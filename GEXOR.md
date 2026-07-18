# Gexor Durable Project Context

This file is the persistent repository context for future Codex sessions. Read it with `AGENTS.md`, then verify it against the current working tree before acting. It is a maintained snapshot, not a substitute for inspection.

## 1. Status Vocabulary and Audit Baseline

Use these labels consistently:

- **Verified current implementation**: directly supported by the present source, migrations, manifests, or tests.
- **Strategic product vision**: the intended product direction; not proof of implementation.
- **Future planned work**: explicitly absent or deferred capability; not implemented.
- **Unknown or unverified**: not provable from this repository.

Initial audit baseline on 2026-07-18:

- repository root: `/home/userland/workspaces/gexor-app`
- branch before these documents were created: `main`
- commit before these documents were created: `7f7a2cab0b2765672890edffcb9659027ef8b226`
- initial working tree: clean
- existing root context files: neither `AGENTS.md` nor `GEXOR.md` existed

Always re-check branch, commit, and status; the baseline above will naturally age.

## 2. Product Identity

### Strategic product vision

Gexor is intended to be a provider-independent AI runtime and personal workspace that preserves a user's workspace, context, memory, knowledge, and continuity independently of any one model provider.

### Verified current implementation

The repository currently delivers a usable local, phone-first, authenticated single-user/personal-workspace vertical slice. It has durable SQLite-backed identity, sessions, one owner workspace per account, provider connections, conversations, message acceptance, idempotency, execution state, and conversation history. The browser can register or log in, restore a session, configure the server-selected provider, create conversations, send a message, poll execution progress, and render the resulting reply.

This is a single-node local application. It is not evidence of the complete strategic MVP, production readiness, high availability, or provider-independent memory/context continuity.

## 3. Repository and Toolchain

### Verified current implementation

```text
apps/api/              Fastify API, auth, provider adapters, runtime, SQLite persistence
apps/api/migrations/   Ordered SQLite up/down migrations
apps/web/              React/Vite responsive browser client and PWA assets
packages/contracts/    Shared TypeScript transport and runtime contracts
README.md              Overview; useful but contains some stale/contradictory status text
```

- npm workspaces: `apps/*` and `packages/*`
- Node: `24.18.x`; `.nvmrc` pins `24.18.0`
- npm: `11.16.x`
- TypeScript: `7.0.2`, strict, no emit, ES2023 base target
- API: Fastify `5.10.0`, ESM, `tsx` for development/tests
- Web: React/React DOM `19.2.7`, Vite `8.1.4`, Vitest `4.1.10`, jsdom
- Lockfile: npm lockfile version 3 with exact top-level versions
- Persistence uses the Node `node:sqlite` API; there is no external ORM.

Root scripts:

```sh
npm run dev        # API and web concurrently
npm run typecheck  # all workspaces with a typecheck script
npm run test       # all workspaces with a test script
npm run build      # web build; other workspaces have no build script
npm run verify     # typecheck, test, build
```

The API defaults to `127.0.0.1:3001`; Vite defaults to `127.0.0.1:5173` and proxies `/api`, `/chat`, and `/mock` to the API. Local runtime configuration is described only by `.env.example`. Never inspect a real `.env`.

## 4. Current Architecture and Request Flow

### Verified current implementation

```text
React/Vite browser
  -> bearer token + X-Workspace-Id through ApiClient
  -> Fastify validation, session lookup, and workspace membership authorization
  -> transactional SQLite message/execution/idempotency/outbox acceptance
  -> setImmediate in the API process
  -> selected workspace TextProvider (Ollama or Gemini)
  -> guarded SQLite execution transition and safe normalized outcome
  -> browser polls execution and reloads durable conversation messages
```

The normal product path is the versioned authenticated API. `/chat` and `/mock/chat` are temporary unauthenticated compatibility/development routes and must not be treated as the canonical architecture.

Fastify assigns or safely accepts an `X-Request-Id`, returns it on every response, validates bodies with additional properties rejected, and uses provider-neutral `application/problem+json` errors. Public errors must not include raw provider payloads or credentials.

## 5. API Surface

### Verified current implementation

