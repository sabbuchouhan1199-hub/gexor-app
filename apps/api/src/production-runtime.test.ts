import assert from "node:assert/strict";
import { test } from "node:test";

import { ProviderError } from "./providers/errors.js";
import { RuntimeWorker } from "./runtime/runtime-worker.js";
import { SqliteDatabase } from "./persistence/database.js";
import { SqliteConversationRepository } from "./persistence/sqlite-repositories.js";
import { SqliteRegistrationService } from "./persistence/sqlite-registration-service.js";
import { SqliteProductionRuntimeRepository } from "./persistence/production-runtime-repository.js";
import { SqliteMessageAcceptanceRepository, SqliteRuntimeExecutionStore } from "./persistence/sqlite-runtime-repository.js";

let current = new Date("2026-07-18T16:00:00.000Z");
const now = () => current;
function advance(ms: number) { current = new Date(current.getTime() + ms); }
function ids(prefix = "id") { let value = 0; return () => `${prefix}${++value}`; }
const tokenGenerator = { generate: () => "synthetic_session_00000000000000000000000000000000", hash: (token: string) => `hash:${token}` };
const passwordHasher = { hash: async () => "scrypt$v1$synthetic", verify: async () => true };

async function setup() {
  current = new Date("2026-07-18T16:00:00.000Z");
  const db = new SqliteDatabase({ filename: ":memory:", now }); db.migrate();
  const makeId = ids("r");
  const registration = await new SqliteRegistrationService(db, { passwordHasher, tokenGenerator, now, createId: makeId })
    .register({ displayName: "Runtime User", email: `runtime-${Math.random()}@example.invalid`, password: "valid-passphrase" });
  const conversation = await new SqliteConversationRepository(db, { now, createId: ids("c") })
    .create(registration.workspace.workspaceId, registration.user.userId, "Production runtime");
  const store = new SqliteRuntimeExecutionStore(db, { now, createId: ids("e") });
  const runtime = new SqliteProductionRuntimeRepository(db, store, { now, createId: ids("p") });
  const acceptance = new SqliteMessageAcceptanceRepository(db, store, { now, createId: ids("m"), durableRuntime: runtime });
  return { db, registration, conversation, store, runtime, acceptance };
}

async function accept(setupResult: Awaited<ReturnType<typeof setup>>, key = "key-1", text = "hello") {
  const result = await setupResult.acceptance.accept({
    actorUserId: setupResult.registration.user.userId,
    workspaceId: setupResult.registration.workspace.workspaceId,
    conversationId: setupResult.conversation.conversationId,
    requestId: `req_${key}`, idempotencyKey: key, requestHash: `hash_${key}`, text,
  });
  assert.equal(result.outcome, "accepted");
  return result.execution;
}

test("durable worker streams ordered replay events and records idempotent usage", async () => {
  const context = await setup();
  const execution = await accept(context, "stream", "hello stream");
  assert.deepEqual(context.runtime.queueStats().queued, 1);
  const worker = new RuntimeWorker(context.runtime, context.store, async () => ({
    async *streamText() {
      yield { provider: "fake", model: "stream-model", delta: "Hel", done: false };
      yield { provider: "fake", model: "stream-model", delta: "lo", done: false };
    },
    async generateText() { throw new Error("stream path expected"); },
  }));
  assert.equal(await worker.runOnce(), true);
  const completed = context.store.get(execution.executionId)!;
  assert.equal(completed.state, "completed");
  assert.deepEqual(completed.response, { text: "Hello" });
  const replay = context.runtime.replay(context.registration.workspace.workspaceId, execution.executionId, 0)!;
  assert.deepEqual(replay.events.map((event) => event.sequence), [1, 2, 3, 4, 5]);
  assert.deepEqual(replay.events.map((event) => event.eventType), ["execution.snapshot", "execution.started", "response.delta", "response.delta", "response.completed"]);
  assert.equal(context.runtime.replay(context.registration.workspace.workspaceId, execution.executionId, 3)!.events.length, 2);
  assert.equal((context.db.prepare("SELECT count(*) count FROM usage_records").get() as { count: number }).count, 1);
  assert.equal((context.db.prepare("SELECT count(*) count FROM provider_attempts").get() as { count: number }).count, 1);
  assert.equal(context.runtime.queueStats().queued, 0);
  context.db.close();
});

