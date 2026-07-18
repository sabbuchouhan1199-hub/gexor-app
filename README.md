# Gexor

Gexor is a provider-independent AI runtime platform intended to preserve a user's
workspace, context, memory, knowledge, and continuity independently of an AI
provider. This repository currently contains a Phase 1 foundation and a provider-
backed vertical slice. It is not the complete documented MVP and is not production
ready.

## Current implementation stage

The application proves a narrow browser → Vite → Fastify → configured provider
request path. It includes strict TypeScript workspaces, deterministic tests,
provider adapters, local configuration, recoverable browser request handling, and
a development-installable PWA shell. It does not yet implement the canonical Gexor
domain or public API.

## Implemented vertical slice

- npm workspaces for the API, web client, and shared contracts;
- Fastify health, deterministic mock-chat, and provider-backed chat routes;
- strict request validation and normalized internal/provider errors;
- provider-independent TextProvider interface with Ollama and Gemini adapters;
- configuration-selected provider factory and dependency injection;
- responsive React chat with timeout/abort, duplicate-submit prevention, and
  recoverable errors;
- browser-to-Fastify integration coverage;
- Vite development proxy;
- Android-installable manifest and icons in standalone display mode;
- workspace typecheck, test, build, and root verification commands.

## Current architecture

The browser posts a minimal shared ChatRequest to Vite's development proxy. Fastify
validates it and directly invokes the process-selected TextProvider. The adapter
makes a non-streaming provider request and Fastify returns a minimal ChatResponse.
There is no runtime execution aggregate, durable pipeline, database, queue, worker,
or streaming relay yet.

## Repository structure

~~~text
apps/api/              Fastify application, configuration, and provider adapters
apps/web/              React/Vite chat and development PWA assets
packages/contracts/    Minimal temporary shared chat request/response types
~~~

## Local development prerequisites

- Node.js 24.18.x
- npm 11.16.x
- either a reachable local Ollama installation/model or a Gemini API key

Install locked dependencies with:

~~~sh
npm install
~~~

## Safe environment setup

Copy the tracked placeholder template to a local environment file and replace only
local placeholder values:

~~~sh
cp .env.example .env
~~~

The local .env file is ignored. Never commit provider credentials, paste them into
issues or logs, expose them to the browser, or add real values to .env.example.
Provider selection is currently process-level local configuration, not the final
workspace-owned provider-connection and secret-reference architecture.

## Development commands

~~~sh
npm run dev
~~~

This starts the Fastify API and Vite development server together. Vite hot module
replacement remains the normal frontend development workflow.

Individual root workflows are also available:

~~~sh
npm run typecheck
npm run test
npm run build
npm run verify
~~~

## Verification commands

Run the complete local verification gate before proposing a change:

~~~sh
npm run verify
~~~

The command runs all workspace typechecks, automated tests, and builds. Provider
adapters use controlled test doubles; external provider availability is not a CI
dependency.

## Temporary routes

- GET /health reports the current Fastify process health.
- POST /chat is a temporary, unversioned, synchronous development route that calls
  the configured provider and returns 200 with a reply.
- POST /mock/chat is a deterministic verification route and does not call a
  provider.

These routes are not the documented /api/v1 resource contract. They provide no
conversation/message/execution resources, 202 acceptance, idempotency key, request
ID, SSE stream, cancellation, retry, or regeneration.

## Known limitations

- no authentication, sessions, personal workspace, membership, authorization, or
  workspace isolation;
- no database, migrations, projects, conversations, persistent messages, or
  durable runtime state;
- non-streaming responses only;
- no intent classification, prompt enhancement, context retrieval, context
  snapshot, prompt snapshot, token budgeting, structured memory, memory candidate,
  Snapshot Lock, file ingestion, or search;
- no usage, cost, quota, spending control, route-decision record, audit, durable
  background job, worker, queue, export, retention, deletion, backup, or recovery;
- no distributed observability, production deployment, CI/CD security gates, or
  production incident-response readiness;
- process-level credentials and provider selection are local compatibility behavior,
  not the target secret-manager and workspace provider-connection boundary.

## PWA development behavior

The web client has a manifest, standard and maskable icons, theme metadata, and
standalone display configuration. Android development installation has been
manually verified. There is no service worker and no offline cache. The installed
development PWA requires the Termux/local development server to remain running.
Offline and production service-worker behavior is deferred to a separate step.

## Secret-safety rules

- Keep .env local and ignored.
- Keep real credentials out of source, tests, examples, diffs, logs, and client
  bundles.
- Use placeholders in tracked configuration examples.
- Do not return provider keys or raw provider payloads in public errors.
- Treat current local credential loading as temporary development behavior.

## Documentation source of truth

The separate gexor-docs repository is authoritative for product scope, functional
and non-functional requirements, architecture, runtime, domain, database, API,
security, UX, testing, deployment, and operations. Documents 01–14 define the target
baseline. Document 15 reports implementation status and deviations without
overriding that baseline.

## Development workflow

1. Select one dependency-ordered, explicitly authorized microstep.
2. Read the governing requirement and adjacent contracts.
3. Implement the smallest coherent change without weakening security boundaries.
4. Add deterministic success and failure evidence.
5. Run npm run verify and inspect the diff.
6. Update implementation traceability when capability status materially changes.

Do not infer that a passing local demonstration satisfies the complete MVP
requirement or production acceptance criteria.

## Current next architectural milestone

The next milestone is canonical shared API and public error contracts, followed by a
runtime execution state-machine skeleton. The broader dependency order is:

1. Canonical shared API and public error contracts
2. Runtime execution state-machine skeleton
3. Authentication and personal workspace boundary
4. Persistent domain repositories and transactional message acceptance
5. Workspace-scoped provider connections and protected credential references
6. SSE streaming, cancellation, and reconnect
7. Context, prompt, and token-budget pipeline
8. Usage, cost, quota, and routing transparency
9. Structured memory and background-job foundation
10. Production quality, security, observability, and deployment controls

These items are planning guidance only; they are not implemented by this change.
