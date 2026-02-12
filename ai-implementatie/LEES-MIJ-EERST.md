# Tandem Browser — AI Implementatie: START HIER

## Voor elke nieuwe Claude Code sessie

Je werkt aan de AI-integratie van Tandem Browser. Lees deze documenten in volgorde:

### 1. Context begrijpen
- `VISIE.md` — Waarom we dit bouwen, de "samen één" filosofie
- `ARCHITECTUUR.md` — Technische architectuur, bestaande API's, nieuwe componenten

### 2. Weten wat je moet doen
- `TODO.md` — Master checklist, vink af wat klaar is
- `ROADMAP.md` — Alle 7 fases met sessie-indeling

### 3. Fase-specifieke details
- `fase-1-mcp-server.md` — MCP Server (Claude Code/Cowork integratie)
- `fase-2-chat-router.md` — Multi-backend chat switching
- `fase-3-claude-backend.md` — Claude API direct in browser
- `fase-4-event-stream.md` — Real-time browser events naar AI
- `fase-5-voice-flow.md` — Voice → AI → response pipeline
- `fase-6-agent-autonomie.md` — AI browsed zelfstandig
- `fase-7-multi-ai.md` — Meerdere AI's tegelijk

### 4. Cross-platform docs
- `../Linux-version/TODO.md` — Linux-specifieke aanpassingen
- `../Linux-version/ROADMAP.md` — Linux portatie plan

## Quick Status Check

```bash
# App werkt?
npm start

# TypeScript clean?
npx tsc

# API draait?
curl http://localhost:8765/status

# Git up to date?
git status
```

## Belangrijke regels

1. **Test incrementeel** — niet alles in één keer bouwen
2. **Breek niets** — bestaande features moeten blijven werken
3. **Cross-platform** — geen hardcoded paden, geen platform-only code
4. **Commit werkende code** — aan het eind van elke sessie
5. **Update TODO.md** — vink taken af, noteer obstakels
6. **npm start** gebruiken — niet `npm run dev` of `npx electron .`

## Codebase Overzicht

```
tandem-browser/
├── shell/
│   ├── index.html          # Hoofd UI (tabs, chat, bookmarks, etc.)
│   ├── newtab.html         # Nieuwe tab pagina
│   ├── bookmarks.html      # Bookmark manager
│   ├── settings.html       # Settings pagina
│   └── help.html           # Help pagina
├── src/
│   ├── main.ts             # Electron main process
│   ├── preload.ts          # IPC bridge (window.tandem.*)
│   ├── api/
│   │   └── server.ts       # HTTP API server (:8765)
│   ├── bookmarks/
│   │   └── manager.ts      # Bookmark data management
│   ├── config/
│   │   └── manager.ts      # Config (~/. tandem/config.json)
│   ├── content/
│   │   └── extractor.ts    # Page content extraction
│   ├── draw/
│   │   └── overlay.ts      # Draw mode + screenshots
│   ├── import/
│   │   └── chrome-importer.ts # Chrome data import
│   ├── agents/
│   │   └── x-scout.ts      # Voorbeeld agent (X.com)
│   ├── mcp/                 # [NIEUW - Fase 1]
│   ├── chat/                # [NIEUW - Fase 2+3]
│   ├── events/              # [NIEUW - Fase 4]
│   └── context/             # [NIEUW - Fase 4]
├── ai-implementatie/        # Dit documentatie pakket
├── Linux-version/           # Linux portatie docs
├── scripts/
│   └── run-electron.js      # Custom Electron launcher
├── package.json
└── tsconfig.json
```

## Key Contactinfo

- **Repo:** https://github.com/hydro13/tandem-browser (private)
- **Owner:** Robin Waslander (hydro13)
- **Taal:** Nederlands (code comments en chat), Engels (code en variabelen)
- **App starten:** `npm start` (NIET npm run dev)
