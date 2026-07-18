import { randomUUID } from "node:crypto";

import type { RegisterRequest } from "@gexor/contracts";
import { AuthDomainError } from "../auth/auth-errors.js";
import type { AtomicRegistrationService, AuthenticationResult } from "../auth/authentication-service.js";
import { normalizeEmail } from "../auth/email.js";
import type { PasswordHashingService } from "../auth/identity-service.js";
import { DEFAULT_SESSION_LIFETIME_MS } from "../auth/session-repository.js";
import type { SessionTokenGenerator } from "../auth/session-token.js";
import { OpaqueSessionTokenGenerator } from "../auth/session-token.js";
import { normalizeDisplayName } from "../auth/user-identity.js";
import { SqliteDatabase } from "./database.js";

export type SqliteRegistrationServiceOptions = {
  passwordHasher: PasswordHashingService;
  tokenGenerator?: SessionTokenGenerator;
  now?: () => Date;
  createId?: () => string;
  sessionLifetimeMs?: number;
};

export class SqliteRegistrationService implements AtomicRegistrationService {
  readonly #database: SqliteDatabase;
  readonly #passwordHasher: PasswordHashingService;
  readonly #tokenGenerator: SessionTokenGenerator;
  readonly #now: () => Date;
  readonly #createId: () => string;
  readonly #sessionLifetimeMs: number;

  constructor(database: SqliteDatabase, options: SqliteRegistrationServiceOptions) {
    this.#database = database;
    this.#passwordHasher = options.passwordHasher;
    this.#tokenGenerator = options.tokenGenerator ?? new OpaqueSessionTokenGenerator();
    this.#now = options.now ?? (() => new Date());
    this.#createId = options.createId ?? randomUUID;
    this.#sessionLifetimeMs = options.sessionLifetimeMs ?? DEFAULT_SESSION_LIFETIME_MS;
  }

  async register(input: RegisterRequest): Promise<AuthenticationResult> {
    const email = normalizeEmail(input.email);
    const displayName = normalizeDisplayName(input.displayName);
    const passwordHash = await this.#passwordHasher.hash(input.password);
    const now = this.#now();
    const timestamp = now.toISOString();
    const userId = `user_${this.#createId()}`;
    const workspaceId = `workspace_${this.#createId()}`;
    const membershipId = `membership_${this.#createId()}`;
    const sessionId = `session_${this.#createId()}`;
    const sessionToken = this.#tokenGenerator.generate();
    const expiresAt = new Date(now.getTime() + this.#sessionLifetimeMs).toISOString();

    try {
      this.#database.transaction(() => {
        this.#database.prepare(
          "INSERT INTO accounts(id, email, display_name, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
        ).run(userId, email, displayName, "active", timestamp, timestamp);
        this.#database.prepare(`
          INSERT INTO authentication_identities(id, account_id, normalized_email, password_hash, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(`identity_${this.#createId()}`, userId, email, passwordHash, timestamp, timestamp);
        this.#database.prepare(`
          INSERT INTO workspaces(id, owner_account_id, workspace_type, name, status, created_at, updated_at)
          VALUES (?, ?, 'personal', ?, 'active', ?, ?)
        `).run(workspaceId, userId, `${displayName} Workspace`, timestamp, timestamp);
        this.#database.prepare(`
          INSERT INTO memberships(id, workspace_id, account_id, role, status, created_at, updated_at)
          VALUES (?, ?, ?, 'owner', 'active', ?, ?)
        `).run(membershipId, workspaceId, userId, timestamp, timestamp);
        this.#database.prepare(`
          INSERT INTO sessions(id, account_id, token_hash, created_at, expires_at, last_seen_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(
          sessionId,
          userId,
          this.#tokenGenerator.hash(sessionToken),
          timestamp,
          expiresAt,
          timestamp,
        );
        this.#database.prepare(`
          INSERT INTO outbox_events(
            id, workspace_id, aggregate_type, aggregate_id, event_type,
            schema_version, payload_json, correlation_id, created_at
          ) VALUES (?, ?, 'account', ?, 'account.registered', 1, ?, ?, ?)
        `).run(
          `event_${this.#createId()}`,
          workspaceId,
          userId,
          JSON.stringify({ accountId: userId, workspaceId }),
          `registration_${userId}`,
          timestamp,
        );
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes("UNIQUE")) {
        throw new AuthDomainError("DUPLICATE_EMAIL");
      }
      throw error;
    }

    return {
      user: {
        userId,
        email,
        displayName,
        status: 'active',
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      sessionToken,
      session: {
        sessionId,
        userId,
        status: 'active',
        createdAt: timestamp,
        expiresAt,
        lastSeenAt: timestamp,
      },
      workspace: {
        workspaceId,
        ownerUserId: userId,
        name: `${displayName} Workspace`,
        status: 'active',
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      membership: {
        membershipId,
        workspaceId,
        userId,
        role: 'owner',
        status: 'active',
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    };
  }
}
