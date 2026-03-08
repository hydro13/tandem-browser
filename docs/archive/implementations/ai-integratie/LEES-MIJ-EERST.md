# Tandem Browser — AI Implementatie: START HERE

> **Last update:** 12 februari 2026
> **Architectuur:** Claude Max Pro → Cowork/Claude Code → MCP → Tandem API
> **No API key nodig** — Claude works via MCP, not via directe API calls.

---

## Architecture in 30 seconds

```
Robin spreekt/typt ──→ Cowork/Claude Code ──→ MCP Server ──→ Tandem API (:8765)
                                                    ↕
Robin sees resultaat ←── Kees Panel ←── OpenClaw Gateway (:18789)
                                                    +
                         MCP tool calls verschijnen if activiteit in Kees panel
```

- **Robin** has a Claude Max Pro account ($200/maand). No API key.
- **Claude** works UITSLUITEND via Cowork or Claude Code → MCP tools → Tandem HTTP API.
- **OpenClaw (Kees)** draait local, WebSocket to `:18789`.
- **Tandem API** draait op `:8765`, auth via Bearer token out `~/.tandem/api-token`.

---

## Documents in This Folder

| File | What | Status |
|---------|-----|--------|
| `VERFIJND-PLAN.md` | Master plan — alle details, audit, architectuur | ✅ Definitief |
| `fase-1-mcp-server.md` | Phase 1: MCP Server (2-3 sessions) | 📋 Ready to start |
| `fase-2-event-stream.md` | Phase 2: Event Stream + Context (1-2 sessions) | 📋 Waiting for phase 1 |
| `fase-3-chat-router.md` | Phase 3: Chat Router + Voice (2-3 sessions) | 📋 Waiting for phase 2 |
| `fase-4-agent-autonomie.md` | Phase 4: Agent Autonomie (2-3 sessions) | 📋 Waiting for phase 3 |
| `fase-5-multi-ai.md` | Phase 5: Multi-AI Coördinatie (1-2 sessions) | 📋 Waiting for phase 4 |
| `TODO.md` | Checklist per phase — vink af wat complete is | 📋 Keep actively updated |
| `archief/` | Oude docs (ter referentie, NIET use if instructie) | 🗄️ Archief |

### ⚠️ Archief

The folder `archief/` contains the **oude** phase docs (fase-1 t/m fase-7, ROADMAP, VISIE, ARCHITECTUUR, oude TODO). This are achterhaald door the verfijnde 5-fasen plan. **Usage ze NIET if instructie.** Ze stand er only if historische referentie.

---

## Quick Status Check

```bash
# Tandem draait?
curl http://localhost:8765/status

# TypeScript clean?
npx tsc

# OpenClaw draait?
curl http://127.0.0.1:18789 2>/dev/null && echo "OK" || echo "NIET ACTIEF"

# Git status?
git status
```

---

## Rules for elke session

1. **Read this file eerst** — then the relevante fase-document
2. **Test incrementeel** — not alles in één keer bouwen
3. **Breek nothing** — existing features must blijven werken
4. **NOOIT `console.log()` in MCP code** — stdout = MCP protocol, usage `console.error()`
5. **Commit werkende code** — about the eind or elke session
6. **Update TODO.md** — vink taken af, noteer obstakels
7. **`npm start`** to the app te starten (NIET `npm run dev`)
8. **Only `@modelcontextprotocol/sdk`** if new dependency (phase 1)

---

## Codebase Overzicht

```
tandem-browser/
├── shell/
│   ├── index.html          # Hoofd UI (tabs, chat/Kees panel, bookmarks)
│   │                       # ⚠️ Contains 200+ rules inline WebSocket code (regel 1681-1894)
│   │                       # ⚠️ OpenClaw token HARDCODED op regel 1687
│   ├── newtab.html         # New tab page
│   ├── bookmarks.html      # Bookmark manager
│   ├── settings.html       # Settings page
│   └── help.html           # Help page
├── src/
│   ├── main.ts             # Electron main process + IPC handlers
│   ├── preload.ts          # IPC bridge (25+ methods via window.tandem.*)
│   ├── api/
│   │   └── server.ts       # HTTP API server (:8765) — 118 endpoints
│   │                       # Auth middleware: skips requests WITHOUT an origin header
│   ├── bookmarks/
│   │   └── manager.ts      # Bookmark data management
│   ├── config/
│   │   └── manager.ts      # Config (~/.tandem/config.json)
│   ├── content/
│   │   └── extractor.ts    # Page content extraction (herbruiken for MCP!)
│   ├── bridge/
│   │   └── context-bridge.ts # ContextBridge (162 rules, EXTEND not rebuild)
│   ├── draw/
│   │   └── overlay.ts      # Draw mode + screenshots
│   ├── import/
│   │   └── chrome-importer.ts # Chrome data import
│   ├── agents/
│   │   └── x-scout.ts      # Agent skeleton with timing patterns (herbruiken)
│   ├── mcp/                # [FASE 1 — MCP Server + tools]
│   ├── chat/               # [FASE 3 — ChatRouter + backends]
│   └── events/             # [FASE 2 — EventStreamManager]
├── ai-implementatie/       # ← JIJ BENT HIER
├── Linux-version/          # Linux portatie docs
├── scripts/
│   └── run-electron.js     # Custom Electron launcher
├── package.json
└── tsconfig.json
```

---

## Key Info

- **Repo:** https://github.com/hydro13/tandem-browser (private)
- **Owner:** Robin Waslander (hydro13)
- **Account:** Claude Max Pro ($200/maand) — no API key
- **Taal:** Nederlands (docs, chat), Engels (code, variabelen)
- **App starten:** `npm start`
- **OpenClaw name in UI:** "Kees" 🐙
- **Claude name in UI:** "Claude" 🤖
