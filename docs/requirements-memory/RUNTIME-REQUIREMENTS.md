# Runtime Requirements

**Source documents:** 02. FUNCTIONAL-REQUIREMENTS.md, 03. NON-FUNCTIONAL-REQUIREMENTS.md,
04. SYSTEM-CONTEXT-AND-HIGH-LEVEL-ARCHITECTURE.md, 05. RUNTIME-PIPELINE.md,
09. CORE-ENGINES.md

**Number of included requirements:** 38 FR + 20 NFR + 3 synthetic

Grouped by subdomain. For the full structured record, see `REQUIREMENTS-INDEX.json`.

---

## Execution Lifecycle

### FR-RUNTIME-001 — Execution Creation
- **Classification:** MVP Critical
- **Statement:** Each eligible user message shall create a unique runtime execution with a stable identifier, initial state, correlation chain, workspace scope, and user identity.
- **Source:** 02. FUNCTIONAL-REQUIREMENTS.md §9.1

### FR-RUNTIME-002 — Execution State
- **Statement:** Each execution shall have an explicit lifecycle state: created, validating, preparing, provider_pending, streaming, finalizing, reconciliation_pending, completed, failed, cancellation_requested, cancelled.
- **Source:** 02. FUNCTIONAL-REQUIREMENTS.md §9.1

### FR-RUNTIME-004 — Execution State Transition Control
- **Statement:** The system shall enforce that only permitted state transitions occur via explicit commands.
- **Source:** 02. FUNCTIONAL-REQUIREMENTS.md §9.1

### FR-RUNTIME-005 — Terminal State Finality
- **Statement:** A terminal execution (completed, failed, cancelled) shall not return to a non-terminal state. Late provider or worker events after a terminal state shall not reactivate the execution.
- **Source:** 02. FUNCTIONAL-REQUIREMENTS.md §9.1

### ARCH-DOC05-001 — Runtime Execution State Machine (synthetic)
- **Statement:** Every runtime execution shall progress through a defined state machine. Terminal states are irreversible. Late events are rejected.
- **Source:** 05. RUNTIME-PIPELINE.md §6

---

## Context and Authorization

### FR-RUNTIME-007 — Context Authorization
- **Classification:** MVP Critical
- **Statement:** Every runtime execution shall verify workspace access, provider credential authorization, model eligibility, and memory authorization before constructing the provider request.
- **Source:** 02. FUNCTIONAL-REQUIREMENTS.md §9.2

### FR-RUNTIME-008 — Provider Credential Availability
- **Statement:** Before dispatch, the system shall verify the selected provider connection is active and has usable credentials.
- **Source:** 02. FUNCTIONAL-REQUIREMENTS.md §9.2

### FR-RUNTIME-009 — Provider Credential Protection at Runtime
- **Statement:** Provider credentials shall never be embedded in the constructed prompt, context, metadata, or any data sent to the provider.
- **Source:** 02. FUNCTIONAL-REQUIREMENTS.md §9.2

---

## Snapshot Lock

### FR-RUNTIME-011 — Snapshot Lock
- **Classification:** MVP Critical
- **Statement:** When a subsequent eligible message arrives before background processing from the prior message is complete, the system shall create a context snapshot from the current active state without waiting for background work to finish. Background results become active only after their transaction completes successfully and are eligible beginning with the next subsequent execution.
- **Source:** 02. FUNCTIONAL-REQUIREMENTS.md §9.2

### ARCH-DOC04-001 — Snapshot Lock for Rapid-Fire Messages (synthetic)
- **Statement:** Message B accepted without waiting for Message A background processing. Context snapshot frozen at acceptance moment. Newly extracted memories from Message A eligible only for Message C onward.
- **Source:** 04. SYSTEM-CONTEXT-AND-HIGH-LEVEL-ARCHITECTURE.md §9

---

## Processing Stages

### FR-RUNTIME-015 — Intent Classification
- **Statement:** The system may classify the user message for task type and complexity before selecting runtime processing mode.
- **Source:** 02. FUNCTIONAL-REQUIREMENTS.md §9.3

### FR-RUNTIME-019 — Prompt Enhancement Execution
- **Statement:** When prompt enhancement is enabled, the system shall construct an enhanced provider-ready prompt that preserves the user's original semantic intent.
- **Source:** 02. FUNCTIONAL-REQUIREMENTS.md §9.3

### FR-RUNTIME-020 — Provider Dispatch
- **Statement:** The system shall dispatch the provider request only after mandatory validation, authorization, credential access, context assembly, and prompt construction complete successfully.
- **Source:** 02. FUNCTIONAL-REQUIREMENTS.md §9.4

