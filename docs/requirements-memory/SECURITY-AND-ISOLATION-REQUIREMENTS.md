# Security and Isolation Requirements

**Source documents:** 02. FUNCTIONAL-REQUIREMENTS.md, 03. NON-FUNCTIONAL-REQUIREMENTS.md,
10. SECURITY-ARCHITECTURE.md, 04. SYSTEM-CONTEXT-AND-HIGH-LEVEL-ARCHITECTURE.md

**Number of included requirements:** 35 FR + 40 NFR + 4 synthetic

For the full structured record of every requirement, see `REQUIREMENTS-INDEX.json`.

---

## Authentication and Identity

### FR-AUTH-001 — User Registration
- **Statement:** Allow a Visitor to create a Gexor account by submitting mandatory registration attributes.

### FR-AUTH-004 — Account Initialization Atomicity
- **Statement:** User identity creation and mandatory account initialization complete as one recoverable operation.

### FR-AUTH-005 — Credential-Based Login
- **Statement:** Allow an eligible user to authenticate using a valid account identifier and credential.

### FR-AUTH-006 — Authentication Failure Privacy
- **Statement:** Return a generic failure response that does not disclose whether the account exists.

### FR-AUTH-007 — Login Attempt Throttling
- **Statement:** Throttle repeated failed authentication attempts according to security policy.

### FR-AUTH-008 — Account Lock and Restriction
- **Statement:** Support temporary or administrative restriction of authentication for an account.

### FR-AUTH-011 — Password Storage
- **Statement:** Store passwords only as outputs of an approved one-way hashing function with unique salts.

### FR-AUTH-018 — Logout From All Sessions
- **Statement:** Allow a user to terminate all active sessions after re-authentication.

### FR-AUTH-019 — Session Creation
- **Statement:** Create a unique authenticated session after successful authentication.

### FR-AUTH-020 — Session Expiration
- **Statement:** Enforce configurable session inactivity and absolute-lifetime limits.

### FR-AUTH-022 — Session Revocation
- **Statement:** Support immediate logical revocation of a specific session. Idempotent.

### FR-AUTH-024 — Session Credential Protection
- **Statement:** Protect session credentials against unauthorized disclosure, replay, and client-side access.

### FR-AUTH-025 — Sensitive-Action Re-authentication
- **Statement:** Require recent authentication before designated sensitive operations.

---

## Provider Credential Protection

### FR-AUTH-026 — Provider Credential Submission
- **Statement:** Allow authorized Workspace Owner to submit a provider credential through a protected interface. Never returned in normal responses.

### FR-AUTH-027 — Provider Credential Encryption
- **Statement:** Encrypt each stored credential using approved secrets-management. Never stored as plaintext.

### FR-AUTH-028 — Provider Credential Vaulting
- **Statement:** Store credentials in a dedicated secrets vault. Application records reference opaque identifiers.

### FR-AUTH-029 — Provider Credential Masking
- **Statement:** Display stored credentials only in masked, non-recoverable form.

### FR-AUTH-030 — Provider Credential Access Control
- **Statement:** Restrict credential creation, replacement, validation, and deletion to explicitly authorized actors.

### FR-AUTH-032 — Provider Credential Deletion
- **Statement:** Allow authorized actor to delete a stored credential. Deleted credentials no longer available for new requests.

### FR-AUTH-033 — Provider Credential Logging Prohibition
- **Statement:** Shall not write complete API keys, tokens, or secrets to logs, traces, analytics, audit records, errors.

### FR-AUTH-034 — Credential-Rotation Support
- **Statement:** Support credential replacement without requiring deletion of associated workspace, conversations, memories, or usage history.

---

## Workspace Isolation

### FR-WORKSPACE-003 — Organization Isolation
- **Statement:** Prevent cross-organization access to protected data without explicit authorization.

### FR-WORKSPACE-018 — Query Scope Enforcement
- **Statement:** Every query, search, job, cache, queue, and export operation shall carry and enforce a workspace scope.

