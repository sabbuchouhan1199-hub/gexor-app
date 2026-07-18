import { randomUUID } from "node:crypto";

import type {
  AuthenticatedUser,
  AuthSessionSummary,
  ConversationSummary,
  ConversationMessage,
  RuntimeExecutionFailure,
  RuntimeExecutionSnapshot,
  PersonalWorkspace,
  UserStatus,
  WorkspaceMembership,
} from "@gexor/contracts";
import { AuthDomainError } from "../auth/auth-errors.js";
import type {
  CreateIdentityInput,
  IdentityRepository,
  InternalCredentialRecord,
} from "../auth/identity-repository.js";
import { normalizeEmail } from "../auth/email.js";
import { normalizeDisplayName } from "../auth/user-identity.js";
import type {
  CreatedSession,
  SessionLookupResult,
  SessionRepository,
  SessionRevocationResult,
} from "../auth/session-repository.js";
import { DEFAULT_SESSION_LIFETIME_MS } from "../auth/session-repository.js";
import type { SessionTokenGenerator } from "../auth/session-token.js";
import { OpaqueSessionTokenGenerator } from "../auth/session-token.js";
import type {
  WorkspaceAuthorization,
  WorkspaceRepository,
} from "../auth/workspace-repository.js";
import { SqliteDatabase } from "./database.js";

export type PersistentRepositoryOptions = {
  now?: () => Date;
  createId?: () => string;
};

type IdentityRow = {
  id: string;
  email: string;
  normalized_email: string;
  display_name: string;
  status: UserStatus;
  password_hash: string;
  created_at: string;
  updated_at: string;
};

