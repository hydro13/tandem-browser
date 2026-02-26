# Tandem Browser — AI Implementatie TODO

> Master checklist voor alle fases. Vink af per sessie.
> Elke sessie begint met het lezen van dit bestand + de relevante fase docs.

---

## Pre-Requisites (voor alle fases)

- [ ] Tandem Browser start zonder crashes (`npm start`)
- [ ] API server draait op :8765 (`curl http://localhost:8765/status`)
- [ ] API token bestaat (`cat ~/.tandem/api-token`)
- [ ] Git repo is up-to-date (`git pull`)
- [ ] TypeScript compileert clean (`npx tsc`)

---

## Fase 1: MCP Server

### Sessie 1.1 — Basis MCP Server
- [ ] `npm install @modelcontextprotocol/sdk`
- [ ] `src/mcp/server.ts` — MCP server entry point
- [ ] `src/mcp/api-client.ts` — HTTP client voor Tandem API
- [ ] Tool: `tandem_navigate(url)`
- [ ] Tool: `tandem_go_back()`
- [ ] Tool: `tandem_go_forward()`
- [ ] Tool: `tandem_reload()`
- [ ] Tool: `tandem_read_page()`
- [ ] Tool: `tandem_screenshot()`
- [ ] npm script: `"mcp": "node dist/mcp/server.js"`
- [ ] tsconfig.json update (mcp bestanden includen)
- [ ] Test: MCP server start zonder errors
- [ ] Test: Claude Code kan `tandem_read_page()` aanroepen
- [ ] Test: Claude Code kan navigeren en pagina verandert

### Sessie 1.2 — Interactie + Tabs + Chat
- [ ] Tool: `tandem_click(selector, text?)`
- [ ] Tool: `tandem_type(selector, text)`
- [ ] Tool: `tandem_scroll(direction, amount?)`
- [ ] Tool: `tandem_execute_js(code)`
- [ ] Tool: `tandem_list_tabs()`
- [ ] Tool: `tandem_open_tab(url?)`
- [ ] Tool: `tandem_close_tab(tabId)`
- [ ] Tool: `tandem_focus_tab(tabId)`
- [ ] Tool: `tandem_send_message(text)`
- [ ] Tool: `tandem_get_chat_history(limit?)`
- [ ] Test: Complete flow — navigeer → lees → klik → typ
- [ ] Test: Tab management werkt
- [ ] Test: Chat berichten verschijnen in Kees panel

### Sessie 1.3 — Resources + Context
- [ ] Resource: `tandem://page/current`
- [ ] Resource: `tandem://tabs/list`
- [ ] Resource: `tandem://chat/history`
- [ ] Tool: `tandem_get_context()`
- [ ] MCP configuratie template (`tandem-mcp-config.json`)
- [ ] Documentatie: hoe MCP server configureren
- [ ] Test: Resources leesbaar vanuit Claude Code

---

## Fase 2: Chat Router

### Sessie 2.1 — Router + OpenClaw Refactor
- [ ] `ChatBackend` interface definiëren
- [ ] `OpenClawBackend` class (refactor uit index.html)
- [ ] `ChatRouter` class
- [ ] Backend selector UI in Kees panel
- [ ] Test: OpenClaw werkt identiek aan voor refactor
- [ ] Test: Selector is zichtbaar en klikbaar
- [ ] Test: Geen regressies in chat

### Sessie 2.2 — Selector UI + State
- [ ] Backend selector styling
- [ ] Connection status indicators (groen/rood)
- [ ] State persistence (onthoud gekozen backend)
- [ ] Graceful disconnect/reconnect
- [ ] "Beide" optie (UI placeholder)
- [ ] Test: Wisselen is smooth
- [ ] Test: Status indicators zijn accuraat

---

## Fase 3: Claude Direct Backend

> ⚠️ VERVALLEN — Robin heeft Max Pro, geen API key. Zie VERFIJND-PLAN.md.
> Claude integratie gaat via MCP (Fase 1). Chat panel integratie via Activity Feed (Fase 3 nieuw).

### Sessie 3.1 — Claude Backend + Tools
- [ ] `npm install @anthropic-ai/sdk`
- [ ] `ClaudeBackend` class
- [ ] API key management (config + settings UI)
- [ ] System prompt met browser context
- [ ] Tool definities (navigate, click, type, read, screenshot)
- [ ] Tool execution loop
- [ ] Streaming responses
- [ ] Test: Robin chat → Claude antwoordt
- [ ] Test: Claude kan browser bedienen via tools
- [ ] Test: Streaming werkt (woord voor woord)

