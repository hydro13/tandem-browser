# Tandem Browser — AI Implementatie TODO

> Master checklist for alle fases. Vink af per session.
> Elke session begint with the read or this file + the relevante phase docs.

---

## Pre-Requisites (for alle fases)

- [ ] Tandem Browser start without crashes (`npm start`)
- [ ] API server draait op :8765 (`curl http://localhost:8765/status`)
- [ ] API token exists (`cat ~/.tandem/api-token`)
- [ ] Git repo is up-to-date (`git pull`)
- [ ] TypeScript compileert clean (`npx tsc`)

---

## Phase 1: MCP Server

### Sessie 1.1 — Basis MCP Server
- [ ] `npm install @modelcontextprotocol/sdk`
- [ ] `src/mcp/server.ts` — MCP server entry point
- [ ] `src/mcp/api-client.ts` — HTTP client for Tandem API
- [ ] Tool: `tandem_navigate(url)`
- [ ] Tool: `tandem_go_back()`
- [ ] Tool: `tandem_go_forward()`
- [ ] Tool: `tandem_reload()`
- [ ] Tool: `tandem_read_page()`
- [ ] Tool: `tandem_screenshot()`
- [ ] npm script: `"mcp": "node dist/mcp/server.js"`
- [ ] tsconfig.json update (mcp files includen)
- [ ] Test: MCP server start without errors
- [ ] Test: Claude Code can `tandem_read_page()` aanroepen
- [ ] Test: Claude Code can navigeren and page verandert

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
- [ ] Test: Complete flow — navigeer → read → click → typ
- [ ] Test: Tab management works
- [ ] Test: Chat berichten verschijnen in Kees panel

### Sessie 1.3 — Resources + Context
- [ ] Resource: `tandem://page/current`
- [ ] Resource: `tandem://tabs/list`
- [ ] Resource: `tandem://chat/history`
- [ ] Tool: `tandem_get_context()`
- [ ] MCP configuration template (`tandem-mcp-config.json`)
- [ ] Documentatie: hoe MCP server configureren
- [ ] Test: Resources leesbaar vanuit Claude Code

---

## Phase 2: Chat Router

### Sessie 2.1 — Router + OpenClaw Refactor
- [ ] `ChatBackend` interface definiëren
- [ ] `OpenClawBackend` class (refactor out index.html)
- [ ] `ChatRouter` class
- [ ] Backend selector UI in Kees panel
- [ ] Test: OpenClaw works identiek about for refactor
- [ ] Test: Selector is visible and klikbaar
- [ ] Test: No regressions in chat

### Sessie 2.2 — Selector UI + State
- [ ] Backend selector styling
- [ ] Connection status indicators (groen/rood)
- [ ] State persistence (onthoud chosen backend)
- [ ] Graceful disconnect/reconnect
- [ ] "Beide" optie (UI placeholder)
- [ ] Test: Wisselen is smooth
- [ ] Test: Status indicators are accuraat

---

## Phase 3: Claude Direct Backend

> ⚠️ VERVALLEN — Robin has Max Pro, no API key. Zie VERFIJND-PLAN.md.
> Claude integratie gaat via MCP (Phase 1). Chat panel integratie via Activity Feed (Phase 3 new).

### Sessie 3.1 — Claude Backend + Tools
- [ ] `npm install @anthropic-ai/sdk`
- [ ] `ClaudeBackend` class
- [ ] API key management (config + settings UI)
- [ ] System prompt with browser context
- [ ] Tool definities (navigate, click, type, read, screenshot)
- [ ] Tool execution loop
- [ ] Streaming responses
- [ ] Test: Robin chat → Claude antwoordt
- [ ] Test: Claude can browser bedienen via tools
- [ ] Test: Streaming works (woord for woord)

