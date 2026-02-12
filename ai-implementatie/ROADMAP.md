# Tandem Browser — AI Implementatie Roadmap

## Overzicht Fases

| Fase | Naam | Doel | Geschatte sessies |
|------|------|------|-------------------|
| 1 | MCP Server | Claude Code/Cowork kan browser bedienen | 2-3 |
| 2 | Chat Router | Meerdere AI backends in Kees panel | 2 |
| 3 | Claude Direct Backend | Claude API als chat backend | 1-2 |
| 4 | Event Stream | Live browser updates naar AI | 1-2 |
| 5 | Voice Flow | Volledige voice → AI → response pipeline | 1 |
| 6 | Agent Autonomie | AI kan zelfstandig browsen | 2-3 |
| 7 | Multi-AI Coördinatie | Meerdere AI's tegelijk actief | 1-2 |

**Totaal:** 10-15 sessies, afhankelijk van complexiteit en obstakels.

---

## Fase 1: MCP Server

### Doel
Claude Code en Cowork kunnen via MCP tools de Tandem Browser bedienen. Dit is de snelste weg naar werkende AI-integratie.

### Sessie 1.1: Basis MCP Server + Navigatie Tools

**Pre-checks:**
- [ ] `npm install @modelcontextprotocol/sdk` succesvol
- [ ] Tandem API draait op :8765 (`curl http://localhost:8765/status`)
- [ ] API token beschikbaar in `~/.tandem/api-token`

**Taken:**
1. Maak `src/mcp/server.ts` — MCP server met stdio transport
2. Implementeer basis tools:
   - `tandem_navigate(url)`
   - `tandem_go_back()`
   - `tandem_go_forward()`
   - `tandem_reload()`
   - `tandem_read_page()` — geeft titel, URL, tekst
   - `tandem_screenshot()` — geeft base64 image
3. Maak `src/mcp/api-client.ts` — HTTP client voor Tandem API
4. Voeg npm script toe: `"mcp": "node dist/mcp/server.js"`
5. Test met Claude Code MCP configuratie

**Verificatie:**
- [ ] MCP server start zonder errors
- [ ] Claude Code kan `tandem_read_page()` aanroepen
- [ ] Claude Code kan `tandem_navigate()` aanroepen en pagina verandert
- [ ] Screenshot tool geeft zichtbare image terug

**Mogelijke obstakels:**
- MCP SDK versie-incompatibiliteit → check latest docs
- API token reading → zorg dat MCP server dezelfde token leest
- TypeScript compilatie → voeg mcp files toe aan tsconfig

---

### Sessie 1.2: Interactie Tools + Tab Management

**Pre-checks:**
- [ ] Basis MCP server uit sessie 1.1 werkt
- [ ] Claude Code kan verbinden met MCP server

**Taken:**
1. Voeg interactie tools toe:
   - `tandem_click(selector, text?)` — klik op element
   - `tandem_type(selector, text)` — typ tekst in veld
   - `tandem_scroll(direction, amount?)` — scroll pagina
   - `tandem_execute_js(code)` — voer JavaScript uit
2. Voeg tab tools toe:
   - `tandem_list_tabs()` — alle tabs met URL/titel
   - `tandem_open_tab(url?)` — nieuwe tab
   - `tandem_close_tab(tabId)` — tab sluiten
   - `tandem_focus_tab(tabId)` — tab focussen
3. Voeg chat tool toe:
   - `tandem_send_message(text)` — bericht in Kees panel
4. Test complete workflow: navigeer → lees → klik → typ

**Verificatie:**
- [ ] `tandem_click` klikt succesvol op elementen
- [ ] `tandem_type` typt tekst in een input veld
- [ ] Tab management werkt (open, focus, close)
- [ ] Chat berichten verschijnen in Kees panel
- [ ] Complete flow: "zoek iets op Google" werkt end-to-end

