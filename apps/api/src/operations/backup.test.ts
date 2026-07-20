import assert from "node:assert/strict";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { backup, DatabaseSync } from "node:sqlite";

import { SqliteDatabase } from "../persistence/database.js";

test("online backup creates valid SQLite snapshot and verifies restore integrity", async () => {
  const tmpDir = join(process.cwd(), ".data", "test-backup-restore");
  mkdirSync(tmpDir, { recursive: true });
  const sourceDbPath = join(tmpDir, "source.sqlite");
  const backupDbPath = join(tmpDir, "backup-restore.sqlite");

  try {
    // 1. Create and populate source database
    const sourceDb = new SqliteDatabase({ filename: sourceDbPath });
    sourceDb.migrate();
    sourceDb.prepare("INSERT INTO accounts (id, email, display_name, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)")
      .run("usr_backup_test", "backup@example.invalid", "Backup User", "active", new Date().toISOString(), new Date().toISOString());
    sourceDb.close();

    // 2. Perform online SQLite backup
    const sourceConnection = new DatabaseSync(sourceDbPath, { readOnly: true });
    await backup(sourceConnection, backupDbPath);
    sourceConnection.close();

    assert.equal(existsSync(backupDbPath), true, "Backup file must exist on disk.");

    // 3. Restore verification: open backup database and verify schema + data
    const restoredDb = new SqliteDatabase({ filename: backupDbPath });
    const user = restoredDb.prepare("SELECT * FROM accounts WHERE id = ?").get("usr_backup_test") as { email: string } | undefined;
    assert.ok(user, "Restored database must contain source account data.");
    assert.equal(user?.email, "backup@example.invalid");
    restoredDb.close();
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});
