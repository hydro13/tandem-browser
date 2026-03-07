# Agent Tools — Implementation Project

Three features Kees, the default OpenClaw persona in Tandem, needs to work more
effectively with the browser. This pack is based on a gap analysis between
Tandem (174 endpoints) and `agent-browser` (~65 endpoints).

## Goal

Not for end-user demos. Purely for agent-facing capability work:

| Feature | Problem | Solution |
|---|---|---|
| **Persistent scripts** | `POST /execute-js` loses state after navigation | `ScriptInjector` — re-inject on every `did-finish-load` |
| **Semantic locators** | CSS selectors are fragile and hard to generate | `POST /find {"by":"role","value":"button"}` — query by semantics |
| **Device emulation** | Tandem always runs desktop Chromium | iPhone/Galaxy presets via the Electron native API |

## Structure

```
docs/agent-tools/
├── CLAUDE.md          ← Maintainer workflow instructions for this pack
├── README.md          ← This file
├── STATUS.md          ← Progress tracking (update after each phase)
└── phases/
    ├── PHASE-1.md     ← Persistent Script & Style Injection
    ├── PHASE-2.md     ← Semantic Locators (Playwright-style)
    └── PHASE-3.md     ← Device Emulation
```

## Files Added After Completion

```
src/
├── scripts/
│   └── injector.ts        ← ScriptInjector
├── locators/
│   └── finder.ts          ← LocatorFinder
└── device/
    └── emulator.ts        ← DeviceEmulator
```

## Endpoints Added After Completion

```
# Phase 1 — Scripts
POST   /scripts/add
DELETE /scripts/remove
GET    /scripts
POST   /scripts/enable
POST   /scripts/disable
POST   /styles/add
DELETE /styles/remove
GET    /styles
POST   /styles/enable
POST   /styles/disable

# Phase 2 — Locators
POST   /find
POST   /find/click
POST   /find/fill
POST   /find/all

# Phase 3 — Device
GET    /device/profiles
GET    /device/status
POST   /device/emulate
POST   /device/reset
```

## Execution Order

One phase per maintainer session, in order: 1 → 2 → 3.
Phase 2 builds on Phase 1.
Phase 3 also builds on Phase 1 because it follows the same `did-finish-load`
pattern.

## Dependencies

All three phases use existing dependencies only:
- Electron native API (`enableDeviceEmulation`, `insertCSS`, `executeJavaScript`)
- Existing `DevToolsManager` for CDP
- Existing `SnapshotManager` for the accessibility tree

No new npm packages are required.