**Mogelijke obstakels:**
- CSS selector matching → bied ook text-based matching aan
- Click op dynamische elementen → wacht tot element zichtbaar is
- Cross-origin beperkingen → execute-js draait in webview context

---

### Sessie 1.3: MCP Resources + Context Tool

**Pre-checks:**
- [ ] Alle tools uit 1.1 en 1.2 werken
- [ ] Claude Code kan complete browse-flow uitvoeren

**Taken:**
1. Voeg MCP resources toe:
   - `tandem://page/current` — auto-updated pagina content
   - `tandem://tabs/list` — actuele tab lijst
   - `tandem://chat/history` — chat geschiedenis
2. Voeg context tool toe:
   - `tandem_get_context()` — alles in één call: URL, titel, tabs, recent events
3. Documenteer MCP configuratie voor gebruikers
4. Maak een `tandem-mcp-config.json` template

**Verificatie:**
- [ ] Resources zijn leesbaar vanuit Claude Code
- [ ] Context tool geeft bruikbaar overzicht
- [ ] MCP config docs zijn duidelijk en werkend

---

## Fase 2: Chat Router

### Doel
Het Kees panel kan met meerdere AI backends praten. Robin kan switchen tussen OpenClaw en Claude, of beide tegelijk gebruiken.

### Sessie 2.1: Chat Router + OpenClaw Refactor

**Pre-checks:**
- [ ] Huidige OpenClaw chat werkt in Kees panel
- [ ] Begrijp de volledige WebSocket flow (zie ARCHITECTUUR.md)

**Context voor deze sessie:**
De chat logica zit nu inline in `shell/index.html` (regels 1680-1880). Dit moet gerefactored worden naar een modulair systeem.

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
2. Refactor bestaande OpenClaw code naar `OpenClawBackend` class
3. Maak `ChatRouter` class die backends beheert
4. Update Kees panel UI: voeg backend selector toe (dropdown)
5. Zorg dat OpenClaw precies zo werkt als voorheen na refactor

**Verificatie:**
- [ ] OpenClaw chat werkt identiek aan voor de refactor
- [ ] Backend selector is zichtbaar in Kees panel
- [ ] Wisselen naar OpenClaw en terug werkt
- [ ] Geen regressies in bestaande chat functionaliteit

**Mogelijke obstakels:**
- Inline code refactoren → veel referenties naar DOM elementen
- WebSocket reconnect logica → moet behouden blijven
- Chat geschiedenis → per backend of gedeeld?

**Beslissing nodig:** Chat geschiedenis per backend of unified? Aanbeveling: unified (één chat stream, berichten getagged met bron).

---

### Sessie 2.2: Backend Selector UI + State Management

**Pre-checks:**
- [ ] Chat Router uit 2.1 werkt met OpenClaw
- [ ] Backend selector is zichtbaar

**Taken:**
1. Styling van backend selector (past bij Kees panel design)
2. State persistence: onthoud gekozen backend
3. Connection status indicators (groen/rood dot per backend)
4. Graceful disconnect/reconnect bij wisselen
5. "Beide" optie voorbereiden (UI ready, implementatie in fase 7)

**Verificatie:**
- [ ] Selector ziet er goed uit, consistent met design
- [ ] Gekozen backend wordt onthouden na herstart
- [ ] Status indicators updaten real-time
- [ ] Wisselen tussen backends is smooth (geen crashes, geen lost messages)

---

## Fase 3: Claude Direct Backend

### Doel
Claude API direct integreren als chat backend in het Kees panel. Zonder IDE, zonder Cowork — Claude praat direct in de browser.

### Sessie 3.1: Claude Backend + Tool Use

**Pre-checks:**
- [ ] Chat Router uit fase 2 werkt
- [ ] Anthropic API key beschikbaar (in config of env)
- [ ] Begrijp Anthropic Messages API met tool use

**Context voor deze sessie:**
Claude wordt een ChatBackend die de Anthropic Messages API aanroept. Claude krijgt tools die de Tandem API aanroepen, zodat Claude de browser kan bedienen vanuit het chat panel.

