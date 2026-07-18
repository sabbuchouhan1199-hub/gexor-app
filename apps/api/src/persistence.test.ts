import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { RuntimeExecutor } from "./runtime-executor.js";
import { SqliteDatabase } from "./persistence/database.js";
import {
  SqliteConversationRepository,
  SqliteIdentityRepository,
  SqliteSessionRepository,
  SqliteWorkspaceRepository,
} from "./persistence/sqlite-repositories.js";
import { SqliteRegistrationService } from "./persistence/sqlite-registration-service.js";
import {
  SqliteMessageAcceptanceRepository,
  SqliteRuntimeExecutionStore,
} from "./persistence/sqlite-runtime-repository.js";

const now = () => new Date("2026-07-18T12:00:00.000Z");
const tokenGenerator = {
  generate: () => "synthetic_opaque_session_token_00000000000000000000",
  hash: (token: string) => createHash("sha256").update(token).digest("hex"),
};
const passwordHasher = {
  hash: async () => "scrypt$v1$synthetic-hash",
  verify: async (password: string, hash: string) => password === "valid-passphrase" && hash === "scrypt$v1$synthetic-hash",
};
function ids(prefix = "id") {
  let value = 0;
  return () => `${prefix}${++value}`;
}

test("core migration applies and rolls back deterministically", () => {
  const database = new SqliteDatabase({ filename: ":memory:", now });
  database.migrate();
  assert.equal(database.prepare("SELECT count(*) AS count FROM schema_migrations").get()!.count, 2);
  assert.equal(database.rollbackLastMigration(), 2);
  assert.equal(database.prepare("SELECT count(*) AS count FROM schema_migrations").get()!.count, 1);
  database.migrate();
  assert.ok(database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'outbox_events'").get());
  database.close();
});

test("registration, sessions, workspaces, and conversations survive database restart", async () => {
  const directory = mkdtempSync(join(tmpdir(), "gexor-persistence-"));
  const filename = join(directory, "domain.sqlite");
  try {
    let database = new SqliteDatabase({ filename, now });
    database.migrate();
    const registration = new SqliteRegistrationService(database, {
      passwordHasher, tokenGenerator, now, createId: ids("a"),
    });
    const created = await registration.register({
      displayName: "Persistent User", email: "persistent@example.invalid", password: "valid-passphrase",
    });
    const conversation = await new SqliteConversationRepository(database, { now, createId: ids("c") })
      .create(created.workspace.workspaceId, created.user.userId, "Restart-safe conversation");
    assert.equal(database.prepare("SELECT token_hash FROM sessions").get()!.token_hash, tokenGenerator.hash(created.sessionToken));
    assert.equal(JSON.stringify(database.prepare("SELECT * FROM sessions").get()).includes(created.sessionToken), false);
    database.close();

    database = new SqliteDatabase({ filename, now });
    database.migrate();
    assert.equal((await new SqliteIdentityRepository(database).findById(created.user.userId))?.email, created.user.email);
    assert.equal((await new SqliteSessionRepository(database, { tokenGenerator, now }).findValidByToken(created.sessionToken)).outcome, "valid");
    assert.equal((await new SqliteWorkspaceRepository(database).authorize(created.user.userId, created.workspace.workspaceId))?.membership.role, "owner");
    assert.equal((await new SqliteConversationRepository(database).find(created.workspace.workspaceId, conversation.conversationId))?.title, conversation.title);
    database.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("message and execution acceptance is atomic, durable, idempotent, and outboxed", async () => {
  const database = new SqliteDatabase({ filename: ":memory:", now });
  database.migrate();
  const registration = await new SqliteRegistrationService(database, {
    passwordHasher, tokenGenerator, now, createId: ids("r"),
  }).register({ displayName: "Runtime User", email: "runtime@example.invalid", password: "valid-passphrase" });
  const conversation = await new SqliteConversationRepository(database, { now, createId: ids("c") })
    .create(registration.workspace.workspaceId, registration.user.userId, "Atomic acceptance");
  const store = new SqliteRuntimeExecutionStore(database, { now, createId: ids("e") });
  const acceptance = new SqliteMessageAcceptanceRepository(database, store, { now, createId: ids("m") });
  const input = {
    actorUserId: registration.user.userId,
    workspaceId: registration.workspace.workspaceId,
    conversationId: conversation.conversationId,
    requestId: "req_test",
    idempotencyKey: "key-1",
    requestHash: "hash-1",
    text: "hello",
  };
  const first = await acceptance.accept(input);
  assert.equal(first.outcome, "accepted");
  const replay = await acceptance.accept(input);
  assert.equal(replay.outcome, "replayed");
  if (first.outcome === "accepted" && replay.outcome === "replayed") {
    assert.equal(replay.execution.executionId, first.execution.executionId);
    const completed = await new RuntimeExecutor(store, {
      generateText: async () => ({ provider: "synthetic", model: "test-model", text: "done" }),
    }).execute(first.execution.executionId, "hello");
    assert.equal(completed.state, "completed");
    assert.equal(store.get(first.execution.executionId)?.response?.text, "done");
  }
  assert.equal((await acceptance.accept({ ...input, requestHash: "different" })).outcome, "conflict");
  assert.equal(database.prepare("SELECT count(*) AS count FROM messages").get()!.count, 1);
  assert.equal(database.prepare("SELECT count(*) AS count FROM runtime_executions").get()!.count, 1);
  assert.equal(database.prepare("SELECT count(*) AS count FROM idempotency_records").get()!.count, 1);
  assert.equal(database.prepare("SELECT count(*) AS count FROM outbox_events").get()!.count, 3);
  database.close();
});

test("outbox failure rolls back the entire acceptance transaction", async () => {
  const database = new SqliteDatabase({ filename: ":memory:", now });
  database.migrate();
  const registration = await new SqliteRegistrationService(database, {
    passwordHasher, tokenGenerator, now, createId: ids("x"),
  }).register({ displayName: "Rollback User", email: "rollback@example.invalid", password: "valid-passphrase" });
  const conversation = await new SqliteConversationRepository(database, { now, createId: ids("c") })
    .create(registration.workspace.workspaceId, registration.user.userId, "Rollback");
  database.exec("CREATE TRIGGER reject_acceptance_outbox BEFORE INSERT ON outbox_events WHEN NEW.event_type = 'message.accepted' BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END");
  const store = new SqliteRuntimeExecutionStore(database, { now });
  const acceptance = new SqliteMessageAcceptanceRepository(database, store, { now, createId: ids("z") });
  await assert.rejects(() => acceptance.accept({
    actorUserId: registration.user.userId, workspaceId: registration.workspace.workspaceId,
    conversationId: conversation.conversationId, requestId: "req_rollback",
    idempotencyKey: "key-rollback", requestHash: "hash", text: "rollback",
  }));
  assert.equal(database.prepare("SELECT count(*) AS count FROM messages").get()!.count, 0);
  assert.equal(database.prepare("SELECT count(*) AS count FROM runtime_executions").get()!.count, 0);
  assert.equal(database.prepare("SELECT count(*) AS count FROM idempotency_records").get()!.count, 0);
  database.close();
});
