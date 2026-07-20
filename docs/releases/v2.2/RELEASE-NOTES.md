# Gexor v2.2.0 Release Notes

**Release Date:** 2026-07-20
**Version:** `2.2.0`
**Git Baseline:** `84a3512ea5b15414dc5110d5ee0fd422ad4ef2d4`

Gexor v2.2.0 establishes the personal AI runtime and workspace platform baseline, featuring cookie-authenticated sessions, durable execution queueing, multi-provider model routing, live event-driven streaming, usage accounting, document grounding, and robust operations scaffolding.

---

## What's New in v2.2.0

### 1. Security & Workspace Authorization
- **HttpOnly Cookie Authentication**: Secure, SameSite=Lax HttpOnly cookies for session management with CSRF header enforcement on state-changing requests.
- **Workspace Isolation**: Multi-workspace tenancy with strict workspace-level isolation across conversations, executions, provider connections, files, and usage dashboards.

### 2. Multi-Provider AI Architecture
- **Provider Routing & Health**: Support for Google Gemini (cloud), Ollama (local), and llama.cpp / Qwen (local HTTP).
- **Catalogue & Connection Management**: Workspace-scoped provider connections with safe credential redaction, health monitoring, and bounded fallback by attempt number.

### 3. Durable Execution Engine & Live Streaming
- **Outboxed Queue & Worker**: SQLite-backed transactional message acceptance, outbox event persistence, worker lease claiming, stale lease recovery, and bounded retries.
- **Event-Driven SSE Streaming**: Live Server-Sent Events for execution replay and delta streaming with event-driven in-process wakeup (`waitForEvent`) and 5s fallback polling.
- **Durable Controls**: Idempotent message submission, execution cancel, retry, and regenerate capabilities.

### 4. Usage Accounting & Cost Transparency
- **Provider-Reported Usage**: Captures measured token usage when reported by LLM providers, falling back to character-heuristic estimation when unavailable.
- **Unpriced Pricing Model**: Displays explicit `"Unpriced"` pricing model status for unpriced versions rather than misleading zero cost spend.

### 5. Document Grounding & Attachment Uploads
- **Bounded Text Chunking**: File upload foundation supporting PDF, TXT, and Markdown files with MIME/signature validation, local private storage, bounded text extraction, and untrusted reference grounding.

### 6. User Experience & Mobile Accessibility
- **Responsive Workspace UI**: React/Vite interface featuring workspace search, conversation management, mobile navigation drawer (<= 720px), accessible Escape-key modal controls, safe Markdown rendering, and code copy blocks.

### 7. Operational Scaffolding & Backup Verification
- **Operations & Security**: Fastify structured JSON logging with header/credential redaction, protected `/api/v1/metrics`, route-aware in-memory rate limiting, online SQLite backup, and automated restore verification drills.

---

## System Requirements
- Node.js: `24.18.x`
- npm: `11.16.x`
- Operating Systems: Linux / macOS / WSL