**Taken:**
1. Maak `ClaudeBackend` class die `ChatBackend` implementeert
2. Anthropic API key management (config, UI in settings)
3. System prompt met browser context (URL, titel, tabs)
4. Tool definities voor browser control:
   - navigate, click, type, scroll
   - read_page, screenshot
   - open_tab, close_tab
5. Tool execution loop: Claude roept tool aan → we voeren uit → stuur result terug
6. Streaming responses voor real-time chat in Kees panel

**Verificatie:**
- [ ] Claude backend verschijnt in backend selector
- [ ] Robin kan typen in chat, Claude antwoordt
- [ ] Claude kan browser bedienen via tools (navigeren, lezen, etc.)
- [ ] Streaming: antwoord verschijnt woord voor woord
- [ ] Context: Claude weet welke pagina open staat

**Mogelijke obstakels:**
- API key veilig opslaan → encrypt in config, niet plaintext
- Tool execution timing → Claude verwacht sync response, API calls zijn async
- Rate limiting → Anthropic API limieten respecteren
- Kosten → tokens kunnen oplopen bij grote pagina's. Truncate content slim.
- CORS → API calls vanuit main process, niet renderer (geen CORS issues)

**Platform-specifiek:**
- API key opslag: allemaal via `~/.tandem/config.json` (cross-platform)
- HTTP client: Node.js `fetch` of `@anthropic-ai/sdk` (cross-platform)

---

### Sessie 3.2: Claude System Prompt + Context Injection

**Pre-checks:**
- [ ] Claude backend uit 3.1 kan chatten en tools gebruiken

**Taken:**
1. Verfijn system prompt:
   - Kees persoonlijkheid en taal (Nederlands)
   - Browser context automatisch injecteren
   - Tool usage instructies
2. Context injection bij elk bericht:
   - Huidige URL + titel
   - Open tabs
   - Laatste 5 events (navigatie, clicks)
   - Optioneel: page summary
3. Conversation memory management:
   - Max context window beheer
   - Oude berichten samenvatten
   - Tool results compact houden

**Verificatie:**
- [ ] Claude weet altijd welke pagina open staat
- [ ] Claude's persoonlijkheid is consistent
- [ ] Lange gesprekken crashen niet (context management)
- [ ] Page content wordt slim getrunceerd (niet 100k tokens per bericht)

---

## Fase 4: Event Stream

### Doel
AI krijgt real-time updates van wat Robin doet in de browser. Niet alleen on-demand, maar proactief.

### Sessie 4.1: Event Emitter + SSE Endpoint

**Pre-checks:**
- [ ] API server werkt
- [ ] Bestaande `activity-webview-event` IPC werkt

**Context voor deze sessie:**
Tandem stuurt al activity events intern (navigatie, loading, etc.). We moeten deze events beschikbaar maken voor externe consumers (MCP, Claude backend, etc.).

**Taken:**
1. Maak `EventStreamManager` class
2. Verzamel events uit bestaande IPC:
   - `did-navigate` → navigation event
   - `did-finish-load` → page-loaded event
   - `tab-update` → tab-change event
   - `form-submitted` → form event
   - `activity-webview-event` → alle webview events
3. SSE endpoint: `GET /events/stream` (voor HTTP clients)
4. WebSocket optie: `ws://localhost:8765/events` (voor real-time)
5. MCP notifications: push naar MCP server

**Verificatie:**
- [ ] `curl http://localhost:8765/events/stream` toont events
- [ ] Navigatie events komen door in real-time
- [ ] Tab switches worden gerapporteerd
- [ ] Events bevatten nuttige data (URL, titel, etc.)

---

### Sessie 4.2: Context Manager + Auto-Updates

**Pre-checks:**
- [ ] Event stream uit 4.1 werkt

