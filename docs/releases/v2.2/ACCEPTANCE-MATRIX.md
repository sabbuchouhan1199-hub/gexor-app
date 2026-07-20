# Gexor v2.2 Release Acceptance Matrix

| Item ID | Governing Requirements | Capability | Current Evidence | Status | Required Action | Verification Method | Target Closure |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `V22-AUTH-01` | `REQ-SEC-001`, `REQ-AUTH-002` | HttpOnly Cookie & CSRF Auth | `apps/api/src/app.ts` (lines 270-320), `auth.test.ts` | `VERIFIED_COMPLETE` | None | `npm run test` | Part 1 |
| `V22-AUTH-02` | `REQ-SEC-002`, `REQ-AUTH-005` | Workspace Authorization Isolation | `apps/api/src/app.ts` `requireWorkspace`, `auth.test.ts` | `VERIFIED_COMPLETE` | None | `npm run test` | Part 1 |
| `V22-DB-01` | `REQ-DATA-001`, `REQ-DATA-003` | SQLite Migrations 001–005 | `apps/api/migrations/*.sql`, `persistence.test.ts` | `VERIFIED_COMPLETE` | None | `npm run test` | Part 1 |
| `V22-QUEUE-01` | `REQ-RTM-001`, `REQ-RTM-002` | Transactional Message Acceptance & Outbox | `apps/api/src/persistence/sqlite-runtime-repository.ts` | `VERIFIED_COMPLETE` | None | `npm run test` | Part 1 |
| `V22-QUEUE-02` | `REQ-RTM-003`, `REQ-RTM-004` | Worker Lease, Claim, & Stale Recovery | `apps/api/src/runtime-worker.ts`, `production-runtime.test.ts` | `VERIFIED_COMPLETE` | None | `npm run test` | Part 1 |
| `V22-SSE-01` | `REQ-RTM-005`, `REQ-SSE-001` | SSE Live Streaming & Delta Events | `apps/api/src/app.ts` (lines 770-798), `ApiClient.ts` | `VERIFIED_COMPLETE` | None | `npm run test` | Part 1 |
| `V22-SSE-02` | `REQ-SSE-002`, `REQ-SSE-003` | SSE Event Replay & Sequence Cursor | `apps/api/src/app.ts` (lines 772-790), `production-runtime.test.ts` | `VERIFIED_COMPLETE` | None | `npm run test` | Part 1 |
| `V22-SSE-03` | `REQ-SSE-004`, `REQ-UX-005` | SSE Replay-Gap Compatibility with Web Client | `apps/api/src/app.ts` (line 787) vs `apps/web/src/api/client.ts` (line 27) | `NEEDS_CODE_FIX` | Emit formatted replay-gap SSE event and parse in web client | Integration test | Part 2 |
| `V22-SSE-04` | `REQ-NFR-002`, `REQ-OPS-004` | 50ms SQLite SSE Polling Interval | `apps/api/src/app.ts` (line 795) | `ACCEPTED_LIMITATION` | Document as single-node local limitation | `docs/OPERATIONS.md` review | Part 4 |
| `V22-PROV-01` | `REQ-PRV-001`, `REQ-PRV-002` | Provider Catalogue & Connection Routing | `apps/api/src/app.ts` (lines 560-635), `provider-connections.test.ts` | `VERIFIED_COMPLETE` | None | `npm run test` | Part 1 |
| `V22-PROV-02` | `REQ-PRV-003`, `REQ-PRV-004` | Deterministic Provider Fallback & Audit | `apps/api/src/providers/` | `VERIFIED_COMPLETE` | None | `npm run test` | Part 1 |
| `V22-PROV-03` | `REQ-TST-001`, `REQ-PRV-005` | Hermetic Provider Unit Tests | `apps/api/src/provider-connections.test.ts` (lines 116-135) | `VERIFIED_COMPLETE` | None | `npm run test` | Part 1 |
| `V22-USAGE-01` | `REQ-USG-001`, `REQ-USG-002` | Usage Dashboard Data & Classification | `apps/api/src/app.ts` (lines 680-720), `Workspace.tsx` | `VERIFIED_COMPLETE` | None | `npm run test` | Part 1 |
| `V22-USAGE-02` | `REQ-USG-003`, `REQ-USG-004` | Workspace Token & Cost Budget Enforcement | `apps/api/src/app.ts` (lines 666-667), `production-runtime.test.ts` | `VERIFIED_COMPLETE` | None | `npm run test` | Part 1 |
| `V22-USAGE-03` | `REQ-UX-006`, `REQ-USG-005` | Usage UI Display for Unpriced Pricing Version | `apps/web/src/Workspace.tsx` (line 96) | `NEEDS_CODE_FIX` | Display "Unpriced" instead of "$0.00" when pricing is unpriced | Web component test | Part 2 |
| `V22-FILE-01` | `REQ-FIL-001`, `REQ-FIL-002` | File Attachment Upload & Private Storage Keys | `apps/api/src/app.ts` (lines 725-765) | `VERIFIED_COMPLETE` | None | `npm run test` | Part 1 |
| `V22-FILE-02` | `REQ-FIL-003`, `REQ-KNW-001` | Bounded Text Chunk Extraction & Grounding | `apps/api/src/attachments/`, `runtime-worker.ts` | `VERIFIED_COMPLETE` | None | `npm run test` | Part 1 |
| `V22-UI-01` | `REQ-UX-001`, `REQ-UX-002` | React/Vite Authenticated Workspace UI | `apps/web/src/Workspace.tsx`, `App.tsx` | `VERIFIED_COMPLETE` | None | `npm run test` | Part 1 |
| `V22-UI-02` | `REQ-UX-003`, `REQ-RTM-006` | Duplicate Regenerate Button Fix | `apps/web/src/Workspace.tsx` (line 106) | `NEEDS_CODE_FIX` | Restrict Regenerate button to completed assistant messages only | Web component test | Part 2 |
| `V22-UI-03` | `REQ-UX-004`, `REQ-API-002` | Message Input Length Contract Alignment (4000) | `apps/web/src/Workspace.tsx` (line 94: `maxLength=12000`) vs `app.ts` (line 171: `maxLength=4000`) | `NEEDS_CODE_FIX` | Align textarea `maxLength` to 4000 characters | Web component test | Part 2 |
| `V22-UI-04` | `REQ-UX-007`, `REQ-MOB-001` | Mobile Conversation Navigation Drawer | `apps/web/src/styles.css` (lines 2-3) | `NEEDS_CODE_FIX` | Add mobile navigation drawer toggle in header for phone screen widths | Web component test | Part 2 |
| `V22-UI-05` | `REQ-UX-008`, `REQ-ACC-001` | Modal Accessibility & Escape Key Handling | `apps/web/src/Workspace.tsx` (line 96) | `NEEDS_CODE_FIX` | Add Escape key handler and focus management to modals | Web component test | Part 2 |
| `V22-UI-06` | `REQ-UX-009`, `REQ-SEC-004` | Safe Markdown Code Block Rendering & Copy | `apps/web/src/Workspace.tsx` (lines 110-113) | `ACCEPTED_LIMITATION` | Document lightweight safe markdown parser boundary | `KNOWN-LIMITATIONS.md` review | Part 4 |
| `V22-TEST-01` | `REQ-TST-002`, `REQ-TST-003` | Deterministic API & Web Test Suite | 196 API tests, 5 Web tests | `VERIFIED_COMPLETE` | None | `npm run verify` | Part 1 |
| `V22-TEST-02` | `REQ-TST-004`, `REQ-TST-005` | Regression Tests for UI Fixes & Replay Gap | `apps/web/src/Workspace.test.tsx`, `apps/api/src/app.test.ts` | `NEEDS_TEST` | Add focused unit/integration tests for Part 2 fixes | `npm run test` | Part 2 |
| `V22-OPS-01` | `REQ-OPS-001`, `REQ-SEC-003` | Structured JSON Logging & Header Redaction | `apps/api/src/app.ts` (line 279) | `VERIFIED_COMPLETE` | None | `npm run test` | Part 1 |
| `V22-OPS-02` | `REQ-OPS-002`, `REQ-OPS-003` | Protected Metrics Endpoint (`/api/v1/metrics`) | `apps/api/src/app.ts` (lines 440-460) | `VERIFIED_COMPLETE` | None | `npm run test` | Part 1 |
| `V22-OPS-03` | `REQ-NFR-003`, `REQ-OPS-005` | Single-Node In-Memory Rate Limiting | `apps/api/src/app.ts` (lines 289, 470-520) | `ACCEPTED_LIMITATION` | Document single-node rate limit boundary | `docs/OPERATIONS.md` review | Part 4 |
| `V22-OPS-04` | `REQ-OPS-006`, `REQ-DATA-004` | Online SQLite Backup Script & Restore Drill | `apps/api/src/backup.ts`, `docs/OPERATIONS.md` | `VERIFIED_COMPLETE` | None | `npm run backup` | Part 1 |
| `V22-DOC-01` | `REQ-DOC-001`, `REQ-DOC-002` | Release Documentation & Provider Status Taxonomy | `GEXOR.md`, `README.md`, `OPERATIONS.md` | `NEEDS_DOCUMENTATION` | Update test counts, version snapshot, and provider taxonomy | Doc review | Part 4 |
| `V22-MAINT-01` | `REQ-MNT-001` | Automatic Event Replay Log Compaction | Not implemented | `DEFERRED_TO_V2_2_1` | Defer to v2.2.1 minor update | Future task | Post-v2.2 |
| `V22-DIST-01` | `REQ-DST-001` | Multi-Node Redis Queue & HA Cluster | Not implemented | `FUTURE` | Out of scope for v2.2 release | Architecture review | Future |