function publicUser(row: IdentityRow): AuthenticatedUser {
  return {
    userId: row.id,
    email: row.email,
    displayName: row.display_name,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class SqliteIdentityRepository implements IdentityRepository {
  readonly #database: SqliteDatabase;
  readonly #now: () => Date;
  readonly #createId: () => string;

  constructor(database: SqliteDatabase, options: PersistentRepositoryOptions = {}) {
    this.#database = database;
    this.#now = options.now ?? (() => new Date());
    this.#createId = options.createId ?? randomUUID;
  }

  async create(input: CreateIdentityInput): Promise<AuthenticatedUser> {
    const email = normalizeEmail(input.email);
    const normalizedEmail = normalizeEmail(input.normalizedEmail);
    if (email !== normalizedEmail) throw new AuthDomainError("INVALID_EMAIL");
    if (!input.passwordHash) throw new AuthDomainError("MALFORMED_PASSWORD_HASH");
    const userId = `user_${this.#createId()}`;
    const timestamp = this.#now().toISOString();
    try {
      this.#database.transaction(() => {
        this.#database.prepare(
          "INSERT INTO accounts(id, email, display_name, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
        ).run(userId, email, normalizeDisplayName(input.displayName), 'active', timestamp, timestamp);
        this.#database.prepare(
          "INSERT INTO authentication_identities(id, account_id, normalized_email, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
        ).run(`identity_${this.#createId()}`, userId, normalizedEmail, input.passwordHash, timestamp, timestamp);
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes("UNIQUE")) {
        throw new AuthDomainError("DUPLICATE_EMAIL");
      }
      throw error;
    }
    return (await this.findById(userId))!;
  }

  async findById(userId: string): Promise<AuthenticatedUser | undefined> {
    const row = this.#identityRow("WHERE a.id = ?", userId);
    return row ? publicUser(row) : undefined;
  }

  async findCredentialsByNormalizedEmail(normalizedEmail: string): Promise<InternalCredentialRecord | undefined> {
    let canonical: string;
    try { canonical = normalizeEmail(normalizedEmail); } catch { return undefined; }
    const row = this.#identityRow("WHERE i.normalized_email = ?", canonical);
    return row ? {
      ...publicUser(row),
      normalizedEmail: row.normalized_email,
      passwordHash: row.password_hash,
    } : undefined;
  }

  async delete(userId: string): Promise<void> {
    this.#database.prepare("DELETE FROM accounts WHERE id = ?").run(userId);
  }

  async setStatus(userId: string, status: UserStatus): Promise<AuthenticatedUser | undefined> {
    this.#database.prepare(
      "UPDATE accounts SET status = ?, updated_at = ? WHERE id = ?",
    ).run(status, this.#now().toISOString(), userId);
    return this.findById(userId);
  }

  #identityRow(where: string, value: string): IdentityRow | undefined {
    return this.#database.prepare(`
      SELECT a.id, a.email, i.normalized_email, a.display_name, a.status,
             i.password_hash, a.created_at, a.updated_at
      FROM accounts a
      JOIN authentication_identities i ON i.account_id = a.id
      ${where}
    `).get(value) as IdentityRow | undefined;
  }
}

type SessionRow = {
  id: string;
  account_id: string;
  token_hash: string;
  created_at: string;
  expires_at: string;
  last_seen_at: string;
  revoked_at: string | null;
};

export type SqliteSessionRepositoryOptions = PersistentRepositoryOptions & {
  tokenGenerator?: SessionTokenGenerator;
  lifetimeMs?: number;
};

export class SqliteSessionRepository implements SessionRepository {
  readonly #database: SqliteDatabase;
  readonly #now: () => Date;
  readonly #createId: () => string;
  readonly #tokenGenerator: SessionTokenGenerator;
  readonly #lifetimeMs: number;

  constructor(database: SqliteDatabase, options: SqliteSessionRepositoryOptions = {}) {
    this.#database = database;
    this.#now = options.now ?? (() => new Date());
    this.#createId = options.createId ?? randomUUID;
    this.#tokenGenerator = options.tokenGenerator ?? new OpaqueSessionTokenGenerator();
    this.#lifetimeMs = options.lifetimeMs ?? DEFAULT_SESSION_LIFETIME_MS;
    if (!Number.isSafeInteger(this.#lifetimeMs) || this.#lifetimeMs < 1) {
      throw new Error("Session lifetime must be a positive integer.");
    }
  }

  async create(userId: string): Promise<CreatedSession> {
    const now = this.#now();
    const token = this.#tokenGenerator.generate();
    const row: SessionRow = {
      id: `session_${this.#createId()}`,
      account_id: userId,
      token_hash: this.#tokenGenerator.hash(token),
      created_at: now.toISOString(),
      expires_at: new Date(now.getTime() + this.#lifetimeMs).toISOString(),
      last_seen_at: now.toISOString(),
      revoked_at: null,
    };
    this.#database.prepare(`
      INSERT INTO sessions(id, account_id, token_hash, created_at, expires_at, last_seen_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(row.id, row.account_id, row.token_hash, row.created_at, row.expires_at, row.last_seen_at);
    return { sessionToken: token, session: this.#summary(row, now) };
  }

  async findValidByToken(token: string): Promise<SessionLookupResult> {
    return this.#lookup(token, this.#now(), false);
  }

  async inspectById(sessionId: string): Promise<AuthSessionSummary | undefined> {
    const row = this.#database.prepare("SELECT * FROM sessions WHERE id = ?").get(sessionId) as SessionRow | undefined;
    return row ? this.#summary(row, this.#now()) : undefined;
  }

  async touch(token: string): Promise<SessionLookupResult> {
    const now = this.#now();
    const result = this.#lookup(token, now, false);
    if (result.outcome !== "valid") return result;
    this.#database.prepare("UPDATE sessions SET last_seen_at = ? WHERE id = ?").run(
      now.toISOString(), result.session.sessionId,
    );
    return { outcome: "valid", session: { ...result.session, lastSeenAt: now.toISOString() } };
  }

  async revoke(sessionId: string): Promise<AuthSessionSummary | undefined> {
    const now = this.#now();
    this.#database.prepare(
      "UPDATE sessions SET revoked_at = COALESCE(revoked_at, ?) WHERE id = ?",
    ).run(now.toISOString(), sessionId);
    return this.inspectById(sessionId);
  }

  async revokeByToken(token: string): Promise<SessionRevocationResult> {
    const now = this.#now();
    const hash = this.#tokenGenerator.hash(token);
    const row = this.#database.prepare("SELECT * FROM sessions WHERE token_hash = ?").get(hash) as SessionRow | undefined;
    if (!row) return { outcome: "unknown" };
    if (new Date(row.expires_at).getTime() <= now.getTime()) return { outcome: "expired" };
    this.#database.prepare(
      "UPDATE sessions SET revoked_at = COALESCE(revoked_at, ?) WHERE id = ?",
    ).run(now.toISOString(), row.id);
    return { outcome: "revoked" };
  }

  async revokeAllForUser(userId: string): Promise<number> {
    const result = this.#database.prepare(`
      UPDATE sessions SET revoked_at = ?
      WHERE account_id = ? AND revoked_at IS NULL AND expires_at > ?
    `).run(this.#now().toISOString(), userId, this.#now().toISOString());
    return Number(result.changes);
  }

  async deleteExpired(): Promise<number> {
    const result = this.#database.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(
      this.#now().toISOString(),
    );
    return Number(result.changes);
  }

  #lookup(token: string, now: Date, _includeRevoked: boolean): SessionLookupResult {
    const hash = this.#tokenGenerator.hash(token);
    const row = this.#database.prepare("SELECT * FROM sessions WHERE token_hash = ?").get(hash) as SessionRow | undefined;
    if (!row) return { outcome: "unknown" };
    if (row.revoked_at) return { outcome: "revoked" };
    if (new Date(row.expires_at).getTime() <= now.getTime()) return { outcome: "expired" };
    return { outcome: "valid", session: this.#summary(row, now) };
  }

  #summary(row: SessionRow, now: Date): AuthSessionSummary {
    const status = row.revoked_at
      ? "revoked"
      : new Date(row.expires_at).getTime() <= now.getTime() ? "expired" : 'active';
    return {
      sessionId: row.id,
      userId: row.account_id,
      status,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      lastSeenAt: row.last_seen_at,
      ...(row.revoked_at ? { revokedAt: row.revoked_at } : {}),
    };
  }
}

type WorkspaceRow = {
  id: string;
  owner_account_id: string;
  name: string;
  status: 'active' | "suspended";
  created_at: string;
  updated_at: string;
  membership_id: string;
  membership_status: 'active' | "revoked";
  membership_created_at: string;
  membership_updated_at: string;
};

export class SqliteWorkspaceRepository implements WorkspaceRepository {
  readonly #database: SqliteDatabase;
  readonly #now: () => Date;
  readonly #createId: () => string;

  constructor(database: SqliteDatabase, options: PersistentRepositoryOptions = {}) {
    this.#database = database;
    this.#now = options.now ?? (() => new Date());
    this.#createId = options.createId ?? randomUUID;
  }

  async provisionPersonalWorkspace(userId: string, displayName: string): Promise<WorkspaceAuthorization> {
    const existing = await this.findPersonalWorkspaceForUser(userId);
    if (existing) return existing;
    const timestamp = this.#now().toISOString();
    const workspaceId = `workspace_${this.#createId()}`;
    this.#database.transaction(() => {
      this.#database.prepare(`
        INSERT INTO workspaces(id, owner_account_id, workspace_type, name, status, created_at, updated_at)
        VALUES (?, ?, 'personal', ?, 'active', ?, ?)
      `).run(workspaceId, userId, `${normalizeDisplayName(displayName)} Workspace`, timestamp, timestamp);
      this.#database.prepare(`
        INSERT INTO memberships(id, workspace_id, account_id, role, status, created_at, updated_at)
        VALUES (?, ?, ?, 'owner', 'active', ?, ?)
      `).run(`membership_${this.#createId()}`, workspaceId, userId, timestamp, timestamp);
    });
    return (await this.authorize(userId, workspaceId))!;
  }

  async findPersonalWorkspaceForUser(userId: string): Promise<WorkspaceAuthorization | undefined> {
    return this.#find("WHERE w.owner_account_id = ?", userId);
  }

  async authorize(userId: string, workspaceId: string): Promise<WorkspaceAuthorization | undefined> {
    return this.#find("WHERE m.account_id = ? AND w.id = ? AND w.status = 'active' AND m.status = 'active'", userId, workspaceId);
  }

  async deletePersonalWorkspaceForUser(userId: string): Promise<void> {
    this.#database.prepare("DELETE FROM workspaces WHERE owner_account_id = ?").run(userId);
  }

  #find(where: string, ...values: string[]): WorkspaceAuthorization | undefined {
    const row = this.#database.prepare(`
      SELECT w.id, w.owner_account_id, w.name, w.status, w.created_at, w.updated_at,
             m.id AS membership_id, m.status AS membership_status,
             m.created_at AS membership_created_at, m.updated_at AS membership_updated_at
      FROM workspaces w JOIN memberships m ON m.workspace_id = w.id
      ${where}
    `).get(...values) as WorkspaceRow | undefined;
    if (!row) return undefined;
    const workspace: PersonalWorkspace = {
      workspaceId: row.id,
      ownerUserId: row.owner_account_id,
      name: row.name,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
    const membership: WorkspaceMembership = {
      membershipId: row.membership_id,
      workspaceId: row.id,
      userId: row.owner_account_id,
      role: 'owner',
      status: row.membership_status,
      createdAt: row.membership_created_at,
      updatedAt: row.membership_updated_at,
    };
    return { workspace, membership };
  }
}

export type ConversationRepository = {
  create(workspaceId: string, userId: string, title: string): Promise<ConversationSummary>;
  find(workspaceId: string, conversationId: string): Promise<ConversationSummary | undefined>;
  list(workspaceId: string): Promise<ConversationSummary[]>;
  messages(workspaceId: string, conversationId: string): Promise<ConversationMessage[] | undefined>;
};

export class SqliteConversationRepository implements ConversationRepository {
  readonly #database: SqliteDatabase;
  readonly #now: () => Date;
  readonly #createId: () => string;

  constructor(database: SqliteDatabase, options: PersistentRepositoryOptions = {}) {
    this.#database = database;
    this.#now = options.now ?? (() => new Date());
    this.#createId = options.createId ?? randomUUID;
  }

  async create(workspaceId: string, userId: string, title: string): Promise<ConversationSummary> {
    const normalizedTitle = title.trim();
    if (!normalizedTitle || normalizedTitle.length > 200) throw new Error("Invalid conversation title.");
    const timestamp = this.#now().toISOString();
    const id = `conversation_${this.#createId()}`;
    this.#database.prepare(`
      INSERT INTO conversations(id, workspace_id, title, status, created_by, created_at, updated_at)
      VALUES (?, ?, ?, 'active', ?, ?, ?)
    `).run(id, workspaceId, normalizedTitle, userId, timestamp, timestamp);
    return (await this.find(workspaceId, id))!;
  }

  async find(workspaceId: string, conversationId: string): Promise<ConversationSummary | undefined> {
    const row = this.#database.prepare(`
      SELECT id, workspace_id, title, status, version, created_at, updated_at
      FROM conversations WHERE workspace_id = ? AND id = ?
    `).get(workspaceId, conversationId) as {
      id: string; workspace_id: string; title: string; status: 'active' | "archived";
      version: number; created_at: string; updated_at: string;
    } | undefined;
    return row ? {
      conversationId: row.id,
      workspaceId: row.workspace_id,
      title: row.title,
      status: row.status,
      version: row.version,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    } : undefined;
  }

  async list(workspaceId: string): Promise<ConversationSummary[]> {
    const rows = this.#database.prepare("SELECT id FROM conversations WHERE workspace_id = ? AND status = \x27active\x27 ORDER BY updated_at DESC, created_at DESC").all(workspaceId) as Array<{ id: string }>;
    return Promise.all(rows.map(async ({ id }) => (await this.find(workspaceId, id))!));
  }

  async messages(workspaceId: string, conversationId: string): Promise<ConversationMessage[] | undefined> {
    if (!await this.find(workspaceId, conversationId)) return undefined;
    const rows = this.#database.prepare(`SELECT m.id, m.conversation_id, m.content_text, m.state, m.created_at, e.id execution_id, e.request_id, e.state execution_state, e.updated_at execution_updated_at, e.started_at, e.completed_at, e.provider, e.model, e.response_text, e.failure_code, e.failure_detail, e.failure_retryable, e.requested_by FROM messages m LEFT JOIN runtime_executions e ON e.message_id=m.id WHERE m.workspace_id=? AND m.conversation_id=? ORDER BY m.created_at, m.id`).all(workspaceId, conversationId) as Array<Record<string, unknown>>;
    const messages: ConversationMessage[] = [];
    for (const row of rows) {
      const execution: RuntimeExecutionSnapshot | undefined = row.execution_id ? { executionId:String(row.execution_id), messageId:String(row.id), conversationId:String(row.conversation_id), requestId:String(row.request_id), workspaceId, requestedBy:String(row.requested_by), state:row.execution_state as RuntimeExecutionSnapshot["state"], createdAt:String(row.created_at), updatedAt:String(row.execution_updated_at), ...(row.started_at?{startedAt:String(row.started_at)}:{}), ...(row.completed_at?{completedAt:String(row.completed_at)}:{}), ...(row.provider?{provider:String(row.provider)}:{}), ...(row.model?{model:String(row.model)}:{}), ...(row.response_text?{response:{text:String(row.response_text)}}:{}), ...(row.failure_code?{failure:{code:row.failure_code as RuntimeExecutionFailure["code"],detail:String(row.failure_detail),retryable:Boolean(row.failure_retryable)}}:{}) } : undefined;
      messages.push({messageId:String(row.id),conversationId:String(row.conversation_id),role:"user",text:String(row.content_text),state:row.state as ConversationMessage["state"],createdAt:String(row.created_at),...(execution?{execution}:{})});
      if(execution?.response?.text) messages.push({messageId:`:assistant`,conversationId:String(row.conversation_id),role:"assistant",text:execution.response.text,state:"complete",createdAt:execution.completedAt??execution.updatedAt});
    }
    return messages;
  }
}
