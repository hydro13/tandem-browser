# Tandem Browser — AI Implementatie Roadmap

## Overzicht Fases

| Phase | Name | Goal | Geschatte sessions |
|------|------|------|-------------------|
| 1 | MCP Server | Claude Code/Cowork can browser bedienen | 2-3 |
| 2 | Chat Router | Multiple AI backends in Kees panel | 2 |
| 3 | Claude Direct Backend | Claude API if chat backend | 1-2 |
| 4 | Event Stream | Live browser updates to AI | 1-2 |
| 5 | Voice Flow | Volledige voice → AI → response pipeline | 1 |
| 6 | Agent Autonomie | AI can zelfstandig browsen | 2-3 |
| 7 | Multi-AI Coördinatie | Multiple AI's simultaneously actief | 1-2 |

**Total:** 10-15 sessions, depending on complexity and obstacles.

---

## Phase 1: MCP Server

### Goal
Claude Code and Cowork can via MCP tools the Tandem Browser bedienen. Dit is the snelste weg to werkende AI-integratie.

### Sessie 1.1: Basis MCP Server + Navigatie Tools

**Pre-checks:**
- [ ] `npm install @modelcontextprotocol/sdk` succesvol
- [ ] Tandem API draait op :8765 (`curl http://localhost:8765/status`)
- [ ] API token beschikbaar in `~/.tandem/api-token`

**Taken:**
1. Maak `src/mcp/server.ts` — MCP server with stdio transport
2. Implementeer basis tools:
   - `tandem_navigate(url)`
   - `tandem_go_back()`
   - `tandem_go_forward()`
   - `tandem_reload()`
   - `tandem_read_page()` — geeft title, URL, text
   - `tandem_screenshot()` — geeft base64 image
3. Maak `src/mcp/api-client.ts` — HTTP client for Tandem API
4. Voeg npm script toe: `"mcp": "node dist/mcp/server.js"`
5. Test with Claude Code MCP configuration

**Verificatie:**
- [ ] MCP server start without errors
- [ ] Claude Code can `tandem_read_page()` aanroepen
- [ ] Claude Code can `tandem_navigate()` aanroepen and page verandert
- [ ] Screenshot tool geeft zichtbare image terug

**Mogelijke obstakels:**
- MCP SDK versie-incompatibiliteit → check latest docs
- API token reading → zorg that MCP server the same token leest
- TypeScript compilatie → voeg mcp files toe about tsconfig

---

### Sessie 1.2: Interactie Tools + Tab Management

**Pre-checks:**
- [ ] Basis MCP server out session 1.1 works
- [ ] Claude Code can verbinden with MCP server

**Taken:**
1. Voeg interactie tools toe:
   - `tandem_click(selector, text?)` — click op element
   - `tandem_type(selector, text)` — typ text in field
   - `tandem_scroll(direction, amount?)` — scroll page
   - `tandem_execute_js(code)` — voer JavaScript out
2. Voeg tab tools toe:
   - `tandem_list_tabs()` — alle tabs with URL/title
   - `tandem_open_tab(url?)` — new tab
   - `tandem_close_tab(tabId)` — tab sluiten
   - `tandem_focus_tab(tabId)` — tab focussen
3. Voeg chat tool toe:
   - `tandem_send_message(text)` — bericht in Kees panel
4. Test complete workflow: navigeer → read → click → typ

**Verificatie:**
- [ ] `tandem_click` clicks succesvol op elementen
- [ ] `tandem_type` typt text in a input field
- [ ] Tab management works (open, focus, close)
- [ ] Chat berichten verschijnen in Kees panel
- [ ] Complete flow: "zoek iets op Google" works end-to-end

**Mogelijke obstakels:**
- CSS selector matching → bied also text-based matching about
- Click op dynamische elementen → wait tot element visible is
- Cross-origin beperkingen → execute-js draait in webview context

---