### FR-WORKSPACE-019 — Cross-Workspace Leakage Prevention
- **Statement:** The system shall prevent information from one workspace being accessible in another. Workspace ID shall never be user-supplied for authorization; it comes from trusted server context.

### FR-WORKSPACE-020 — Cache Segregation
- **Statement:** Cached data shall respect workspace boundaries. Cache keys shall include workspace scope.

### FR-WORKSPACE-023 — Background Job Segregation
- **Statement:** Background jobs shall operate only on authorized workspace data and shall not cross workspace boundaries.

### FR-WORKSPACE-026 — Provider Connection Segregation
- **Statement:** Provider connections and credentials shall be scoped to the owning workspace.

### FR-WORKSPACE-030 — Workspace Deletion Boundary
- **Statement:** Workspace deletion shall not affect data in other workspaces.

---

## Security NFRs

### NFR-SEC-001 — Encrypted Transport
- **Statement:** All communication between clients and Gexor endpoints and between internal services carrying user, workspace, or credential data shall use approved encrypted transport (TLS 1.2 minimum, 1.3 preferred).

### NFR-SEC-002 — Encryption at Rest
- **Statement:** Data containing workspace content, user PII, provider credentials, and sensitive operational metadata shall be encrypted at rest using managed encryption keys.

### NFR-SEC-003 — Secret Separation
- **Statement:** Provider credentials and platform secrets shall be stored in a dedicated secrets manager separated from application data stores.

### NFR-SEC-004 — Least Privilege
- **Statement:** Every actor, service, and automated process shall receive only the minimum permissions required for its authorized function.

### NFR-SEC-005 — Default Deny
- **Statement:** Access, data retrieval, and operation execution shall be denied unless explicitly authorized by an applicable policy, role, or permission.

### NFR-SEC-006 — Administrative Strong Authentication
- **Statement:** Administrative access shall require MFA and strong authentication separate from ordinary user sessions.

### NFR-SEC-007 — Sensitive Action Re-authentication
- **Statement:** Sensitive actions (password change, account deletion, provider-key operations, large exports) shall require recent re-authentication.

### NFR-SEC-008 — Session Protection
- **Statement:** Browser session cookies shall use Secure, HttpOnly, and SameSite controls. Session tokens shall not appear in URLs or logs.

### NFR-SEC-016 — Secure Deletion
- **Statement:** The deletion workflow shall ensure that data is irrecoverable after the defined hard-purge execution. Source rows, objects, indexes, caches, queues, and derived projections shall be removed.

---

## Tenant Isolation NFRs

### NFR-ISOL-001 — Workspace Data Isolation
- **Statement:** Workspace data shall be accessible only to authorized actors within the owning workspace.

### NFR-ISOL-002 — Cross-Workspace Query Prevention
- **Statement:** The system shall prevent any operation from querying, retrieving, or mutating data across workspace boundaries.

### NFR-ISOL-003 — Cache Isolation
- **Statement:** Cached responses, context, and derived data shall respect workspace boundaries.

### NFR-ISOL-005 — Derived Search and Index Isolation
- **Statement:** Search indexes, vector indexes, and keyword indexes shall enforce workspace boundaries.

---

## Security Architecture (synthetic)

### ARCH-DOC10-001 — Zero-Trust Security Model (synthetic)
- **Statement:** Operate on zero-trust model assuming untrusted clients, user content, uploaded files, retrieved text, provider output, and integration payloads. Optional services shall fail without weakening mandatory controls.
- **Source:** 10. SECURITY-ARCHITECTURE.md §1

### ARCH-DOC04-002 — Ten Trust Boundary Controls (synthetic)
- **Statement:** Every trust boundary crossing shall enforce 15 categories of controls (authentication, authorization, validation, encryption, idempotency, audit, etc.).
- **Source:** 04. SYSTEM-CONTEXT-AND-HIGH-LEVEL-ARCHITECTURE.md §6
