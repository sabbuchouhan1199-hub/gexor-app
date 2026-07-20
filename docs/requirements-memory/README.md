# Gexor Requirements Memory

## Purpose

This directory contains a durable, structured snapshot of every requirement and governing
constraint extracted from the authoritative `gexor-docs` repository (Documents 01–15).

It exists so that future implementation agents and contributors can:

1. Locate any requirement by its ID.
2. Understand its classification (MVP Critical, MVP Required, etc.).
3. Trace its source to the exact document and section.
4. Check its documented implementation status.
5. Assess whether a proposed change contradicts an approved constraint.

## Authority Hierarchy

Documents 01–14 are the authoritative product and engineering target baseline.

Document 15 (Implementation Status and Traceability Register) reports implementation
progress, evidence, gaps, and deviations. It does **not** override or alter any
higher-authority requirement.

```
1. PRD (Document 01)
2. Functional Requirements (Document 02)
3. Non-Functional Requirements (Document 03)
4. System Context and Architecture (Documents 04–10)
5. UX and Information Architecture (Document 11)
6. Testing and Quality Assurance (Document 12)
7. Deployment and DevOps (Document 13)
8. Operations and Incident Response (Document 14)
9. Implementation Status Report (Document 15 — status only)
```

## Conflict Handling

If documents conflict:

1. Preserve the conflict — do not silently resolve it.
2. Record both sources.
3. Apply the documented authority hierarchy.
4. Mark the item as requiring product-owner review in
   `GOVERNANCE-CONFLICTS-AND-OPEN-QUESTIONS.md`.

## How to Find a Requirement by ID

Open `REQUIREMENTS-INDEX.json` and search for the requirement ID.

Each entry includes:

- `requirementId` — stable unique identifier
- `title` — concise name
- `domain` — normalized domain
- `classification` — MVP priority
- `statement` — authoritative requirement text
- `acceptanceCriteria` — verifiable completion conditions
- `verificationMethods` — how the requirement is tested
- `source` — exact document and section
- `documentedImplementationStatus` — status per Document 15

For a grouped view by domain, open the appropriate domain file:

| File | Domain |
|------|--------|
| `MVP-REQUIREMENTS.md` | MVP-level requirements and acceptance criteria |
| `RUNTIME-REQUIREMENTS.md` | Runtime execution, messages, context, streaming |
| `SECURITY-AND-ISOLATION-REQUIREMENTS.md` | Security, workspace isolation, credentials |
| `DATA-AND-PERSISTENCE-REQUIREMENTS.md` | Data, retention, deletion, database |
| `PROVIDER-AND-ROUTING-REQUIREMENTS.md` | Provider connections, routing, models |
| `CONTEXT-MEMORY-AND-KNOWLEDGE-REQUIREMENTS.md` | Memory, context, knowledge |
| `UX-AND-ACCESSIBILITY-REQUIREMENTS.md` | UX, information architecture, accessibility |
| `TESTING-QUALITY-AND-ACCEPTANCE-REQUIREMENTS.md` | Testing, QA, acceptance criteria |
| `OPERATIONS-DEPLOYMENT-AND-OBSERVABILITY-REQUIREMENTS.md` | Operations, deployment, monitoring |
| `DEFERRED-FUTURE-AND-OUT-OF-SCOPE.md` | Explicitly deferred, future, and out-of-scope items |
| `GOVERNANCE-CONFLICTS-AND-OPEN-QUESTIONS.md` | Conflicts, ambiguities, unresolved questions |
| `DOCUMENT-15-STATUS-SNAPSHOT.md` | Document 15 implementation status snapshot |

## Regeneration

This memory package was generated from the state of `sabbuchouhan1199-hub/gexor-docs`
at commit `1c8b628`. It must be regenerated when:

- Source documents are updated.
- New requirement IDs are added.
- Requirement classifications change.
- Document 15 implementation status meaningfully changes.

Regeneration creates a new snapshot. Old snapshots should be preserved under
version control for audit trail purposes.

## WARNING

**Before changing Gexor behaviour, locate the relevant requirement IDs in
`REQUIREMENTS-INDEX.json` and verify them against the original source documents.**

Generated memory must never independently change requirement meaning. If a conflict
is found between this memory and the source documents, the source documents govern.