### Sessie 1.3: MCP Resources + Context Tool

**Pre-checks:**
- [ ] Alle tools out 1.1 and 1.2 werken
- [ ] Claude Code can complete browse-flow uitvoeren

**Taken:**
1. Voeg MCP resources toe:
   - `tandem://page/current` — auto-updated page content
   - `tandem://tabs/list` — actuele tab list
   - `tandem://chat/history` — chat geschiedenis
2. Voeg context tool toe:
   - `tandem_get_context()` — alles in één call: URL, title, tabs, recent events
3. Documenteer MCP configuration for users
4. Maak a `tandem-mcp-config.json` template

**Verificatie:**
- [ ] Resources are leesbaar vanuit Claude Code
- [ ] Context tool geeft bruikbaar overzicht
- [ ] MCP config docs are duidelijk and werkend

---

## Phase 2: Chat Router

### Goal
The Kees panel can with multiple AI backends praten. Robin can switchen between OpenClaw and Claude, or beide simultaneously use.

### Sessie 2.1: Chat Router + OpenClaw Refactor

**Pre-checks:**
- [ ] Huidige OpenClaw chat works in Kees panel
- [ ] Begrijp the full WebSocket flow (zie ARCHITECTUUR.md)

**Context for this session:**
The chat logica zit nu inline in `shell/index.html` (rules 1680-1880). Dit must gerefactored be to a modulair system.

**Taken:**
1. Maak `ChatBackend` interface (TypeScript):
   ```typescript
   interface ChatBackend {
     id: string;
     name: string;
     connect(): Promise<void>;
     disconnect(): Promise<void>;
     sendMessage(text: string): Promise<void>;
     onMessage(cb: (msg: ChatMessage) => void): void;
     onTyping(cb: (typing: boolean) => void): void;
     isConnected(): boolean;
   }
   ```
2. Refactor existing OpenClaw code to `OpenClawBackend` class
3. Maak `ChatRouter` class that backends beheert
4. Update Kees panel UI: voeg backend selector toe (dropdown)
5. Zorg that OpenClaw precies zo works if voorheen na refactor

**Verificatie:**
- [ ] OpenClaw chat works identiek about for the refactor
- [ ] Backend selector is visible in Kees panel
- [ ] Wisselen to OpenClaw and terug works
- [ ] No regressions in existing chat functionaliteit

**Mogelijke obstakels:**
- Inline code refactoren → veel referenties to DOM elementen
- WebSocket reconnect logica → must behouden blijven
- Chat geschiedenis → per backend or shared?

**Beslissing nodig:** Chat geschiedenis per backend or unified? Aanbeveling: unified (één chat stream, berichten getagged with bron).

---

### Sessie 2.2: Backend Selector UI + State Management

**Pre-checks:**
- [ ] Chat Router out 2.1 works with OpenClaw
- [ ] Backend selector is visible

**Taken:**
1. Styling or backend selector (past bij Kees panel design)
2. State persistence: onthoud chosen backend
3. Connection status indicators (groen/rood dot per backend)
4. Graceful disconnect/reconnect bij wisselen
5. "Beide" optie voorbereiden (UI ready, implementatie in phase 7)

**Verificatie:**
- [ ] Selector sees er goed out, consistent with design
- [ ] Chosen backend is onthouden na herstart
- [ ] Status indicators updaten real-time
- [ ] Wisselen between backends is smooth (no crashes, no lost messages)

---

## Phase 3: Claude Direct Backend

### Goal
Claude API direct integreren if chat backend in the Kees panel. Without IDE, without Cowork — Claude praat direct in the browser.

### Sessie 3.1: Claude Backend + Tool Use

**Pre-checks:**
- [ ] Chat Router out phase 2 works
- [ ] Anthropic API key beschikbaar (in config or env)
- [ ] Begrijp Anthropic Messages API with tool use