test("retryable provider failures use bounded retry wait and preserve attempt audit", async () => {
  const context = await setup();
  const execution = await accept(context, "retry", "retry me");
  let calls = 0;
  const worker = new RuntimeWorker(context.runtime, context.store, async () => ({
    async generateText() {
      calls += 1;
      if (calls === 1) throw new ProviderError({ code: "PROVIDER_UNAVAILABLE", message: "temporary", status: 503, retryable: true });
      return { provider: "fake", model: "fallback-model", text: "recovered" };
    },
  }));
  assert.equal(await worker.runOnce(), true);
  assert.equal(context.runtime.queueStats().retryWait, 1);
  advance(1_000);
  assert.equal(await worker.runOnce(), true);
  assert.equal(context.store.get(execution.executionId)!.state, "completed");
  assert.equal((context.db.prepare("SELECT count(*) count FROM provider_attempts").get() as { count: number }).count, 2);
  assert.equal((context.db.prepare("SELECT fallback_attempts FROM usage_records WHERE execution_id=?").get(execution.executionId) as { fallback_attempts: number }).fallback_attempts, 1);
  context.db.close();
});

test("cancellation is idempotent and emits one terminal event", async () => {
  const context = await setup();
  const execution = await accept(context, "cancel", "cancel me");
  const first = context.runtime.requestCancellation(context.registration.workspace.workspaceId, execution.executionId)!;
  const second = context.runtime.requestCancellation(context.registration.workspace.workspaceId, execution.executionId)!;
  assert.equal(first.status, "completed");
  assert.equal(second.status, "completed");
  assert.equal(context.store.get(execution.executionId)!.state, "cancelled");
  assert.equal((context.db.prepare("SELECT count(*) count FROM execution_events WHERE execution_id=? AND event_type='execution.cancelled'").get(execution.executionId) as { count: number }).count, 1);
  assert.equal((context.db.prepare("SELECT count(*) count FROM usage_records WHERE execution_id=?").get(execution.executionId) as { count: number }).count, 1);
  context.db.close();
});

test("derived retry attempts are idempotent and budget limits are enforceable", async () => {
  const context = await setup();
  const execution = await accept(context, "derive", "derive me");
  context.store.transition(execution.executionId, "preparing");
  const failed = context.store.transition(execution.executionId, "dispatching")!;
  context.store.transition(failed.executionId, "failed", { failure: { code: "PROVIDER_UNAVAILABLE", detail: "Temporary provider failure.", retryable: true } });
  const retry = context.runtime.createDerived(context.registration.workspace.workspaceId, context.registration.user.userId, execution.executionId, "retry", "retry-key", "req_retry");
  const replay = context.runtime.createDerived(context.registration.workspace.workspaceId, context.registration.user.userId, execution.executionId, "retry", "retry-key", "req_retry_again");
  assert.notEqual(retry, "not_found"); assert.notEqual(retry, "not_eligible");
  assert.notEqual(replay, "not_found"); assert.notEqual(replay, "not_eligible");
  if (typeof retry !== "string" && typeof replay !== "string") assert.equal(retry.executionId, replay.executionId);
  context.runtime.upsertBudget(context.registration.workspace.workspaceId, { tokenLimit: 1 });
  assert.equal(context.runtime.checkBudget(context.registration.workspace.workspaceId, 2).allowed, false);
  const dashboard = context.runtime.usageDashboard(context.registration.workspace.workspaceId, "2026-07-18T00:00:00.000Z", "2026-07-19T00:00:00.000Z");
  assert.equal(dashboard.budget?.state, "remaining");
  context.db.close();
});

test("SqliteProductionRuntimeRepository provides event-driven waitForEvent wakeup", async () => {
  const context = await setup();
  const start = Date.now();
  const promise = context.runtime.waitForEvent("exec_wakeup_1", 5000);
  context.runtime.notifyEvent("exec_wakeup_1");
  await promise;
  const elapsed = Date.now() - start;
  assert.ok(elapsed < 1000, `Expected instant wakeup, got ${elapsed}ms`);
  context.db.close();
});

test("RuntimeWorker records provider-reported measured usage when supplied", async () => {
  const context = await setup();
  const execution = await accept(context, "measured-usage", "test input");
  const provider = {
    async generateText() {
      return {
        provider: "fake",
        model: "fake-model",
        text: "response text",
        usage: { inputTokens: 50, outputTokens: 100, measured: true },
      };
    },
  };
  const worker = new RuntimeWorker(context.runtime, context.store, async () => provider);
  const worked = await worker.runOnce();
  assert.equal(worked, true);
  const dashboard = context.runtime.usageDashboard(context.registration.workspace.workspaceId, "2026-07-18T00:00:00.000Z", "2026-07-20T00:00:00.000Z");
  assert.equal(dashboard.usageClassification.measured, 1);
  assert.equal(dashboard.totals.inputTokens, 50);
  assert.equal(dashboard.totals.outputTokens, 100);
  context.db.close();
});
