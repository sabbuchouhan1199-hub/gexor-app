# Gexor v2.2 Specification & Implementation Traceability

This matrix maps core requirement specifications to their corresponding source code implementations, test suites, and documentation references in Gexor v2.2.

---

## Traceability Mapping Table

| Requirement ID | Domain Area | Implementation Location | Test Suite Location | Documentation Reference |
| :--- | :--- | :--- | :--- | :--- |
| `REQ-SEC-001` | Authentication | `apps/api/src/app.ts` (lines 270-320) | `apps/api/src/auth.test.ts` | `docs/API_RUNTIME.md` |
| `REQ-SEC-002` | Authorization | `apps/api/src/app.ts` (`requireWorkspace`) | `apps/api/src/auth-api.test.ts` | `GEXOR.md` (Section 8) |
| `REQ-DATA-001` | Persistence | `apps/api/migrations/*.sql` | `apps/api/src/persistence.test.ts` | `GEXOR.md` (Section 9) |
| `REQ-RTM-001` | Runtime Engine | `apps/api/src/persistence/sqlite-runtime-repository.ts` | `apps/api/src/production-runtime.test.ts` | `GEXOR.md` (Section 6) |
| `REQ-RTM-003` | Worker Queue | `apps/api/src/runtime-worker.ts` | `apps/api/src/production-runtime.test.ts` | `docs/OPERATIONS.md` |
| `REQ-SSE-001` | Streaming | `apps/api/src/app.ts` (lines 770-798) | `apps/web/src/App.integration.test.tsx` | `docs/API_RUNTIME.md` |
| `REQ-PRV-001` | Provider Engine | `apps/api/src/providers/` | `apps/api/src/provider-connections.test.ts` | `GEXOR.md` (Section 12) |
| `REQ-USG-001` | Usage & Accounting | `apps/api/src/app.ts` (lines 680-720) | `apps/api/src/production-runtime.test.ts` | `GEXOR.md` (Section 13) |
| `REQ-FIL-001` | File Attachments | `apps/api/src/attachments/` | `apps/api/src/app.test.ts` | `GEXOR.md` (Section 15) |
| `REQ-UX-001` | Workspace UI | `apps/web/src/Workspace.tsx` (`5a9fcea`, `9a697cf`) | `apps/web/src/Workspace.test.tsx` | `README.md` |
| `REQ-API-002` | API Contracts | `packages/contracts/src/index.ts` (`5a9fcea`) | `apps/web/src/Workspace.test.tsx` | `docs/API_RUNTIME.md` |
| `REQ-SSE-004` | SSE Stream Replay | `apps/api/src/app.ts`, `apps/web/src/api/client.ts` (`8e37bc3`) | `apps/api/src/app.test.ts` | `docs/API_RUNTIME.md` |
| `REQ-OPS-001` | Operations | `apps/api/src/app.ts` (line 279), `backup.ts` | `apps/api/src/config.test.ts` | `docs/OPERATIONS.md` |
