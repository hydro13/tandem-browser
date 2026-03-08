# AI Implementatie — TODO Checklist

> Vink af (`[x]`) wat complete is. Update this file about the eind or elke session.
> Zie fase-documenten for details per taak.

---

## Pre-requisites

- [ ] Tandem draait op `:8765` (`curl http://localhost:8765/status`)
- [ ] OpenClaw draait op `:18789`
- [ ] `npx tsc` — zero errors
- [ ] Git is clean (`git status`)

---

## Phase 1: MCP Server (2-3 sessions)

### Sessie 1.1: Basis MCP Server + Read/Navigatie Tools ✅ (13 feb 2026)
- [x] `npm install @modelcontextprotocol/sdk@^1.26.0`
- [x] `src/mcp/api-client.ts` — HTTP wrapper for Tandem API
- [x] `src/mcp/server.ts` — MCP server with stdio transport
- [x] Tool: `tandem_navigate` (POST /navigate)
- [x] Tool: `tandem_go_back` / `tandem_go_forward` / `tandem_reload`
- [x] Tool: `tandem_read_page` (GET /page-content → markdown, max 2000 woorden)
- [x] Tool: `tandem_screenshot` (GET /screenshot → MCP image content type)
- [x] Tool: `tandem_get_links` (links op huidige page)
- [x] Tool: `tandem_wait_for_load` (polling op page status)
- [x] Activity logging: elke tool call → POST /chat with from: "claude"
- [x] Error handling: duidelijke message if Tandem not draait
- [x] `npx tsc` — zero errors
- [x] Test: Cowork can `tandem_read_page()` aanroepen
- [x] Test: navigatie works, page verandert in Tandem
- [x] Test: screenshot geeft zichtbare image

### Sessie 1.2: Interactie + Tabs + Chat + Extra Tools ✅ (13 feb 2026, code added)

- [x] Tool: `tandem_click` (POST /click)
- [x] Tool: `tandem_type` (POST /type)
- [x] Tool: `tandem_scroll` (POST /scroll)
- [x] Tool: `tandem_execute_js` (POST /execute-js)
- [x] Tool: `tandem_list_tabs` (GET /tabs/list)
- [x] Tool: `tandem_open_tab` (POST /tabs/open)
- [x] Tool: `tandem_close_tab` (POST /tabs/close)
- [x] Tool: `tandem_focus_tab` (POST /tabs/focus)
- [x] Tool: `tandem_send_message` (POST /chat with from: "claude")
- [x] Tool: `tandem_get_chat_history` (GET /chat)
- [x] Tool: `tandem_search_bookmarks` (GET /bookmarks/search)
- [x] Tool: `tandem_search_history` (GET /history/search)
- [x] Tool: `tandem_get_context` (multiple calls gecombineerd)
- [x] `npx tsc` — zero errors
- [x] Test: complete flow navigeer → read → click → typ
- [x] Test: tab management (open, focus, close)
- [x] Test: chat berichten verschijnen in Kees panel

### Sessie 1.3: MCP Resources + Config + Content Truncatie ✅ (13 feb 2026, code added)

- [x] Resource: `tandem://page/current` (huidige page)
- [x] Resource: `tandem://tabs/list` (open tabs)
- [x] Resource: `tandem://chat/history` (chat berichten)
- [x] Resource: `tandem://context` (browser overzicht)
- [x] Content truncatie via ContentExtractor + turndown (max 2000 woorden)
- [x] MCP config for Cowork gedocumenteerd
- [x] MCP config for Claude Code gedocumenteerd
- [x] `npx tsc` — zero errors
- [x] Test: resources leesbaar vanuit Cowork

---

## Phase 2: Event Stream + Context Manager (1-2 sessions)

### Sessie 2.1: EventStreamManager + SSE Endpoint ✅ (13 feb 2026)

- [x] `src/events/stream.ts` — EventStreamManager class
- [x] Event types: navigation, page-loaded, tab-opened/closed/focused, click, form-submit, scroll, voice-input, screenshot, error
- [x] Ring buffer: max 100 events
- [x] SSE endpoint: GET /events/stream
- [x] Debounce: navigatie direct, scroll max 1 per 5s
- [x] Wire IPC events → EventStreamManager in main.ts
- [x] `npx tsc` — zero errors
- [x] Test: `curl http://localhost:8765/events/stream` shows events
- [x] Test: navigatie events komen door in real-time

### Sessie 2.2: ContextManager (extend ContextBridge) ✅ (13 feb 2026)

- [x] Extend existing ContextBridge (src/bridge/context-bridge.ts)
- [x] `getContextSummary()` — compact text (~500 tokens max)
- [x] Event subscriptions op EventStreamManager
- [x] Update MCP resources with live context (`tandem://context` → `/context/summary`)
- [x] MCP notifications bij events (SSE listener → `sendResourceUpdated`)
- [x] `npx tsc` — zero errors
- [x] Test: context actueel na navigatie/tab switch
- [ ] Test: no noticeable performance impact

---

## Phase 3: Chat Router + Voice Koppeling (2-3 sessions)

