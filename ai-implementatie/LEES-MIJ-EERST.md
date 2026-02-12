# Tandem Browser — AI Implementatie: START HIER

> **Laatste update:** 12 februari 2026
> **Architectuur:** Claude Max Pro → Cowork/Claude Code → MCP → Tandem API
> **Geen API key nodig** — Claude werkt via MCP, niet via directe API calls.

---

## Architectuur in 30 seconden

```
Robin spreekt/typt ──→ Cowork/Claude Code ──→ MCP Server ──→ Tandem API (:8765)
                                                    ↕
Robin ziet resultaat ←── Kees Panel ←── OpenClaw Gateway (:18789)
                                                    +
                         MCP tool calls verschijnen als activiteit in Kees panel
```

- **Robin** heeft een Claude Max Pro account ($200/maand). Geen API key.
- **Claude** werkt UITSLUITEND via Cowork of Claude Code → MCP tools → Tandem HTTP API.
- **OpenClaw (Kees)** draait lokaal, WebSocket naar `:18789`.
- **Tandem API** draait op `:8765`, auth via Bearer token uit `~/.tandem/api-token`.

---

## Documenten in deze map

| Bestand | Wat | Status |
|---------|-----|--------|
| `VERFIJND-PLAN.md` | Master plan — alle details, audit, architectuur | ✅ Definitief |
| `fase-1-mcp-server.md` | Fase 1: MCP Server (2-3 sessies) | 📋 Klaar om te starten |
| `fase-2-event-stream.md` | Fase 2: Event Stream + Context (1-2 sessies) | 📋 Wacht op fase 1 |
| `fase-3-chat-router.md` | Fase 3: Chat Router + Voice (2-3 sessies) | 📋 Wacht op fase 2 |
| `fase-4-agent-autonomie.md` | Fase 4: Agent Autonomie (2-3 sessies) | 📋 Wacht op fase 3 |
| `fase-5-multi-ai.md` | Fase 5: Multi-AI Coördinatie (1-2 sessies) | 📋 Wacht op fase 4 |
| `TODO.md` | Checklist per fase — vink af wat klaar is | 📋 Actief bijhouden |
| `archief/` | Oude docs (ter referentie, NIET gebruiken als instructie) | 🗄️ Archief |

### ⚠️ Archief

De map `archief/` bevat de **oude** fase docs (fase-1 t/m fase-7, ROADMAP, VISIE, ARCHITECTUUR, oude TODO). Deze zijn achterhaald door het verfijnde 5-fasen plan. **Gebruik ze NIET als instructie.** Ze staan er alleen als historische referentie.

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

## Regels voor elke sessie

1. **Lees dit bestand eerst** — dan het relevante fase-document
2. **Test incrementeel** — niet alles in één keer bouwen
3. **Breek niets** — bestaande features moeten blijven werken
4. **NOOIT `console.log()` in MCP code** — stdout = MCP protocol, gebruik `console.error()`
5. **Commit werkende code** — aan het eind van elke sessie
6. **Update TODO.md** — vink taken af, noteer obstakels
7. **`npm start`** om de app te starten (NIET `npm run dev`)
8. **Alleen `@modelcontextprotocol/sdk`** als nieuwe dependency (fase 1)

---

## Codebase Overzicht

```
tandem-browser/
├── shell/
│   ├── index.html          # Hoofd UI (tabs, chat/Kees panel, bookmarks)
│   │                       # ⚠️ Bevat 200+ regels inline WebSocket code (regel 1681-1894)
│   │                       # ⚠️ OpenClaw token HARDCODED op regel 1687
│   ├── newtab.html         # Nieuwe tab pagina
│   ├── bookmarks.html      # Bookmark manager
│   ├── settings.html       # Settings pagina
│   └── help.html           # Help pagina
├── src/
│   ├── main.ts             # Electron main process + IPC handlers
│   ├── preload.ts          # IPC bridge (25+ methods via window.tandem.*)
│   ├── api/
│   │   └── server.ts       # HTTP API server (:8765) — 118 endpoints
│   │                       # Auth middleware: skipt requests ZONDER origin header
│   ├── bookmarks/
│   │   └── manager.ts      # Bookmark data management
│   ├── config/
│   │   └── manager.ts      # Config (~/.tandem/config.json)
│   ├── content/
│   │   └── extractor.ts    # Page content extraction (herbruiken voor MCP!)
│   ├── bridge/
│   │   └── context-bridge.ts # ContextBridge (162 regels, EXTEND niet rebuild)
│   ├── draw/
│   │   └── overlay.ts      # Draw mode + screenshots
│   ├── import/
│   │   └── chrome-importer.ts # Chrome data import
│   ├── agents/
│   │   └── x-scout.ts      # Agent skeleton met timing patronen (herbruiken)
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
- **Account:** Claude Max Pro ($200/maand) — geen API key
- **Taal:** Nederlands (docs, chat), Engels (code, variabelen)
- **App starten:** `npm start`
- **OpenClaw naam in UI:** "Kees" 🐙
- **Claude naam in UI:** "Claude" 🤖
