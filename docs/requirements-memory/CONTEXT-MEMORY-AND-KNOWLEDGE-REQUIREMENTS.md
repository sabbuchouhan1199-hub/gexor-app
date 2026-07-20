# Context, Memory, and Knowledge Requirements

**Source documents:** 02. FUNCTIONAL-REQUIREMENTS.md, 03. NON-FUNCTIONAL-REQUIREMENTS.md,
05. RUNTIME-PIPELINE.md, 09. CORE-ENGINES.md

**Number of included requirements:** 30+ FR + 6 NFR + 2 synthetic

For the full structured record of every requirement, see `REQUIREMENTS-INDEX.json`.

---

## Memory Lifecycle

### FR-MEMORY-001 — Memory Creation
- **Statement:** The system may create a structured memory record from: explicit user instruction, automatic extraction, suggested extraction, manual entry, or editing an existing memory.

### FR-MEMORY-002 — Memory Record Structure
- **Statement:** Each memory record shall contain: content, category, workspace ID, source conversation, source message, creation method, confidence, confirmation status, sensitivity level, creation/last-updated/last-used timestamps, usage count, active/disabled status, optional expiry.

### FR-MEMORY-003 — Memory Category
- **Statement:** Supported memory categories shall include: project fact, client fact, decision, requirement, constraint, preference, instruction, entity, current status, temporary context, custom note.

### FR-MEMORY-004 — Memory State Model
- **Statement:** Each memory shall have an explicit lifecycle: candidate_linked, active, inactive, conflicted, superseded, expired, deletion_pending, deleted.

### FR-MEMORY-005 — Memory Candidate Status
- **Statement:** A newly created memory candidate shall not be eligible for retrieval until it reaches active status through confirmation.

### FR-MEMORY-006 — Memory Workspace Isolation
- **Classification:** MVP Critical
- **Statement:** A memory shall belong to exactly one workspace. Memory retrieval shall only return memories from the authorized workspace.

### FR-MEMORY-007 — Memory Retrieval
- **Classification:** MVP Critical
- **Statement:** Memory retrieval shall consider: workspace match, task relevance, active status, confirmation status, confidence, recency, importance, category, user restrictions, and token budget.

### FR-MEMORY-008 — Memory Retrieval Exclusion
- **Statement:** Expired, disabled, deleted, or superseded memories shall not be returned by retrieval.

---

## User Memory Controls

### FR-MEMORY-009 — Memory Viewing
- **Statement:** The user shall be able to view active, inactive, and suggested memories within an authorized workspace.

### FR-MEMORY-010 — Memory Search
- **Statement:** The user shall be able to search memory content within an authorized workspace.

### FR-MEMORY-011 — Memory Filtering
- **Statement:** The user shall be able to filter memories by category, status, workspace, and creation date.

### FR-MEMORY-012 — Manual Memory Addition
- **Statement:** The user shall be able to manually add a memory to an authorized workspace.

### FR-MEMORY-013 — Memory Editing
- **Statement:** The user shall be able to edit existing memory content, category, and status.

### FR-MEMORY-014 — Memory Disabling
- **Statement:** The user shall be able to disable an active memory, excluding it from future retrieval.

### FR-MEMORY-015 — Memory Deletion
- **Statement:** The user shall be able to delete a memory from an authorized workspace.

### FR-MEMORY-016 — Memory Confirmation
- **Statement:** The user shall be able to confirm a suggested memory, promoting it to active status.

### FR-MEMORY-017 — Memory Rejection
- **Statement:** The user shall be able to reject a suggested memory, removing it from the candidate set.

---

## Memory Integrity

### FR-MEMORY-018 — Memory Deletion Integrity
- **Statement:** When a source message or conversation is deleted, associated memories and their retrieval eligibility shall be handled according to the configured source-deletion policy.

### FR-MEMORY-019 — Memory Candidate Deduplication
- **Statement:** The system shall detect and prevent creation of duplicate memory candidates for the same fact within the same workspace.

### FR-MEMORY-020 — Memory Conflict Detection
- **Statement:** When a new memory candidate contradicts an existing active memory, the system shall record the conflict and notify the user.