**Taken:**
1. `ContextManager` die browser staat bijhoudt
2. Auto-update bij events (geen polling nodig)
3. Periodic page content refresh (elke 30s als AI actief)
4. Slim screenshot caching (alleen bij significante changes)
5. Integratie met Claude Backend: context auto-injecteren
6. Integratie met MCP: resources auto-updaten

**Verificatie:**
- [ ] Context is altijd actueel
- [ ] Claude weet onmiddellijk als Robin van pagina wisselt
- [ ] Geen performance impact op browsing (lazy loading)

---

## Fase 5: Voice Flow

### Doel
Volledige pipeline: Robin spreekt → tekst → naar AI → antwoord in chat (en optioneel text-to-speech terug).

### Sessie 5.1: Voice → Chat → AI Pipeline

**Pre-checks:**
- [ ] Voice input werkt (Web Speech API)
- [ ] Chat router werkt met Claude backend
- [ ] Voice indicator UI bestaat (gebouwd in eerdere bug fix)

**Context voor deze sessie:**
Voice input is deels gebouwd. Speech-to-text werkt via Web Speech API. We moeten de pipeline voltooien zodat voice input automatisch naar de actieve AI backend gaat.

**Taken:**
1. Voice transcript → automatisch als chat bericht sturen
2. Interim results tonen in voice indicator
3. Final result → chat input → naar actieve backend
4. Optioneel: text-to-speech voor AI antwoorden
5. Voice activatie via knop in Kees panel (naast chat input)
6. Push-to-talk mode (houd knop ingedrukt)

**Verificatie:**
- [ ] Spreek een vraag → verschijnt in chat → AI antwoordt
- [ ] Interim tekst is zichtbaar tijdens het spreken
- [ ] Voice werkt met alle backends (OpenClaw, Claude)
- [ ] Cmd+Shift+M (macOS) / Ctrl+Shift+M (Linux) activeert voice

**Platform-specifiek:**
- Web Speech API: werkt in Chromium (Electron) op alle platforms
- Microfoon permissies: Electron moet mic access vragen (platform dialogs)

---

## Fase 6: Agent Autonomie

### Doel
AI kan zelfstandig browsen, onderzoeken, en taken uitvoeren — met Robin's toestemming en oversight.

### Sessie 6.1: Task Queue + Approval System

**Pre-checks:**
- [ ] Alle browser control tools werken
- [ ] Chat werkt bidirectioneel
- [ ] Event stream levert context

**Taken:**
1. Task queue systeem:
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
   - Lezen: altijd OK
   - Navigeren: meestal OK
   - Klikken/typen: vraag eerst
   - Formulieren invullen: altijd vragen
4. Activity log: wat heeft AI gedaan?

**Verificatie:**
- [ ] AI kan een taak starten ("zoek reviews van product X")
- [ ] AI pauzeert bij acties die goedkeuring vereisen
- [ ] Robin kan goedkeuren/afwijzen vanuit Kees panel
- [ ] Activity log toont alle AI acties

---

### Sessie 6.2: Autonomous Browse Sessions

**Pre-checks:**
- [ ] Task queue uit 6.1 werkt
- [ ] Approval system werkt

**Taken:**
1. Browse session management:
   - AI kan "sessies" starten in aparte tabs
   - Robin ziet welke tabs door AI bestuurd worden (indicator)
   - AI respecteert menselijke timing (delays tussen acties)
2. Research agent:
   - Gegeven een onderwerp → zoek, lees, samenvat
   - Rapporteer bevindingen in Kees chat
   - Bewaar resultaten in notities
3. Monitoring agent:
   - Check pagina's periodiek op veranderingen
   - Meld significante changes aan Robin
4. Refactor X-Scout agent om nieuw systeem te gebruiken

**Verificatie:**
- [ ] AI kan zelfstandig 5 pagina's onderzoeken
- [ ] Robin ziet AI's voortgang in real-time
- [ ] AI stopt als Robin ingrijpt
- [ ] Resultaten zijn bruikbaar en goed samengevat

---

