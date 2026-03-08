# Universal Session Prompt Template

Use this prompt for any multi-phase implementation track that stores progress in
its own `LEES-MIJ-EERST.md` handoff file.

Replace `[TRACK PATH]` with the path to the relevant track directory, for
example:

- `docs/implementations/security-hardening`
- `docs/implementations/sidebar-infra`

```text
You are working in /Users/robinwaslander/Documents/dev/tandem-browser.

This session is for the multi-phase implementation track at:
[TRACK PATH]

Before coding:
1. git pull origin main
2. Read AGENTS.md
3. Read [TRACK PATH]/LEES-MIJ-EERST.md fully
4. Read the Progress Log in that file
5. Determine the next phase automatically by selecting the first phase in order
   whose status is not Complete
6. Read only that phase file and the files listed in its "Existing Code To Read" table

Scope rules:
- Do not wander through unrelated parts or the codebase unless the active phase
  explicitly requires it
- Do not start a later phase early
- Do not add npm dependencies unless truly necessary, and if you do, explain why
- Keep code, comments, commits, and repo-facing docs in English
- Preserve anti-detection constraints from AGENTS.md
- Do not leave the phase half-done without updating the docs state clearly

You must:
- execute the active phase end-to-end
- keep changes scoped to that phase goal
- run npm run compile
- update CHANGELOG.md
- bump package.json with a patch release
- update [TRACK PATH]/LEES-MIJ-EERST.md with:
  - phase status
  - date
  - commit hash
  - completed work summary
  - remaining risks for the next phase
- if the phase is blocked, record exactly why in [TRACK PATH]/LEES-MIJ-EERST.md
- commit in English
- push to origin main

At the end, report:
- which phase was executed
- what changed
- what was tested
- exact commit hash
- exact remaining risks for the next phase

If the repo state and [TRACK PATH]/LEES-MIJ-EERST.md disagree, stop and report
the mismatch before making changes.
```
