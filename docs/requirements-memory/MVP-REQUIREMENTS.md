# MVP Requirements

**Source documents:** 01. PRD.md, 02. FUNCTIONAL-REQUIREMENTS.md, 03. NON-FUNCTIONAL-REQUIREMENTS.md

**Number of included requirements:** 426 FR + 160 NFR + 12 synthetic constraints

This file summarizes the MVP-level requirements by domain. For the full structured
record of every requirement, see `REQUIREMENTS-INDEX.json`.

---

## MVP Critical Requirements

### Identity and Authentication (FR-AUTH-*)

- **FR-AUTH-001** — User Registration
- **FR-AUTH-004** — Account Initialization Atomicity
- **FR-AUTH-005** — Credential-Based Login
- **FR-AUTH-006** — Authentication Failure Privacy
- **FR-AUTH-007** — Login Attempt Throttling
- **FR-AUTH-011** — Password Storage
- **FR-AUTH-019** — Session Creation
- **FR-AUTH-020** — Session Expiration
- **FR-AUTH-022** — Session Revocation
- **FR-AUTH-024** — Session Credential Protection
- **FR-AUTH-026** — Provider Credential Submission
- **FR-AUTH-027** — Provider Credential Encryption
- **FR-AUTH-029** — Provider Credential Masking
- **FR-AUTH-030** — Provider Credential Access Control
- **FR-AUTH-032** — Provider Credential Deletion
- **FR-AUTH-033** — Provider Credential Logging Prohibition
- **FR-AUTH-034** — Credential-Rotation Support
- **FR-AUTH-035** — Identity Audit Events

### Workspace and Isolation (FR-WORKSPACE-*)

- **FR-WORKSPACE-003** — Organization Isolation
- **FR-WORKSPACE-004** — Personal Workspace Creation
- **FR-WORKSPACE-008** — Workspace State Model
- **FR-WORKSPACE-009** — Active Workspace Access
- **FR-WORKSPACE-013** — Workspace Ownership Binding
- **FR-WORKSPACE-014** — Workspace Membership Verification
- **FR-WORKSPACE-018** — Query Scope Enforcement
- **FR-WORKSPACE-019** — Cross-Workspace Leakage Prevention
- **FR-WORKSPACE-020** — Cache Segregation
- **FR-WORKSPACE-023** — Background Job Segregation
- **FR-WORKSPACE-026** — Provider Connection Segregation
- **FR-WORKSPACE-027** — Usage Record Segregation
- **FR-WORKSPACE-030** — Workspace Deletion Boundary

### Runtime Execution (FR-RUNTIME-*)

- **FR-RUNTIME-001** — Execution Creation
- **FR-RUNTIME-002** — Execution State
- **FR-RUNTIME-004** — Execution State Transition Control
- **FR-RUNTIME-005** — Terminal State Finality
- **FR-RUNTIME-007** — Context Authorization
- **FR-RUNTIME-009** — Provider Credential Protection at Runtime
- **FR-RUNTIME-011** — Snapshot Lock

### Provider Connection and Routing (FR-PROVIDER-*)

- **FR-PROVIDER-001** — Provider Connection Domain
- **FR-PROVIDER-002** — Provider Connection Lifecycle
- **FR-PROVIDER-003** — Provider Connection Creation
- **FR-PROVIDER-006** — Provider Authentication Test
- **FR-PROVIDER-007** — Credential Validation Before Activation
- **FR-PROVIDER-011** — Connected Provider Access Validation
- **FR-PROVIDER-012** — Provider Connection Status Visibility
- **FR-PROVIDER-015** — Provider-Supported Model Registration
- **FR-PROVIDER-016** — User Model Selection
- **FR-PROVIDER-021** — Provider Routing Decision
- **FR-PROVIDER-035** — Provider Error Normalization

### Memory and Context (FR-MEMORY-*)

- **FR-MEMORY-006** — Memory Workspace Isolation
- **FR-MEMORY-007** — Memory Retrieval
- **FR-MEMORY-018** — Memory Deletion
- **FR-MEMORY-022** — Memory Content Trust Boundary
- **FR-MEMORY-023** — Memory Provenance
- **FR-MEMORY-025** — Memory Candidate Exclusion from Retrieval

### Streaming (FR-STREAM-*)

- **FR-STREAM-001** — SSE Response Channel
- **FR-STREAM-002** — SSE Authentication
- **FR-STREAM-004** — Stream Event Types
- **FR-STREAM-006** — Stream Event Ordering
- **FR-STREAM-010** — Client Disconnect
- **FR-STREAM-011** — Stream Reconnection
- **FR-STREAM-013** — Stream Failure
- **FR-STREAM-015** — SSE Cross-Tenant Isolation

### Security NFRs (NFR-SEC-*)

- **NFR-SEC-001** — Encrypted Transport
- **NFR-SEC-002** — Encryption at Rest
- **NFR-SEC-003** — Secret Separation
- **NFR-SEC-004** — Least Privilege
- **NFR-SEC-005** — Default Deny
- **NFR-SEC-007** — Sensitive Action Re-authentication
- **NFR-SEC-008** — Session Protection
- **NFR-SEC-016** — Secure Deletion

