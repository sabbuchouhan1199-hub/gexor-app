# Gexor Durable Project Context

Read this file together with `AGENTS.md` at the start of every Codex session in this repository. Verify every claim against the current working tree before acting. Repository code, migrations, tests, and current user instructions remain authoritative.

## 1. Status Vocabulary

- Verified current implementation: directly supported by present source, migrations, manifests, docs, or tests.
- Partial implementation: working foundation exists, but important production or product requirements remain limited.
- Strategic product vision: intended product direction, not proof of implementation.
- Future planned work: explicitly absent or deferred capability.
- Unknown or unverified: not provable from this repository.

## 2. Repository Snapshot

Verified on 2026-07-18 during the major runtime upgrade task:

- repository root: `/home/userland/workspaces/gexor-app`
- branch at task start: `main`
- commit at task start: `e18755ab97a8f297ee89bfb585f7b5cd220f7922`
- Node.js: `24.18.0`
- npm: `11.16.0`
- npm workspaces: `apps/*`, `packages/*`
- persistence: SQLite through Node `node:sqlite`; no ORM
- browser client: React/Vite
- API: Fastify
- shared contracts: `packages/contracts`

Always re-check branch, commit, and status. This snapshot will age.

## 3. Product Identity

Strategic product vision: Gexor is a provider-independent AI runtime and personal workspace intended to preserve workspace, context, memory, knowledge, and continuity independently of any one model provider.

Verified current implementation: this repository now provides a single-node local runtime foundation with authenticated browser workspace flows, durable SQLite-backed identity/session/workspace/conversation/execution data, live streaming, replay, worker queueing, provider management, usage accounting, chat management, upload foundations, and operations scaffolding.

This repository does not prove high availability, a hosted production topology, an external secret manager, regulatory compliance, a full semantic retrieval platform, or complete long-term memory continuity.

## 4. Repository Layout

```text
apps/api/              Fastify API, auth, providers, SQLite persistence, worker, operations
apps/api/migrations/   Ordered SQLite up/down migrations
apps/web/              React/Vite authenticated workspace UI and PWA assets
packages/contracts/    Shared API/runtime contracts
docs/                  API and operations documentation
README.md              Current setup and architecture overview
AGENTS.md              Codex operating rules
GEXOR.md               Durable project context
```

## 5. Commands

Root scripts:

```sh
npm run dev        # API, worker, and web concurrently
npm run dev:api    # API only
npm run dev:worker # worker only
npm run backup     # SQLite online backup command
npm run typecheck  # workspace typechecks
npm run test       # workspace tests
npm run build      # workspace builds where present
npm run verify     # typecheck, test, build
```

API scripts include `dev`, `worker`, `backup`, `start`, `typecheck`, and `test`. Web scripts include Vite dev/test/build/typecheck through the workspace package.

## 6. Architecture and Request Flow

Verified canonical browser path:

```text
React/Vite UI
  -> ApiClient with same-origin credentials, CSRF header, and X-Workspace-Id
  -> Fastify validation, request id, rate limit, cookie/bearer session lookup, workspace authorization
  -> SQLite transaction for message acceptance, idempotency, execution, outbox, queue job, and replay snapshot
  -> RuntimeWorker lease claim from execution_jobs
  -> provider-neutral streamText or generateText adapter
  -> execution_events response deltas and terminal event
  -> runtime_executions terminal state, usage_records, provider_attempts, queue completion/dead-letter
  -> browser SSE replay/reconnect and final conversation reload
```

Compatibility `/chat` and `/mock/chat` routes still exist for local development and tests. Do not route canonical browser behavior through them.

## 7. API Surface

Verified current routes include:

