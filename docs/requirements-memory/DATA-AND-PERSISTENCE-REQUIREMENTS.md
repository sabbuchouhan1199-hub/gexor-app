# Data and Persistence Requirements

**Source documents:** 02. FUNCTIONAL-REQUIREMENTS.md, 03. NON-FUNCTIONAL-REQUIREMENTS.md,
06. DOMAIN-MODEL.md, 07. DATABASE-DESIGN.md

**Number of included requirements:** 20+ FR + 12 NFR + 1 synthetic

For the full structured record, see `REQUIREMENTS-INDEX.json`.

---

## Data Model and Storage

### DATA-DOC07-001 — Database Design Principles (synthetic)
- **Statement:** Every tenant-owned row shall carry workspace_id. Stable generated identifiers as PKs. Canonical and derived records separate. UTC timestamps. Version column for mutable aggregates. Secrets in secret manager only. Append-only runtime/audit evidence.
- **Source:** 07. DATABASE-DESIGN.md §2

### FR-WORKSPACE-029 — Export Segregation
- **Statement:** Exports shall contain only data from the requested workspace.

### FR-WORKSPACE-030 — Workspace Deletion Boundary
- **Statement:** Workspace deletion shall not affect data in other workspaces.

---

## Deletion Requirements

### FR-ADMIN-058 — Account Deletion Request
- **Statement:** The user shall be able to request deletion of their account. The request shall trigger the configured deletion workflow.

### FR-ADMIN-059 — Workspace Deletion Request
- **Statement:** The Workspace Owner shall be able to request deletion of a workspace.

### FR-ADMIN-060 — Deletion Cooling-Off Period
- **Statement:** After a deletion request, the system shall support a configurable cooling-off period during which the user may cancel.

### FR-ADMIN-061 — Deletion Cancellation
- **Statement:** The user or Workspace Owner shall be able to cancel a deletion request during the cooling-off period.

### FR-ADMIN-062 — Complete Erasure Processing
- **Statement:** Within 30 days of the deletion request, the system shall permanently hard-purge all associated rows, assets, metadata, cached data, background queues, and copies in Gexor-controlled system backups.

### FR-ADMIN-063 — Provider Credential Erasure
- **Statement:** Provider credentials must be removed from the credential store as part of the deletion workflow.

### FR-ADMIN-064 — Derived Data Erasure
- **Statement:** Indexes, embeddings, caches, summaries, and other derived representations of the deleted source data shall be removed or rebuilt.

### FR-ADMIN-065 — Backup Deletion Handling
- **Statement:** Deletion workflow shall account for data held in encrypted system backups according to the backup retention schedule.

### FR-ADMIN-066 — Legal Retention Exception
- **Statement:** Where legal or regulatory requirements mandate retention beyond the standard deletion period, the system shall support a controlled legal-hold mechanism that preserves only the minimum required records.

### FR-ADMIN-067 — Deletion Job Idempotency
- **Statement:** Deletion jobs shall be idempotent. Re-execution after a partial or ambiguous outcome shall not cause duplicate or destructive effects.

### FR-ADMIN-068 — Deletion Failure Reconciliation
- **Statement:** Failed deletion operations shall be recorded, retried, and escalated after exceeding the configured retry limit.

### FR-ADMIN-069 — Deletion Completion Record
- **Statement:** The system shall record and retain an immutable completion record for each deletion workflow.

### FR-ADMIN-070 — Deletion Confirmation
- **Statement:** The requesting user shall receive confirmation after deletion completes.

---

## Export Requirements

### FR-ADMIN-047 — Data Export Request
- **Statement:** The user shall be able to request an export of their workspace data or account data through an approved export workflow.

### FR-ADMIN-048 — Export Scope
- **Statement:** Exports shall include: conversations, messages, memories, workspace settings, instructions, usage history. Provider API keys shall never be included.

### FR-ADMIN-049 — Export Secret Exclusion
- **Statement:** Exports shall not include authentication secrets, provider credentials, or session tokens.

### FR-ADMIN-052 — Export Generation
- **Statement:** Export shall be generated asynchronously. The user shall be notified when the export is ready for download.

### FR-ADMIN-055 — Export Expiration
- **Statement:** Completed exports shall expire after a defined period. Expired exports shall be removed from accessible storage.

---

## Data Integrity and Retention NFRs

### NFR-DATA-001 — Soft-Deletion Immediate Effect
- **Statement:** When a user requests deletion, the entity shall be soft-deleted immediately, making it unavailable in the application interface and normal runtime.

### NFR-DATA-002 — Permanent Deletion Timeline
- **Statement:** Gexor shall permanently hard-purge all associated data within exactly 30 days of the deletion request.

### NFR-DATA-005 — Deletion-Request Recording
- **Statement:** The deletion workflow shall record the request timestamp, immediate soft-deletion status, hard-purge deadline, and final purge-completion timestamp.

### NFR-DATA-008 — Export Scope Integrity
- **Statement:** An export shall contain only data from the authorized scope. Cross-workspace data shall not be included.

### NFR-DATA-009 — Deletion Independent of Provider
- **Statement:** The 30-day hard-purge applies to data controlled by Gexor. Data transmitted to an external AI provider remains subject to that provider's independent retention and deletion policies.

---

## Migration Policy

### (07. DATABASE-DESIGN.md §3)
- Migrations shall be immutable, ordered, peer-reviewed.
- Expand/migrate/contract compatibility pattern.
- Destructive changes require verified backups and rollback instructions.
- Seed data limited to permissions, provider catalog metadata, safe defaults.
- No production credentials or customer data in fixtures.
