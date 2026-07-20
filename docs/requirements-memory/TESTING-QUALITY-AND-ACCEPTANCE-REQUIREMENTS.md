# Testing, Quality, and Acceptance Requirements

**Source documents:** 02. FUNCTIONAL-REQUIREMENTS.md, 03. NON-FUNCTIONAL-REQUIREMENTS.md,
12. TESTING-AND-QUALITY-ASSURANCE.md

**Number of included requirements:** 16 AC requirements + document-12 test model

For the full structured record of every requirement, see `REQUIREMENTS-INDEX.json`.

---

## MVP Acceptance Criteria (Document 02 §16)

### AC-MVP-001 — Account and Workspace Readiness
- **Statement:** A user shall be able to register, authenticate, and access a personal workspace.

### AC-MVP-002 — Workspace Isolation
- **Statement:** Workspace A data shall not be accessible from Workspace B.

### AC-MVP-003 — Provider Connection
- **Statement:** A user shall be able to connect a supported provider, test the connection, and select a model.

### AC-MVP-004 — Conversational Execution
- **Statement:** A user shall be able to send a message, receive a streamed response, cancel streaming, and regenerate.

### AC-MVP-005 — Context and Prompt Control
- **Statement:** A user shall be able to select prompt enhancement mode and view runtime details showing context used, memories retrieved, and final prompt.

### AC-MVP-006 — Structured Memory
- **Statement:** A user shall be able to create, view, edit, confirm, reject, disable, and delete memories within a workspace.

### AC-MVP-007 — Rapid-Fire Message Responsiveness
- **Statement:** If the user sends Message B while Message A background processing is incomplete, Message B shall be accepted and processed without blocking.

### AC-MVP-010 — Usage and Cost Visibility
- **Statement:** A user shall be able to view per-request token counts and estimated provider cost.

### AC-MVP-012 — Export and Deletion
- **Statement:** A user shall be able to export workspace data and request account or workspace deletion.

### AC-MVP-016 — Audit and Error Safety
- **Statement:** Security-significant events shall be auditable. Errors shall not expose credentials, internal topology, or other workspace content.

Full AC list: AC-MVP-001 through AC-MVP-016 in `REQUIREMENTS-INDEX.json`.

---

## Test Model (Document 12 §1–3)

### Test Levels
| Level | Scope |
|-------|-------|
| Unit/Property | Validation, state machines, budget/routing rules, invariants, redaction |
| Component | Service/engine behaviour with controlled dependencies |
| Contract | OpenAPI, SSE, events, provider adapters, backward compatibility |
| Integration | Database, object store, queue, search/vector, secret manager, identity |
| End-to-end | Sign-in through chat, files, memory, usage, export/deletion |
| Non-functional | Performance, scale, security, accessibility, resilience, recovery |
| Operational | Deploy/rollback, dashboards, alerts, runbooks, restore/incident drills |

### Critical Functional Test Suites (Document 12 §4)
- Identity: registration, login, recovery, expiry, logout, MFA, revocation
- Isolation: every workspace-owned endpoint/query/job/cache/index/export/delete path + adversarial ID substitution
- Conversation/runtime: acceptance atomicity, idempotency, state transitions, streaming order/reconnect, cancellation, retry/regeneration, timeout, terminal races, Snapshot Lock
- Context/memory: eligibility, ranking, token reduction, candidate confirmation, conflict, stale job protection, provenance, deletion
- Provider: credential lifecycle, catalog/model eligibility, explicit choice, fallback, normalized errors, late output
- Files/search: type/size/malware, parsing/chunking, hybrid results/citations, source versions, derived cleanup
- Usage: estimate/report reconciliation, price versions, reservations, quota/spending concurrency
- Lifecycle: export completeness, soft/permanent deletion, backup disclosure, restoration authorization

### Non-Functional Verification (Document 12 §5)
- Performance: NFRS percentiles for acceptance, preparation, first stream, relay overhead, retrieval, cancellation, enqueue, token counting
- Load profiles: steady, burst, noisy-neighbor, large conversation, large workspace, provider degradation
- Soak: leaks, queue drift
- Reliability: process death, duplicate/out-of-order events, queue redelivery, database failover, cache loss, index lag, provider timeouts, partial streams
- Recovery: RPO/RTO verification, restore integrity, reconciliation, no cross-workspace contamination

### Security Testing (Document 12 §6)
- CI: SAST, dependency/license, secrets, IaC, container, API schema scanning
- Dynamic: OWASP web/API risks, BOLA/IDOR, injection, SSRF, CSRF, session, file attacks, rate/cost abuse, credential redaction, privilege escalation, webhook replay, audit tampering
- AI adversarial: prompt injection, malicious retrieved documents, context exfiltration, unsafe tool parameters, system-prompt/secret extraction
- Penetration testing required before production

---

## Release Exit Criteria (Document 12 §11)

### TEST-DOC12-001 — Release Exit Criteria (synthetic)
- **Statement:** Before any MVP release: All MVP critical/required requirements must have passing evidence. No open Severity 1 or unaccepted Severity 2 defects. Security, tenant-isolation, accessibility, performance, resilience, migration, rollback, restore gates must pass. Alert/runbook checks and operational readiness must pass. Product, Engineering, QA, Security, Operations must approve.
- **Source:** 12. TESTING-AND-QUALITY-ASSURANCE.md §11

### Automated Pipeline (Document 12 §9)
- PR gates: lint, unit/property, contract/breaking-change, component, migration, security/secret scans, changed-scope accessibility
- Main-branch: + integration, E2E
- Release candidates: + perf smoke, resilience, full security, accessibility, deploy/rollback, observability, backup/restore
- Flaky tests quarantined with owner, issue, expiry, compensating coverage

### Test Data (Document 12 §8)
- Synthetic, deterministic, workspace-separated data factories
- Production content, provider keys, personal data prohibited in lower environments
- Each suite creates unique tenants and cleans through product lifecycle APIs
