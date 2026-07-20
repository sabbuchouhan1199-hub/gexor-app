import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

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
  assert.equal(database.prepare("SELECT count(*) AS count FROM schema_migrations").get()!.count, 5);
  assert.equal(database.rollbackLastMigration(), 5);
  assert.equal(database.prepare("SELECT count(*) AS count FROM schema_migrations").get()!.count, 4);
  database.migrate();
  assert.ok(database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'outbox_events'").get());
  assert.ok(database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'execution_events'").get());
  assert.ok(database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'execution_jobs'").get());
  assert.ok(database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'usage_records'").get());
  assert.ok(database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'file_attachments'").get());
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

test("migration 004 backfills populated routing selections and rolls back deterministically", () => {
  const realMigrationsDir = fileURLToPath(new URL("../migrations", import.meta.url));
  const tempMigrationsDir = mkdtempSync(join(tmpdir(), "gexor-temp-migrations-"));
  let database: SqliteDatabase | undefined;
  try {
    copyFileSync(join(realMigrationsDir, "001_core.up.sql"), join(tempMigrationsDir, "001_core.up.sql"));
    copyFileSync(join(realMigrationsDir, "001_core.down.sql"), join(tempMigrationsDir, "001_core.down.sql"));
    copyFileSync(join(realMigrationsDir, "002_provider_connections.up.sql"), join(tempMigrationsDir, "002_provider_connections.up.sql"));
    copyFileSync(join(realMigrationsDir, "002_provider_connections.down.sql"), join(tempMigrationsDir, "002_provider_connections.down.sql"));
    copyFileSync(join(realMigrationsDir, "003_production_runtime.up.sql"), join(tempMigrationsDir, "003_production_runtime.up.sql"));
    copyFileSync(join(realMigrationsDir, "003_production_runtime.down.sql"), join(tempMigrationsDir, "003_production_runtime.down.sql"));

    database = new SqliteDatabase({
      filename: ":memory:",
      migrationsDirectory: tempMigrationsDir,
      now
    });
    database.migrate();

    const timestamp = now().toISOString();

    // 1. Seed Accounts
    for (let i = 1; i <= 6; i++) {
      database.prepare(`
        INSERT INTO accounts (id, email, display_name, status, created_at, updated_at)
        VALUES (?, ?, ?, 'active', ?, ?)
      `).run(`acc_${i}`, `user${i}@example.invalid`, `User ${i}`, timestamp, timestamp);
    }

    // 2. Seed Workspaces
    for (let i = 1; i <= 6; i++) {
      database.prepare(`
        INSERT INTO workspaces (id, owner_account_id, workspace_type, name, status, created_at, updated_at)
        VALUES (?, ?, 'personal', ?, 'active', ?, ?)
      `).run(`ws_${i}`, `acc_${i}`, `Workspace ${i}`, timestamp, timestamp);
    }

    // 3. Seed active catalog models
    database.prepare(`
      INSERT INTO model_catalog (model_key, provider_key, provider_model_id, display_name, status, created_at, updated_at)
      VALUES ('gemini:flash', 'gemini', 'gemini-1.5-flash', 'Gemini Flash', 'active', ?, ?)
    `).run(timestamp, timestamp);
    database.prepare(`
      INSERT INTO model_catalog (model_key, provider_key, provider_model_id, display_name, status, created_at, updated_at)
      VALUES ('gemini:pro', 'gemini', 'gemini-1.5-pro', 'Gemini Pro', 'active', ?, ?)
    `).run(timestamp, timestamp);

    // 4. Seed Provider Connections
    database.prepare(`
      INSERT INTO provider_connections (id, workspace_id, provider_key, status, credential_reference, created_by, created_at, updated_at, version)
      VALUES ('conn_1', 'ws_1', 'gemini', 'active', 'ref_1', 'acc_1', ?, ?, 1)
    `).run(timestamp, timestamp);

    database.prepare(`
      INSERT INTO provider_connections (id, workspace_id, provider_key, status, credential_reference, created_by, created_at, updated_at, version)
      VALUES ('conn_2a', 'ws_2', 'ollama', 'active', 'ref_2a', 'acc_2', ?, ?, 1)
    `).run(timestamp, timestamp);
    database.prepare(`
      INSERT INTO provider_connections (id, workspace_id, provider_key, status, credential_reference, created_by, created_at, updated_at, version)
      VALUES ('conn_2b', 'ws_2', 'gemini', 'active', 'ref_2b', 'acc_2', ?, ?, 1)
    `).run(timestamp, timestamp);

    database.prepare(`
      INSERT INTO provider_connections (id, workspace_id, provider_key, status, credential_reference, created_by, created_at, updated_at, version)
      VALUES ('conn_3', 'ws_3', 'gemini', 'active', 'ref_3', 'acc_3', ?, ?, 1)
    `).run(timestamp, timestamp);

    database.prepare(`
      INSERT INTO provider_connections (id, workspace_id, provider_key, status, credential_reference, created_by, created_at, updated_at, version)
      VALUES ('conn_4', 'ws_4', 'gemini', 'active', 'ref_4', 'acc_4', ?, ?, 1)
    `).run(timestamp, timestamp);

    database.prepare(`
      INSERT INTO provider_connections (id, workspace_id, provider_key, status, credential_reference, created_by, created_at, updated_at, version)
      VALUES ('conn_5', 'ws_5', 'gemini', 'active', 'ref_5', 'acc_5', ?, ?, 1)
    `).run(timestamp, timestamp);

    database.prepare(`
      INSERT INTO provider_connections (id, workspace_id, provider_key, status, credential_reference, created_by, created_at, updated_at, version)
      VALUES ('conn_6', 'ws_6', 'gemini', 'active', 'ref_6', 'acc_6', ?, ?, 1)
    `).run(timestamp, timestamp);

    // 5. Update routing to match the migration eligibility scenarios
    database.prepare(`
      UPDATE provider_routing SET is_default = 1, model_key = 'gemini:flash', health_state = 'healthy', enabled = 1
      WHERE workspace_id = 'ws_1' AND connection_id = 'conn_1'
    `).run();

    database.prepare(`
      UPDATE provider_routing SET is_default = 1, model_key = NULL, health_state = 'healthy', enabled = 1
      WHERE workspace_id = 'ws_2' AND connection_id = 'conn_2a'
    `).run();
    database.prepare(`
      UPDATE provider_routing SET is_default = 0, model_key = 'gemini:pro', health_state = 'healthy', enabled = 1
      WHERE workspace_id = 'ws_2' AND connection_id = 'conn_2b'
    `).run();

    database.prepare(`
      UPDATE provider_routing SET is_default = 1, model_key = 'gemini:pro', health_state = 'disabled', enabled = 0
      WHERE workspace_id = 'ws_3' AND connection_id = 'conn_3'
    `).run();

    database.prepare(`
      UPDATE provider_routing SET is_default = 0, model_key = 'gemini:pro', health_state = 'healthy', enabled = 1
      WHERE workspace_id = 'ws_4' AND connection_id = 'conn_4'
    `).run();

    database.prepare(`
      UPDATE provider_routing SET is_default = 1, model_key = NULL, health_state = 'healthy', enabled = 1
      WHERE workspace_id = 'ws_5' AND connection_id = 'conn_5'
    `).run();

    database.prepare(`
      UPDATE provider_routing SET is_default = 1, model_key = 'gemini:flash', health_state = 'healthy', enabled = 1
      WHERE workspace_id = 'ws_6' AND connection_id = 'conn_6'
    `).run();
    database.prepare(`
      INSERT INTO workspace_provider_selection (workspace_id, connection_id, model_key, selected_by, selected_at)
      VALUES ('ws_6', 'conn_6', 'gemini:pro', 'acc_6', ?)
    `).run(timestamp);

    copyFileSync(join(realMigrationsDir, "004_provider_selection_routing_sync.up.sql"), join(tempMigrationsDir, "004_provider_selection_routing_sync.up.sql"));
    copyFileSync(join(realMigrationsDir, "004_provider_selection_routing_sync.down.sql"), join(tempMigrationsDir, "004_provider_selection_routing_sync.down.sql"));

    database.migrate();

    assert.equal(database.prepare("SELECT count(*) AS count FROM schema_migrations").get()!.count, 4);

    const selections = database.prepare("SELECT * FROM workspace_provider_selection ORDER BY workspace_id").all() as any[];

    const sel1 = selections.find(s => s.workspace_id === "ws_1");
    assert.ok(sel1);
    assert.equal(sel1.connection_id, "conn_1");
    assert.equal(sel1.model_key, "gemini:flash");

    const sel2 = selections.find(s => s.workspace_id === "ws_2");
    assert.ok(sel2);
    assert.equal(sel2.connection_id, "conn_2a");
    assert.equal(sel2.model_key, "ollama:qwen3-0.6b");

    assert.equal(selections.find(s => s.workspace_id === "ws_3"), undefined);
    assert.equal(selections.find(s => s.workspace_id === "ws_4"), undefined);
    assert.equal(selections.find(s => s.workspace_id === "ws_5"), undefined);

    const sel6 = selections.find(s => s.workspace_id === "ws_6");
    assert.ok(sel6);
    assert.equal(sel6.connection_id, "conn_6");
    assert.equal(sel6.model_key, "gemini:pro");

    assert.equal(database.prepare("PRAGMA foreign_key_check").all().length, 0);
    assert.equal((database.prepare("PRAGMA integrity_check").get() as any).integrity_check, "ok");

    assert.equal(database.rollbackLastMigration(), 4);

    assert.equal(database.prepare("SELECT count(*) AS count FROM schema_migrations").get()!.count, 3);

    const rollbackSelections = database.prepare("SELECT * FROM workspace_provider_selection ORDER BY workspace_id").all() as any[];
    assert.equal(rollbackSelections.length, 3);

    const rSel1 = rollbackSelections.find(s => s.workspace_id === "ws_1");
    assert.ok(rSel1);
    assert.equal(rSel1.connection_id, "conn_1");
    assert.equal(rSel1.model_key, "gemini:flash");

    const rSel2 = rollbackSelections.find(s => s.workspace_id === "ws_2");
    assert.ok(rSel2);
    assert.equal(rSel2.connection_id, "conn_2a");
    assert.equal(rSel2.model_key, "ollama:qwen3-0.6b");

    const rSel6 = rollbackSelections.find(s => s.workspace_id === "ws_6");
    assert.ok(rSel6);
    assert.equal(rSel6.connection_id, "conn_6");
    assert.equal(rSel6.model_key, "gemini:pro");

    assert.equal(database.prepare("PRAGMA foreign_key_check").all().length, 0);
    assert.equal((database.prepare("PRAGMA integrity_check").get() as any).integrity_check, "ok");
  } finally {
    if (database) {
      try {
        database.close();
      } catch {}
    }
    rmSync(tempMigrationsDir, { recursive: true, force: true });
  }
});

test("migration 005 adds llama-cpp provider and model deterministically", () => {
  const database = new SqliteDatabase({ filename: ":memory:", now });
  database.migrate();

  const providers = database.prepare("SELECT * FROM provider_catalog WHERE provider_key = 'llama-cpp'").all() as any[];
  assert.equal(providers.length, 1);
  assert.equal(providers[0].provider_key, "llama-cpp");
  assert.equal(providers[0].display_name, "Local llama.cpp");
  assert.equal(providers[0].status, "active");

  const models = database.prepare("SELECT * FROM model_catalog WHERE model_key = 'llama-cpp:qwen-local'").all() as any[];
  assert.equal(models.length, 1);
  assert.equal(models[0].model_key, "llama-cpp:qwen-local");
  assert.equal(models[0].provider_key, "llama-cpp");
  assert.equal(models[0].provider_model_id, "qwen-local");
  assert.equal(models[0].display_name, "Qwen 2.5 3B Local");
  assert.equal(models[0].status, "active");

  database.close();
});

test("migration 005 rollback removes seeded catalogue entries", () => {
  const database = new SqliteDatabase({ filename: ":memory:", now });
  database.migrate();

  assert.equal(database.rollbackLastMigration(), 5);
  assert.equal(database.prepare("SELECT count(*) AS count FROM schema_migrations").get()!.count, 4);

  assert.equal(database.prepare("SELECT count(*) AS count FROM provider_catalog WHERE provider_key = 'llama-cpp'").get()!.count, 0);
  assert.equal(database.prepare("SELECT count(*) AS count FROM model_catalog WHERE model_key = 'llama-cpp:qwen-local'").get()!.count, 0);

  database.migrate();
  assert.equal(database.prepare("SELECT count(*) AS count FROM schema_migrations").get()!.count, 5);
  assert.equal(database.prepare("SELECT count(*) AS count FROM provider_catalog WHERE provider_key = 'llama-cpp'").get()!.count, 1);

  database.close();
});

test("migration 005 does not alter existing Ollama and Gemini catalogue rows", () => {
  const database = new SqliteDatabase({ filename: ":memory:", now });
  database.migrate();

  assert.equal(database.prepare("SELECT count(*) AS count FROM provider_catalog WHERE provider_key = 'ollama'").get()!.count, 1);
  assert.equal(database.prepare("SELECT count(*) AS count FROM provider_catalog WHERE provider_key = 'gemini'").get()!.count, 1);
  assert.equal(database.prepare("SELECT count(*) AS count FROM model_catalog WHERE model_key = 'ollama:qwen3-0.6b'").get()!.count, 1);
  assert.equal(database.prepare("SELECT count(*) AS count FROM model_catalog WHERE model_key = 'gemini:flash-lite'").get()!.count, 1);

  database.close();
});
