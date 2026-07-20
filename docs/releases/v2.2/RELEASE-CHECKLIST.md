# Gexor v2.2 Release Gate Checklist

This checklist defines the mandatory verification gates required before Gexor v2.2 is frozen and tagged as a stable release.

---

## Pre-Release Gate Verification

### 1. Repository Safety & Cleanliness
- [ ] Working tree is clean (`git status --short --branch` shows no uncommitted or untracked changes).
- [ ] No secrets, credentials, or `.env` files are tracked or present in git diff.
- [ ] `git diff --check` passes cleanly with zero whitespace or line-ending warnings.

### 2. Automated Testing Baseline
- [ ] Workspace typecheck passes cleanly (`npm run typecheck`).
- [ ] All API unit and integration tests pass hermetically (`npx tsx --test apps/api/src/*.test.ts`). Total API tests: 196+.
- [ ] All Web component and integration tests pass (`npm run test --workspace apps/web`). Total Web tests: 5+.
- [ ] Full local gate passes (`npm run verify`).

### 3. Production Build Integrity
- [ ] Workspace packages build cleanly (`npm run build`).
- [ ] React/Vite web bundle completes without warnings or broken imports.

### 4. Part 2 Correctness Verification
- [x] Regenerate control appears strictly on completed assistant messages (`V22-UI-02`, commit `5a9fcea`).
- [x] Textarea input `maxLength` is capped at 4000 characters matching API schema (`V22-UI-03`, commit `5a9fcea`).
- [x] SSE `replayGap` events are formatted and handled correctly by web client (`V22-SSE-03`, commit `8e37bc3`).
- [x] Usage UI accurately displays "Unpriced" for unpriced pricing versions (`V22-USAGE-03`, commit `9a697cf`).
- [x] Regression tests added for all UI & SSE replay gap fixes (`V22-TEST-02`, commits `5a9fcea`, `8e37bc3`).

### 5. Documentation Baseline Reconciliation
- [ ] `GEXOR.md` project context updated with verified test counts and release snapshot.
- [ ] `README.md` and `docs/OPERATIONS.md` updated with single-node operational qualifications.
- [ ] `docs/releases/v2.2/` closure documents complete and verified.

---

## Release Approval & Tagging

- [ ] All checklist items verified complete.
- [ ] Release baseline tagged as `v2.2.0`.
