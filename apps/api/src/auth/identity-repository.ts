import type {
  AuthenticatedUser,
  UserStatus,
} from "@gexor/contracts";
import { randomUUID } from "node:crypto";

import { AuthDomainError } from "./auth-errors.js";
import { normalizeEmail } from "./email.js";
import {
  normalizeDisplayName,
  toAuthenticatedUser,
  type UserIdentityRecord,
} from "./user-identity.js";

export type CreateIdentityInput = {
  email: string;
  normalizedEmail: string;
  displayName: string;
  passwordHash: string;
};

export type InternalCredentialRecord = UserIdentityRecord;

export interface IdentityRepository {
  create(input: CreateIdentityInput): Promise<AuthenticatedUser>;
  findById(userId: string): Promise<AuthenticatedUser | undefined>;
  findCredentialsByNormalizedEmail(
    normalizedEmail: string,
  ): Promise<InternalCredentialRecord | undefined>;
  setStatus(
    userId: string,
    status: UserStatus,
  ): Promise<AuthenticatedUser | undefined>;
}

export type InMemoryIdentityRepositoryOptions = {
  now?: () => Date;
  createId?: () => string;
};

export class InMemoryIdentityRepository implements IdentityRepository {
  readonly #recordsById = new Map<string, UserIdentityRecord>();
  readonly #idByNormalizedEmail = new Map<string, string>();
  readonly #now: () => Date;
  readonly #createId: () => string;

  constructor(options: InMemoryIdentityRepositoryOptions = {}) {
    this.#now = options.now ?? (() => new Date());
    this.#createId = options.createId ?? randomUUID;
  }

  async create(input: CreateIdentityInput): Promise<AuthenticatedUser> {
    const email = normalizeEmail(input.email);
    const normalizedEmail = normalizeEmail(input.normalizedEmail);
    if (email !== normalizedEmail) {
      throw new AuthDomainError("INVALID_EMAIL");
    }
    if (input.passwordHash.length === 0) {
      throw new AuthDomainError("MALFORMED_PASSWORD_HASH");
    }
    if (this.#idByNormalizedEmail.has(normalizedEmail)) {
      throw new AuthDomainError("DUPLICATE_EMAIL");
    }

    const timestamp = this.#now().toISOString();
    const record: UserIdentityRecord = {
      userId: `user_${this.#createId()}`,
      email,
      normalizedEmail,
      displayName: normalizeDisplayName(input.displayName),
      status: "active",
      passwordHash: input.passwordHash,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.#recordsById.set(record.userId, record);
    this.#idByNormalizedEmail.set(normalizedEmail, record.userId);
    return toAuthenticatedUser(record);
  }

  async findById(userId: string): Promise<AuthenticatedUser | undefined> {
    const record = this.#recordsById.get(userId);
    return record ? toAuthenticatedUser(record) : undefined;
  }

  async findCredentialsByNormalizedEmail(
    normalizedEmail: string,
  ): Promise<InternalCredentialRecord | undefined> {
    let canonicalEmail: string;
    try {
      canonicalEmail = normalizeEmail(normalizedEmail);
    } catch {
      return undefined;
    }

    const userId = this.#idByNormalizedEmail.get(canonicalEmail);
    if (!userId) return undefined;
    const record = this.#recordsById.get(userId);
    return record ? { ...record } : undefined;
  }

  async setStatus(
    userId: string,
    status: UserStatus,
  ): Promise<AuthenticatedUser | undefined> {
    const record = this.#recordsById.get(userId);
    if (!record) return undefined;
    record.status = status;
    record.updatedAt = this.#now().toISOString();
    return toAuthenticatedUser(record);
  }
}
