# [TRACK NAME] — Multi-Phase Execution Template

> **Date:** YYYY-MM-DD
> **Status:** Ready / In progress / Complete / Blocked
> **Goal:** [One sentence describing the overall outcome]
> **Order:** Phase 1 → 2 → 3 → ... → N

---

## Why This Track Exists

[2-4 paragraphs describing the problem, why it should be handled in phases, and
what overall risk or product goal it addresses.]

---

## Architecture In 30 Seconds

```text
[ASCII diagram showing the high-level system flow]
```

[Short explanation or how the phases fit together.]

---

## Project Structure — Relevant Files

> Read only the files listed by the active phase document.

### Read For All Phases

| File | Why |
|------|-----|
| `AGENTS.md` | workflow rules, anti-detection constraints, commit/report expectations |
| `PROJECT.md` | product and architecture context |
| `[path/to/core/file.ts]` | central lifecycle or orchestration file |
| `[path/to/core/file.ts]` | main API or state entry point |

### Additional Files Per Phase

See the active `fase-*.md` document.

---

## Hard Rules For This Track

1. **[Rule 1]** — [why it exists]
2. **[Rule 2]** — [why it exists]
3. **Function names over line numbers** — always reference concrete
   functions/classes
4. **Each phase must leave the product working** — no intentionally broken
   intermediate states

---

## Document Set

| File | Purpose | Status |
|------|---------|--------|
| `LEES-MIJ-EERST.md` | execution guide for the full track | Ready |
| `SESSION-PROMPT.md` | reusable universal prompt for new sessions | Ready |
| `fase-1-[name].md` | first implementation phase | Ready |
| `fase-2-[name].md` | second implementation phase | Waiting for phase 1 |
| `fase-3-[name].md` | third implementation phase | Waiting for phase 2 |

---

## Quick Status Check

```bash
curl http://localhost:8765/status
npx tsc
git status
npx vitest run
```

---

## Session Start Protocol

Every new session for this track should begin the same way:

1. `git pull origin main`
2. Read `AGENTS.md`
3. Read this file from top to bottom
4. Read the `Progress Log` section below
5. Identify the first phase whose status is not `Complete`
6. Open only that phase file
7. Verify the previous phase handoff notes and remaining risks before coding

If the docs and the actual repo state disagree, stop and report the mismatch
before making changes.

---

## Session Completion Protocol

Every phase session must do all or the following before it ends:

1. Complete the phase end-to-end
2. Run `npm run compile`
3. Update `CHANGELOG.md`
4. Bump `package.json` with a patch release
5. Update the `Progress Log` in this file
6. Include:
   - status
   - date
   - commit hash
   - summary or completed work
   - remaining risks for the next phase
7. Commit in English
8. Push to `origin main`

If the phase is too large or blocked, update this file with a clear blocked
state and explain exactly what stopped progress.

---

## Phase Selection Rule

Future sessions should **not** guess which phase to start.

They must:

- read this file
- check the `Progress Log`
- select the first phase in sequence whose status is one or:
  - `Ready`
  - `In progress`
  - `Blocked`
- continue from there

They must **not** skip ahead to a later phase unless this file explicitly says
the dependency order changed.

---

## Progress Tracking Rules

After each phase:

- update `CHANGELOG.md`
- update this document if the sequence or assumptions change
- note any newly discovered risks before starting the next phase
- explicitly record what still remains true, what changed, and what is now
  protected or completed

This file exists so future sessions can restart from the documented state
instead or depending on chat context.

---

## Progress Log

### Phase 1 — [Name]

- Status: Ready
- Date: —
- Commit: —
- Summary: —
- Remaining risks for next phase: —

### Phase 2 — [Name]

- Status: Waiting
- Date: —
- Commit: —
- Summary: —
- Remaining risks for next phase: —

### Phase 3 — [Name]

- Status: Waiting
- Date: —
- Commit: —
- Summary: —
- Remaining risks for next phase: —
