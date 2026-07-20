# Gexor v2.2 Release Closure Plan

This document defines the ordered, step-by-step closure plan to achieve a frozen, production-grade Gexor v2.2 release.

---

## Part 2: UI and API Correctness Tasks

1. **Task 2.1 — Restrict Regenerate Button to Completed Assistant Messages (`V22-UI-02`)**:
   - **Target**: `apps/web/src/Workspace.tsx` (`MessageView` component).
   - **Action**: Update the conditional rendering check to `{item.role === "assistant" && execution?.state === "completed" && <button ...>Regenerate</button>}` to prevent Regenerate controls from appearing on user messages or incomplete executions.
   - **Verification**: Add web unit test in `apps/web/src/Workspace.test.tsx` asserting Regenerate button is rendered only for completed assistant messages.

2. **Task 2.2 — Align Textarea Input Length with API Schema Contract (`V22-UI-03`)**:
   - **Target**: `apps/web/src/Workspace.tsx` (composer form `<textarea>`).
   - **Action**: Change `maxLength={12000}` to `maxLength={4000}` matching `messageSubmissionSchema` in `apps/api/src/app.ts`.
   - **Verification**: Add component test verifying textarea enforces `maxLength={4000}`.

3. **Task 2.3 — Implement SSE Replay Gap Compatibility (`V22-SSE-03`)**:
   - **Target**: `apps/api/src/app.ts` (SSE route line 787) and `apps/web/src/api/client.ts` (`streamExecution`).
   - **Action**: Format the replay-gap event emitted by Fastify as a standard `ExecutionStreamEvent` (`eventType: "execution.snapshot"`, `eventId`, `sequence`) and update web client `isExecutionEvent` filter to handle replay-gap event payloads gracefully.
   - **Verification**: Add integration test in `apps/api/src/app.test.ts` / `apps/web/src/App.integration.test.tsx` verifying client receives replay gap snapshots without dropping stream connections.

4. **Task 2.4 — Add Mobile Navigation Drawer Toggle (`V22-UI-04`)**:
   - **Target**: `apps/web/src/Workspace.tsx` and `apps/web/src/styles.css`.
   - **Action**: Add a mobile header toggle button and responsive drawer state (`showMobileHistory`) allowing mobile users on screens <= 720px to toggle conversation history view.
   - **Verification**: Add web component test rendering workspace in mobile view and testing history toggle state.

5. **Task 2.5 — Add Modal Accessibility & Escape Key Dismissal (`V22-UI-05`)**:
   - **Target**: `apps/web/src/Workspace.tsx` (Usage modal) and `ProviderSettings.tsx`.
   - **Action**: Add `keydown` event listener for `Escape` key to close active modal, attach `aria-labelledby` / `role="dialog"`, and restore focus to trigger element upon closing.
   - **Verification**: Test Escape key press closes Usage modal in `apps/web/src/Workspace.test.tsx`.

6. **Task 2.6 — Polish Usage UI Pricing Display for Unpriced Version (`V22-USAGE-03`)**:
   - **Target**: `apps/web/src/Workspace.tsx` (Usage modal card).
   - **Action**: When `usage.pricingVersion === "pricing_unpriced_v1"` or estimated cost is unpriced, display `"Unpriced"` instead of misleading `"$0.00 Estimated spend"`.
   - **Verification**: Web component test verifying unpriced usage status rendering.

---

## Part 3: Runtime, Persistence, Provider, Usage & Operations Verification

1. **Task 3.1 — Verify Runtime Worker Recovery & Lease Claiming (`V22-QUEUE-02`)**:
   - **Target**: `apps/api/src/runtime-worker.ts` & `production-runtime.test.ts`.
   - **Action**: Verify worker lease recovery for expired jobs and ensure graceful process shutdown handles signal termination cleanly.
   - **Verification**: Run `npx tsx --test apps/api/src/production-runtime.test.ts`.

2. **Task 3.2 — Verify Provider Connection Selection & Redaction (`V22-PROV-01`)**:
   - **Target**: `apps/api/src/provider-connections.test.ts`.
   - **Action**: Confirm provider connections redact credential references (`local-env:configured`) and expose active models in provider catalogue.
   - **Verification**: Run `npx tsx --test apps/api/src/provider-connections.test.ts`.

3. **Task 3.3 — Verify Online SQLite Backup Execution (`V22-OPS-04`)**:
   - **Target**: `apps/api/src/backup.ts`.
   - **Action**: Execute `npm run backup` and confirm timestamped backup database file is generated in `.data/backups/`.
   - **Verification**: Run `npm run backup` and check output log.

---

## Part 4: Final Release Documentation & Freeze Evidence

1. **Task 4.1 — Update `GEXOR.md` & `README.md` Release Snapshot (`V22-DOC-01`)**:
   - **Target**: `GEXOR.md` and `README.md`.
   - **Action**: Update test count baseline (196 API tests + 5 Web tests = 201 total tests), commit snapshot, node version (`24.18.0`), and document provider status taxonomy (`Connection Status` vs `Health State`).

2. **Task 4.2 — Qualify Operational Boundaries (`V22-OPS-03`, `V22-SSE-04`)**:
   - **Target**: `docs/OPERATIONS.md` and `docs/releases/v2.2/KNOWN-LIMITATIONS.md`.
   - **Action**: Explicitly document single-node 50ms SQLite SSE polling and in-memory rate limiting boundaries.

3. **Task 4.3 — Complete Full Gate Verification & Tag v2.2.0 Release**:
   - **Target**: Full repository.
   - **Action**: Execute `npm run verify`, inspect `git status --short --branch`, and record release freeze evidence.
