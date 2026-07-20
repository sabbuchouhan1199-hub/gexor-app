export type ChatRequest = {
  message: string;
};

export type ChatResponse = {
  reply: string;
};

export type UserStatus =
  | "active"
  | "disabled";

export type AuthenticatedUser = {
  userId: string;
  email: string;
  displayName: string;
  status: UserStatus;
  createdAt: string;
  updatedAt: string;
};

export type SessionStatus =
  | "active"
  | "expired"
  | "revoked";

export type AuthSessionSummary = {
  sessionId: string;
  userId: string;
  status: SessionStatus;
  createdAt: string;
  expiresAt: string;
  lastSeenAt: string;
  revokedAt?: string;
};

export type WorkspaceStatus = "active" | "suspended";

export type PersonalWorkspace = {
  workspaceId: string;
  ownerUserId: string;
  name: string;
  status: WorkspaceStatus;
  createdAt: string;
  updatedAt: string;
};

export type WorkspaceMembership = {
  membershipId: string;
  workspaceId: string;
  userId: string;
  role: "owner";
  status: "active" | "revoked";
  createdAt: string;
  updatedAt: string;
};

export type RegisterRequest = {
  displayName: string;
  email: string;
  password: string;
};

export type LoginRequest = {
  email: string;
  password: string;
};

export type AuthenticationResponse = {
  user: AuthenticatedUser;
  session: AuthSessionSummary;
  workspace: PersonalWorkspace;
  membership: WorkspaceMembership;
};

export type RegisterResponse = AuthenticationResponse;

export type LoginResponse = AuthenticationResponse;

export type CurrentUserResponse = AuthenticationResponse;

export type ApiProblemCode =
  | "AUTHENTICATION_REQUIRED"
  | "INVALID_CREDENTIALS"
  | "SESSION_EXPIRED"
  | "SESSION_REVOKED"
  | "EMAIL_ALREADY_EXISTS"
  | "PASSWORD_POLICY_VIOLATION"
  | "USER_DISABLED"
  | "WORKSPACE_CONTEXT_REQUIRED"
  | "WORKSPACE_ACCESS_DENIED"
  | "VALIDATION_ERROR"
  | "ROUTE_NOT_FOUND"
  | "EXECUTION_NOT_FOUND"
  | "CONVERSATION_NOT_FOUND"
  | "IDEMPOTENCY_KEY_REQUIRED"
  | "IDEMPOTENCY_CONFLICT"
  | "INTERNAL_SERVER_ERROR"
  | "PROVIDER_AUTHENTICATION_FAILED"
  | "PROVIDER_CONNECTION_REQUIRED"
  | "PROVIDER_CONNECTION_INVALID"
  | "PROVIDER_REQUEST_REJECTED"
  | "PROVIDER_MODEL_NOT_FOUND"
  | "PROVIDER_RATE_LIMITED"
  | "PROVIDER_TIMEOUT"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_INVALID_RESPONSE"
  | "CSRF_VALIDATION_FAILED"
  | "ORIGIN_NOT_ALLOWED"
  | "EXECUTION_NOT_CANCELLABLE"
  | "EXECUTION_NOT_RETRYABLE"
  | "REPLAY_GAP"
  | "RATE_LIMITED"
  | "UPLOAD_TOO_LARGE"
  | "UNSUPPORTED_FILE_TYPE"
  | "FILE_NOT_FOUND"
  | "BUDGET_EXCEEDED";

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
  workspaceId?: string;
  requestedBy?: string;
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

export type ProviderCatalogueEntry = { providerKey: string; displayName: string; status: "active" | "disabled" };
export type ModelCatalogueEntry = { modelKey: string; providerKey: string; providerModelId: string; displayName: string; status: "active" | "disabled" };
export type ProviderConnectionStatus = "pending_validation" | "active" | "invalid" | "revoked";
export type WorkspaceProviderConnection = { connectionId: string; workspaceId: string; providerKey: string; status: ProviderConnectionStatus; createdAt: string; updatedAt: string; validatedAt?: string; revokedAt?: string };
export type CreateProviderConnectionRequest = { providerKey: string; credentialReference: string };
export type SelectProviderConnectionRequest = { modelKey: string };
export type RotateProviderCredentialReferenceRequest = { credentialReference: string };

