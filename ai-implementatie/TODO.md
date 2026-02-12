# AI Implementatie — TODO Checklist

> Vink af (`[x]`) wat klaar is. Update dit bestand aan het eind van elke sessie.
> Zie fase-documenten voor details per taak.

---

## Pre-requisites

- [ ] Tandem draait op `:8765` (`curl http://localhost:8765/status`)
- [ ] OpenClaw draait op `:18789`
- [ ] `npx tsc` — zero errors
- [ ] Git is clean (`git status`)

---

## Fase 1: MCP Server (2-3 sessies)

### Sessie 1.1: Basis MCP Server + Lees/Navigatie Tools
- [ ] `npm install @modelcontextprotocol/sdk@^1.26.0`
- [ ] `src/mcp/api-client.ts` — HTTP wrapper voor Tandem API
- [ ] `src/mcp/server.ts` — MCP server met stdio transport
- [ ] Tool: `tandem_navigate` (POST /navigate)
- [ ] Tool: `tandem_go_back` / `tandem_go_forward` / `tandem_reload`
- [ ] Tool: `tandem_read_page` (GET /page-content → markdown, max 2000 woorden)
- [ ] Tool: `tandem_screenshot` (GET /screenshot → MCP image content type)
- [ ] Tool: `tandem_get_links` (links op huidige pagina)
- [ ] Tool: `tandem_wait_for_load` (polling op page status)
- [ ] Activity logging: elke tool call → POST /chat met from: "claude"
- [ ] Error handling: duidelijke melding als Tandem niet draait
- [ ] `npx tsc` — zero errors
- [ ] Test: Cowork kan `tandem_read_page()` aanroepen
- [ ] Test: navigatie werkt, pagina verandert in Tandem
- [ ] Test: screenshot geeft zichtbare image

### Sessie 1.2: Interactie + Tabs + Chat + Extra Tools
- [ ] Tool: `tandem_click` (POST /click)
- [ ] Tool: `tandem_type` (POST /type)
- [ ] Tool: `tandem_scroll` (POST /scroll)
- [ ] Tool: `tandem_execute_js` (POST /execute-js)
- [ ] Tool: `tandem_list_tabs` (GET /tabs/list)
- [ ] Tool: `tandem_open_tab` (POST /tabs/open)
- [ ] Tool: `tandem_close_tab` (POST /tabs/close)
- [ ] Tool: `tandem_focus_tab` (POST /tabs/focus)
- [ ] Tool: `tandem_send_message` (POST /chat met from: "claude")
- [ ] Tool: `tandem_get_chat_history` (GET /chat)
- [ ] Tool: `tandem_search_bookmarks` (GET /bookmarks/search)
- [ ] Tool: `tandem_search_history` (GET /history/search)
- [ ] Tool: `tandem_get_context` (meerdere calls gecombineerd)
- [ ] `npx tsc` — zero errors
- [ ] Test: complete flow navigeer → lees → klik → typ
- [ ] Test: tab management (open, focus, close)
- [ ] Test: chat berichten verschijnen in Kees panel

### Sessie 1.3: MCP Resources + Config + Content Truncatie
- [ ] Resource: `tandem://page/current` (huidige pagina)
- [ ] Resource: `tandem://tabs/list` (open tabs)
- [ ] Resource: `tandem://chat/history` (chat berichten)
- [ ] Resource: `tandem://context` (browser overzicht)
- [ ] Content truncatie via ContentExtractor + turndown (max 2000 woorden)
- [ ] MCP config voor Cowork gedocumenteerd
- [ ] MCP config voor Claude Code gedocumenteerd
- [ ] `npx tsc` — zero errors
- [ ] Test: resources leesbaar vanuit Cowork

---

## Fase 2: Event Stream + Context Manager (1-2 sessies)

### Sessie 2.1: EventStreamManager + SSE Endpoint
- [ ] `src/events/stream.ts` — EventStreamManager class
- [ ] Event types: navigation, page-loaded, tab-opened/closed/focused, click, form-submit, scroll, voice-input, screenshot, error
- [ ] Ring buffer: max 100 events
- [ ] SSE endpoint: GET /events/stream
- [ ] Debounce: navigatie direct, scroll max 1 per 5s
- [ ] Wire IPC events → EventStreamManager in main.ts
- [ ] `npx tsc` — zero errors
- [ ] Test: `curl http://localhost:8765/events/stream` toont events
- [ ] Test: navigatie events komen door in real-time

