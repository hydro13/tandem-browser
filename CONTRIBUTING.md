# Contributing

Thanks for contributing to Tandem Browser.

This repository is public because outside contributors are expected to help
improve the browser over time. If you are interested in OpenClaw workflows,
local-first browser tooling, security, Electron infrastructure, or agent
interfaces, contributions are welcome.

Tandem is still in a stage where extra help is genuinely valuable. Bug fixes,
repro steps, platform testing, code review, docs cleanup, and focused UX polish
all move the project forward.

## Before You Start

- Read [README.md](README.md) for the product overview
- Read [PROJECT.md](PROJECT.md) for architecture context
- Read [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) for collaboration expectations
- Keep changes local-first and privacy-preserving
- Avoid introducing new dependencies unless they are clearly justified

## Project Status

The repository is currently maintained as a public developer preview.

- macOS is the primary development target
- Linux is supported but still has rough edges in some media workflows
- Windows is not actively validated
- official public releases are currently source-only
- official end-user binaries are intentionally not published yet

Please keep changes honest about current product maturity. Do not present
unfinished features as production-ready.

Tandem is also intentionally OpenClaw-first. Contributions should preserve that
positioning in public docs, UX wording, and architecture decisions unless the
project direction explicitly changes.

Public-facing changes should also avoid framing Tandem as a gimmick or a loose
plugin integration. The project is intended as a first-party OpenClaw companion
browser maintained from the same ecosystem.

## Good First Contribution Areas

Useful contribution areas right now include:

- bug fixes with clear reproduction steps
- Linux testing and platform-specific fixes
- browser API improvements for tabs, sessions, snapshots, and devtools
- OpenClaw workflow polish and Tandem skill ergonomics
- security review and containment hardening
- UI polish in the shared human + Wingman workflow
- docs cleanup where public setup or project status is confusing

If you are unsure where to start, opening an issue with a concrete bug report,
validation result, or implementation question is already useful.

## Development Workflow

```bash
npm install
npm run verify
```

For manual app testing:

```bash
npm start
```

If your change affects the Electron shell, screenshots, permissions, packaging,
or the local API lifecycle, do a manual app sanity check in addition to
`npm run verify`.

`TODO.md` is the active engineering backlog. Treat `docs/internal/ROADMAP.md`
and `docs/internal/STATUS.md` as historical snapshots, not the live source of
truth for day-to-day implementation work.

## Definition of Done

A task is only considered done when all of the following are true:

- the code or documentation change is complete
- `npm run verify` passes
- related docs are updated when behavior, API shape, or workflow changed
- a manual app check is done when Electron lifecycle or visible UI changed

Keep work scoped to one active task at a time when possible. Smaller finished
steps are better than broad partially-done rewrites.

## Coding Expectations

- TypeScript should compile cleanly
- Prefer focused patches over broad rewrites
- Keep Electron security defaults intact unless there is a reviewed reason to change them
- Do not introduce cloud dependencies into core browsing flows
- Keep public-facing text in English

## Commits

Use conventional commit prefixes:

- `fix:`
- `feat:`
- `chore:`
- `docs:`
- `refactor:`
- `test:`

## Pull Requests

A good pull request should include:

- a clear problem statement
- the implementation approach
- test or verification notes
- screenshots when UI changes are visible
- what is still open or risky, if anything

If a change depends on local OpenClaw services, call that out clearly so other
contributors know what they can and cannot validate on a clean machine.

If your PR is exploratory, incomplete, or looking for direction, that is still
fine. A smaller draft PR with a clear problem statement is better than waiting
for a perfect large patch.

## Session Closeout

At the end of a session or PR, summarize:

- what was built or changed
- what was tested
- what remains open, risky, or intentionally deferred

## Security-Sensitive Changes

If a change touches stealth behavior, session isolation, extension loading, or
the local API security model, call that out explicitly in the PR description.