export type CreateConversationRequest = {
  title: string;
};

export type ConversationSummary = {
  conversationId: string;
  workspaceId: string;
  title: string;
  status: "active" | "archived";
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type ConversationMessage = {
  messageId: string; conversationId: string; role: "user" | "assistant"; text: string;
  state: "accepted" | "complete" | "failed" | "cancelled"; createdAt: string;
  execution?: RuntimeExecutionSnapshot;
};
export type ConversationListResponse = { conversations: ConversationSummary[] };
export type ConversationMessagesResponse = { messages: ConversationMessage[] };

export const MAX_MESSAGE_TEXT_LENGTH = 4000;

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

export const executionEventTypes = [
  "execution.snapshot", "execution.started", "response.delta", "response.completed",
  "execution.cancelled", "execution.failed", "execution.timed_out", "heartbeat",
] as const;
export type ExecutionEventType = (typeof executionEventTypes)[number];
export type ExecutionStreamEvent = {
  eventId: string; executionId: string; eventType: ExecutionEventType;
  timestamp: string; sequence: number; payload: Record<string, unknown>;
};
export type ExecutionReplayResponse = {
  events: ExecutionStreamEvent[]; snapshot: RuntimeExecutionSnapshot;
  replayGap: boolean; nextSequence: number;
};
export type ExecutionRelationship = "initial" | "retry" | "regenerate";
export type ExecutionActionResponse = MessageSubmissionResponse & {
  relationship: ExecutionRelationship; sourceExecutionId?: string;
};
export type CancellationResponse = {
  executionId: string;
  status: "requested" | "completed" | "no_longer_possible";
  state: RuntimeExecutionState;
};

export type ProviderHealthState = "unknown" | "healthy" | "degraded" | "unhealthy" | "disabled";
export type ProviderRoutingStatus = {
  connectionId: string; priority: number; enabled: boolean; isDefault: boolean;
  modelKey?: string;
  healthState: ProviderHealthState; lastCheckedAt?: string; safeFailureCode?: string;
  safeFailureMessage?: string; latencyMs?: number; consecutiveFailures: number;
};
export type WorkspaceProviderSelection = { connectionId: string; modelKey: string; providerModelId: string };
export type WorkspaceProviderConnectionsResponse = { connections: WorkspaceProviderConnection[]; routing: ProviderRoutingStatus[]; selected?: WorkspaceProviderSelection };
export type UpdateProviderRoutingRequest = { priority?: number; enabled?: boolean; isDefault?: boolean; modelKey?: string };

export type UsageClassification = "measured" | "estimated" | "unavailable";
export type UsageDashboard = {
  range: { from: string; to: string };
  totals: {
    requests: number; successful: number; failed: number; cancelled: number; timedOut: number;
    inputTokens: number; outputTokens: number; totalTokens: number;
    estimatedCostMicros: number; currency: string;
  };
  byProvider: Array<{ provider: string; model: string; requests: number; tokens: number; costMicros: number }>;
  usageClassification: { measured: number; estimated: number; unavailable: number };
  budget?: { requestLimit?: number; tokenLimit?: number; costLimitMicros?: number; state: "remaining" | "warning" | "reached" | "exceeded" };
};

export type UpdateWorkspaceBudgetRequest = { requestLimit?: number; tokenLimit?: number; costLimitMicros?: number };

export type ConversationSearchResult = { conversation: ConversationSummary; snippet?: string };
export type ConversationSearchResponse = { results: ConversationSearchResult[]; nextCursor?: string };
export type RenameConversationRequest = { title: string };
export type FileExtractionState = "pending" | "processing" | "ready" | "failed";
export type ConversationAttachment = {
  fileId: string; conversationId: string; displayName: string; contentType: string;
  sizeBytes: number; extractionState: FileExtractionState; safeFailureCode?: string;
  createdAt: string; updatedAt: string;
};