| Method | Route | Access | Current purpose |
|---|---|---|---|
| GET | `/health` | Public | Compatibility process health |
| GET | `/api/v1/health` | Public | Canonical health response |
| POST | `/api/v1/auth/register` | Public | Create account, personal workspace, owner membership, and session atomically |
| POST | `/api/v1/auth/login` | Public | Verify credentials and create a session |
| POST | `/api/v1/auth/logout` | Bearer | Durably revoke the presented session; repeated revoke is safe |
| GET | `/api/v1/auth/me` | Bearer | Restore current user/session/personal workspace context |
| POST | `/mock/chat` | Public compatibility route | Deterministic mock reply |
| POST | `/chat` | Public compatibility route | Synchronous process-configured provider call through the runtime executor |
| GET | `/api/v1/providers` | Bearer | List seeded provider and model catalogue |
| GET/POST | `/api/v1/workspaces/:workspaceId/provider-connections` | Bearer + workspace | List or create workspace connections |
| POST | `/api/v1/workspaces/:workspaceId/provider-connections/:connectionId/test` | Bearer + workspace | Validate a connection reference |
| POST | `/api/v1/workspaces/:workspaceId/provider-connections/:connectionId/select` | Bearer + workspace | Select an active connection/model |
| POST | `/api/v1/workspaces/:workspaceId/provider-connections/:connectionId/revoke` | Bearer + workspace | Revoke and deselect a connection |
| POST | `/api/v1/workspaces/:workspaceId/provider-connections/:connectionId/rotate` | Bearer + workspace | Replace the reference, deselect, and require revalidation |
| POST/GET | `/api/v1/workspaces/:workspaceId/conversations` | Bearer + workspace | Create or list active conversations |
| GET | `/api/v1/conversations/:conversationId/messages` | Bearer + workspace | Read workspace-scoped history |
| POST | `/api/v1/conversations/:conversationId/messages` | Bearer + workspace + idempotency key | Accept exactly one text item and return `202` |
| GET | `/api/v1/executions/:executionId` | Bearer + workspace | Read a workspace-scoped execution snapshot |

All protected workspace operations re-check an active account, active workspace, and active owner membership. Explicit `X-Workspace-Id` is required for workspace routes. Cross-workspace access fails closed with a not-found-style response.

There are no SSE, WebSocket, cancellation, retry, regeneration, archive, deletion, search, file, export, admin, or recovery endpoints in the current tree.

## 6. Authentication and Authorization

### Verified current implementation

- Registration normalizes email and display name, hashes the password, and transactionally creates account, authentication identity, personal workspace, owner membership, session, and an outbox event.
- Passwords allow 12–128 Unicode characters, reject all-whitespace and embedded NUL, and have no composition rule. Password hashes use versioned scrypt parameters, a random 16-byte salt, and timing-safe comparison.
- Login uses a synthetic password hash for unknown/malformed identities so public failures remain enumeration-resistant.
- Sessions use 32 random bytes encoded base64url. Only a SHA-256 token hash is stored in SQLite. Default lifetime is a fixed 24 hours; valid use updates `last_seen_at` but does not extend expiry.
- Logout revocation and expired/revoked session rejection are durable.
- The browser stores the bearer token in `window.localStorage` under `gexor.session`, restores through `/api/v1/auth/me`, and clears it after restoration failure or logout.
- Authentication uses bearer headers, not cookies. No CSRF-cookie design is present.
- Current membership role is only `owner`; each account schema supports one personal workspace owner relationship.

### Future planned work / current limitations

Email verification, password/account recovery, MFA/passkeys, production throttling/rate limiting, cookie-based authentication, session-management UI, and production authentication assurance are absent. Local-storage bearer handling is an implemented local product choice, not a claim of production-hardening.

## 7. Provider Boundary

### Verified current implementation

