# Document 15 — Status Snapshot (Non-Governing)

**Source document:** 15. DEVELOPMENT-STATUS-AND-ROADMAP.md

**Authority level:** Status snapshot only — this document does not govern implementation decisions.

This file captures the state snapshot as of Document 15 (historical pre-v2.2 baseline). It is recorded for historical traceability. Current v2.2.0 implementation status is defined by `docs/releases/v2.2/ACCEPTANCE-MATRIX.md`.

---

## Historical Baseline (Document 15 §1 — Pre-v2.2)

Document 15 records the current development status, known gaps, and immediate next steps at the time of writing. It describes what is implemented, what gaps exist in the implementation, and where work should focus next.

## Key Observations

### Implementation Status
- Core API is scaffolded but not fully implemented
- Runtime pipeline is designed but not coded
- Auth and user management have basic implementation
- Provider integration is prototyped for some providers
- UI exists as a scaffold with basic chat interface
- Memory and knowledge engines are not implemented
- File handling is not implemented

### Known Gaps
- Missing end-to-end auth flow integration
- Provider credential management incomplete
- Runtime execution pipeline not wired
- Background processing not yet implemented
- Memory extraction, storage, retrieval not implemented
- Search across conversations not implemented
- Usage tracking and cost calculation not implemented
- Export and deletion workflows not implemented

### Next Steps (per Document 15)
1. Implement complete auth and user management
2. Build provider connection and credential management
3. Implement runtime execution pipeline
4. Build conversation management with streaming
5. Implement memory and knowledge engines
6. Add file upload and processing
7. Implement search
8. Add usage tracking and cost management
9. Build export and deletion workflows
10. UI polish and accessibility

---

## Note on Relevance

Document 15's identification of "known gaps" is consistent with the requirements extracted from
Documents 01–14. It does not introduce new, modified, or conflicting requirements. The gap analysis
in Document 15 may be referenced for prioritization but does not override the governing documents.

---

## Reconciled Gexor v2.2.0 Current Implementation Status

As of Gexor v2.2.0 release closure (2026-07-20), the pre-v2.2 gaps have been reconciled as follows:

| Capability Domain | Baseline Gap (Doc 15) | Current v2.2.0 Status | Controlling Evidence |
| :--- | :--- | :--- | :--- |
| **Auth & Workspace** | Missing integration | **VERIFIED COMPLETE**: HttpOnly session cookies, SameSite=Lax, CSRF tokens, workspace isolation | `apps/api/src/app.ts`, `auth.test.ts` |
| **Provider Routing** | Prototyped / incomplete | **VERIFIED COMPLETE**: Catalogue, priority routing, health checks, bounded fallback (Gemini, Ollama, llama.cpp) | `apps/api/src/providers/`, `provider-connections.test.ts` |
| **Runtime Pipeline** | Not coded / unwired | **VERIFIED COMPLETE**: Idempotent message acceptance, outbox, worker lease/claim, SSE replay & deltas | `apps/api/src/runtime/`, `production-runtime.test.ts` |
| **Usage & Cost** | Not tracking / calculating | **VERIFIED COMPLETE**: Provider-reported measured usage, estimation fallback, budgets, `Unpriced` status | `apps/api/src/app.ts`, `Workspace.tsx` |
| **File Handling** | Not implemented | **VERIFIED COMPLETE**: Bounded text extraction for PDF/TXT/MD, private storage, chunks, untrusted grounding | `apps/api/src/attachments/`, `app.test.ts` |
| **Search & Management**| Not implemented | **VERIFIED COMPLETE**: Workspace-scoped title/snippet search, rename, soft deletion | `apps/api/src/app.ts`, `app.test.ts` |
| **Operations** | Not implemented | **VERIFIED COMPLETE**: Structured JSON logging, redaction, protected metrics, rate limits, online backup & restore drill | `apps/api/src/operations/`, `backup.test.ts` |
| **Long-Term Memory** | Not implemented | **DEFERRED TO V2.2.1 / FUTURE**: Long-term memory extraction & vector RAG out of scope for v2.2 | `docs/releases/v2.2/V2.2.1-BACKLOG.md` |
