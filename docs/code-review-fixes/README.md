# Code Review Fixes Project

> Fix alle issues gevonden in de full codebase review van 26 feb 2026 — geordend van laag risico naar hoog risico, in 6 fases.

**Start:** TBD
**Status:** Not started

## Context

Op 2026-02-26 is een volledige codebase review uitgevoerd door 5 parallelle Claude review-agents.
Het rapport staat in [`docs/CODE-REVIEW-2026-02-26.md`](../CODE-REVIEW-2026-02-26.md).

Er zijn 24 issues gevonden: 9 security, 8 bugs/architectuur, 7 code hygiene.
Dit project fixt ze allemaal in 6 fases, geordend op risico en blast radius.

## How It Works

1. Een nieuwe Claude Code sessie leest automatisch `CLAUDE.md` (sessie-instructies)
2. De sessie leest `STATUS.md` om de volgende `PENDING` fase te vinden
3. De sessie leest `phases/PHASE-{N}.md` voor de gedetailleerde specificatie
4. Na afronding werkt de sessie `STATUS.md` bij met resultaten
5. Commit + push

## Documentation

| File | Purpose |
|------|---------|
| [CLAUDE.md](CLAUDE.md) | Instructions for Claude Code sessions (auto-loaded) |
| [STATUS.md](STATUS.md) | Progress tracking per phase (read this FIRST) |
| [CODE-REVIEW-2026-02-26.md](../CODE-REVIEW-2026-02-26.md) | Original code review report with all 24 findings |

## Phase Documents

| Phase | Document | Description | Risk |
|-------|----------|-------------|------|
| 1 | [PHASE-1.md](phases/PHASE-1.md) | Triviale safe fixes (8 stuks, chirurgisch) | Zero |
| 2 | [PHASE-2.md](phases/PHASE-2.md) | XSS fixes + crash handler | Low |
| 3 | [PHASE-3.md](phases/PHASE-3.md) | Auth hardening (origin bypass, path traversal) | Medium |
| 4 | [PHASE-4.md](phases/PHASE-4.md) | Init & lifecycle fixes (activate race, dispatcher, tab-register) | Medium |
| 5 | [PHASE-5.md](phases/PHASE-5.md) | Performance fixes (writeFileSync, history search, getSessionWC) | Medium |
| 6 | [PHASE-6.md](phases/PHASE-6.md) | Overig (sandbox, MCP approval, dist cleanup) | High |

## Risk Ordering Rationale

- **Phase 1:** Zero-risk one-liners — if anything breaks here, the fix is wrong
- **Phase 2:** Low-risk HTML escaping + process handlers — visuele regressie mogelijk
- **Phase 3:** Medium-risk auth changes — raakt elke API call, shell moet daarna nog werken
- **Phase 4:** Medium-risk init sequence changes — raakt app startup en macOS lifecycle
- **Phase 5:** Medium-risk performance refactors — verandert I/O patterns in hot paths
- **Phase 6:** High-risk — sandbox mode wijzigen kan preload breken, MCP protocol wijzigingen

See [STATUS.md](STATUS.md) for the current status per phase.
