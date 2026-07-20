# Governance, Conflicts, and Open Questions

**Source documents:** 01. PRD.md, 04. SYSTEM-CONTEXT-AND-HIGH-LEVEL-ARCHITECTURE.md,
07. DATA-MODEL.md, 10. API-SPECIFICATION.md and all NFR sections

**Number of included requirements:** 2 synthetic governance constraints

For the full structured record of every requirement, see `REQUIREMENTS-INDEX.json`.

---

## Document Authority Hierarchy

Per `01. PRD.md §2` and `gexor-docs/README.md`:

| Priority | Documents |
|----------|-----------|
| 1 (Highest) | 05. RUNTIME-PIPELINE.md, 09. CORE-ENGINES.md |
| 2 | 02. FUNCTIONAL-REQUIREMENTS.md, 03. NON-FUNCTIONAL-REQUIREMENTS.md |
| 3 | 06. IMPLEMENTATION-GUIDELINES.md, 08. DATA-FLOW-AND-INTERFACES.md |
| 4 | 04. SYSTEM-CONTEXT-AND-HIGH-LEVEL-ARCHITECTURE.md, 07. DATA-MODEL.md, 10. API-SPECIFICATION.md |
| 5 | 11. UX-AND-INFORMATION-ARCHITECTURE.md, 12. TESTING-AND-QUALITY-ASSURANCE.md, 13. DEPLOYMENT-AND-DEVOPS.md, 14. OPERATIONS-MONITORING-AND-INCIDENT-RESPONSE.md |

**Document 15** is status-snapshot only and shall not govern implementation decisions.

---

## Key Design Conflicts

### Memory Confirmation vs. Friction
- **Conflict:** MVP Critical FR-MEMORY-005, FR-MEMORY-016, FR-MEMORY-017 require user confirmation for candidate memories before retrieval, but PRD §44 requires "user control without constant interruption."
- **Resolution:** Automatic saving for clear, stable, non-sensitive information with non-disruptive notification; suggested memory requiring explicit confirmation for uncertain, inferred, or sensitive information (FR-MEMORY-027, FR-MEMORY-028).

### Single-Workspace-Manifesto vs. Multi-Workspace Architecture
- **Conflict:** PRD §35 states Gexor is "a single-workspace-manifesto application" at the user journey level, but the architecture (workspaces/conversations/execution model) is designed for multi-workspace from day one.
- **Resolution:** MVP delivers single-workspace UX with multi-workspace internal data model. Multi-workspace UI and team accounts are deferred post-MVP.

### Private Chat vs. Memory Extraction
- **Conflict:** Private Chat prohibits memory reading/writing by default (GOV-DOC02-011), but background memory extraction (FR-MEMORY-026) could conflict with privacy intent.
- **Resolution:** Private Chat defaults to no memory reading/writing. User may opt into memory reading only (no writing). Background extraction is gated by privacy mode.

### Rapid-Fire vs. Sequential Background
- **Conflict:** AC-MVP-007 requires Message B accepted while Message A background processing is incomplete, but the Snapshot Lock mechanism (RUNTIME-PIPELINE-008) guards against stale-overwrite.
- **Resolution:** Accept Message B immediately; sequence background processing using the Snapshot Lock; allow concurrent executions within a conversation with order guarantees.

### Snapshot Lock vs. No Blocking
- **Conflict:** Snapshot Lock (RUNTIME-PIPELINE-008) requires version checks to prevent stale overwrites, but rapid-fire acceptance requires non-blocking.
- **Resolution:** Lock applies only to background write operations (memory extraction, knowledge creation), not to message acceptance. Reads always see the latest snapshot.

---

## Open Questions

### Rate Limiting Granularity
- Document 03 specifies rate limiting (NFR-PERF-008, etc.) but does not specify whether limits are per-user, per-workspace, per-IP, or per-provider.

### Secret Scanning Depth
- PRD §65 mentions dynamic credential redaction in provider requests, but the exact scanning depth (e.g., inline image OCR, base64-encoded strings) is not specified.

### Token Counting Consistency
- Different providers count tokens differently. The system must estimate costs per-request (AC-MVP-010), but document 10 does not specify which tokenizer(s) to use for estimation.

### Export Format Detail
- Document 02 specifies data export (AC-MVP-012) but does not enumerate exact export formats (JSON? Markdown? CSV?).

### Rate Limit Enforcement Behavior
- When a rate limit is hit, should the system return 429, queue the request, or degrade? Not specified in documents 01–14.

---

## Cross-Cutting Constraints

### No System Prompt Injection
- The runtime pipeline shall never allow retrieved memory, knowledge, or user-uploaded file content to write into the system-prompt section of the final provider payload. All such content is restricted to the user-message or context sections with appropriate untrusted labelling.

### Respect Provider ToS
- The system shall respect each provider's terms of service, rate limits, and content policies. Provider credentials shall be stored encrypted.

### Not an Agent Framework
- Gexor is a chat interface, not an autonomous agent framework. The system shall not execute tool calls, run code, or perform actions on behalf of the user without explicit user instruction and confirmation.

### Zero-Knowledge Encryption Intent
- While Document 01 mentions zero-knowledge architecture as a goal, the MVP data model (Document 07) does not mandate server-side encryption with user-held keys. MVP should use encryption at rest with provider-managed keys; zero-knowledge is post-MVP.
