# Tandem Security Shield — AI-Powered Browser Security

## Vision

Tandem is a copilot browser — human and AI browse together. Security should work the same way: an AI Gatekeeper that understands what's happening, prevents threats in real-time, and evolves over time.

**This is not a blocklist. This is an AI Security Copilot.**

## Architecture: 7 Layers

| Layer | Name | Type | Speed | Action |
|-------|------|------|-------|--------|
| **0** | **Guardian + Gatekeeper** | **Active interceptor + AI agent** | **Real-time** | **BLOCKS** |
| 1 | Network Shield | Blocklists | Real-time lookup | Informs Guardian |
| 2 | Content Analyzer | Page scan | Per page load | Informs Guardian |
| 3 | Behavior Monitor | Event stream | Continuous | Informs Guardian |
| 4 | AI Threat Intelligence | Analysis | On-demand | Strategic |
| 5 | Evolution Engine | Database + learning | Continuous | Learns |
| 6 | Security Agents | Autonomous watchers | 2min - daily | Decides + escalates |

## Key Principle

**Guardian is the active wall. Layers 1-5 feed Guardian with intelligence. The Gatekeeper Agent is Guardian's AI brain.**

Nothing gets in or out without Guardian's approval. Not requests, not responses, not scripts, not outbound data.

## Implementation Phases

| Phase | Focus | Deliverable |
|-------|-------|-------------|
| **0** | **Unified Request Dispatcher** | **Central webRequest handler, refactor existing hooks, rebuild script** |
| 1 | Security Core | Types, SQLite DB, blocklists, Guardian (via dispatcher), API routes |
| 2 | Outbound Data Guard | Data exfiltration prevention, form/POST monitoring |
| 3 | Script & Content Guard | Script analysis via DevToolsManager, content scanning |
| 4 | AI Gatekeeper Agent | Sentinel agent via WebSocket, real-time AI decisions |
| 5 | Evolution Engine | Baseline learning, anomaly detection, agent fleet |

## Session Workflow

**Each phase = exactly 1 Claude Code session.** No session spans multiple phases.

Every session follows this workflow:
1. Read `STATUS.md` to understand current state
2. Read the phase doc for the current phase
3. Implement all deliverables
4. Run verification checklist
5. Update `STATUS.md` with results
6. Commit and push

See [CLAUDE.md](CLAUDE.md) for detailed session instructions.

## Existing Infrastructure (already in Tandem)

The CDP DevTools bridge is already built. The Gatekeeper uses these existing endpoints:

- `GET /devtools/network` — all requests, real-time
- `GET /devtools/network/:id/body` — response body inspection
- `GET /devtools/console` — JS errors, warnings, logs
- `POST /devtools/evaluate` — execute JS in page context
- `POST /devtools/dom/query` — DOM element inspection
- `POST /devtools/dom/xpath` — XPath queries
- `GET /devtools/storage` — cookies, localStorage, sessionStorage
- `GET /devtools/performance` — heap, nodes, metrics
- `POST /devtools/cdp` — raw CDP commands (unlimited power)

## Directory Structure

```
src/security/
├── guardian.ts          — Phase 1: Active interceptor (via RequestDispatcher)
├── network-shield.ts    — Phase 1: Blocklist lookups
├── security-db.ts       — Phase 1: SQLite database layer
├── security-manager.ts  — Phase 1: Orchestrator, registers API routes
├── outbound-guard.ts    — Phase 2: Data exfiltration prevention
├── script-guard.ts      — Phase 3: Script analysis (via DevToolsManager)
├── content-analyzer.ts  — Phase 3: Page content analysis
├── behavior-monitor.ts  — Phase 3: Real-time behavior monitoring
├── gatekeeper-ws.ts     — Phase 4: WebSocket server for AI Gatekeeper Agent
├── evolution.ts         — Phase 5: Baseline learning + anomaly detection
├── threat-intel.ts      — Phase 5: AI threat intelligence
├── types.ts             — Shared types and interfaces
└── blocklists/
    ├── updater.ts       — Blocklist download + sync
    └── data/            — Local blocklist files

src/network/
├── dispatcher.ts        — Phase 0: Unified webRequest handler (NEW)
├── inspector.ts         — Refactored in Phase 0 to use dispatcher
```

## Read the phase docs in order:
0. [Phase 0: Unified Dispatcher](phases/PHASE-0.md) ← START HERE
1. [Phase 1: Security Core](phases/PHASE-1.md)
2. [Phase 2: Outbound Guard](phases/PHASE-2.md)
3. [Phase 3: Script & Content Guard](phases/PHASE-3.md)
4. [Phase 4: AI Gatekeeper Agent](phases/PHASE-4.md)
5. [Phase 5: Evolution Engine](phases/PHASE-5.md)
