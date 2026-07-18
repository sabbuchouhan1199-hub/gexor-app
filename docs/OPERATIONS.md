# Gexor Operations

This document covers the operational foundation implemented in this repository. It does not claim a hosted production deployment.

## Runtime Processes

Local development runs three processes:

```sh
npm run dev:api
npm run dev:worker
npm run dev --workspace apps/web
```

The root `npm run dev` starts API, worker, and web together. The worker handles durable `execution_jobs` and stops gracefully on process signals. If a worker dies while a lease is active, the job becomes claimable after lease expiry.

## Configuration

Safe variable names are listed in `.env.example`. Real `.env` files are ignored and must not be committed, logged, or printed.

Important variables:

- `GEXOR_DATABASE_PATH`
- `GEXOR_UPLOAD_PATH`
- `GEXOR_MAX_UPLOAD_BYTES`
- `GEXOR_MAX_WORKSPACE_UPLOAD_BYTES`
- `GEXOR_MAX_CONVERSATION_FILES`
- `GEXOR_ALLOWED_ORIGIN`
- `GEXOR_BACKUP_PATH`
- `GEXOR_BACKUP_RETENTION`

## Backups

Run SQLite online backup:

```sh
npm run backup
```

The backup command creates timestamped SQLite backup files in `GEXOR_BACKUP_PATH` and applies retention from `GEXOR_BACKUP_RETENTION`. Backup logs must not include secrets. Backup files are ignored by Git.

Uploaded files are stored separately from the SQLite database. A consistent operational backup must include both the SQLite backup and the configured upload directory from the same maintenance window. If object storage is added later, this consistency requirement must be revisited.

## Restore Verification

A safe restore drill should use a copy of the backup, not the active database:

1. Stop API and worker processes for the restore target.
2. Copy the selected SQLite backup to a temporary restore path.
3. Copy the matching upload directory snapshot to a temporary private path.
4. Start the API with `GEXOR_DATABASE_PATH` and `GEXOR_UPLOAD_PATH` pointing at the restored copies.
5. Run health/readiness checks and targeted verification.
6. Confirm conversations, executions, usage rows, provider routing metadata, and attachment metadata load without exposing private content in logs.

Do not run restore drills against private user data unless explicitly authorized.

## Structured Logs

Production structured logging uses Fastify JSON logs with redaction for authorization headers, cookies, CSRF headers, passwords, and provider credential references. Logs should avoid message bodies, uploaded document contents, raw provider responses, and local filesystem paths.

## Metrics

`GET /api/v1/metrics` is authenticated. Metrics include HTTP request/error counts, active SSE connections, SSE reconnects, replay gaps, rate-limit rejections, and queue depth/age counters. Metrics intentionally avoid secrets, filenames, message text, document contents, raw user input, and high-cardinality labels.

## Rate Limits

The API applies in-memory route-aware rate limits for authentication, uploads, SSE, execution controls, search, usage, and general routes. Rejections return a structured 429 problem and `Retry-After`.

Current limitation: rate limits are per API process. A distributed deployment would need a shared rate-limit store.

## Health and Readiness

- `/api/v1/health/live` checks process liveness.
- `/api/v1/health/ready` checks configured dependency readiness from server startup.
- The worker logs startup and shutdown through the API process logger path when structured logging is enabled.

## CI/CD

GitHub Actions CI installs from the lockfile, enforces the Node version from `.nvmrc`, runs `npm run verify`, and runs a production-only npm audit. There is no deployment job because hosting and release topology are not defined in this repository.

## Known Operational Limits

- SQLite queue, leases, metrics, and rate limits are single-node.
- No external secret manager or encrypted credential vault is implemented.
- File extraction is bounded text extraction, not OCR or full RAG.
- Cost records are reproducible against pricing versions, but current default pricing is intentionally unpriced.
- Metrics and structured logs are foundations, not a complete incident-response platform.
