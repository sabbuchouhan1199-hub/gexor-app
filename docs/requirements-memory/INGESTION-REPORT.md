# Ingestion Report

**Generated:** 2026-07-20

**Source documents:** gexor-docs Documents 01–15 at commit `1c8b628`

**Target directory:** `docs/requirements-memory/`

---

## Summary

| Metric | Value |
|--------|-------|
| Source documents read | 15 |
| Functional requirements (FR) extracted | 426 |
| Non-functional requirements (NFR) extracted | 160 |
| Synthetic governance/architecture/UX/ops constraints added | 36 |
| Acceptance criteria (AC) added | 16 |
| **Total requirements in index** | **638** |
| Output markdown files | 14 |
| Output JSON index | 1 |

---

## Files Created

| File | Purpose |
|------|---------|
| `README.md` | Memory package overview and usage guide |
| `REQUIREMENTS-INDEX.json` | Complete structured index of all 598 requirements |
| `MVP-REQUIREMENTS.md` | MVP critical, required, and nice-to-have classifications |
| `RUNTIME-REQUIREMENTS.md` | Runtime execution pipeline, state machine, engines |
| `SECURITY-AND-ISOLATION-REQUIREMENTS.md` | Auth, RBAC, workspace isolation, secrets, audit |
| `DATA-AND-PERSISTENCE-REQUIREMENTS.md` | Data model, entities, lifecycle, retention, export |
| `PROVIDER-AND-ROUTING-REQUIREMENTS.md` | Provider connection, credential mgmt, model routing |
| `CONTEXT-MEMORY-AND-KNOWLEDGE-REQUIREMENTS.md` | Memory lifecycle, retrieval, context construction |
| `UX-AND-ACCESSIBILITY-REQUIREMENTS.md` | UX principles, IA, WCAG 2.2 AA, journeys |
| `TESTING-QUALITY-AND-ACCEPTANCE-REQUIREMENTS.md` | Test model, ACs, release criteria |
| `OPERATIONS-DEPLOYMENT-AND-OBSERVABILITY-REQUIREMENTS.md` | Availability, scalability, resilience, IaC, IR |
| `DEFERRED-FUTURE-AND-OUT-OF-SCOPE.md` | Deferred MVP items, out-of-scope, strategic goals |
| `GOVERNANCE-CONFLICTS-AND-OPEN-QUESTIONS.md` | Document hierarchy, design conflicts, open questions |
| `DOCUMENT-15-STATUS-SNAPSHOT.md` | Non-governing status snapshot from Document 15 |

---

## Source Document Coverage

| Doc | Title | FRs | NFRs | Notes |
|-----|-------|-----|------|-------|
| 01 | PRD.md | 25 | 10 | UX principles, deferred scope, strategic goals |
| 02 | FUNCTIONAL-REQUIREMENTS.md | 122 | 0 | Primary FR source; 16 MVP ACs |
| 03 | NON-FUNCTIONAL-REQUIREMENTS.md | 0 | 150 | All NFRs; availability, perf, security, etc. |
| 04 | SYSTEM-CONTEXT-AND-HIGH-LEVEL-ARCHITECTURE.md | 48 | 0 | Content trust hierarchy, architectural entities |
| 05 | RUNTIME-PIPELINE.md | 59 | 0 | State machine, Snapshot Lock, cancellation |
| 06 | DOMAIN-MODEL.md | 0 | 0 | Domain model specification, no extractable numbered FRs/NFRs |
| 07 | DATABASE-DESIGN.md | 52 | 0 | Database entities, enums, relationships |
| 08 | API-DESIGN.md | 38 | 0 | API design, system interfaces |
| 09 | CORE-ENGINES.md | 36 | 0 | Context, memory, knowledge, search engines |
| 10 | SECURITY-ARCHITECTURE.md | 31 | 0 | Security architecture, endpoint definitions |
| 11 | UX-AND-INFORMATION-ARCHITECTURE.md | 0 | 0 | UX patterns, IA, accessibility guidance |
| 12 | TESTING-AND-QUALITY-ASSURANCE.md | 0 | 0 | Test model, ACs, release criteria |
| 13 | DEPLOYMENT-AND-DEVOPS.md | 0 | 0 | IaC, CI/CD, database, rollback |
| 14 | OPERATIONS-MONITORING-AND-INCIDENT-RESPONSE.md | 0 | 0 | IR, observability, runbooks |
| 15 | IMPLEMENTATION-STATUS-AND-TRACEABILITY.md | 0 | 0 | Non-governing status snapshot |

