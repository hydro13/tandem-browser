# Code Review Fixes Project

> Fix all issues found in the full codebase review from February 26, 2026,
> ordered from low risk to high risk across six phases.

**Start:** TBD
**Status:** Not started

## Context

On 2026-02-26, a full codebase review was performed by five parallel review
agents. The report lives in
[`docs/CODE-REVIEW-2026-02-26.md`](../CODE-REVIEW-2026-02-26.md).

The review found 24 issues: 9 security issues, 8 bugs or architectural risks,
and 7 code-hygiene issues. This project groups the fixes into six phases based
on risk and blast radius.

## How It Works

1. The maintainer reads `CLAUDE.md` for workflow instructions
2. The maintainer reads `STATUS.md` to find the next `PENDING` phase
3. The maintainer reads `phases/PHASE-{N}.md` for the detailed specification
4. After completion, the maintainer updates `STATUS.md` with the outcome
5. Commit and push

## Documentation

| File | Purpose |
|------|---------|
| [CLAUDE.md](CLAUDE.md) | Maintainer workflow instructions for this documentation pack |
| [STATUS.md](STATUS.md) | Progress tracking per phase (read this FIRST) |
| [CODE-REVIEW-2026-02-26.md](../CODE-REVIEW-2026-02-26.md) | Original code review report with all 24 findings |

## Phase Documents

| Phase | Document | Description | Risk |
|-------|----------|-------------|------|
| 1 | [PHASE-1.md](phases/PHASE-1.md) | Trivial safe fixes (8 items, surgical) | Zero |
| 2 | [PHASE-2.md](phases/PHASE-2.md) | XSS fixes + crash handler | Low |
| 3 | [PHASE-3.md](phases/PHASE-3.md) | Auth hardening (origin bypass, path traversal) | Medium |
| 4 | [PHASE-4.md](phases/PHASE-4.md) | Init & lifecycle fixes (activate race, dispatcher, tab-register) | Medium |
| 5 | [PHASE-5.md](phases/PHASE-5.md) | Performance fixes (writeFileSync, history search, getSessionWC) | Medium |
| 6 | [PHASE-6.md](phases/PHASE-6.md) | Remaining work (sandbox, MCP approval, dist cleanup) | High |

## Risk Ordering Rationale

- **Phase 1:** Zero-risk one-liners — if anything breaks here, the fix is wrong
- **Phase 2:** Low-risk HTML escaping + process handlers; visual regressions are possible
- **Phase 3:** Medium-risk auth changes that touch every API call
- **Phase 4:** Medium-risk init sequence changes that affect startup and macOS lifecycle
- **Phase 5:** Medium-risk performance refactors that change I/O patterns in hot paths
- **Phase 6:** High-risk work; sandbox changes can break preload and MCP protocol behavior

See [STATUS.md](STATUS.md) for the current status per phase.
