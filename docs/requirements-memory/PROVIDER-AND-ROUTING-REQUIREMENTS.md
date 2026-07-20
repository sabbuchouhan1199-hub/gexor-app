# Provider and Routing Requirements

**Source documents:** 02. FUNCTIONAL-REQUIREMENTS.md, 03. NON-FUNCTIONAL-REQUIREMENTS.md,
05. RUNTIME-PIPELINE.md

**Number of included requirements:** 39 FR + 4 NFR

For the full structured record of every requirement, see `REQUIREMENTS-INDEX.json`.

---

## Provider Connection Lifecycle

### FR-PROVIDER-001 — Provider Connection Domain
- **Statement:** A provider connection shall belong to exactly one workspace and shall represent a secure binding between Gexor and an external AI provider using user-supplied credentials.

### FR-PROVIDER-002 — Provider Connection Lifecycle
- **Statement:** A provider connection shall have an explicit lifecycle: created, validating, active, invalid, suspended, disconnected, deletion_pending, deleted.

### FR-PROVIDER-003 — Provider Connection Creation
- **Statement:** A Workspace Owner shall create a provider connection by specifying the provider type and credential reference.

### FR-PROVIDER-004 — Provider Type Validation
- **Statement:** The system shall validate the provider type against the supported provider registry.

### FR-PROVIDER-005 — Credential Format Validation
- **Statement:** The system shall validate the credential format and completeness before creating the connection.

### FR-PROVIDER-006 — Provider Authentication Test
- **Statement:** The Workspace Owner shall be able to test the provider connection by sending an authentication-only request that does not trigger paid generation where possible.

### FR-PROVIDER-007 — Credential Validation Before Activation
- **Statement:** The connection shall not enter an active state until the credential has been validated against the provider.

### FR-PROVIDER-011 — Connected Provider Access Validation
- **Statement:** Before each provider dispatch, the system shall verify the provider connection is active and credentials remain usable.

### FR-PROVIDER-012 — Provider Connection Status Visibility
- **Statement:** The user shall be able to view the connection status of each provider connection.

### FR-PROVIDER-014 — Credential Replacement
- **Statement:** The Workspace Owner shall be able to replace the credential for an existing provider connection without deleting the connection.

---

## Model Selection and Routing

### FR-PROVIDER-015 — Provider-Supported Model Registration
- **Statement:** The system shall maintain a provider-scoped model registry that records each provider's supported models, capabilities, context limits, and pricing metadata.

### FR-PROVIDER-016 — User Model Selection
- **Statement:** The user shall be able to select a supported model from the connected provider's available models.

### FR-PROVIDER-017 — Model Availability Check
- **Statement:** Before dispatch, the system shall verify that the selected model is still available from the connected provider.

### FR-PROVIDER-018 — Model Capability Check
- **Statement:** Before dispatch, the system may verify that the selected model supports the required capabilities.

### FR-PROVIDER-019 — Model Context Limit Check
- **Statement:** The system shall verify that the constructed context fits within the selected model's supported context limit before dispatch.

### FR-PROVIDER-020 — Model Unavailability
- **Statement:** When the selected model is unavailable, the system shall return a clear error offering the user alternative available models.

### FR-PROVIDER-021 — Provider Routing Decision
- **Statement:** The system shall make a routing decision that selects the provider, model, and credential to use for each eligible execution.

### FR-PROVIDER-022 — User-Selected Provider Priority
- **Statement:** When the user has explicitly selected a provider and model, the routing decision shall respect that selection unless it is unavailable.

### FR-PROVIDER-023 — Cost-Aware Routing
- **Statement:** The system may consider cost when making routing decisions, preferring less expensive models for tasks within their capability.

### FR-PROVIDER-024 — Capability-Aware Routing
- **Statement:** The system may consider model capabilities when making routing decisions, routing complex tasks to more capable models.

### FR-PROVIDER-025 — Routing Transparency
- **Statement:** The routing decision (which provider, which model, why) shall be visible in the runtime details for the execution.

---

## Fallback Behaviour

### FR-PROVIDER-026 — Fallback Policy
- **Statement:** When the primary selected provider or model fails, the system may attempt a configured fallback provider or model. Silent cross-provider fallback shall not bypass user selection, workspace policy, or cost controls.

### FR-PROVIDER-027 — Fallback Permission
- **Statement:** Fallback shall only be attempted when workspace policy permits fallback and the user has not explicitly disabled it.

### FR-PROVIDER-031 — Fallback Attempt Limit
- **Statement:** The system shall limit fallback attempts to a defined maximum per execution.

### FR-PROVIDER-032 — Duplicate Provider Execution Prevention
- **Statement:** The system shall not dispatch the same message to multiple providers simultaneously during fallback.

### FR-PROVIDER-033 — Fallback Result Attribution
- **Statement:** The routing decision for each fallback attempt shall be recorded and visible in runtime details.

---

## Provider Error Handling

### FR-PROVIDER-035 — Provider Error Normalization
- **Statement:** Provider-specific error responses shall be normalized into Gexor's error categories: authentication, permission, quota, rate-limit, unavailable, timeout, unsupported-model, and unknown.

### FR-PROVIDER-036 — Provider Error Privacy
- **Statement:** Error responses shall not expose provider-internal details, raw error payloads, or credentials.

### FR-PROVIDER-037 — Provider Usage Capture
- **Statement:** The system shall capture usage metadata returned by the provider (input tokens, output tokens, model used).

### FR-PROVIDER-038 — Provider Pricing Association
- **Statement:** Captured usage shall be associated with the applicable provider pricing metadata for cost estimation.

---

## Provider Independence NFRs

### NFR-PORT-001 — Provider Abstraction
- **Statement:** Provider-specific operations shall be isolated behind a provider abstraction layer. Adding or switching providers shall not require core runtime changes.

### NFR-PORT-002 — Provider-Neutral Contracts
- **Statement:** Core domain entities (message, context, execution, memory) shall remain provider-neutral. Provider-native format shall not become a public domain contract.

### NFR-PORT-003 — Provider Adapter
- **Statement:** Each provider shall have a dedicated adapter for request and response translation.