### FR-MEMORY-021 — Memory Conflict Resolution
- **Statement:** The user shall be able to resolve memory conflicts by: keeping existing, replacing, keeping both with conditions, editing manually, or marking unresolved.

### FR-MEMORY-022 — Memory Content Trust Boundary
- **Classification:** MVP Critical
- **Statement:** Retrieved memory content shall be treated as untrusted contextual data. It shall not automatically become system instructions or override the current user request.

### FR-MEMORY-023 — Memory Provenance
- **Statement:** Each memory shall maintain traceability to its originating conversation and message.

### FR-MEMORY-024 — Stale Memory Detection
- **Statement:** The system may detect and flag memories that have not been confirmed or used for an extended period.

### FR-MEMORY-025 — Memory Candidate Exclusion from Retrieval
- **Statement:** Unconfirmed memory candidates shall not be included in retrieval results.

---

## Background Memory Processing

### FR-MEMORY-026 — Background Memory Extraction
- **Statement:** The system may extract memory candidates from completed provider responses as a background operation.

### FR-MEMORY-027 — Automatic Memory Saving
- **Statement:** When clear, stable, confirmed, non-sensitive information is detected, the system may automatically save the memory candidate and notify the user.

### FR-MEMORY-028 — Memory Suggestion
- **Statement:** For uncertain, inferred, or sensitive information, the system shall create a suggested memory requiring user confirmation.

### FR-MEMORY-029 — Memory Source Snapshot
- **Statement:** Background memory extraction shall operate on a point-in-time snapshot of the source execution.

---

## Context Construction

### FR-RUNTIME-007 — Context Authorization
- **Statement:** Every execution shall verify workspace access, credential authorization, model eligibility, and memory authorization before context construction.

### FR-MEMORY-030 — Context Budget Management
- **Statement:** The system shall manage a context budget that allocates capacity among mandatory instructions, recent messages, retrieved memories, workspace instructions, and the current user message.

### ARCH-DOC04-003 — Content Trust Hierarchy
- **Statement:** 9-level instruction precedence for context construction. Retrieved content labelled untrusted.
- **Source:** 04. SYSTEM-CONTEXT-AND-HIGH-LEVEL-ARCHITECTURE.md §15

---

## Knowledge Requirements

### FR-KNOWLEDGE-001 — Knowledge Record
- **Statement:** A knowledge record shall store structured information derived from approved sources.

### FR-KNOWLEDGE-002 — Knowledge Source Eligibility
- **Statement:** Only approved source types (user-uploaded files, explicit user knowledge) shall be eligible for knowledge extraction.

### FR-KNOWLEDGE-003 — Knowledge Extraction
- **Statement:** Knowledge shall be extracted from eligible sources through approved processing pipelines.

### FR-KNOWLEDGE-004 — Knowledge Deduplication
- **Statement:** The system shall detect and prevent duplicate knowledge records for the same information within the same workspace.

### FR-KNOWLEDGE-005 — Knowledge Retrieval
- **Statement:** Knowledge retrieval shall consider workspace scope, source eligibility, relevance, and recency.

### FR-KNOWLEDGE-006 — Knowledge Provenance
- **Statement:** Each knowledge record shall maintain traceability to its source file or conversation.

### FR-KNOWLEDGE-008 — Knowledge Deletion Reconciliation
- **Statement:** When a knowledge source is deleted, associated knowledge records and retrieval eligibility shall be reconciled.

---

## Memory NFRs

### NFR-REL-007 — Memory Provenance Integrity
- **Statement:** The system shall maintain provable traceability between a memory and its source message, conversation, and workspace.

### NFR-SEC-014 — Sensitive Memory Protection
- **Statement:** The system shall support sensitivity classification for memory records and may restrict automatic saving of high-sensitivity information.

### UX-DOC11-004 — Memory Inspectability
- **Statement:** Memory controls and retrieval details shall be accessible through standard keyboard navigation and screen readers.

---

## Unresolved Conflict Fallback (PRD §30.6)

### FR-MEMORY-031 — Unresolved Conflict Non-Blocking
- **Statement:** If the user continues chatting without resolving a memory conflict, the prompt generation pipeline shall not block or crash. The Context Engine shall use the most recent user statement as authoritatively true. The older memory shall remain stored and marked as part of an unresolved conflict.