**Context for this session:**
Claude is a ChatBackend that the Anthropic Messages API aanroept. Claude gets tools that the Tandem API aanroepen, zodat Claude the browser can bedienen vanuit the chat panel.

**Taken:**
1. Maak `ClaudeBackend` class that `ChatBackend` implementeert
2. Anthropic API key management (config, UI in settings)
3. System prompt with browser context (URL, title, tabs)
4. Tool definities for browser control:
   - navigate, click, type, scroll
   - read_page, screenshot
   - open_tab, close_tab
5. Tool execution loop: Claude roept tool about → we voeren out → stuur result terug
6. Streaming responses for real-time chat in Kees panel

**Verificatie:**
- [ ] Claude backend appears in backend selector
- [ ] Robin can typen in chat, Claude antwoordt
- [ ] Claude can browser bedienen via tools (navigeren, read, etc.)
- [ ] Streaming: antwoord appears woord for woord
- [ ] Context: Claude weet welke page open staat

**Mogelijke obstakels:**
- API key veilig save → encrypt in config, not plaintext
- Tool execution timing → Claude verwacht sync response, API calls are async
- Rate limiting → Anthropic API limieten respecteren
- Kosten → tokens can oplopen bij grote page's. Truncate content slim.
- CORS → API calls vanuit main process, not renderer (no CORS issues)

**Platform-specifiek:**
- API key opslag: allemaal via `~/.tandem/config.json` (cross-platform)
- HTTP client: Node.js `fetch` or `@anthropic-ai/sdk` (cross-platform)

---

### Sessie 3.2: Claude System Prompt + Context Injection

**Pre-checks:**
- [ ] Claude backend out 3.1 can chatten and tools use

**Taken:**
1. Verfijn system prompt:
   - Kees persoonlijkheid and taal (Nederlands)
   - Browser context automatisch injecteren
   - Tool usage instructies
2. Context injection bij elk bericht:
   - Huidige URL + title
   - Open tabs
   - Last 5 events (navigatie, clicks)
   - Optioneel: page summary
3. Conversation memory management:
   - Max context window beheer
   - Oude berichten samenvatten
   - Tool results compact houden

**Verificatie:**
- [ ] Claude weet always welke page open staat
- [ ] Claude's persoonlijkheid is consistent
- [ ] Lange gesprekken crashen not (context management)
- [ ] Page content is slim getrunceerd (not 100k tokens per bericht)

---

## Phase 4: Event Stream

### Goal
AI gets real-time updates or wat Robin doet in the browser. Not only on-demand, but proactief.

### Sessie 4.1: Event Emitter + SSE Endpoint

**Pre-checks:**
- [ ] API server works
- [ ] Existing `activity-webview-event` IPC works

**Context for this session:**
Tandem stuurt already activity events intern (navigatie, loading, etc.). We must this events beschikbaar maken for externe consumers (MCP, Claude backend, etc.).

**Taken:**
1. Maak `EventStreamManager` class
2. Verzamel events out existing IPC:
   - `did-navigate` → navigation event
   - `did-finish-load` → page-loaded event
   - `tab-update` → tab-change event
   - `form-submitted` → form event
   - `activity-webview-event` → alle webview events
3. SSE endpoint: `GET /events/stream` (for HTTP clients)
4. WebSocket optie: `ws://localhost:8765/events` (for real-time)
5. MCP notifications: push to MCP server

**Verificatie:**
- [ ] `curl http://localhost:8765/events/stream` shows events
- [ ] Navigatie events komen door in real-time
- [ ] Tab switches be gerapporteerd
- [ ] Events bevatten nuttige data (URL, title, etc.)

---

### Sessie 4.2: Context Manager + Auto-Updates

**Pre-checks:**
- [ ] Event stream out 4.1 works

