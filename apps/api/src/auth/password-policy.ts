import { AuthDomainError } from "./auth-errors.js";

export const MIN_PASSWORD_LENGTH = 12;
export const MAX_PASSWORD_LENGTH = 128;

export function validatePassword(password: string): void {
  const characterLength = Array.from(password).length;

  if (
    characterLength < MIN_PASSWORD_LENGTH
    || characterLength > MAX_PASSWORD_LENGTH
    || password.trim().length === 0
    || password.includes("\0")
  ) {
    throw new AuthDomainError("PASSWORD_POLICY_VIOLATION");
  }
}
