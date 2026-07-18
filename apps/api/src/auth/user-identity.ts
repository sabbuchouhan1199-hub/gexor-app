import type {
  AuthenticatedUser,
  UserStatus,
} from "@gexor/contracts";

import { AuthDomainError } from "./auth-errors.js";

export const MAX_DISPLAY_NAME_LENGTH = 100;
export const DEFAULT_USER_STATUS: UserStatus = "active";

export type UserIdentityRecord = {
  userId: string;
  email: string;
  normalizedEmail: string;
  displayName: string;
  status: UserStatus;
  passwordHash: string;
  createdAt: string;
  updatedAt: string;
};

export function normalizeDisplayName(input: string): string {
  const displayName = input.trim();
  if (
    displayName.length === 0
    || Array.from(displayName).length > MAX_DISPLAY_NAME_LENGTH
    || displayName.includes("\0")
  ) {
    throw new AuthDomainError("INVALID_DISPLAY_NAME");
  }
  return displayName;
}

export function toAuthenticatedUser(
  identity: UserIdentityRecord,
): AuthenticatedUser {
  return {
    userId: identity.userId,
    email: identity.email,
    displayName: identity.displayName,
    status: identity.status,
    createdAt: identity.createdAt,
    updatedAt: identity.updatedAt,
  };
}
