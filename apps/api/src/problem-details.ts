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