### Sessie 3.2 — System Prompt + Context
- [ ] Kees persoonlijkheid in system prompt
- [ ] Auto context injection (URL, title, tabs)
- [ ] Last events meesturen
- [ ] Conversation memory management
- [ ] Content truncatie (grote page's)
- [ ] Test: Claude weet always welke page open staat
- [ ] Test: Lange gesprekken werken stabiel

---

## Phase 4: Event Stream

### Sessie 4.1 — Event Emitter + Endpoints
- [ ] `EventStreamManager` class
- [ ] Event types definiëren
- [ ] Verzamel events out existing IPC
- [ ] SSE endpoint: `GET /events/stream`
- [ ] WebSocket optie (optional)
- [ ] MCP notifications
- [ ] Test: Events visible via curl/SSE
- [ ] Test: Navigatie events komen door

### Sessie 4.2 — Context Manager
- [ ] `ContextManager` class
- [ ] Auto-update bij events
- [ ] Periodic content refresh
- [ ] Screenshot caching
- [ ] Integratie with Claude Backend
- [ ] Integratie with MCP Resources
- [ ] Test: Context always actueel
- [ ] Test: No performance impact

---

## Phase 5: Voice Flow

> ⚠️ SAMENGEVOEGD with Chat Router (Phase 3 new). Voice koppeling is ~30 rules code.

### Sessie 5.1 — Voice Pipeline
- [ ] Voice transcript → chat bericht (automatisch)
- [ ] Interim results in voice indicator
- [ ] Final result to actieve backend
- [ ] Voice knop in Kees panel (next to input)
- [ ] Push-to-talk mode
- [ ] Optioneel: text-to-speech for antwoorden
- [ ] Test: Spreek → chat → AI antwoordt
- [ ] Test: Works with alle backends
- [ ] Test: Shortcut (Cmd/Ctrl+Shift+M) works

---

## Phase 6: Agent Autonomie

### Sessie 6.1 — Task Queue + Approvals
- [ ] Task queue system
- [ ] Approval UI in Kees panel
- [ ] Auto-approve settings per actie type
- [ ] Activity log
- [ ] Test: AI start taak, pauzeert bij approval
- [ ] Test: Robin can goedkeuren/afwijzen

### Sessie 6.2 — Autonomous Browse
- [ ] Browse session management (tabs per agent)
- [ ] AI tab indicator (welke tabs door AI bestuurd)
- [ ] Research agent implementatie
- [ ] Monitoring agent implementatie
- [ ] Menselijke timing (delays)
- [ ] Test: AI onderzoekt 5 page's zelfstandig
- [ ] Test: Robin sees voortgang real-time

---

## Phase 7: Multi-AI Coördinatie

### Sessie 7.1 — Dual Backend
- [ ] "Beide" mode in chat router
- [ ] Berichten to alle actieve backends
- [ ] Antwoorden gelabeld per bron
- [ ] Selective routing (@claude, @kees)
- [ ] Inter-AI context sharing
- [ ] Test: Beide backends simultaneously actief
- [ ] Test: @-mention routing works

### Sessie 7.2 — Role-Based Agents
- [ ] Agent rollen definiëren
- [ ] Role assignment UI
- [ ] Agent-to-agent communicatie
- [ ] Unified activity log
- [ ] Test: Multiple agents parallel
- [ ] Test: Robin has overzicht

---

## Cross-Platform Checks (herhaal per fase)

Na elke fase, controleer:
- [ ] No hardcoded macOS paden
- [ ] No `process.platform === 'darwin'` without else
- [ ] Alle file paden via `path.join()` and `os.homedir()`
- [ ] Keyboard shortcuts: `CmdOrCtrl` in Electron, dynamisch in UI
- [ ] TypeScript compileert clean
- [ ] No platform-specific npm packages

---

## Sessie Start Protocol

Elke new Claude Code session that about this project works must:

1. **Read** `ai-implementatie/VISIE.md` for the context
2. **Read** `ai-implementatie/ARCHITECTUUR.md` for technische details
3. **Read** `ai-implementatie/TODO.md` (this file) for voortgang
4. **Read** the relevante phase section in `ai-implementatie/ROADMAP.md`
5. **Check** pre-requisites or the huidige session
6. **Run** `npm start` to te bevestigen that the app works
7. **Run** `npx tsc` to te bevestigen that TypeScript clean is
8. **Begin** with the first onafgevinkte taak or the huidige session
9. **Test** elke change incrementeel (not alles in één keer)
10. **Commit** werkende code about the eind or the session

---

## Sessie Einde Protocol

Aan the eind or elke session:

1. **Update** this TODO file (vink taken af)
2. **Commit** alle werkende code
3. **Documenteer** obstakels that tegenkwamen
4. **Noteer** wat the next session must oppakken
5. **Push** to GitHub (`git push origin main`)