- public/health: `GET /health`, `GET /api/v1/health`, `GET /api/v1/health/live`, `GET /api/v1/health/ready`
- auth: `POST /api/v1/auth/register`, `POST /api/v1/auth/login`, `POST /api/v1/auth/logout`, `GET /api/v1/auth/me`
- providers: `GET /api/v1/providers`
- provider connections: `GET/POST /api/v1/workspaces/:workspaceId/provider-connections`, routing patch, test, select, revoke, rotate
- conversations: create/list/search/rename/delete
- messages: `GET/POST /api/v1/conversations/:conversationId/messages`
- executions: snapshot, SSE events, cancel, retry, regenerate
- usage: `GET /api/v1/workspaces/:workspaceId/usage`, `PATCH /api/v1/workspaces/:workspaceId/usage/budget`
- files: `POST/GET /api/v1/conversations/:conversationId/files`, `DELETE /api/v1/files/:fileId`
- metrics: `GET /api/v1/metrics` protected by authentication

See `docs/API_RUNTIME.md` for route behavior.

## 8. Authentication and Authorization

Verified current implementation:

- Browser auth uses HttpOnly session cookies and a separate CSRF proof cookie.
- Production session cookie name is `__Host-gexor_session`; development uses `gexor_session`.
- Cookies use SameSite=Lax, Path=/, and Secure in production.
- CSRF header validation is required for unsafe cookie-authenticated requests.
- `GEXOR_ALLOWED_ORIGIN` enables origin validation.
- Browser code no longer stores bearer tokens in localStorage or sessionStorage.
- Bearer sessions remain supported for non-browser compatibility.
- Sessions are stored as SHA-256 token hashes in SQLite and can be revoked durably.
- Workspace routes require active session, active account, active workspace, active owner membership, and explicit workspace context.

Future planned work: MFA/passkeys, email verification, recovery flows, session management UI, distributed session invalidation, and production auth assurance.

## 9. Persistence and Migrations

Verified current migrations:

- `001_core`: accounts, identities, sessions, workspaces, conversations, messages, runtime executions, idempotency, outbox.
- `002_provider_connections`: provider/model catalogues, workspace provider connections, selection, audit.
- `003_production_runtime`: execution events, execution jobs, relationships, provider routing, provider attempts, pricing versions/rates, usage records, workspace budgets, conversation deletion evidence, file attachments, file chunks, and search/ownership indexes.

Migrations are ordered and applied transactionally by the repository migration runner. Do not inspect real local SQLite data unless explicitly authorized.

## 10. Runtime Lifecycle

Verified current implementation:

- Message acceptance is idempotent and transactional.
- Durable queue scheduling happens in the same acceptance transaction.
- Worker claiming uses SQLite job state, lease owner, lease expiry, and retry wait.
- Stale leased jobs are returned to the queue when the lease expires.
- Worker restart can recover queued/retry-wait/stale-leased work.
- Streaming provider output is persisted as ordered `execution_events` deltas.
- Terminal execution states are guarded and terminal replay events are unique.
- Cancellation is idempotent and prevents later completion.
- Retry and regenerate create related new executions instead of mutating historical attempts.
- Usage records are idempotent by execution id.

Partial implementation / limitations:

- Queue, leases, metrics, and rate limits are single-node SQLite/in-memory foundations.
- No Redis or distributed queue is required locally.
- Provider fallback is bounded by execution attempt number and deterministic routing order; it is not a full policy engine.

## 11. SSE and Replay

Verified current implementation:

- `GET /api/v1/executions/:executionId/events?after=<sequence>` returns SSE.
- Events have stable id, execution id, event type, timestamp, sequence, and safe payload.
- Replay uses the `after` sequence cursor and ownership checks.
- Browser reconnect uses bounded exponential backoff and ignores duplicate ids/sequences.
- Terminal events stop reconnecting.
- Heartbeats/comments are emitted for long connections.

Known limitation: replay retention/compaction is modeled with durable rows and replay limits, but no background compaction job is implemented.

## 12. Provider Boundary

Verified current implementation:

- Provider adapters: Ollama and Gemini.
- Provider contract supports `generateText` and optional `streamText` with `AbortSignal`.
- Provider connection public responses redact credential references.
- Provider validation records health state and safe status metadata.
- Routing supports enable/disable, default, priority, deterministic selection, and bounded fallback by attempt.
- Provider attempts record execution attempt metadata without raw provider payloads.

Known limitation: `local-env:configured` is still the local credential-reference compatibility path. There is no production secret manager or encrypted credential vault.

