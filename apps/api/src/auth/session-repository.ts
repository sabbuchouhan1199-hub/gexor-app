import { randomUUID } from "node:crypto";

import type {
  AuthSessionSummary,
  SessionStatus,
} from "@gexor/contracts";

import type { SessionTokenGenerator } from "./session-token.js";
import { OpaqueSessionTokenGenerator } from "./session-token.js";

export const DEFAULT_SESSION_LIFETIME_MS = 24 * 60 * 60 * 1000;

export type SessionRecord = {
  sessionId: string;
  userId: string;
  tokenHash: string;
  createdAt: string;
  expiresAt: string;
  lastSeenAt: string;
  revokedAt?: string;
};

export type CreatedSession = {
  sessionToken: string;
  session: AuthSessionSummary;
};

export type SessionLookupResult =
  | { outcome: "valid"; session: AuthSessionSummary }
  | { outcome: "unknown" }
  | { outcome: "expired" }
  | { outcome: "revoked" };

export interface SessionRepository {
  create(userId: string): Promise<CreatedSession>;
  findValidByToken(sessionToken: string): Promise<SessionLookupResult>;
  inspectById(sessionId: string): Promise<AuthSessionSummary | undefined>;
  touch(sessionToken: string): Promise<SessionLookupResult>;
  revoke(sessionId: string): Promise<AuthSessionSummary | undefined>;
  revokeAllForUser(userId: string): Promise<number>;
  deleteExpired(): Promise<number>;
}

export type InMemorySessionRepositoryOptions = {
  now?: () => Date;
  createId?: () => string;
  tokenGenerator?: SessionTokenGenerator;
  lifetimeMs?: number;
};

export class InMemorySessionRepository implements SessionRepository {
  readonly #recordsById = new Map<string, SessionRecord>();
  readonly #idByTokenHash = new Map<string, string>();
  readonly #now: () => Date;
  readonly #createId: () => string;
  readonly #tokenGenerator: SessionTokenGenerator;
  readonly #lifetimeMs: number;

  constructor(options: InMemorySessionRepositoryOptions = {}) {
    const lifetimeMs = options.lifetimeMs ?? DEFAULT_SESSION_LIFETIME_MS;
    if (!Number.isSafeInteger(lifetimeMs) || lifetimeMs < 1) {
      throw new Error("Session lifetime must be a positive integer.");
    }

    this.#now = options.now ?? (() => new Date());
    this.#createId = options.createId ?? randomUUID;
    this.#tokenGenerator = options.tokenGenerator ?? new OpaqueSessionTokenGenerator();
    this.#lifetimeMs = lifetimeMs;
  }

  async create(userId: string): Promise<CreatedSession> {
    const now = this.#now();
    const sessionToken = this.#tokenGenerator.generate();
    const tokenHash = this.#tokenGenerator.hash(sessionToken);
    const record: SessionRecord = {
      sessionId: `session_${this.#createId()}`,
      userId,
      tokenHash,
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + this.#lifetimeMs).toISOString(),
      lastSeenAt: now.toISOString(),
    };
    this.#recordsById.set(record.sessionId, record);
    this.#idByTokenHash.set(tokenHash, record.sessionId);

    return {
      sessionToken,
      session: toSessionSummary(record, now),
    };
  }

  async findValidByToken(sessionToken: string): Promise<SessionLookupResult> {
    return this.#lookup(sessionToken, this.#now());
  }

  async inspectById(sessionId: string): Promise<AuthSessionSummary | undefined> {
    const record = this.#recordsById.get(sessionId);
    return record ? toSessionSummary(record, this.#now()) : undefined;
  }

  async touch(sessionToken: string): Promise<SessionLookupResult> {
    const now = this.#now();
    const result = this.#lookupRecord(sessionToken, now);
    if (result.outcome !== "valid") return result;

    result.record.lastSeenAt = now.toISOString();
    return {
      outcome: "valid",
      session: toSessionSummary(result.record, now),
    };
  }

  async revoke(sessionId: string): Promise<AuthSessionSummary | undefined> {
    const record = this.#recordsById.get(sessionId);
    if (!record) return undefined;
    const now = this.#now();
    if (!record.revokedAt) record.revokedAt = now.toISOString();
    return toSessionSummary(record, now);
  }

  async revokeAllForUser(userId: string): Promise<number> {
    const now = this.#now();
    let revokedCount = 0;
    for (const record of this.#recordsById.values()) {
      if (record.userId === userId && sessionStatus(record, now) === "active") {
        record.revokedAt = now.toISOString();
        revokedCount += 1;
      }
    }
    return revokedCount;
  }

  async deleteExpired(): Promise<number> {
    const now = this.#now();
    let deletedCount = 0;
    for (const [sessionId, record] of this.#recordsById) {
      if (new Date(record.expiresAt).getTime() <= now.getTime()) {
        this.#recordsById.delete(sessionId);
        this.#idByTokenHash.delete(record.tokenHash);
        deletedCount += 1;
      }
    }
    return deletedCount;
  }

  #lookup(sessionToken: string, now: Date): SessionLookupResult {
    const result = this.#lookupRecord(sessionToken, now);
    if (result.outcome !== "valid") return result;
    return {
      outcome: "valid",
      session: toSessionSummary(result.record, now),
    };
  }

  #lookupRecord(
    sessionToken: string,
    now: Date,
  ):
    | { outcome: "valid"; record: SessionRecord }
    | { outcome: "unknown" }
    | { outcome: "expired" }
    | { outcome: "revoked" } {
    const tokenHash = this.#tokenGenerator.hash(sessionToken);
    const sessionId = this.#idByTokenHash.get(tokenHash);
    if (!sessionId) return { outcome: "unknown" };

    const record = this.#recordsById.get(sessionId);
    if (!record) return { outcome: "unknown" };

    const status = sessionStatus(record, now);
    if (status === "expired") return { outcome: "expired" };
    if (status === "revoked") return { outcome: "revoked" };
    return { outcome: "valid", record };
  }
}

function sessionStatus(record: SessionRecord, now: Date): SessionStatus {
  if (record.revokedAt) return "revoked";
  if (new Date(record.expiresAt).getTime() <= now.getTime()) return "expired";
  return "active";
}

function toSessionSummary(
  record: SessionRecord,
  now: Date,
): AuthSessionSummary {
  return {
    sessionId: record.sessionId,
    userId: record.userId,
    status: sessionStatus(record, now),
    createdAt: record.createdAt,
    expiresAt: record.expiresAt,
    lastSeenAt: record.lastSeenAt,
    ...(record.revokedAt ? { revokedAt: record.revokedAt } : {}),
  };
}
