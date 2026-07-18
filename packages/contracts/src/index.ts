export type ChatRequest = {
  message: string;
};

export type ChatResponse = {
  reply: string;
};

export type ApiProblemCode =
  | "VALIDATION_ERROR"
  | "ROUTE_NOT_FOUND"
  | "EXECUTION_NOT_FOUND"
  | "INTERNAL_SERVER_ERROR"
  | "PROVIDER_AUTHENTICATION_FAILED"
  | "PROVIDER_MODEL_NOT_FOUND"
  | "PROVIDER_RATE_LIMITED"
  | "PROVIDER_TIMEOUT"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_INVALID_RESPONSE";

export type ApiProblem = {
  type: string;
  title: string;
  status: number;
  code: ApiProblemCode;
  detail: string;
  requestId: string;
  retryable: boolean;
  errors?: Array<{ path: string; message: string }>;
};

export const runtimeExecutionStates = [
  "created", "validating", "preparing", "provider_pending", "streaming",
  "finalizing", "reconciliation_pending", "completed", "failed",
  "cancellation_requested", "cancelled",
] as const;

export type RuntimeExecutionState = (typeof runtimeExecutionStates)[number];

export type MessageSubmissionRequest = {
  content: Array<{ type: "text"; text: string }>;
};

export type MessageSubmissionResponse = {
  messageId: string;
  executionId: string;
  state: RuntimeExecutionState;
  requestId: string;
  createdAt: string;
  links: { execution: string };
};

export type RuntimeExecutionResponse = {
  id: string;
  conversationId: string;
  messageId: string;
  state: RuntimeExecutionState;
  createdAt: string;
  updatedAt: string;
  links: { self: string };
};