### Sessie 3.2 — System Prompt + Context
- [ ] Kees persoonlijkheid in system prompt
- [ ] Auto context injection (URL, titel, tabs)
- [ ] Laatste events meesturen
- [ ] Conversation memory management
- [ ] Content truncatie (grote pagina's)
- [ ] Test: Claude weet altijd welke pagina open staat
- [ ] Test: Lange gesprekken werken stabiel

---

## Fase 4: Event Stream

### Sessie 4.1 — Event Emitter + Endpoints
- [ ] `EventStreamManager` class
- [ ] Event types definiëren
- [ ] Verzamel events uit bestaande IPC
- [ ] SSE endpoint: `GET /events/stream`
- [ ] WebSocket optie (optioneel)
- [ ] MCP notifications
- [ ] Test: Events zichtbaar via curl/SSE
- [ ] Test: Navigatie events komen door

### Sessie 4.2 — Context Manager
- [ ] `ContextManager` class
- [ ] Auto-update bij events
- [ ] Periodic content refresh
- [ ] Screenshot caching
- [ ] Integratie met Claude Backend
- [ ] Integratie met MCP Resources
- [ ] Test: Context altijd actueel
- [ ] Test: Geen performance impact

---

## Fase 5: Voice Flow

> ⚠️ SAMENGEVOEGD met Chat Router (Fase 3 nieuw). Voice koppeling is ~30 regels code.

### Sessie 5.1 — Voice Pipeline
- [ ] Voice transcript → chat bericht (automatisch)
- [ ] Interim results in voice indicator
- [ ] Final result naar actieve backend
- [ ] Voice knop in Kees panel (naast input)
- [ ] Push-to-talk mode
- [ ] Optioneel: text-to-speech voor antwoorden
- [ ] Test: Spreek → chat → AI antwoordt
- [ ] Test: Werkt met alle backends
- [ ] Test: Shortcut (Cmd/Ctrl+Shift+M) werkt

---

## Fase 6: Agent Autonomie

### Sessie 6.1 — Task Queue + Approvals
- [ ] Task queue systeem
- [ ] Approval UI in Kees panel
- [ ] Auto-approve settings per actie type
- [ ] Activity log
- [ ] Test: AI start taak, pauzeert bij approval
- [ ] Test: Robin kan goedkeuren/afwijzen

### Sessie 6.2 — Autonomous Browse
- [ ] Browse session management (tabs per agent)
- [ ] AI tab indicator (welke tabs door AI bestuurd)
- [ ] Research agent implementatie
- [ ] Monitoring agent implementatie
- [ ] Menselijke timing (delays)
- [ ] Test: AI onderzoekt 5 pagina's zelfstandig
- [ ] Test: Robin ziet voortgang real-time

---

## Fase 7: Multi-AI Coördinatie

### Sessie 7.1 — Dual Backend
- [ ] "Beide" mode in chat router
- [ ] Berichten naar alle actieve backends
- [ ] Antwoorden gelabeld per bron
- [ ] Selective routing (@claude, @kees)
- [ ] Inter-AI context sharing
- [ ] Test: Beide backends tegelijk actief
- [ ] Test: @-mention routing werkt

### Sessie 7.2 — Role-Based Agents
- [ ] Agent rollen definiëren
- [ ] Role assignment UI
- [ ] Agent-to-agent communicatie
- [ ] Unified activity log
- [ ] Test: Meerdere agents parallel
- [ ] Test: Robin heeft overzicht

---

## Cross-Platform Checks (herhaal per fase)

Na elke fase, controleer:
- [ ] Geen hardcoded macOS paden
- [ ] Geen `process.platform === 'darwin'` zonder else
- [ ] Alle file paden via `path.join()` en `os.homedir()`
- [ ] Keyboard shortcuts: `CmdOrCtrl` in Electron, dynamisch in UI
- [ ] TypeScript compileert clean
- [ ] Geen platform-specifieke npm packages

---

## Sessie Start Protocol

Elke nieuwe Claude Code sessie die aan dit project werkt moet:

1. **Lees** `ai-implementatie/VISIE.md` voor de context
2. **Lees** `ai-implementatie/ARCHITECTUUR.md` voor technische details
3. **Lees** `ai-implementatie/TODO.md` (dit bestand) voor voortgang
4. **Lees** de relevante fase sectie in `ai-implementatie/ROADMAP.md`
5. **Check** pre-requisites van de huidige sessie
6. **Run** `npm start` om te bevestigen dat de app werkt
7. **Run** `npx tsc` om te bevestigen dat TypeScript clean is
8. **Begin** met de eerste onafgevinkte taak van de huidige sessie
9. **Test** elke change incrementeel (niet alles in één keer)
10. **Commit** werkende code aan het eind van de sessie

---

## Sessie Einde Protocol

Aan het eind van elke sessie:

1. **Update** dit TODO bestand (vink taken af)
2. **Commit** alle werkende code
3. **Documenteer** obstakels die tegenkwamen
4. **Noteer** wat de volgende sessie moet oppakken
5. **Push** naar GitHub (`git push origin main`)