## Fase 7: Multi-AI Coördinatie

### Doel
Meerdere AI's tegelijk actief: OpenClaw + Claude, of meerdere Claude instanties met verschillende rollen.

### Sessie 7.1: Dual Backend + Message Routing

**Pre-checks:**
- [ ] OpenClaw backend werkt
- [ ] Claude backend werkt
- [ ] Chat router ondersteunt backend switching

**Taken:**
1. "Beide" mode in chat router:
   - Bericht gaat naar alle actieve backends
   - Antwoorden komen met label: [OpenClaw] / [Claude]
   - Visueel onderscheid in chat (kleur/icon)
2. Selective routing:
   - "@claude zoek dit op" → alleen naar Claude
   - "@kees wat vind jij?" → alleen naar OpenClaw
   - Geen prefix → naar alle actieve backends
3. Inter-AI communicatie:
   - Claude kan OpenClaw's antwoorden lezen en vice versa
   - Samenwerking aan complexe taken

**Verificatie:**
- [ ] Beide backends tegelijk actief zonder crashes
- [ ] Berichten correct gerouteerd
- [ ] Antwoorden duidelijk gelabeld per bron
- [ ] Selective routing werkt met @-mentions

---

### Sessie 7.2: Role-Based AI Agents

**Pre-checks:**
- [ ] Dual backend werkt
- [ ] Agent autonomie (fase 6) werkt

**Taken:**
1. Agent rollen definiëren:
   - **Researcher**: zoekt en leest informatie
   - **Navigator**: bedient de browser
   - **Analyst**: analyseert data en pagina's
   - **Writer**: stelt teksten op
2. Role assignment UI in Kees panel
3. Agent-to-agent communicatie protocol
4. Unified activity log over alle agents

**Verificatie:**
- [ ] Meerdere agents kunnen parallel werken
- [ ] Elke agent houdt zich aan zijn rol
- [ ] Robin heeft overzicht over alle agent-activiteit
- [ ] Agents kunnen samenwerken aan complexe taken

---

## Uitbreidingen (Toekomst)

### Na de 7 fases, mogelijke uitbreidingen:

1. **Lokale LLM integratie** — Ollama/llama.cpp als backend optie
2. **Browser extensie protocol** — AI kan extensies bedienen
3. **Multi-window** — AI kan in meerdere browser windows werken
4. **Mobiele companion** — Robin geeft instructies via telefoon
5. **Workflow recorder** — Robin doet iets voor, AI herhaalt het
6. **AI-to-AI marketplace** — Agents van verschillende providers samenwerken
7. **Encrypted AI communication** — end-to-end encrypted AI chat

---

## Risico's & Mitigatie

| Risico | Impact | Mitigatie |
|--------|--------|-----------|
| API rate limiting (Anthropic) | Claude antwoordt niet | Retry logic, queue systeem, caching |
| WebSocket disconnects | OpenClaw chat stopt | Bestaande reconnect logica uitbreiden |
| Grote pagina's (>100k tokens) | Context overflow | Slim trunceren, samenvatten, chunking |
| Performance impact | Browser wordt traag | Lazy loading, debouncing, caching |
| API key exposure | Security risk | Encrypt in config, nooit in renderer |
| Cross-platform bugs | Werkt niet op Linux/Windows | Platform checks, early testing |
| MCP SDK updates | Breaking changes | Pin versies, test bij updates |

---

## Afhankelijkheden

### Nieuwe npm packages (per fase)

| Fase | Package | Versie | Doel |
|------|---------|--------|------|
| 1 | `@modelcontextprotocol/sdk` | latest | MCP server framework |
| 3 | `@anthropic-ai/sdk` | latest | Claude API client |
| 4 | - | - | Geen nieuwe dependencies |
| 5 | - | - | Web Speech API (built-in) |

### Bestaande dependencies die gebruikt worden
- `express` — API server
- `electron` — browser framework
- `ws` — WebSocket (als nodig voor event stream)