**Taken:**
1. `ContextManager` that browser staat bijhoudt
2. Auto-update bij events (no polling nodig)
3. Periodic page content refresh (elke 30s if AI actief)
4. Slim screenshot caching (only bij significante changes)
5. Integratie with Claude Backend: context auto-injecteren
6. Integratie with MCP: resources auto-updaten

**Verificatie:**
- [ ] Context is always actueel
- [ ] Claude weet onmiddellijk if Robin or page wisselt
- [ ] No performance impact op browsing (lazy loading)

---

## Phase 5: Voice Flow

### Goal
Volledige pipeline: Robin spreekt → text → to AI → antwoord in chat (and optional text-to-speech terug).

### Sessie 5.1: Voice → Chat → AI Pipeline

**Pre-checks:**
- [ ] Voice input works (Web Speech API)
- [ ] Chat router works with Claude backend
- [ ] Voice indicator UI exists (built in eerdere bug fix)

**Context for this session:**
Voice input is deels built. Speech-to-text works via Web Speech API. We must the pipeline voltooien zodat voice input automatisch to the actieve AI backend gaat.

**Taken:**
1. Voice transcript → automatisch if chat bericht sturen
2. Interim results tonen in voice indicator
3. Final result → chat input → to actieve backend
4. Optioneel: text-to-speech for AI antwoorden
5. Voice activatie via knop in Kees panel (next to chat input)
6. Push-to-talk mode (houd knop ingedrukt)

**Verificatie:**
- [ ] Spreek a question → appears in chat → AI antwoordt
- [ ] Interim text is visible tijdens the spreken
- [ ] Voice works with alle backends (OpenClaw, Claude)
- [ ] Cmd+Shift+M (macOS) / Ctrl+Shift+M (Linux) activeert voice

**Platform-specifiek:**
- Web Speech API: works in Chromium (Electron) op alle platforms
- Microfoon permissies: Electron must mic access questions (platform dialogs)

---

## Phase 6: Agent Autonomie

### Goal
AI can zelfstandig browsen, onderzoeken, and taken uitvoeren — with Robin's toestemming and oversight.

### Sessie 6.1: Task Queue + Approval System

**Pre-checks:**
- [ ] Alle browser control tools werken
- [ ] Chat works bidirectioneel
- [ ] Event stream levert context

**Taken:**
1. Task queue system:
   ```typescript
   interface AITask {
     id: string;
     description: string;
     steps: TaskStep[];
     status: 'pending' | 'running' | 'waiting-approval' | 'done';
     results: any[];
   }
   ```
2. Approval UI in Kees panel:
   - "Kees wil [actie] uitvoeren. Goedkeuren?"
   - Approve / Reject / Modify knoppen
3. Auto-approve settings per actie type:
   - Lezen: always OK
   - Navigeren: meestal OK
   - Klikken/typen: question eerst
   - Formulieren invullen: always questions
4. Activity log: wat has AI gedaan?

**Verificatie:**
- [ ] AI can a taak starten ("zoek reviews or product X")
- [ ] AI pauzeert bij acties that approval vereisen
- [ ] Robin can goedkeuren/afwijzen vanuit Kees panel
- [ ] Activity log shows alle AI acties

---

### Sessie 6.2: Autonomous Browse Sessions

**Pre-checks:**
- [ ] Task queue out 6.1 works
- [ ] Approval system works

**Taken:**
1. Browse session management:
   - AI can "sessions" starten in aparte tabs
   - Robin sees welke tabs door AI bestuurd be (indicator)
   - AI respecteert menselijke timing (delays between acties)
2. Research agent:
   - Gegeven a onderwerp → zoek, read, samenvat
   - Rapporteer bevindingen in Kees chat
   - Bewaar resultaten in notes
3. Monitoring agent:
   - Check page's periodiek op veranderingen
   - Meld significante changes about Robin
4. Refactor X-Scout agent to new system te use

**Verificatie:**
- [ ] AI can zelfstandig 5 page's onderzoeken
- [ ] Robin sees AI's voortgang in real-time
- [ ] AI stopt if Robin ingrijpt
- [ ] Resultaten are bruikbaar and goed samengevat