- `TextProvider` exposes one provider-neutral `generateText({ input })` method returning provider, model, and text.
- Implemented adapters: local Ollama `/api/chat` and Google Gemini `generateContent`.
- Both adapters validate input, apply configurable timeouts, normalize network/HTTP/invalid-response failures, and avoid returning raw provider responses in public problems.
- SQLite seeds Ollama/Qwen3 0.6B and Gemini/Flash Lite catalogue records.
- Provider connection public shapes omit `credential_reference`; lifecycle states are `pending_validation`, `active`, `invalid`, and `revoked`.
- Connect, validation, selection, revocation, and reference rotation produce durable audit rows.
- The current server resolves only the special reference `local-env:configured`, and only when its provider matches process-level `TEXT_PROVIDER`. The actual credential remains process configuration.
- The current web provider screen hardcodes `local-env:configured`, validates it, and selects the first catalogue model for that provider. It does not accept a credential from the browser.
- Canonical message submission requires an active selected workspace connection.

### Future planned work / current limitations

There is no production secret manager, encrypted credential vault, arbitrary per-workspace credential resolver, provider health service, audit export, dynamic catalogue management, fallback routing, or cost-aware routing. The opaque reference stored in SQLite is a boundary/evidence mechanism; it is not itself secret storage.

## 8. Persistence and Data Model

### Verified current implementation

The API opens one local SQLite database, defaulting to `.data/gexor.sqlite` (ignored by Git). It enables foreign keys, a 5-second busy timeout, WAL journal mode, and `synchronous = FULL` for file databases. Ordered migrations are applied transactionally at server startup.

Migration `001_core` creates:

- accounts and authentication identities;
- sessions;
- personal workspaces and owner memberships;
- conversations and messages;
- runtime executions;
- idempotency records;
- outbox events.

Migration `002_provider_connections` creates:

- provider and model catalogues;
- workspace provider connections and selection;
- provider-connection audit evidence.

Registration and canonical message acceptance use `BEGIN IMMEDIATE` transactions. Canonical acceptance writes the user message, accepted execution, idempotency record, and `message.accepted` outbox evidence as one unit. Terminal execution transitions update message state and write terminal outbox evidence atomically.

Conversation history persists user message rows. The assistant reply is not a separate durable message row; the repository synthesizes an assistant history item from the execution's stored `response_text`.

### Future planned work / current limitations

Outbox rows are durable evidence only: there is no publisher, consumer, queue, or worker. There is no HA topology, automated backup/restore, retention/deletion workflow, migration deployment orchestration, database encryption claim, or disaster-recovery process.

## 9. Runtime Lifecycle and Recovery

### Verified current implementation

Canonical acceptance requires a valid `Idempotency-Key` and hashes the request body. An equivalent retry returns the original execution without dispatching again; reuse with a different body returns an idempotency conflict.

Execution states and legal transitions are:

```text
accepted -> preparing -> dispatching -> completed
    |           |             |-------> failed
    |           |             |-------> timed_out
    |           |             `-------> cancelled
    |           `---------------------> failed or cancelled
    `---------------------------------> cancelled
