# Gexor Runtime API

This document describes the verified API surface in this repository. Repository code and tests remain authoritative.

## Authentication

Browser authentication uses server-issued cookies:

- Development session cookie: `gexor_session`
- Production session cookie: `__Host-gexor_session`
- CSRF proof cookie: `gexor_csrf`
- Session cookie flags: HttpOnly, Path=/, SameSite=Lax, Secure in production
- CSRF cookie flags: Path=/, SameSite=Lax, Secure in production

State-changing cookie-authenticated requests must include `X-CSRF-Token` matching the CSRF cookie. Allowed origin validation is enabled when `GEXOR_ALLOWED_ORIGIN` is configured. Non-browser bearer sessions remain accepted for compatibility, but browser code does not persist bearer tokens in localStorage or sessionStorage.

Routes:

- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/logout`
- `GET /api/v1/auth/me`

## Conversations and Messages

Routes:

- `POST /api/v1/workspaces/:workspaceId/conversations`
- `GET /api/v1/workspaces/:workspaceId/conversations`
- `GET /api/v1/workspaces/:workspaceId/conversations/search?q=...&cursor=...&limit=...`
- `PATCH /api/v1/conversations/:conversationId`
- `DELETE /api/v1/conversations/:conversationId`
- `GET /api/v1/conversations/:conversationId/messages`
- `POST /api/v1/conversations/:conversationId/messages`

Message submission requires an `Idempotency-Key`. Acceptance writes the user message, runtime execution, idempotency record, outbox event, durable queue job, and initial replay snapshot in one SQLite transaction.

Conversation deletion is soft deletion. Normal lists, reads, and search hide deleted conversations while preserving audit evidence and related data integrity.

## Execution Streaming, Replay, and Controls

Routes:

- `GET /api/v1/executions/:executionId`
- `GET /api/v1/executions/:executionId/events?after=<sequence>`
- `POST /api/v1/executions/:executionId/cancel`
- `POST /api/v1/executions/:executionId/retry`
- `POST /api/v1/executions/:executionId/regenerate`

SSE events are durable rows in `execution_events`. Each event has a stable id, execution id, event type, timestamp, sequence, and safe payload.

Event types:

- `execution.snapshot`
- `execution.started`
- `response.delta`
- `response.completed`
- `execution.cancelled`
- `execution.failed`
- `execution.timed_out`
- `heartbeat`

Replay uses the `after` sequence cursor. The client ignores duplicate event ids/sequences and reconnects with bounded exponential backoff. When history cannot cover the requested cursor, the server can return a replay-gap snapshot instead of fabricating missing deltas.

Cancellation is idempotent. Retry creates a new execution related to the failed, timed-out, or cancelled execution. Regenerate creates a new assistant attempt related to a completed execution. Historical attempts are preserved.

## Worker and Queue

Accepted work is queued in SQLite `execution_jobs`. The worker claims jobs with leases, records attempts, processes streaming providers when available, persists deltas, records terminal state once, writes usage idempotently, retries eligible transient provider failures with bounded backoff, and leaves exhausted failures auditable as dead-letter jobs.

Run the worker with:

```sh
npm run worker --workspace apps/api
```

## Provider Management

Routes:

- `GET /api/v1/providers`
- `GET /api/v1/workspaces/:workspaceId/provider-connections`
- `POST /api/v1/workspaces/:workspaceId/provider-connections`
- `PATCH /api/v1/workspaces/:workspaceId/provider-connections/:connectionId/routing`
- `POST /api/v1/workspaces/:workspaceId/provider-connections/:connectionId/test`
- `POST /api/v1/workspaces/:workspaceId/provider-connections/:connectionId/select`
- `POST /api/v1/workspaces/:workspaceId/provider-connections/:connectionId/revoke`
- `POST /api/v1/workspaces/:workspaceId/provider-connections/:connectionId/rotate`

Public responses redact credential references. Health states are `unknown`, `healthy`, `degraded`, `unhealthy`, and `disabled`. Routing is deterministic by default status, priority, and connection id. Fallback is bounded by execution attempt number and is only appropriate for retryable transient failures.

## Usage and Budgets

Routes:

- `GET /api/v1/workspaces/:workspaceId/usage?from=...&to=...`
- `PATCH /api/v1/workspaces/:workspaceId/usage/budget`

Usage records are idempotent by execution id. Token usage is marked `measured`, `estimated`, or `unavailable`. Current cost uses a versioned unpriced pricing row and stores cost in micros to avoid binary floating-point money errors.

Workspace budgets can limit requests, tokens, or cost micros for the active period. Acceptance checks configured limits before queueing new work.

## File Uploads

Routes:

- `POST /api/v1/conversations/:conversationId/files`
- `GET /api/v1/conversations/:conversationId/files`
- `DELETE /api/v1/files/:fileId`

Supported initial types are PDF, plain text, and Markdown. Upload validation checks size, extension, MIME type, and simple signatures. Storage keys are generated server-side under the configured private upload directory. Public responses never expose filesystem paths. Extraction is bounded text extraction into chunks with provenance. Uploaded content is treated as untrusted reference context.

## Health and Metrics

Routes:

- `GET /health`
- `GET /api/v1/health`
- `GET /api/v1/health/live`
- `GET /api/v1/health/ready`
- `GET /api/v1/metrics`

Metrics are protected by authentication and avoid message text, filenames, document contents, secrets, raw inputs, and uncontrolled high-cardinality labels.