---

## Phase 7: Multi-AI Coördinatie

### Goal
Multiple AI's simultaneously actief: OpenClaw + Claude, or multiple Claude instanties with verschillende rollen.

### Sessie 7.1: Dual Backend + Message Routing

**Pre-checks:**
- [ ] OpenClaw backend works
- [ ] Claude backend works
- [ ] Chat router ondersteunt backend switching

**Taken:**
1. "Beide" mode in chat router:
   - Bericht gaat to alle actieve backends
   - Antwoorden komen with label: [OpenClaw] / [Claude]
   - Visual onderscheid in chat (color/icon)
2. Selective routing:
   - "@claude zoek this op" → only to Claude
   - "@kees wat vind jij?" → only to OpenClaw
   - No prefix → to alle actieve backends
3. Inter-AI communicatie:
   - Claude can OpenClaw's antwoorden read and vice versa
   - Samenwerking about complexe taken

**Verificatie:**
- [ ] Beide backends simultaneously actief without crashes
- [ ] Berichten correct gerouteerd
- [ ] Antwoorden duidelijk gelabeld per bron
- [ ] Selective routing works with @-mentions

---

### Sessie 7.2: Role-Based AI Agents

**Pre-checks:**
- [ ] Dual backend works
- [ ] Agent autonomie (phase 6) works

**Taken:**
1. Agent rollen definiëren:
   - **Researcher**: zoekt and leest informatie
   - **Navigator**: bedient the browser
   - **Analyst**: analyseert data and page's
   - **Writer**: stelt teksten op
2. Role assignment UI in Kees panel
3. Agent-to-agent communicatie protocol
4. Unified activity log over alle agents

**Verificatie:**
- [ ] Multiple agents can parallel werken
- [ ] Elke agent houdt zich about are rol
- [ ] Robin has overzicht over alle agent-activiteit
- [ ] Agents can samenwerken about complexe taken

---

## Uitbreidingen (Toekomst)

### Na the 7 fases, mogelijke uitbreidingen:

1. **Lokale LLM integratie** — Ollama/llama.cpp if backend optie
2. **Browser extensie protocol** — AI can extensies bedienen
3. **Multi-window** — AI can in multiple browser windows werken
4. **Mobiele companion** — Robin geeft instructies via telefoon
5. **Workflow recorder** — Robin doet iets for, AI herhaalt the
6. **AI-to-AI marketplace** — Agents or verschillende providers samenwerken
7. **Encrypted AI communication** — end-to-end encrypted AI chat

---

## Risk's & Mitigation

| Risk | Impact | Mitigation |
|--------|--------|-----------|
| API rate limiting (Anthropic) | Claude antwoordt not | Retry logic, queue system, caching |
| WebSocket disconnects | OpenClaw chat stopt | Existing reconnect logica uitbreiden |
| Grote page's (>100k tokens) | Context overflow | Slim trunceren, samenvatten, chunking |
| Performance impact | Browser is traag | Lazy loading, debouncing, caching |
| API key exposure | Security risk | Encrypt in config, nooit in renderer |
| Cross-platform bugs | Works not op Linux/Windows | Platform checks, early testing |
| MCP SDK updates | Breaking changes | Pin versies, test bij updates |

---

## Afhankelijkheden

### New npm packages (per fase)

| Phase | Package | Versie | Goal |
|------|---------|--------|------|
| 1 | `@modelcontextprotocol/sdk` | latest | MCP server framework |
| 3 | `@anthropic-ai/sdk` | latest | Claude API client |
| 4 | - | - | No new dependencies |
| 5 | - | - | Web Speech API (built-in) |

### Existing dependencies that uses be
- `express` — API server
- `electron` — browser framework
- `ws` — WebSocket (if nodig for event stream)
