# Agent Tools — Implementation Project

3 features die Kees (de AI) nodig heeft om effectiever met Tandem te werken.
Gebaseerd op een gap-analyse tussen Tandem (174 endpoints) en agent-browser (~65 endpoints).

## Doel

Niet voor mensen, niet voor demos — puur voor AI-gebruik:

| Feature | Probleem | Oplossing |
|---|---|---|
| **Persistent scripts** | `POST /execute-js` vergeet alles na navigatie | `ScriptInjector` — re-inject na elke `did-finish-load` |
| **Semantic locators** | CSS selectors zijn fragiel en moeilijk te genereren | `POST /find {"by":"role","value":"button"}` — zoek op wat het IS |
| **Device emulation** | Tandem draait altijd desktop Chromium | iPhone/Galaxy presets via Electron native API |

## Structuur

```
docs/agent-tools/
├── CLAUDE.md          ← Instructies voor Claude Code (lees EERSTE)
├── README.md          ← Dit bestand
├── STATUS.md          ← Voortgang bijhouden (bijwerken na elke phase)
└── phases/
    ├── PHASE-1.md     ← Persistent Script & Style Injection
    ├── PHASE-2.md     ← Semantic Locators (Playwright-style)
    └── PHASE-3.md     ← Device Emulation
```

## Nieuwe bestanden na voltooiing

```
src/
├── scripts/
│   └── injector.ts        ← ScriptInjector
├── locators/
│   └── finder.ts          ← LocatorFinder
└── device/
    └── emulator.ts        ← DeviceEmulator
```

## Nieuwe endpoints na voltooiing

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

## Volgorde

1 phase per Claude Code sessie. In volgorde: 1 → 2 → 3.
Phase 2 bouwt op Phase 1 (geen harde afhankelijkheid, maar STATUS.md checks het).
Phase 3 bouwt op Phase 1 (volgt hetzelfde did-finish-load patroon).

## Geen dependencies

Alle 3 phases gebruiken alleen wat al aanwezig is:
- Electron native API (`enableDeviceEmulation`, `insertCSS`, `executeJavaScript`)
- Bestaande `DevToolsManager` voor CDP
- Bestaande `SnapshotManager` voor accessibility tree

Geen nieuwe npm packages nodig.
