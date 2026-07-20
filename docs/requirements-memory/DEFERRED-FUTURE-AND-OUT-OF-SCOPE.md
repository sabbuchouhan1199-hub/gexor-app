# Deferred, Future, and Out-of-Scope Items

**Source documents:** 01. PRD.md, 02. FUNCTIONAL-REQUIREMENTS.md, 03. NON-FUNCTIONAL-REQUIREMENTS.md

**Number of included requirements:** 2 deferred FR + deferred system sections

For the full structured record of every requirement, see `REQUIREMENTS-INDEX.json`.

---

## Deferred MVP Requirements (Document 02 §17)

### GOV-DOC02-001 — Team Account (deferred)
- **Statement:** A user with a team account shall be able to create a team workspace with role-based access.
- **Classification:** Governance-only
- **Reason:** Multi-user RBAC deferred post-MVP

### GOV-DOC02-002 — Team Invitation (deferred)
- **Statement:** A team workspace owner shall be able to invite members and assign roles.
- **Classification:** Governance-only
- **Reason:** Multi-user RBAC deferred post-MVP

### GOV-DOC02-003 — Team Billing (deferred)
- **Statement:** A team account may support a consolidated billing model.
- **Classification:** Governance-only
- **Reason:** Multi-user billing deferred post-MVP

### GOV-DOC02-012 — Model Recommendation (deferred)
- **Statement:** The router may recommend a model based on task, cost, latency, and capability.
- **Classification:** Governance-only
- **Reason:** Intelligence enhancements deferred post-MVP

### GOV-DOC02-013 — Model Routing Constraint (deferred)
- **Statement:** The user may request routing within a provider family or capability tier.
- **Classification:** Governance-only
- **Reason:** Intelligence enhancements deferred post-MVP

### GOV-DOC02-014 — Prompt Enhancement (deferred)
- **Statement:** The user may use prompt enhancement to optimize a prompt for the selected model.
- **Classification:** Governance-only
- **Reason:** Intelligence enhancements deferred post-MVP

### GOV-DOC02-015 — Automatic Provider Fallback (deferred)
- **Statement:** The router may automatically fall back to an alternative provider or model if the primary request fails.
- **Classification:** Governance-only
- **Reason:** Intelligence enhancements deferred post-MVP

### FR-KNOWLEDGE-007 — Knowledge Automation (deferred)
- **Statement:** The system may periodically scan eligible sources for new knowledge.
- **Classification:** Future
- **Reason:** Intelligence enhancements deferred post-MVP

### FR-KNOWLEDGE-009 — Multimodal Knowledge (deferred)
- **Statement:** Knowledge records may support multimodal content.
- **Classification:** Future
- **Reason:** Intelligence enhancements deferred post-MVP

### FR-MEMORY-001.1 — Automatic Memory Extraction (deferred)
- **Statement:** The system may extract memory candidates from completed provider responses.
- **Classification:** Future
- **Reason:** Intelligence enhancements deferred post-MVP

### GOV-DOC02-005 — File Upload (deferred)
- **Statement:** The user shall be able to upload files up to 25 MiB. File content shall be extracted as knowledge.
- **Classification:** Governance-only
- **Reason:** File handling deferred post-MVP

### GOV-DOC02-006 — File Metadata (deferred)
- **Statement:** Uploaded files shall show file name, type, upload date, and file size.
- **Classification:** Governance-only
- **Reason:** File handling deferred post-MVP

### GOV-DOC02-007 — File Search (deferred)
- **Statement:** File content shall be searchable through the conversation search interface.
- **Classification:** Governance-only
- **Reason:** File handling deferred post-MVP

### GOV-DOC02-008 — File Reprocessing (deferred)
- **Statement:** The user may request file reprocessing after configuration change.
- **Classification:** Governance-only
- **Reason:** File handling deferred post-MVP

### GOV-DOC02-009 — File Deletion (deferred)
- **Statement:** File deletion shall deny the deleted version from retrieval and prompt construction.
- **Classification:** Governance-only
- **Reason:** File handling deferred post-MVP

### GOV-DOC02-010 — File Compliance (deferred)
- **Statement:** File handling shall comply with data retention and deletion policies.
- **Classification:** Governance-only
- **Reason:** File handling deferred post-MVP

---

## Out-of-Scope Items (PRD §8)

- Native mobile/desktop applications (prioritize web-first)
- Plugin/extension ecosystem (too broad for initial scope)
- Custom fine-tuned local model hosting (not a model provider)
- Marketplace
- Multimodal generation
- API/SDK for third-party integration (consider post-MVP)
- Real-time voice/video
- No-code/workflow builder
- Browser automation (Obsidian plugin / MCP server)
- Offline mode
- Built-in observability (use existing tools)
- AI-powered analytics
- AI-assisted configuration

---

## Internal Tooling / Strategic Goals (PRD §67)

- Supply chain hardening (SBOM, signed images, provenance attestation, cosign/notation, admission controller)
- Automatic dependency updates (automated patch PRs, minor update bundles, major gated)
- Anti-pattern detection (static analysis, manual review for ORM N+1, no-buffer streaming, mixed concerns, missing validation, broken status/error flows, coarse single-process locking, CPU-intensive work during API response)
- Flaky test management (automated quarantine with Jira issue, owner, expiry)
- Upgrade to non-vulnerable, non-EOL dependencies
- Future B2B SSO (SAML/OIDC, SCIM)
- Internationalization (l10n/i18n)
