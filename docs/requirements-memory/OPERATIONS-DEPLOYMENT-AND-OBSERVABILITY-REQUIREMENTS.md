# Operations, Deployment, and Observability Requirements

**Source documents:** 03. NON-FUNCTIONAL-REQUIREMENTS.md, 13. DEPLOYMENT-AND-DEVOPS.md,
14. OPERATIONS-MONITORING-AND-INCIDENT-RESPONSE.md, 04. SYSTEM-CONTEXT-AND-HIGH-LEVEL-ARCHITECTURE.md

**Number of included requirements:** 28 NFR + 2 synthetic

For the full structured record of every requirement, see `REQUIREMENTS-INDEX.json`.

---

## Availability NFRs

### NFR-AVAIL-001 — Monthly Service Availability
- **Statement:** Gexor-controlled API and streaming services shall achieve monthly availability ≥ 99.5%, excluding approved maintenance.

### NFR-AVAIL-002 — Runtime Submission Availability
- **Statement:** Runtime submission acceptance shall achieve monthly availability ≥ 99.9%.

### NFR-AVAIL-003 — Provider Failure Isolation
- **Statement:** An individual provider failure shall not prevent Gexor-controlled operations or use of other connected providers.

### NFR-AVAIL-004 — Degraded Mode
- **Statement:** When a non-critical external dependency fails, the system shall continue providing core functionality in a degraded mode.

### NFR-AVAIL-005 — Streaming Service Availability
- **Statement:** The streaming service shall achieve availability sufficient to meet the combined runtime submission and first-event latency NFRs.

### NFR-AVAIL-006 — Administrative Availability
- **Statement:** Administrative functions shall be available during normal operation. Emergency administrative access shall be available during incidents.

### NFR-AVAIL-008 — Health Check Coverage
- **Statement:** Every service and critical integration shall expose a health-check endpoint.

### NFR-AVAIL-009 — Readiness Enforcement
- **Statement:** A service shall not accept traffic until its readiness checks pass. Readiness checks shall verify dependencies required for normal operation.

### NFR-AVAIL-010 — Availability Measurement Integrity
- **Statement:** Availability shall be measured using server-side health checks and user-facing request success rates. Provider failures shall be reported separately.

---

## Scalability NFRs

### NFR-SCALE-001 — Concurrent User Capacity
- **Statement:** The system shall support the MVP concurrent user target without degrading P95 latency beyond the degradation bound.

### NFR-SCALE-002 — Concurrent Runtime Capacity
- **Statement:** The system shall support the MVP concurrent runtime execution target without exceeding per-execution latency budgets.

### NFR-SCALE-004 — Horizontal Runtime Scaling
- **Statement:** Runtime services shall support horizontal scaling by adding instances without topology changes.

### NFR-SCALE-005 — Stateless Request Handling
- **Statement:** API and runtime services shall be stateless for request processing. Session state shall be stored in a shared data store.

### NFR-SCALE-006 — Queue Backpressure
- **Statement:** Background job submission shall apply backpressure when queue depth exceeds configured thresholds.

### NFR-SCALE-007 — Per-Workspace Fairness
- **Statement:** The system shall prevent a single workspace from consuming disproportionate shared resources.

---

## Resilience NFRs

### OPS-DOC14-002 — Process Recovery
- **Statement:** A service process failure shall not cause permanent data loss. In-flight executions shall be recoverable or gracefully failed.

### OPS-DOC14-003 — Retry with Exponential Backoff
- **Statement:** Transient failures shall be retried with exponential backoff and jitter.

### OPS-DOC14-004 — Background Job Recovery
- **Statement:** Failed background jobs shall be retried according to policy. Jobs exceeding the retry limit shall be recorded and escalated.

---

## Observability NFRs

### NFR-OBS-001 — Request Tracing
- **Statement:** Every user-facing request shall produce a trace spanning ingress through completion, including provider and background processing stages.

### NFR-OBS-003 — Structured Logging
- **Statement:** All services shall produce structured logs with consistent fields: timestamp, level, service, request ID, workspace ID (where safe), execution ID, correlation ID.

### NFR-OBS-004 — Metrics Collection
- **Statement:** The system shall collect metrics for: request rate, error rate, latency percentiles, queue depth, provider response time, active users, memory usage.

### NFR-OBS-006 — Availability Monitoring
- **Statement:** Automated health checks shall monitor service availability and report degradation.

### NFR-OBS-007 — Provider Status Monitoring
- **Statement:** Provider API availability and error rates shall be monitored separately from Gexor-controlled metrics.

---

## Deployment Requirements (Document 13)

### Environment Separation
- Dev, test, staging, production: separate accounts, networks, identities, keys, secret namespaces, data, providers/quotas, observability, deployment approvals.
- Production data/secrets never enter lower environments.

### Infrastructure as Code
- All infra, identity, network, policies, alerts, backup schedules: version-controlled IaC.
- Manual production changes: emergency-only, audited, reconciled back to code.

### CI/CD Flow
PR → Lint/Test/Scan/Contract → Build/Sign/SBOM → Deploy Test → Integration/E2E → Deploy Staging → Performance/Security/Resilience → Production Approval → Canary/Progressive → Full Production (auto-rollback).

### Database Changes
- Expand/migrate/contract pattern. Backward-compatible expansion before code reliance.
- Migrations never make external calls.
- Search/vector: parallel index build + alias/cutover.

### Rollback
- Stateless: rolling, canary, or blue/green. Auto-rollback for compatible changes.
- Irreversible data changes: roll-forward plans, tested backups, explicit approval.

### Backup/Recovery
- Encrypted DB PITR, object versioning/backup, critical config retention, secret recovery, derived-index rebuild.
- Restore drills: verify tenant isolation, referential integrity, outbox/queue consistency.

---

## Incident Response (Document 14)

### OPS-DOC14-001 — Service Ownership (synthetic)
- **Statement:** Every service, job class, data store, integration, dashboard, alert, and runbook shall have a named technical owner with escalation path. Provider failures measured separately.
- **Source:** 14. OPERATIONS-MONITORING-AND-INCIDENT-RESPONSE.md §2

### Severity Classification (Document 14 §5)
- Sev1: service unavailable or data loss
- Sev2: partial degradation with workaround
- Sev3: non-critical issue
- Sev4: cosmetic or minor

### Communication (Document 14 §6–7)
- Status page, in-app notifications for major incidents.
- Post-incident review: timeline, root cause, impact, detection/response gaps, action items.

### Operational Readiness (Document 14 §9)
- Service catalog, dashboard, alert, runbook, on-call rotation per service.
- Production readiness review before launch and material architecture changes.
