# Gexor v2.2 Accepted Known Limitations

This document explicitly defines the accepted technical, operational, and architectural limitations of the Gexor v2.2 release.

---

## 1. Single-Node Architecture Boundaries

- **Single-Node Queue & Worker**: Background jobs (`execution_jobs`), leases, worker polling, and attempt retries are managed within a local SQLite database on a single node. Gexor v2.2 does not use Redis, RabbitMQ, or a distributed queue system.
- **In-Memory Rate Limiting**: HTTP rate limits are tracked in-process memory (`rateWindows`). Multi-node API instances would enforce independent rate limits per instance.
- **In-Process SSE Polling**: Live streaming events are retrieved by polling SQLite at 50ms intervals per active connection. Scaled multi-node setups would use pub/sub or Redis streams.
- **Single-Node Backup & Restore**: Database online backups copy the local SQLite file; file upload storage is located on local disk. Both must be backed up from the same maintenance window to preserve storage consistency.

---

## 2. Usage & Cost Accounting Boundaries

- **Default Unpriced Pricing Model**: Default pricing relies on version `pricing_unpriced_v1`, which assigns zero cost micros to requests. Calculated costs are displayed as estimated.
- **Estimated Token Usage**: Token counts for streaming deltas or providers without token metadata are estimated using character heuristic ratios rather than model-specific tokenizers.

---

## 3. Grounding & File Attachment Boundaries

- **Plain Text Extraction Only**: File extraction processes PDF, plain text, and Markdown into plain text chunks stored in SQLite. Gexor v2.2 does not perform OCR (Optical Character Recognition) on images/scans or compute dense vector embeddings.
- **Untrusted Reference Context**: Uploaded document content is prepended to LLM prompts as untrusted reference context; it is not executed or treated as system instructions.

---

## 4. Frontend & Presentation Boundaries

- **Lightweight React Markdown Parser**: Markdown rendering splits paragraphs and fenced code blocks (with copy controls) and escapes HTML to prevent XSS. It does not construct full GFM AST trees for complex inline formatting or Markdown tables.
- **Local Cookie Storage**: Session tokens use HttpOnly browser cookies; token credentials are never stored in browser `localStorage` or `sessionStorage`.

---

## 5. Security & Credentials Boundaries

- **Local Server Credentials**: Provider credentials are retrieved from local server environment configuration (`local-env:configured`). Public APIs redact all credentials and secret references. Production vault manager integrations are out of scope for v2.2.
