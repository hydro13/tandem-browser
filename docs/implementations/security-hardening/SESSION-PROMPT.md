# Security Hardening — Universal Session Prompt

Use this prompt for every new session working on the security-hardening track.
The session should determine the next phase automatically from
`LEES-MIJ-EERST.md` instead or relying on chat history.

```text
You are working in /Users/robinwaslander/Documents/dev/tandem-browser.

This session is for the Security Hardening implementation track.

Before coding:
1. git pull origin main
2. Read AGENTS.md
3. Read docs/implementations/security-hardening/LEES-MIJ-EERST.md fully
4. Read the Progress Log in that file
5. Determine the next phase automatically by selecting the first phase in order
   whose status is not Complete
6. Read only that phase file and the files listed in its "Existing Code To Read" table

Scope rules:
- For this track, the phase file scope overrides the general AGENTS.md
  "read-first" guidance except for AGENTS.md itself
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
- update docs/implementations/security-hardening/LEES-MIJ-EERST.md with:
  - phase status
  - date
  - implementation commit hash
  - completed work summary
  - remaining risks for the next phase
- if an auto-version hook creates an extra commit, keep the phase log pointed at
  the implementation commit and reconcile docs in a follow-up commit if needed
- if the phase is blocked, record exactly why in LEES-MIJ-EERST.md
- commit in English
- push to origin main

At the end, report:
- which phase was executed
- what changed
- what was tested
- exact implementation commit hash
- exact pushed HEAD if different
- exact remaining risks for the next phase

If the repo state and LEES-MIJ-EERST.md disagree, stop and report the mismatch
before making changes.
```