```

Terminal states cannot transition again. Completed executions require a response; failed/timed-out executions require a safe failure. SQLite uses a state-qualified update and version increment to guard transitions.

After `202` acceptance, Fastify schedules provider dispatch with `setImmediate` inside the API process. The provider receives only the newly submitted text—not prior conversation history, retrieved context, or a prompt snapshot. Responses are non-streaming.

The browser polls every 500 ms for at most 100 iterations (about 50 seconds), reloads message history during polling, prevents a second submit while busy, and restores the draft on a surfaced failure.

### Future planned work / current limitations

No startup recovery scan resumes or terminates executions left in `accepted`, `preparing`, or `dispatching`; a process crash can leave durable non-terminal records stuck. There is no queue/worker, lease, heartbeat, retry scheduler, dead-letter handling, cancellation route, provider abort after acceptance, SSE reconnect, or client-visible timeout when the 100-poll loop simply exhausts.

Although `cancelled` is defined and transition-tested, the normal API/browser flow cannot request cancellation.

## 10. Frontend and Current User Flows

### Verified current implementation

- React renders login and registration forms, safe API errors, session restoration, and logout.
- The authenticated shell has Chat and Providers views.
- Conversation list/history is durable across refresh. Users can create a titled conversation; sending without one creates a title from the first 60 characters.
- Sending uses canonical versioned message/execution endpoints and a new browser UUID idempotency key.
- Responsive CSS switches to a compact phone layout at 720 px, hides the desktop sidebar, provides a mobile New button, uses `100dvh`, and accounts for bottom safe-area inset.
- The web app has a standalone portrait manifest and standard/maskable icons.

### Current limitations

There is no service worker or offline cache, so the manifest makes the app installable but not offline-capable. There is no streaming UI, Markdown renderer, attachments, search, rename/archive/delete conversation UI, memory/context UI, usage/cost UI, provider credential-entry UI, or accessibility/UX acceptance claim beyond the implemented tests and markup.

## 11. Test Evidence and Verification

### Verified current implementation

API tests cover:

- config validation and safe defaults;
- canonical problems, request correlation, health, compatibility chat, async execution success/failure/timeout, and unknown resources;
- Ollama and Gemini request construction and normalized failures using controlled fetch doubles;
- provider-factory wiring;
- email/display-name/password policy, scrypt hashes, identities, sessions, revocation, and enumeration-resistant auth;
- registration/login/logout/current authorization and cross-workspace denial;
- runtime state transitions and safe snapshots;
- migrations, restart durability, atomic registration/message acceptance, idempotency, and rollback on outbox failure;
- provider-connection isolation, redaction, authorization, lifecycle, and audit evidence.

Web tests cover registration, session restoration, safe errors, and the canonical conversation/message/execution flow. External provider availability is not required by the test suite.

Use targeted workspace checks first:

```sh
npm run typecheck --workspace apps/api
npm run test --workspace apps/api
npm run typecheck --workspace apps/web
npm run test --workspace apps/web
```

Use `npm run verify` as the full repository gate when appropriate. It also runs the web build, which writes ignored build output; respect task-specific restrictions before running it. Never report a passing gate based only on historical documentation.

## 12. Known Documentation Drift

### Verified current implementation

`README.md` remains useful for setup and broad intent, but portions of its status narrative are stale or internally inconsistent with the current tree. Examples include claims that browser authentication UI or durable conversation ownership are absent, an outdated provider-connection milestone, and ambiguous wording around SSE/cancellation. Current source and tests take precedence.

The README says a separate `gexor-docs` repository defines the target product baseline. That repository is not present here, so its current contents and roadmap status are **unknown or unverified** in this audit. Do not invent requirements from it or claim compliance with it.

## 13. Strategic Future Direction (Not Implemented)

The repository documentation identifies the following direction, but current priority/order must be re-confirmed before implementation:

- streaming, cancellation, and reconnect;
- context retrieval, prompt enhancement/snapshots, and token budgeting;
- intent classification and transparent route decisions;
- usage, cost, quota, and spending controls;
- structured memory and memory candidates;
- file ingestion and search;
- durable background jobs, outbox publishing, workers, and crash recovery;
- export, retention, deletion, backup, and recovery;
- production secrets, security, observability, deployment, CI/CD gates, and incident readiness.

None of these capabilities should be described as implemented merely because a contract contains a future state, a table contains an evidence field, or README planning text mentions it.

## 14. Unknown or Unverified Information

Unless separately inspected or supplied, this repository does not prove:

- the contents or latest decisions in `gexor-docs`;
- production deployment topology, hosting, domains, CI/CD, or operational ownership;
- live Ollama/Gemini availability or validity of local credentials;
- current contents of any local SQLite runtime database;
- manual Android/PWA installation status on the user's present device;
- production performance, security audit, accessibility audit, load capacity, backup recovery, or regulatory compliance;
- product roadmap priority, dates, acceptance criteria, or release commitments beyond repository evidence.

Ask for evidence or inspect the relevant authorized source before relying on any of the above.

## 15. Safe Change Guidance

- Preserve the provider-neutral shared contracts and canonical versioned resource flow unless a task explicitly changes them.
- Treat bearer/session handling, workspace scoping, credential-reference redaction, idempotency, state-transition guards, and transaction boundaries as security/correctness invariants.
- Do not route canonical browser behavior through `/chat` or `/mock/chat`.
- Do not pass raw credentials to the browser, persist plaintext session tokens, or surface raw provider payloads/errors.
- When runtime capabilities change, update contracts, API behavior, persistence, frontend flow, deterministic tests, README status, and this file coherently as authorized.
- Keep current implementation, vision, planned work, and unknowns visibly separate in all future documentation and handoffs.
