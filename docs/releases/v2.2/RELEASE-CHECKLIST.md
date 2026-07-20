# Gexor v2.2 Release Gate Checklist

This checklist defines the mandatory verification gates required before Gexor v2.2 is frozen and tagged as a stable release.

---

## Pre-Release Gate Verification

### 1. Repository Safety & Cleanliness
- [x] Working tree is clean (`git status --short --branch` shows no uncommitted or untracked changes).
- [x] No secrets, credentials, or `.env` files are tracked or present in git diff.
- [x] `git diff --check` passes cleanly with zero whitespace or line-ending warnings.

### 2. Automated Testing Baseline
- [x] Workspace typecheck passes cleanly (`npm run typecheck`).
- [x] All API unit and integration tests pass hermetically (`npx tsx --test apps/api/src/*.test.ts`). Total API tests: 200.
- [x] All Web component and integration tests pass (`npm run test --workspace apps/web`). Total Web tests: 6.
- [x] Full local gate passes (`npm run verify`).

### 3. Production Build Integrity
- [x] Workspace packages build cleanly (`npm run build`).
- [x] React/Vite web bundle completes without warnings or broken imports.

### 4. Part 2 Correctness Verification
- [x] Regenerate control appears strictly on completed assistant messages (`V22-UI-02`, commit `5a9fcea`).
- [x] Textarea input `maxLength` is capped at 4000 characters matching API schema (`V22-UI-03`, commit `5a9fcea`).
- [x] SSE `replayGap` events are formatted and handled correctly by web client (`V22-SSE-03`, commit `8e37bc3`).
- [x] Usage UI accurately displays "Unpriced" for unpriced pricing versions (`V22-USAGE-03`, commit `9a697cf`).
- [x] Regression tests added for all UI & SSE replay gap fixes (`V22-TEST-02`, commits `5a9fcea`, `8e37bc3`).

### 5. Part 3 Runtime & Operations Closure Verification
- [x] Event-driven SSE wakeup eliminates 50ms polling loop (`V22-SSE-04`, commit `7a0c89d`).
- [x] Provider-reported measured token usage recorded when available (`V22-USAGE-01`, commit `3e6bae9`).
- [x] Online SQLite backup script and automated restore verification test (`V22-OPS-04`, commit `e8d136b`).
- [x] Evidence and acceptance matrix updated (`V22-DOC-01`, commit `84a3512`).

### 6. Documentation Baseline Reconciliation
- [x] `GEXOR.md` project context updated with verified test counts (206) and release snapshot.
- [x] `README.md` and `docs/OPERATIONS.md` updated with single-node operational qualifications and provider taxonomy.
- [x] `docs/releases/v2.2/` closure documents complete and verified (`RELEASE-NOTES.md`, `FINAL-EVIDENCE.md`, `V2.2.1-BACKLOG.md`).

---

## Release Approval & Tagging

- [x] All checklist items verified complete.
- [x] Release baseline ready for freeze as `v2.2.0`.
