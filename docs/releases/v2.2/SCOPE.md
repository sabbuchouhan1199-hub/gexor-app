# Gexor v2.2 Release Scope Specification

## 1. Product Identity and Release Vision

Gexor v2.2 is a **provider-independent AI runtime and personal workspace** designed for single-node local execution. It enables users to run conversational AI workflows across multiple model providers (Ollama, Gemini, llama.cpp / Qwen) while maintaining workspace context, durable execution state, security isolation, and data ownership on their local system.

### What Gexor v2.2 Is:
- A single-node local runtime foundation built with React/Vite, Fastify, shared TypeScript contracts, and SQLite.
- An authenticated browser workspace using HttpOnly session cookies, CSRF protection, and workspace-level data isolation.
- A durable execution pipeline with background queueing, SQLite lease management, live SSE streaming, and event replay.
- A provider management system supporting health checks, priority routing, default connection selection, and bounded attempt fallback.
- A usage tracking dashboard tracking request outcomes, estimated token counts, cost micros, and workspace token/budget enforcement.
- A file upload foundation supporting PDF, TXT, and Markdown text extraction for prompt grounding.
- An operational foundation with structured JSON logging, redacted sensitive headers, protected metrics, online SQLite backups, and GitHub Actions CI.

### What Gexor v2.2 Is NOT:
- **Not a Multi-Tenant SaaS Platform**: Gexor v2.2 is designed for personal/local workspace operation.
- **Not a High-Availability Distributed System**: Database, queue leases, rate limits, and SSE streams operate on a single node without Redis or external orchestrators.
- **Not a Vector RAG or OCR Engine**: File upload extraction extracts plain text chunks into SQLite with provenance; it does not perform optical character recognition or dense vector indexing.
- **Not a Billing-Grade SaaS Engine**: Token usage is measured where available or estimated; default pricing uses an unpriced reference version (`pricing_unpriced_v1`).
- **Not an Enterprise Secret Vault**: Credentials use safe local server configuration (`local-env:configured`); production secret manager integration is out of scope for v2.2.

---

## 2. Included Capabilities (v2.2 Release Baseline)

1. **Authentication & Session Isolation**:
   - HttpOnly `gexor_session` (development) / `__Host-gexor_session` (production) cookies.
   - CSRF protection header (`X-CSRF-Token`) matching `gexor_csrf` cookie.
   - Session revocation and SHA-256 token hashing in SQLite.
   - Workspace-level ownership authorization across all routes.

2. **Durable Runtime & Queue Execution**:
   - Transactional message acceptance with `Idempotency-Key` headers.
   - SQLite execution jobs queue (`execution_jobs`) with worker leases, retry wait backoff, and dead-letter handling.
   - Idempotent execution state machine (`accepted` -> `dispatching` -> `completed` / `failed` / `timed_out` / `cancelled`).
   - Execution controls: Idempotent cancellation, related retry attempts, and assistant regeneration.

3. **Live SSE Streaming & Replay**:
   - Real-time response deltas via Server-Sent Events (`GET /api/v1/executions/:id/events`).
   - Durable event persistence in `execution_events` with sequence numbers.
   - Event replay with sequence cursor (`?after=<seq>`) and replay-gap reconciliation.

4. **Provider Connection Management**:
   - Catalogue support for Ollama, Gemini, and llama.cpp.
   - Workspace provider connection creation, selection, health validation, enabling/disabling, priority routing, and credential redaction.
   - Bounded provider attempt tracking without raw payload exposure.

5. **Usage & Budget Management**:
   - Request tracking by outcome, provider, model, tokens, and cost micros.
   - Workspace budget checking before accepting new executions.
   - Usage classification into measured, estimated, and unavailable tokens.

6. **File Attachment & Grounding**:
   - Upload support for PDF, plain text, and Markdown up to configured file/size limits.
   - Server-side private storage key generation outside public web paths.
   - Text chunk extraction and inclusion in execution context as untrusted reference data.

7. **Operations & Observability Scaffolding**:
   - Structured JSON logging with header/secret redaction.
   - Authenticated `/api/v1/metrics` endpoint reporting request counts, errors, SSE connections, replay gaps, and rate-limit hits.
   - Online SQLite backup script (`npm run backup`).
   - Liveness (`/api/v1/health/live`) and readiness (`/api/v1/health/ready`) health checks.

---

## 3. Excluded and Deferred Capabilities

- **Deferred to v2.2.1**:
  - Automated background compaction job for historical `execution_events` rows.
- **Future Product Roadmap (Post-v2.2)**:
  - Vector database indexing and hybrid semantic retrieval.
  - Multi-node Redis queue and distributed worker pool.
  - Production external secret manager vault integration.
  - Enterprise MFA, SSO, passkeys, and multi-user RBAC.
  - Service worker offline mode / PWA offline storage.

---

## 4. Release Quality Expectations

- **Code Quality**: Clean TypeScript compilation with zero errors across all workspaces (`npm run typecheck`).
- **Test Integrity**: 100% deterministic test pass across all API unit/integration tests and Web component/integration tests (`npm run test`). Tests must run hermetically without requiring live external provider APIs or local daemon processes.
- **Build Quality**: Clean Vite production bundle compilation (`npm run build`).
- **Documentation**: All public capabilities, limitations, API routes, and operational guides must accurately reflect present working tree implementation.
