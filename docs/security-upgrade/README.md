# Tandem Security Upgrade Project

> Improve Tandem's security system based on insights from Azul Bedrock (ASD), CyberChef (GCHQ), and Ghidra (NSA).

**Start:** 24 Feb 2026
**Status:** In progress

## How It Works

1. A new Claude Code session automatically reads `CLAUDE.md` (session instructions)
2. The session reads `STATUS.md` to find the next phase to implement
3. The session reads `phases/PHASE-{N}.md` for the detailed specification
4. After completion, the session updates `STATUS.md` with results

## Documentation

| File | Purpose |
|------|---------|
| [CLAUDE.md](CLAUDE.md) | Instructions for Claude Code sessions (auto-loaded) |
| [STATUS.md](STATUS.md) | Progress tracking per phase (read this FIRST) |
| [REPORT.md](REPORT.md) | Full analysis of reference repos + recommendations |
| [ROADMAP.md](ROADMAP.md) | Detailed task checklist with checkboxes per sub-task |

## Phase Documents

| Phase | Document | Description |
|-------|----------|-------------|
| 0-A | [PHASE-0A.md](phases/PHASE-0A.md) | Deduplicate shared constants (KNOWN_TRACKERS, URL_LIST_SAFE_DOMAINS) |
| 0-B | [PHASE-0B.md](phases/PHASE-0B.md) | Wire cookie_count + correlation trigger + blocklist scheduling |
| 1 | [PHASE-1.md](phases/PHASE-1.md) | Shannon entropy check + MIME whitelist |
| 2-A | [PHASE-2A.md](phases/PHASE-2A.md) | ThreatRule interface + rule set definition (25 rules) |
| 2-B | [PHASE-2B.md](phases/PHASE-2B.md) | Rule engine + CDP integration + event logging |
| 3-A | [PHASE-3A.md](phases/PHASE-3A.md) | Cross-domain script correlation (DB + logic) |
| 3-B | [PHASE-3B.md](phases/PHASE-3B.md) | Normalized hashing + API endpoint |
| 4 | [PHASE-4.md](phases/PHASE-4.md) | CyberChef regex patterns integration |
| 5-A | [PHASE-5A.md](phases/PHASE-5A.md) | Confidence type system + DB layer |
| 5-B | [PHASE-5B.md](phases/PHASE-5B.md) | Confidence wiring in Guardian/OutboundGuard/ScriptGuard |
| 5-C | [PHASE-5C.md](phases/PHASE-5C.md) | Remaining modules + Gatekeeper routing + Evolution weighting |
| 6-A | [PHASE-6A.md](phases/PHASE-6A.md) | Acorn parser + AST hash algorithm |
| 6-B | [PHASE-6B.md](phases/PHASE-6B.md) | Similarity matching + DB integration |
| 7-A | [PHASE-7A.md](phases/PHASE-7A.md) | Plugin interface + AnalyzerManager + example plugin |
| 7-B | [PHASE-7B.md](phases/PHASE-7B.md) | ContentAnalyzer migration to plugin interface |
| 7-C | [PHASE-7C.md](phases/PHASE-7C.md) | BehaviorMonitor migration to plugin interface |
| 8 | [PHASE-8.md](phases/PHASE-8.md) | Post-review fix round (1 critical + 5 important + 4 minor) |
| 9 | [PHASE-9.md](phases/PHASE-9.md) | Test coverage, EventCategory type cleanup + CDP timing fix |

## Review

| File | Purpose |
|------|---------|
| [REVIEW.md](REVIEW.md) | Full code review report of all 16 phases |

See [STATUS.md](STATUS.md) for the current status per phase.
