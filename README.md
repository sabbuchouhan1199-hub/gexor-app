# Gexor

Gexor is a provider-independent AI runtime and personal workspace. This repository contains a single-node local implementation with a React/Vite web app, Fastify API, shared TypeScript contracts, SQLite persistence, durable execution queueing, live SSE streaming, secure cookie browser sessions, provider routing, usage accounting, chat management, file-upload foundations, and production-oriented operations scaffolding.

This is not a high-availability production deployment. It is a production-grade local/runtime foundation that keeps secrets out of the browser, preserves ownership isolation, and documents remaining distributed-system limitations.

## Repository Structure

```text
apps/api/              Fastify API, SQLite migrations, runtime worker, providers, operations
apps/web/              React/Vite authenticated workspace UI
packages/contracts/    Shared API/runtime/provider/usage/upload contracts
docs/                  API and operations notes
```

## Current Runtime Architecture

The canonical browser flow uses versioned API routes only:

```text
React/Vite client
  -> HttpOnly session cookie + CSRF proof + X-Workspace-Id
  -> Fastify validation, rate limits, session and workspace authorization
  -> transactional SQLite acceptance with idempotency, outbox evidence, queue job, and replay snapshot
  -> durable worker lease/claim loop
  -> provider-neutral streaming or generateText adapter
  -> durable execution_events, usage_records, provider_attempts, and terminal execution state
  -> SSE replay/reconnect to the browser
```

Compatibility `/chat` and `/mock/chat` routes remain for local development and testing. They are not the canonical product lifecycle.

## Implemented Capabilities

- HttpOnly browser session cookies with production `Secure` behavior, SameSite=Lax, logout invalidation, `/api/v1/auth/me` restoration, and CSRF checks for cookie-authenticated unsafe requests.
- Workspace-scoped authorization on conversations, messages, executions, provider connections, usage, and files.
- Durable SQLite migrations through `005_llama_cpp` for replay events, queue jobs, execution relationships, provider routing and attempts, usage and budgets, soft-deletion evidence, file attachments, file chunks, and llama.cpp/Qwen local provider integration.
- Live Server-Sent Events with event-driven in-process wakeup and durable replay fallback.
- Cancel, retry, and regenerate execution controls with durable relationships and idempotency keys.
- Durable background worker with SQLite leases, retry wait, stale lease recovery, bounded attempts, dead-letter state, graceful shutdown, and queue metrics.
- Provider connection management with safe redaction, health state, enable/disable, default/priority routing, and bounded fallback by attempt number across Gemini, Ollama, and llama.cpp/Qwen.
- Usage dashboard data consuming provider-reported measured tokens when available (or character estimation fallback), pricing classification (`measured`, `estimated`, `unavailable`), explicit `Unpriced` pricing model status, provider/model breakdowns, and optional workspace budgets.
- Chat rename, soft delete, workspace-scoped search, responsive controls, mobile drawer navigation, accessible Escape-key modal controls, streaming indicator, safe Markdown/code rendering, and copy-code control.
- File upload foundation for PDF, plain text, and Markdown with type/signature checks, server-generated storage keys, local private storage, bounded extraction, chunks, and untrusted document grounding.
- Structured JSON logging in production, redaction, protected metrics, health/readiness endpoints, in-memory layered rate limits, SQLite online backup command with tested restore drill, and GitHub Actions CI.

## Local Development

Prerequisites:

- Node.js 24.18.x
- npm 11.16.x
- local Ollama or a configured Gemini key if provider-backed execution is required

Install dependencies:

```sh
npm install
```

Create local configuration from safe placeholders:

```sh
cp .env.example .env
```

Never commit `.env`, provider credentials, cookies, tokens, local SQLite data, uploaded files, backups, or runtime logs.

Run the API, worker, and web client together:

```sh
npm run dev
```

Run individual services:

```sh
npm run dev:api
npm run dev:worker
npm run dev --workspace apps/web
```

Run backups:

```sh
npm run backup
```

## Verification

```sh
npm run typecheck
npm run test
npm run build
npm run verify
```

Provider tests use controlled doubles and do not require live external provider credentials.

## Canonical API Areas

See [docs/API_RUNTIME.md](docs/API_RUNTIME.md) for route details. Major groups include:

- `/api/v1/auth/*`
- `/api/v1/workspaces/:workspaceId/conversations*`
- `/api/v1/conversations/:conversationId/messages`
- `/api/v1/executions/:executionId/*`
- `/api/v1/workspaces/:workspaceId/provider-connections*`
- `/api/v1/workspaces/:workspaceId/usage*`
- `/api/v1/conversations/:conversationId/files`
- `/api/v1/files/:fileId`
- `/api/v1/health/*` and `/api/v1/metrics`

## Operations

See [docs/OPERATIONS.md](docs/OPERATIONS.md) for backup/restore, structured logging, metrics, rate-limit, worker, and CI notes.

Important operational boundaries:

- SQLite, queue leases, rate limits, metrics counters, and worker coordination are single-node/local by design.
- Local file uploads are stored outside public web directories, but database and uploaded-file backups must be kept consistent by operations.
- Cost accounting uses an explicit unpriced pricing version unless a maintained pricing table is configured later.
- File extraction is bounded text extraction and chunking. It is not OCR and does not claim full semantic retrieval.
- Uploaded document content is treated as untrusted reference data, not instructions.

## Secret Safety

- Do not inspect or commit `.env`.
- `.env.example` contains variable names and safe placeholders only.
- Browser code must not store bearer tokens in `localStorage` or `sessionStorage`.
- Public APIs must not return provider credential references, provider secrets, raw provider payloads, cookies, tokens, uploaded document contents, private database paths, or local runtime data.
- Logs, reports, tests, fixtures, and documentation must use synthetic values only.
