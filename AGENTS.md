# Gexor Codex Operating Instructions

## 1. Mandatory Context Bootstrap

- At the beginning of every new Codex session in this repository, actually read, in order:
  1. `AGENTS.md`
  2. `GEXOR.md`
- Before beginning every new user task or materially different prompt:
  1. re-check `GEXOR.md`;
  2. inspect current Git status;
  3. inspect the current branch and commit;
  4. reconcile the request with the present working tree.
- Do not rely only on conversational memory, an earlier session summary, commit messages, or stale documentation.
- For long tasks, re-read the relevant `GEXOR.md` sections before architectural decisions, implementation, verification, and final handoff.
- If `GEXOR.md` is missing, inaccessible, stale, or contradicts the working tree, treat the repository implementation and tests as authoritative for implemented state. Stop before risky edits, then update the context document or request clarification as appropriate.
- Never claim to have read either file unless it was actually read during the current task or session.

## 2. Source-of-Truth Hierarchy

Use this precedence order:

1. Current user instruction
2. Safety and security constraints
3. Current repository implementation and tests
4. `AGENTS.md` operating rules
5. `GEXOR.md` project context
6. Existing repository documentation
7. Historical summaries and assumptions

Current user instructions do not authorize unsafe secret exposure, weakening security boundaries without an explicit scoped reason, or destructive unrelated actions. When sources disagree, report the disagreement and follow the higher source.

## 3. Required Work Method

- Understand the request and its boundaries.
- Inspect the relevant files and current repository state.
- For substantial work, state a bounded implementation plan.
- Make the smallest coherent change; avoid unrelated refactors and formatting churn.
- Run targeted verification first, then broader verification when appropriate.
- Inspect the final diff and confirm Git status.
- Produce a factual final report: what changed, why, verification performed, failures or risks, and what remains.
- Never enter an endless autonomous loop.
- Never repeatedly retry the same failing command without diagnosing the failure.
- Stop and explain clearly when blocked.
- Do not weaken types, validation, authorization, error handling, or tests merely to make a check pass.

Preferred development rhythm:

> One microstep → inspect → implement → verify → explain → review diff → wait for the next instruction, unless the user explicitly authorized the complete multi-step task.

## 4. User Communication Style

- The user develops primarily from an Android phone using UserLAnd Ubuntu.
- When communicating directly with the user, explain important actions in clear Hindi-English mixed language unless another language is requested.
- Explain what changed, why it changed, how it was verified, and what remains.
- Be direct about failures, uncertainty, risks, and missing information.
- Do not bury decisive errors in long output or claim success without completed verification.
- When command output is very long, summarize the decisive lines and provide the saved log path if a log was created.
- Keep commands phone-friendly and copyable; call out commands that may be slow, network-dependent, or resource-intensive.

## 5. Repository Safety

- Never read, print, expose, copy, modify, stage, or commit `.env` files or credentials. `.env.example` may be inspected only as a placeholder contract and must never contain real secrets.
- Never expose API keys, tokens, cookies, authentication files, password hashes, database secrets, provider credential references, or private user data.
- Do not use `git reset --hard`, `git clean -fd` or stronger variants, force push, destructive checkout/restore operations, mass deletion, or equivalent destructive actions unless the user explicitly requests the exact operation and its consequences have been confirmed.
- Never overwrite uncommitted user changes or discard unrelated modifications.
- Do not change generated output, dependencies, package files, lockfiles, migrations, configuration, or environment files unless the current task requires it.
- Do not commit, push, reset, rebase, merge, stash, switch branches, or open a pull request unless explicitly requested in the current task.
- Before any commit, inspect the relevant diff and verification results, and confirm the intended files.
- Never change public contracts, persistence schemas, authentication/authorization rules, provider credential boundaries, or runtime state semantics as an incidental refactor.
- Treat local SQLite data under `.data/` as private runtime data. Do not inspect, copy, delete, or publish it unless explicitly required and safely scoped.

## 6. Verification and Change Boundaries

- Use the root scripts documented in `package.json`; start with the narrowest workspace command that covers the change.
- The full local gate is `npm run verify` (typechecks, tests, then web build). Do not claim it passed unless it actually ran successfully in the current working tree.
- Do not run commands that rewrite lockfiles, install packages, or modify generated output unless authorized and required.
- Tests must be deterministic and must not require live Ollama, Gemini, or other external-provider access.
- Inspect `git diff --check`, the relevant diff, and `git status --short --branch` before handoff.

## 7. Maintaining Durable Context

- Keep `GEXOR.md` factual and evidence-backed. Separate verified implementation, strategic vision, planned work, and unknown/unverified information.
- Update `GEXOR.md` when a task materially changes architecture, routes, persistence, security boundaries, runtime lifecycle, user flows, verification commands, or known limitations.
- Do not mark a planned capability implemented until code and appropriate verification exist in the current working tree.