### Sessie 2.2: ContextManager (extend ContextBridge)
- [ ] Extend bestaande ContextBridge (src/bridge/context-bridge.ts)
- [ ] `getContextSummary()` — compact tekst (~500 tokens max)
- [ ] Event subscriptions op EventStreamManager
- [ ] Update MCP resources met live context
- [ ] MCP notifications bij events
- [ ] `npx tsc` — zero errors
- [ ] Test: context actueel na navigatie/tab switch
- [ ] Test: geen merkbare performance impact

---

## Fase 3: Chat Router + Voice Koppeling (2-3 sessies)

### Sessie 3.1: Interface + OpenClawBackend extractie
- [ ] ChatMessage en ChatBackend interfaces definiëren
- [ ] OpenClawBackend class — WebSocket logica uit index.html extraheren
- [ ] FIX: OpenClaw token dynamisch laden uit ~/.openclaw/openclaw.json
- [ ] Endpoint in server.ts voor token ophalen
- [ ] ClaudeActivityBackend class — pollt /chat voor MCP activiteit
- [ ] ChatRouter class — routeert naar actieve backend
- [ ] `npx tsc` — zero errors
- [ ] Test: OpenClaw werkt IDENTIEK aan voor de refactor
- [ ] Test: geen regressies (reconnect, streaming, history, typing)

### Sessie 3.2: Router UI + Voice koppeling
- [ ] Backend selector UI (🐙 Kees | 🤖 Claude)
- [ ] Connection status indicators
- [ ] State persistence in config
- [ ] Voice final transcript → chatRouter.sendMessage()
- [ ] Unified chat history met source labels
- [ ] Visueel onderscheid per bron (border colors)
- [ ] `npx tsc` — zero errors
- [ ] Test: backend wisselen is smooth
- [ ] Test: voice → actieve backend → antwoord in panel

---

## Fase 4: Agent Autonomie (2-3 sessies)

### Sessie 4.1: Task Queue + Approval System
- [ ] AITask en TaskStep interfaces
- [ ] Task queue opslag: ~/.tandem/tasks/
- [ ] Risico-niveaus met approval defaults
- [ ] Approval UI in Kees panel
- [ ] Noodrem: Escape stopt ALLE agent-activiteit
- [ ] Settings UI voor autonomie levels
- [ ] Vertrouwde sites configuratie
- [ ] `npx tsc` — zero errors
- [ ] Test: Robin ziet approval request
- [ ] Test: noodrem stopt alles

### Sessie 4.2: Autonomous Browse Sessions
- [ ] Tab isolatie (tabSource: 'robin' | 'kees')
- [ ] Visuele indicator in tab header
- [ ] Robin kan AI tab overnemen (klik = claim)
- [ ] Menselijke timing (hergebruik X-Scout patronen)
- [ ] `tandem_research()` MCP tool
- [ ] Activity log (ActivityEntry interface)
- [ ] `npx tsc` — zero errors
- [ ] Test: Claude kan zelfstandig 5 pagina's onderzoeken
- [ ] Test: Robin ziet voortgang real-time

---

## Fase 5: Multi-AI Coördinatie (1-2 sessies)

### Sessie 5.1: Dual Backend + Message Routing
- [ ] DualMode class — berichten naar alle backends
- [ ] @-mention routing (@claude, @kees)
- [ ] Antwoorden gelabeld per bron
- [ ] TabLockManager — voorkom tab conflicten
- [ ] Backend selector: derde optie "🐙🤖 Beide"
- [ ] `npx tsc` — zero errors
- [ ] Test: beide backends tegelijk zonder crashes
- [ ] Test: @-mention routing werkt
- [ ] Test: geen tab conflicten

---

## Sessie Protocol

### Bij start van elke sessie:
1. Lees `LEES-MIJ-EERST.md`
2. Lees het relevante `fase-X.md` document
3. Check deze TODO — waar waren we gebleven?
4. Run `npx tsc` en `curl http://localhost:8765/status`

### Bij einde van elke sessie:
1. `npx tsc` — zero errors
2. Update deze TODO (vink af, noteer obstakels)
3. Commit werkende code
4. Noteer waar de volgende sessie moet beginnen
