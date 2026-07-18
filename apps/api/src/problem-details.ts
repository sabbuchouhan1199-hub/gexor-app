import type {
  ApiProblemCode,
  RuntimeExecutionFailure,
} from "@gexor/contracts";

import { ProviderError } from "./providers/errors.js";

export type ProblemDefinition = {
  type: string;
  title: string;
  detail: string;
  retryable: boolean;
};

export const problemDefinitions: Record<ApiProblemCode, ProblemDefinition> = {
  AUTHENTICATION_REQUIRED: {
    type: "https://docs.gexor/errors/authentication-required",
    title: "Authentication required",
    detail: "Authentication is required to access this resource.",
    retryable: false,
  },
  INVALID_CREDENTIALS: {
    type: "https://docs.gexor/errors/invalid-credentials",
    title: "Invalid credentials",
    detail: "The email or password is incorrect.",
    retryable: false,
  },
  SESSION_EXPIRED: {
    type: "https://docs.gexor/errors/session-expired",
    title: "Session expired",
    detail: "The session has expired. Sign in again.",
    retryable: false,
  },
  SESSION_REVOKED: {
    type: "https://docs.gexor/errors/session-revoked",
    title: "Session revoked",
    detail: "The session is no longer active. Sign in again.",
    retryable: false,
  },
  EMAIL_ALREADY_EXISTS: {
    type: "https://docs.gexor/errors/email-already-exists",
    title: "Registration unavailable",
    detail: "Registration could not be completed with the supplied email address.",
    retryable: false,
  },
  PASSWORD_POLICY_VIOLATION: {
    type: "https://docs.gexor/errors/password-policy-violation",
    title: "Password policy violation",
    detail: "The password does not meet the required security policy.",
    retryable: false,
  },
  USER_DISABLED: {
    type: "https://docs.gexor/errors/user-disabled",
    title: "Account unavailable",
    detail: "The account is not permitted to sign in.",
    retryable: false,
  },
  WORKSPACE_CONTEXT_REQUIRED: {
    type: "https://docs.gexor/errors/workspace-context-required",
    title: "Workspace context required",
    detail: "An authorized workspace context is required.",
    retryable: false,
  },
  WORKSPACE_ACCESS_DENIED: {
    type: "https://docs.gexor/errors/workspace-access-denied",
    title: "Workspace access denied",
    detail: "The requested resource is not available in the authorized workspace.",
    retryable: false,
  },
  VALIDATION_ERROR: {
    type: "https://docs.gexor/errors/validation-error",
    title: "Validation error",
    detail: "Request validation failed.",
    retryable: false,
  },
  ROUTE_NOT_FOUND: {
    type: "https://docs.gexor/errors/route-not-found",
    title: "Route not found",
    detail: "The requested route was not found.",
    retryable: false,
  },
  CONVERSATION_NOT_FOUND: {
    type: "https://docs.gexor/errors/conversation-not-found",
    title: "Conversation not found",
    detail: "The requested conversation was not found.",
    retryable: false,
  },
  IDEMPOTENCY_KEY_REQUIRED: {
    type: "https://docs.gexor/errors/idempotency-key-required",
    title: "Idempotency key required",
    detail: "A valid Idempotency-Key header is required for this operation.",
    retryable: false,
  },
  IDEMPOTENCY_CONFLICT: {
    type: "https://docs.gexor/errors/idempotency-conflict",
    title: "Idempotency conflict",
    detail: "The idempotency key was already used for a different request.",
    retryable: false,
  },
  EXECUTION_NOT_FOUND: {
    type: "https://docs.gexor/errors/execution-not-found",
    title: "Execution not found",
    detail: "The requested execution was not found.",
    retryable: false,
  },
  INTERNAL_SERVER_ERROR: {
    type: "https://docs.gexor/errors/internal-server-error",
    title: "Internal server error",
    detail: "An unexpected server error occurred.",
    retryable: false,
  },
  PROVIDER_AUTHENTICATION_FAILED: {
    type: "https://docs.gexor/errors/provider-authentication-failed",
    title: "Provider authentication failed",
    detail: "The provider request could not be authenticated.",
    retryable: false,
  },
  PROVIDER_CONNECTION_REQUIRED: {
    type: "https://docs.gexor/errors/provider-connection-required",
    title: "Provider connection required",
    detail: "An active provider connection and model selection are required for this workspace.",
    retryable: false,
  },
  PROVIDER_CONNECTION_INVALID: {
    type: "https://docs.gexor/errors/provider-connection-invalid",
    title: "Provider connection invalid",
    detail: "The provider connection is unavailable or invalid.",
    retryable: false,
  },
  PROVIDER_REQUEST_REJECTED: {
    type: "https://docs.gexor/errors/provider-request-rejected",
    title: "Provider request rejected",
    detail: "The provider rejected the request.",
    retryable: false,
  },
  PROVIDER_MODEL_NOT_FOUND: {
    type: "https://docs.gexor/errors/provider-model-not-found",
    title: "Provider model not found",
    detail: "The configured provider model is unavailable.",
    retryable: false,
  },
  PROVIDER_RATE_LIMITED: {
    type: "https://docs.gexor/errors/provider-rate-limited",
    title: "Provider rate limited",
    detail: "The provider temporarily rejected the request.",
    retryable: true,
  },
  PROVIDER_TIMEOUT: {
    type: "https://docs.gexor/errors/provider-timeout",
    title: "Provider timeout",
    detail: "The provider request timed out.",
    retryable: true,
  },
  PROVIDER_UNAVAILABLE: {
    type: "https://docs.gexor/errors/provider-unavailable",
    title: "Provider unavailable",
    detail: "The provider is unavailable.",
    retryable: true,
  },
  PROVIDER_INVALID_RESPONSE: {
    type: "https://docs.gexor/errors/provider-invalid-response",
    title: "Invalid provider response",
    detail: "The provider returned an invalid response.",
    retryable: false,
  },
  CSRF_VALIDATION_FAILED: { type: "https://docs.gexor/errors/csrf-validation-failed", title: "CSRF validation failed", detail: "The request could not be verified. Refresh and try again.", retryable: false },
  ORIGIN_NOT_ALLOWED: { type: "https://docs.gexor/errors/origin-not-allowed", title: "Origin not allowed", detail: "The request origin is not allowed.", retryable: false },
  EXECUTION_NOT_CANCELLABLE: { type: "https://docs.gexor/errors/execution-not-cancellable", title: "Execution not cancellable", detail: "The execution can no longer be cancelled.", retryable: false },
  EXECUTION_NOT_RETRYABLE: { type: "https://docs.gexor/errors/execution-not-retryable", title: "Execution action unavailable", detail: "The requested execution action is not available in its current state.", retryable: false },
  REPLAY_GAP: { type: "https://docs.gexor/errors/replay-gap", title: "Replay gap", detail: "Some historical stream events are unavailable; reconcile using the current snapshot.", retryable: true },
  RATE_LIMITED: { type: "https://docs.gexor/errors/rate-limited", title: "Rate limited", detail: "Too many requests were received. Try again later.", retryable: true },
  UPLOAD_TOO_LARGE: { type: "https://docs.gexor/errors/upload-too-large", title: "Upload too large", detail: "The uploaded document exceeds the configured size limit.", retryable: false },
  UNSUPPORTED_FILE_TYPE: { type: "https://docs.gexor/errors/unsupported-file-type", title: "Unsupported file type", detail: "The uploaded document type is not supported or did not match its content.", retryable: false },
  FILE_NOT_FOUND: { type: "https://docs.gexor/errors/file-not-found", title: "File not found", detail: "The requested attachment was not found.", retryable: false },
  BUDGET_EXCEEDED: { type: "https://docs.gexor/errors/budget-exceeded", title: "Budget exceeded", detail: "The workspace usage limit has been reached.", retryable: false },
};

export function toSafeRuntimeFailure(error: unknown): RuntimeExecutionFailure {
  if (error instanceof ProviderError) {
    return {
      code: error.code,
      detail: problemDefinitions[error.code].detail,
      retryable: error.retryable,
    };
  }

  return {
    code: "INTERNAL_SERVER_ERROR",
    detail: problemDefinitions.INTERNAL_SERVER_ERROR.detail,
    retryable: false,
  };
}
