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
  | "PROVIDER_REQUEST_REJECTED"
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
  "accepted",
  "preparing",
  "dispatching",
  "completed",
  "failed",
  "timed_out",
  "cancelled",
] as const;

export type RuntimeExecutionState = (typeof runtimeExecutionStates)[number];

export type RuntimeExecutionFailure = {
  code: ApiProblemCode;
  detail: string;
  retryable: boolean;
};

export type RuntimeExecutionSnapshot = {
  executionId: string;
  messageId: string;
  conversationId: string;
  requestId: string;
  state: RuntimeExecutionState;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
  provider?: string;
  model?: string;
  response?: { text: string };
  failure?: RuntimeExecutionFailure;
};

export type MessageSubmissionRequest = {
  content: [{ type: "text"; text: string }];
};

export type MessageSubmissionResponse = {
  messageId: string;
  executionId: string;
  state: RuntimeExecutionState;
  requestId: string;
  createdAt: string;
  links: { execution: string };
};

export type RuntimeExecutionResponse = RuntimeExecutionSnapshot & {
  links: { self: string };
};