### FR-RUNTIME-022 — Response Streaming
- **Statement:** Where the provider supports streaming, the system shall relay provider response events to the authorized client through the streaming channel.
- **Source:** 02. FUNCTIONAL-REQUIREMENTS.md §9.4

### FR-RUNTIME-023 — Streaming Cancellation
- **Statement:** The user shall be able to request cancellation of an active streaming response during provider execution.
- **Source:** 02. FUNCTIONAL-REQUIREMENTS.md §9.4

---

## Error Handling

### FR-RUNTIME-030 — Provider Error Handling
- **Statement:** Provider errors shall be categorized as: authentication, permission, quota, rate-limited, unavailable, timeout, unsupported model, or unknown. Errors shall be mapped to user-facing guidance without exposing provider secrets.
- **Source:** 02. FUNCTIONAL-REQUIREMENTS.md §9.6

### FR-RUNTIME-031 — Execution Failure Safe State
- **Statement:** A failed execution shall preserve the user message, error category, and applicable context. The conversation shall remain accessible.
- **Source:** 02. FUNCTIONAL-REQUIREMENTS.md §9.6

---

## Performance NFRs

### NFR-PERF-001 — API Acceptance Latency
- **Statement:** 95% of authenticated non-streaming operations within 500ms, 99% within 1,500ms.

### NFR-PERF-002 — Message Acceptance Latency
- **Statement:** 95% of user-message submissions acknowledged within 750ms before provider generation.

### NFR-PERF-003 — Runtime Preparation Latency
- **Statement:** Direct route P95 < 1,500ms; Enhanced route P95 < 3,000ms.

### NFR-PERF-004 — Streaming First-Event Latency
- **Statement:** P95 < 250ms from provider first event to client first event.

### NFR-PERF-005 — Stream Relay Overhead
- **Statement:** Median < 100ms added by Gexor relay.

### NFR-PERF-006 — Memory Retrieval Latency
- **Statement:** P95 < 750ms within the memory retrieval stage.

### NFR-PERF-015 — Cancellation Responsiveness
- **Statement:** P95 < 500ms from cancellation request to output stop.

### NFR-PERF-016 — Snapshot-Lock Non-Blocking Behaviour
- **Statement:** Snapshot creation overhead < 100ms in P95 case.

### NFR-PERF-019 — Performance Degradation Bound
- **Statement:** At 80% of reference capacity, latency ≤ 2× the baseline P95.

---

## Background Processing

### FR-BACKGROUND-001 — Background Job Creation
- **Statement:** The system may create background jobs for memory extraction, conversation summarization, usage reconciliation, and similar non-critical post-response tasks.
- **Source:** 02. FUNCTIONAL-REQUIREMENTS.md §14.3

### FR-BACKGROUND-002 — Background Job State Model
- **Statement:** Each background job shall have an explicit lifecycle: created, queued, claimed, processing, retry_scheduled, succeeded, no_change, stale, cancelled, failed_terminal, superseded.
- **Source:** 02. FUNCTIONAL-REQUIREMENTS.md §14.3

### FR-BACKGROUND-004 — Background Job Idempotency
- **Statement:** Background jobs shall be idempotent. Repeated delivery of the same job after a claimed-but-ambiguous outcome shall not duplicate committed effects.
- **Source:** 02. FUNCTIONAL-REQUIREMENTS.md §14.3

### FR-BACKGROUND-009 — Source Snapshot
- **Statement:** Background jobs shall operate on a point-in-time snapshot of their source data. Another job or user mutation shall not overwrite the job's working state mid-processing.
- **Source:** 02. FUNCTIONAL-REQUIREMENTS.md §14.3

### FR-BACKGROUND-010 — Late Result Rejection
- **Statement:** A background job result received after a newer job for the same source target has already committed shall be rejected or safely reconciled.
- **Source:** 02. FUNCTIONAL-REQUIREMENTS.md §14.3

### FR-BACKGROUND-011 — Background Failure Isolation
- **Statement:** A background job failure shall not retroactively invalidate a successfully completed and delivered provider response.
- **Source:** 02. FUNCTIONAL-REQUIREMENTS.md §14.3

---

## Context Construction (PRD-derived)

### ARCH-DOC04-003 — Content Trust Hierarchy (synthetic)
- **Statement:** 9-level instruction precedence: platform policy > safety > organization > workspace > project > conversation > current user > retrieved context > provider output.
- **Source:** 04. SYSTEM-CONTEXT-AND-HIGH-LEVEL-ARCHITECTURE.md §15

### FR-RUNTIME-010 — Context Budget Enforcement
- **Statement:** The system shall enforce a configurable context budget to prevent exceeding the selected model's supported input capacity.
- **Source:** 02. FUNCTIONAL-REQUIREMENTS.md §9.2