### Isolation NFRs (NFR-ISOL-*)

- **NFR-ISOL-001** — Workspace Data Isolation
- **NFR-ISOL-002** — Cross-Workspace Query Prevention
- **NFR-ISOL-003** — Cache Isolation
- **NFR-ISOL-004** — Queue and Background Isolation
- **NFR-ISOL-005** — Derived Search and Index Isolation
- **NFR-ISOL-006** — Export and Deletion Segregation
- **NFR-ISOL-007** — Parallel Tenant Escape Testing

---

## MVP Required Requirements

### Conversation Management (FR-CONVERSATION-*)

- **FR-CONVERSATION-007** — Conversation Creation
- **FR-CONVERSATION-008** — Conversation-Creation Idempotency
- **FR-CONVERSATION-009** — Conversation Default Title
- **FR-CONVERSATION-010** — Conversation Naming
- **FR-CONVERSATION-012** — Conversation Retrieval
- **FR-CONVERSATION-013** — Conversation Listing
- **FR-CONVERSATION-015** — Conversation Attribute Update
- **FR-CONVERSATION-020** — Conversation Soft Delete
- **FR-CONVERSATION-023** — Permanent Conversation Deletion Request
- **FR-CONVERSATION-024** — Permanent Conversation Deletion Processing
- **FR-CONVERSATION-029** — Conversation Exclusion From Memory

### Message Management (FR-MSG-*)

- **FR-MSG-001** — User Message Submission
- **FR-MSG-002** — Message Ordering
- **FR-MSG-003** — Message Retrieval
- **FR-MSG-004** — Message Idempotency
- **FR-MSG-005** — User Message Immutability
- **FR-MSG-006** — Message Edit
- **FR-MSG-010** — Message Regeneration

### Administration and Usage (FR-ADMIN-*)

- **FR-ADMIN-001** — Input Token Count
- **FR-ADMIN-002** — Output Token Count
- **FR-ADMIN-003** — Total Token Count
- **FR-ADMIN-008** — Estimated Provider Cost
- **FR-ADMIN-015** — Usage Inspection
- **FR-ADMIN-016** — Workspace Soft Spending Ceiling
- **FR-ADMIN-017** — Workspace Hard Spending Ceiling
- **FR-ADMIN-028** — Rate Limit
- **FR-ADMIN-030** — Administrator Authentication
- **FR-ADMIN-031** — Administrator Authorization
- **FR-ADMIN-032** — Least-Privilege Administration
- **FR-ADMIN-038** — Administrative Audit Log
- **FR-ADMIN-041** — Audit Immutability
- **FR-ADMIN-047** — Data Export Request
- **FR-ADMIN-058** — Account Deletion Request
- **FR-ADMIN-059** — Workspace Deletion Request
- **FR-ADMIN-062** — Complete Erasure Processing
- **FR-ADMIN-066** — Legal Retention Exception
- **FR-ADMIN-067** — Deletion Job Idempotency

### Performance NFRs (NFR-PERF-*)

- **NFR-PERF-001** — API Acceptance Latency (95% < 500ms)
- **NFR-PERF-002** — Message Acceptance Latency (95% < 750ms)
- **NFR-PERF-004** — Streaming First-Event Latency (P95 < 250ms)
- **NFR-PERF-005** — Stream Relay Overhead (median < 100ms)
- **NFR-PERF-006** — Memory Retrieval Latency (P95 < 750ms)
- **NFR-PERF-015** — Cancellation Responsiveness (P95 < 500ms)
- **NFR-PERF-016** — Snapshot-Lock Non-Blocking Behaviour (< 100ms overhead)

### Availability NFRs (NFR-AVAIL-*)

- **NFR-AVAIL-001** — Monthly Service Availability (≥ 99.5%)
- **NFR-AVAIL-002** — Runtime Submission Availability (≥ 99.9%)
- **NFR-AVAIL-003** — Provider Failure Isolation
- **NFR-AVAIL-005** — Streaming Service Availability
- **NFR-AVAIL-008** — Health Check Coverage
- **NFR-AVAIL-009** — Readiness Enforcement

### Reliability NFRs (NFR-REL-*)

- **NFR-REL-001** — Durable Message Acceptance
- **NFR-REL-002** — Duplicate Execution Prevention
- **NFR-REL-003** — Terminal-State Consistency
- **NFR-REL-007** — Memory Provenance Integrity
- **NFR-REL-010** — Background Job Idempotency

### Scalability NFRs (NFR-SCALE-*)

- **NFR-SCALE-001** — Concurrent User Capacity
- **NFR-SCALE-002** — Concurrent Runtime Capacity
- **NFR-SCALE-005** — Stateless Request Handling

### Data Integrity NFRs (NFR-DATA-*)

- **NFR-DATA-001** — Soft-Deletion Immediate Effect
- **NFR-DATA-002** — Permanent Deletion Timeline (30 days)
- **NFR-DATA-005** — Deletion-Request Recording
- **NFR-DATA-008** — Export Scope Integrity

For the full structured record of every requirement with detailed fields,
see `REQUIREMENTS-INDEX.json`.