### Sessie 3.1+3.2: Interface + OpenClawBackend + Router UI + Voice ✅ (13 feb 2026)
- [x] ChatMessage and ChatBackend interfaces definiëren (`src/chat/interfaces.ts`)
- [x] OpenClawBackend class — WebSocket logica out index.html extraheren (`shell/chat/openclaw-backend.js`)
- [x] FIX: OpenClaw token dynamisch laden out ~/.openclaw/openclaw.json
- [x] Endpoint in server.ts for token ophalen (GET /config/openclaw-token)
- [x] ClaudeActivityBackend class — pollt /chat for MCP activiteit (`shell/chat/claude-activity-backend.js`)
- [x] ChatRouter class — routeert to actieve backend (`shell/chat/router.js`)
- [x] PanelManager + API server: `from: 'claude'` support (was only robin|kees)
- [x] Backend selector UI (🐙 Kees | 🤖 Claude)
- [x] Connection status indicators (groen dots)
- [x] Voice final transcript → chatRouter.sendMessage()
- [x] Unified chat history with source labels
- [x] Visual onderscheid per bron (border colors: openclaw=#ff6b35, claude=#7c3aed, robin=#10b981)
- [x] `npx tsc` — zero errors
- [x] State persistence in config (general.activeBackend) ✅ (13 feb 2026)
- [ ] Test: OpenClaw works IDENTIEK about for the refactor
- [ ] Test: no regressions (reconnect, streaming, history, typing)
- [ ] Test: backend wisselen is smooth
- [ ] Test: voice → actieve backend → antwoord in panel

---

## Phase 4: Agent Autonomie (2-3 sessions)

### Sessie 4.1: Task Queue + Approval System ✅ (13 feb 2026)
- [x] AITask and TaskStep interfaces (`src/agents/task-manager.ts`)
- [x] Task queue opslag: ~/.tandem/tasks/
- [x] Risk-niveaus with approval defaults (none/low/medium/high)
- [x] Approval UI in Kees panel (approval cards with goedkeuren/afwijzen)
- [x] Noodrem: Shift+Escape stopt ALLE agent-activiteit + 🛑 knop in panel header
- [x] Settings UI for autonomie levels (`shell/settings.html` → AI Autonomie section)
- [x] Vertrouwde sites configuration (textarea in settings)
- [x] API endpoints: GET/POST /tasks, /tasks/:id/approve, /tasks/:id/reject, POST /emergency-stop
- [x] Autonomy settings: GET/PATCH /autonomy
- [x] Activity log: GET /activity-log/agent
- [x] TaskManager events to renderer via IPC (approval-request, task-updated, emergency-stop)
- [x] `npx tsc` — zero errors
- [ ] Test: Robin sees approval request
- [ ] Test: noodrem stopt alles

### Sessie 4.2: Autonomous Browse Sessions ✅ (13 feb 2026)
- [x] Tab isolatie (tabSource: 'robin' | 'kees') — already aanwezig in TabManager
- [x] Visual indicator in tab header (🤖 icon + paarse border for AI tabs)
- [x] Robin can AI tab overnemen (click op AI tab = claim via POST /tabs/source)
- [x] Menselijke timing (Gaussian delay, hergebruik X-Scout patterns in MCP server)
- [x] `tandem_research()` MCP tool — autonoom zoeken, read, samenvatten
- [x] `tandem_create_task()` MCP tool — taken aanmaken with stappen
- [x] `tandem_emergency_stop()` MCP tool — noodrem via MCP
- [x] Activity log (ActivityEntry interface in TaskManager)
- [x] POST /tabs/source endpoint for tab claim
- [x] `npx tsc` — zero errors
- [ ] Test: Claude can zelfstandig 5 page's onderzoeken
- [ ] Test: Robin sees voortgang real-time

---

## Phase 5: Multi-AI Coördinatie (1-2 sessions)

### Sessie 5.1: Dual Backend + Message Routing ✅ (13 feb 2026)
- [x] DualMode class — berichten to alle backends (`shell/chat/dual-mode.js`)
- [x] @-mention routing (@claude, @kees) — case insensitive, strip prefix
- [x] Antwoorden gelabeld per bron (source: 'openclaw' | 'claude')
- [x] TabLockManager — voorkom tab conflicten (`src/agents/tab-lock-manager.ts`)
- [x] Backend selector: derde optie "🐙🤖 Beide" in index.html
- [x] API endpoints: GET/POST /tab-locks, /tab-locks/acquire, /tab-locks/release, /tab-locks/:tabId
- [x] State persistence: general.activeBackend supports 'both'
- [x] `npx tsc` — zero errors
- [ ] Test: beide backends simultaneously without crashes
- [ ] Test: @-mention routing works
- [ ] Test: no tab conflicts

---

## Sessie Protocol

### Bij start or elke session:
1. Read `LEES-MIJ-EERST.md`
2. Read the relevante `fase-X.md` document
3. Check this TODO — waar waren we gebleven?
4. Run `npx tsc` and `curl http://localhost:8765/status`

### Bij einde or elke session:
1. `npx tsc` — zero errors
2. Update this TODO (vink af, noteer obstakels)
3. Commit werkende code
4. Noteer waar the next session must beginnen
