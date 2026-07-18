import { mkdirSync, readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync, type StatementSync } from "node:sqlite";

export type SqliteDatabaseOptions = {
  filename: string;
  migrationsDirectory?: string;
  now?: () => Date;
};

const defaultMigrationsDirectory = fileURLToPath(
  new URL("../../migrations", import.meta.url),
);

export class SqliteDatabase {
  readonly #database: DatabaseSync;
  readonly #migrationsDirectory: string;
  readonly #now: () => Date;

  constructor(options: SqliteDatabaseOptions) {
    if (options.filename !== ":memory:") {
      mkdirSync(dirname(resolve(options.filename)), { recursive: true });
    }
    this.#database = new DatabaseSync(options.filename);
    this.#migrationsDirectory = options.migrationsDirectory ?? defaultMigrationsDirectory;
    this.#now = options.now ?? (() => new Date());
    this.#database.exec("PRAGMA foreign_keys = ON");
    this.#database.exec("PRAGMA busy_timeout = 5000");
    if (options.filename !== ":memory:") {
      this.#database.exec("PRAGMA journal_mode = WAL");
      this.#database.exec("PRAGMA synchronous = FULL");
    }
    this.#database.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        applied_at TEXT NOT NULL
      ) STRICT
    `);
  }

  migrate(): void {
    for (const migration of this.#migrationFiles("up")) {
      const applied = this.prepare(
        "SELECT 1 AS present FROM schema_migrations WHERE version = ?",
      ).get(migration.version);
      if (applied) continue;
      const sql = readFileSync(migration.path, "utf8");
      this.transaction(() => {
        this.exec(sql);
        this.prepare(
          "INSERT INTO schema_migrations(version, name, applied_at) VALUES (?, ?, ?)",
        ).run(migration.version, migration.name, this.#now().toISOString());
      });
    }
  }

  rollbackLastMigration(): number | undefined {
    const latest = this.prepare(
      "SELECT version, name FROM schema_migrations ORDER BY version DESC LIMIT 1",
    ).get() as { version: number; name: string } | undefined;
    if (!latest) return undefined;
    const down = this.#migrationFiles("down").find((entry) => entry.version === latest.version);
    if (!down) throw new Error("The latest migration has no rollback companion.");
    const sql = readFileSync(down.path, "utf8");
    this.transaction(() => {
      this.exec(sql);
      this.prepare("DELETE FROM schema_migrations WHERE version = ?").run(latest.version);
    });
    return latest.version;
  }

  exec(sql: string): void {
    this.#database.exec(sql);
  }

  prepare(sql: string): StatementSync {
    return this.#database.prepare(sql);
  }

  transaction<T>(operation: () => T): T {
    this.#database.exec("BEGIN IMMEDIATE");
    try {
      const result = operation();
      this.#database.exec("COMMIT");
      return result;
    } catch (error) {
      this.#database.exec("ROLLBACK");
      throw error;
    }
  }

  close(): void {
    this.#database.close();
  }

  #migrationFiles(direction: "up" | "down") {
    const pattern = new RegExp("^([0-9]+)_([a-z0-9_]+)[.]" + direction + "[.]sql$");
    return readdirSync(this.#migrationsDirectory)
      .map((name) => {
        const match = pattern.exec(name);
        if (!match) return undefined;
        return {
          version: Number(match[1]),
          name: match[2]!,
          path: resolve(this.#migrationsDirectory, name),
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== undefined)
      .sort((left, right) => left.version - right.version);
  }
}