## 13. Usage and Cost

Verified current implementation:

- Usage records track request outcome, provider/model, workspace/account/execution, input/output tokens where available or estimated, usage classification, fallback attempts, duration, cost micros, currency, and pricing version.
- Duplicate terminal processing does not double-count usage.
- Dashboard aggregation supports time range, provider/model breakdown, outcomes, token totals, cost total, and usage classification.
- Workspace budgets can limit requests, tokens, or cost micros for the active period and are checked before accepting new work.

Known limitation: default pricing is intentionally unpriced (`pricing_unpriced_v1`). Do not present estimated spend as provider-reported truth.

## 14. Frontend Flows

Verified current implementation:

- Login, registration, session restoration, and logout use cookie auth.
- Chat UI supports conversation list, create, rename, delete, search, message send, SSE streaming text, cancel, retry, regenerate, attachments, provider settings, and usage modal.
- Markdown rendering is React-escaped, supports fenced code blocks and copy-code, and does not execute assistant HTML or JavaScript.
- UI remains responsive for phone layouts through the existing CSS.

Known limitation: no service worker/offline mode is implemented.

## 15. File Upload and Grounding

Verified current implementation:

- Upload endpoint accepts PDF, plain text, and Markdown.
- Validation checks configured size, per-workspace aggregate bytes, per-conversation file count, MIME type, extension, and simple signatures.
- Storage keys are server-generated and stored under a private configured upload root, outside public web directories.
- Public APIs do not expose local filesystem paths.
- Extraction is bounded text extraction into chunks with provenance.
- Worker prompt construction includes bounded uploaded document context as explicitly untrusted reference data.

Known limitation: no OCR, no vector index, and no full semantic retrieval claim.

## 16. Operations

Verified current implementation:

- Production structured logging uses JSON logging and redaction for headers, cookies, CSRF, passwords, and provider credential references.
- Protected metrics include HTTP counts, errors, SSE connections/reconnects, replay gaps, rate-limit rejections, and queue stats.
- In-memory layered rate limits return structured 429 errors with Retry-After.
- Liveness and readiness routes exist.
- SQLite online backup command exists and documented restore verification is in `docs/OPERATIONS.md`.
- GitHub Actions CI installs from lockfile, uses `.nvmrc`, runs `npm run verify`, and runs production audit.

Known limitations: no hosted CD target, no distributed metrics/rate-limit store, no incident-response platform, no database encryption claim.

## 17. Verification Baseline From v2.2.0 Release

Current verified command results for Gexor v2.2.0:

- API typecheck (`npm run typecheck`): passed cleanly across `@gexor/api`, `@gexor/web`, `@gexor/contracts`.
- API tests (`npx tsx --test`): passed, 200 tests.
- Web typecheck & tests (`vitest run`): passed, 7 tests.
- Total workspace tests: 207 tests.
- Production build (`npm run build`): passed.
- Full verification gate (`npm run verify`): passed.

## 18. Documentation and Unknowns

Verified docs now present:

- `README.md`
- `docs/API_RUNTIME.md`
- `docs/OPERATIONS.md`
- `AGENTS.md`
- `GEXOR.md`
- `docs/releases/v2.2/*` (v2.2 release closure specification & evidence)

Unknown or unverified:

- any separate `gexor-docs` repository contents;
- production hosting, domain, release, and operations ownership;
- live provider credentials or provider availability;
- real local SQLite data contents;
- Android PWA install status after this upgrade;
- external security, accessibility, load, or compliance audits.

## 19. Change History

- 2026-07-18: Durable Codex bootstrap files added.
- 2026-07-18: Major runtime upgrade implemented: SSE/replay, cancel/retry/regenerate, durable worker/queue, cookie auth/CSRF, provider health/routing, usage/budgets, chat management/Markdown, file uploads/extraction, backup/logging/metrics/rate limits/CI foundations, and updated docs.
- 2026-07-20: Gexor v2.2.0 release closure completed across Parts 1–4: contracts alignment, SSE event-driven wakeup, provider usage classification, backup/restore verification, mobile drawer/accessibility updates, and complete release documentation reconciliation.