---

## Synthetic Requirements

36 synthetic constraints were added to cover governance, cross-cutting, deferred features,
and authority-hierarchy requirements not explicitly enumerated as FRs/NFRs in the source
documents:

- ARCH-DOC04-001 through ARCH-DOC04-003 — architectural constraints from Document 04
- ARCH-DOC05-001 — architectural constraint from Document 05
- ARCH-DOC06-001 — architectural constraint from Document 06
- ARCH-DOC08-001, ARCH-DOC08-002 — architectural constraints from Document 08
- ARCH-DOC10-001 — architectural constraint from Document 10
- DATA-DOC07-001 — data constraint from Document 07
- GOV-DOC02-001 through GOV-DOC02-015 — governance constraints for deferred team/file/provider features and private chat
- OPS-DOC14-001 through OPS-DOC14-004 — operations constraints (service ownership, resilience)
- TEST-DOC12-001 — release exit criteria
- UX-DOC11-001 through UX-DOC11-007 — WCAG 2.2 AA baseline and accessibility requirements

---

## Notable Decisions

### No FRs/NFRs Extracted From Documents 06, 11–15
- **06 (Domain Model):** Domain model specification; ARCH-DOC06-001 created as synthetic architectural constraint.
- **11 (UX and IA):** UX patterns and IA structure; UX-DOC11-001 through UX-DOC11-007 created as synthetic UX constraints for WCAG 2.2 AA and accessibility.
- **12 (Testing and QA):** Test model specification; TEST-DOC12-001 created as synthetic test constraint for release exit criteria.
- **13 (Deployment and DevOps):** Deployment practices; incorporated into OPS domain file as prose.
- **14 (Operations and IR):** Incident response procedures; OPS-DOC14-001 through OPS-DOC14-004 created as synthetic operations constraints.
- **15 (Status):** Non-governing status snapshot only.

### ACs Indexed as AC Prefixed IDs
- 16 MVP Acceptance Criteria from Document 02 §16 are indexed with AC-MVP prefix (AC-MVP-001 through AC-MVP-016) for traceability.

### Synthetic Constraint IDs Used

| Synthetic Prefix | Source Document | Count | Purpose |
|---|---|---|---|
| ARCH-DOC04-* | 04 | 3 | Architectural constraints from system context |
| ARCH-DOC05-* | 05 | 1 | Architectural constraint from runtime pipeline |
| ARCH-DOC06-* | 06 | 1 | Architectural constraint from domain model |
| ARCH-DOC08-* | 08 | 2 | Architectural constraints from API design |
| ARCH-DOC10-* | 10 | 1 | Architectural constraint from security architecture |
| DATA-DOC07-* | 07 | 1 | Data constraint from database design |
| GOV-DOC02-* | 02 | 15 | Governance constraints: deferred team/file/provider features, private chat |
| OPS-DOC14-* | 14 | 4 | Operations constraints: ownership, resilience, process recovery |
| TEST-DOC12-* | 12 | 1 | Test constraint: release exit criteria |
| UX-DOC11-* | 11 | 7 | UX constraints: accessibility requirements, WCAG 2.2 AA baseline |

### Authority Hierarchy Respected
- Where Document 05/09 (priority 1) detail differs from Document 04/07/10 (priority 4), the higher-priority document's requirement is recorded.

---

## Quality Checks

| Check | Status |
|-------|--------|
| JSON parses successfully | Pass |
| All markdown IDs exist in JSON index | Pass (638 in index, 0 missing) |
| No placeholder IDs (e.g., "TBD", "TODO") | Pass |
| All FR IDs numeric | Pass |
| All NFR IDs numeric | Pass |
| No duplicate IDs | Pass |
| Every file has a header with source docs | Pass |
| No source documents modified | Pass |
| No application code modified | Pass |
