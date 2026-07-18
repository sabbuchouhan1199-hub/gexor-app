export type AuthDomainErrorCode =
  | "INVALID_EMAIL"
  | "INVALID_DISPLAY_NAME"
  | "PASSWORD_POLICY_VIOLATION"
  | "DUPLICATE_EMAIL"
  | "INVALID_CREDENTIALS"
  | "USER_DISABLED"
  | "MALFORMED_PASSWORD_HASH"
  | "PASSWORD_HASHING_FAILED"
  | "SESSION_TOKEN_GENERATION_FAILED";

const messages: Record<AuthDomainErrorCode, string> = {
  INVALID_EMAIL: "The email address is invalid.",
  INVALID_DISPLAY_NAME: "The display name is invalid.",
  PASSWORD_POLICY_VIOLATION: "The password does not meet the required security policy.",
  DUPLICATE_EMAIL: "The email address is unavailable.",
  INVALID_CREDENTIALS: "The email or password is incorrect.",
  USER_DISABLED: "The account is not permitted to sign in.",
  MALFORMED_PASSWORD_HASH: "The stored password credential is invalid.",
  PASSWORD_HASHING_FAILED: "The password credential could not be processed.",
  SESSION_TOKEN_GENERATION_FAILED: "The session credential could not be created.",
};

export class AuthDomainError extends Error {
  readonly code: AuthDomainErrorCode;

  constructor(code: AuthDomainErrorCode) {
    super(messages[code]);
    this.name = "AuthDomainError";
    this.code = code;
  }
}
