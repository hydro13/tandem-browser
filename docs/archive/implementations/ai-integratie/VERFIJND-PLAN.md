# Tandem Browser — Verfijnd AI Implementatie Plan

> Audit & optimalisatie door Cowork (Claude Opus) — 12 februari 2026
> Gebaseerd op cross-referentie or the originele plan tegen the werkelijke codebase.
> **HERZIEN:** Architectuur aangepast for Claude Max Pro (no API key, MCP-only).

---

## KRITIEKE ARCHITECTUURWIJZIGING

Robin has a **Claude Max Pro account** ($200/maand). Dit betekent:

- **NO Anthropic API key** — Claude does not work through direct API calls
- **NO API costs** — flat-rate subscription, unlimited usage
- **Claude works UITSLUITEND via Claude Code/Cowork** → MCP → Tandem API
- **Phase 3 (Claude Direct Backend) VERVALT** — er is no API to about te roepen

**New architectuur:**
```
Robin spreekt/typt ──→ Cowork/Claude Code ──→ MCP Server ──→ Tandem API (:8765)
                                                    ↕
Robin sees resultaat ←── Kees Panel ←── OpenClaw Gateway (:18789)
                                                    +
                             MCP tool calls verschijnen if activiteit in browser
```

**MCP is DE primaire Claude-integratie.** Alles wat Claude doet with Tandem gaat via MCP tools. The Kees panel blijft for OpenClaw, with a activity feed that shows zien wat Claude/Cowork about the doen is.

---

## Samenvatting

The originele plan (7 fases, 13 documenten) is **85% accuraat** for API docs and architectuur. Maar the aanname that Claude via directe API calls works is **fout** — Robin has no API key and has that also not nodig.

Dit document contains:
1. Wat klopt and we behouden
2. Wat fout is and we must fixen
3. Wat ontbreekt and we must add
4. The new faseorder (5 fases in plaats or 7)
5. Concrete aanbevelingen per fase

---

## 1. Wat klopt (behouden)

**API endpoints:** Alle 118 endpoints are correct gedocumenteerd. The MCP server can this 1-op-1 wrappen.

**Twee-lagen architectuur:** The "webview is heilig terrein" filosofie is correct and cruciaal. AI-code belongs in Layer 2 (main process + shell), nooit in the webview.

**IPC bridge:** The `window.tandem.*` API has 25+ methodes and works. The preload bridge is fully.

**Agent referentie:** `src/agents/x-scout.ts` exists if skeleton with goede timing-patterns that herbruikbaar are for phase 4.

**Chat locatie:** OpenClaw WebSocket code zit op rules 1681-1894 in `shell/index.html`. Protocol details (RPC, streaming states, reconnect) are accuraat.

**Cross-platform approach:** The focus op `path.join()`, `os.homedir()`, and platform checks is goed.

---

## 2. Wat fout is (must gefixed)

### 2.1 Auth middleware is permissiever then gedocumenteerd

**Plan zegt:** "Localhost requests exempt from auth"

**Werkelijkheid:** The auth middleware in `server.ts` (rules 162-185) shows ALLE requests without `origin` header door:

```
if (!origin) return next();
```

Dit betekent that **elke lokale process** (not only localhost requests) the API can aanroepen without token. For the MCP server is this handig (MCP server stuurt no origin header), but the is a beveiligingsrisico if andere software op the machine draait.

**Aanbeveling:** For phase 1 is this acceptabel (MCP server draait local). Maar bij phase 4 (agent autonomie) must this strikter: ofwel always token vereisen, ofwel a whitelist or bekende callers.

### 2.2 OpenClaw token is hardcoded

**Plan documenteert:** `AUTH_TOKEN = 'de07381e...'` if hardcoded string in shell/index.html regel 1687.

**Probleem:** Dit token zou out `~/.openclaw/openclaw.json` gelezen must be. Bij a token-rotatie breekt the chat.

**Aanbeveling:** Bij phase 3 (Chat Router refactoring) the token dynamisch laden via a API call or IPC bridge:
```
GET /config/openclaw-token → leest ~/.openclaw/openclaw.json → gateway.auth.token
```

### 2.3 Context Bridge exists already, but plan negeert this

**Plan zegt:** "src/context/manager.ts must built be"

**Werkelijkheid:** `src/bridge/context-bridge.ts` exists already (162 rules) with:
- `recordSnapshot()` — page context save
- `getRecent()` — recente page's ophalen
- `search()` — doorzoeken
- `getPage()` — specific URL context
- `addNote()` — handmatige notes
- Opslag in `~/.tandem/context/`

**Aanbeveling:** Extend the existing ContextBridge, bouw not from scratch.

### 2.4 Voice is verder then the plan denkt

**Plan zegt:** Hele phase nodig for voice → AI pipeline

**Werkelijkheid:** Voice is already 80% complete. Wat ontbreekt: only koppeling voice transcript → ChatRouter → actieve backend (~30 rules).

**Aanbeveling:** Samenvoegen with Chat Router fase.

### 2.5 OUDE FASE 3 (Claude Direct Backend) IS ONMOGELIJK

**Plan zegt:** Integreer the Anthropic Messages API direct if chat backend.

**Werkelijkheid:** Robin has no API key. He has a Max Pro account. Claude works uitsluitend via Claude Code/Cowork → MCP.

**Oplossing:** Vervang the "Claude Direct Backend" with a **Claude Activity Feed** in the Kees panel. Dit shows wat Claude Code/Cowork about the doen is wanneer the MCP tools uses:

```
[🤖 Claude via Cowork]
  → tandem_navigate("https://google.com")
  → tandem_read_page() — "Google Search Results..."
  → tandem_click("#result-1")
  → "Ik heb the first resultaat geopend for you."
```

Dit geeft Robin zichtbaarheid in wat Claude doet, without directe API integratie.

### 2.6 No API key management, no token budget nodig

The hele section over API key opslag (safeStorage), token budgettering, model selectie, and kosten-monitoring is **not or toepassing**. Claude Max Pro is a vast bedrag. Robin uses wat he wil.

Content truncatie is WEL still relevant — grote page's vullen Claude's context window op, also via MCP.

---

## 3. Wat ontbreekt (must added)

### 3.1 MCP Activity Feed in Kees Panel

Wanneer Claude Code/Cowork MCP tools aanroept, must Robin this ZIEN in the Kees panel. Dit is the "Claude" aanwezigheid in the browser.

**Implementatie:**
- The MCP server logt elke tool call to Tandem's chat API (`POST /chat`)
- Kees panel shows this if "[🤖 Claude] actie: navigeert to google.com"
- Robin can reageren in the panel (bericht gaat to chat history, Claude leest this via MCP resource)

**Bidirectioneel:**
- Robin typt in Kees panel → opgeslagen in chat history
- Claude Code leest chat via `tandem_get_chat_history()` MCP tool
- Claude Code stuurt antwoord via `tandem_send_message()` MCP tool
- Kees panel shows antwoord

This creates a **chat loop** between Robin (browser) and Claude (Cowork) WITHOUT direct API calls.

### 3.2 Fallback & error recovery

**Scenario's that not gedekt are:**
- OpenClaw gateway is down → chat panel shows only errors
- Tandem API crash → MCP server gets connection refused
- MCP tool execution timeout → Claude Code wait

**Add:**
- Per-backend health check (ping elke 30s)
- Tool execution timeout: 30s per tool call
- Graceful degradation: duidelijke foutmelding if Tandem not draait
- MCP server geeft context-rijke errors terug

### 3.3 MCP Server lifecycle

Claude Code/Cowork starten the MCP server zelf via hun config. Tandem must only draaien (API op :8765).

**Correct model:**
```
1. Robin start Tandem Browser (npm start) → API draait op :8765
2. Robin opens Cowork → Cowork leest MCP config → start tandem-mcp bridge
3. tandem-mcp maakt HTTP calls to localhost:8765
4. If Tandem not draait → MCP server geeft foutmelding
```

**Documenteer this duidelijk** in the MCP setup guide.

### 3.4 Slim content trunceren

Page's can 50.000+ woorden are. Also via MCP fills this Claude's context.

**Strategie:**
1. Usage the existing `ContentExtractor` (src/content/extractor.ts) for structured extraction
2. Prioriteer: title → headings → main content → sidebar
3. Strip navigatie, footer, ads
4. `tandem_read_page` stuurt markdown, not HTML (~60% minder tokens)
5. `tandem_screenshot` resize to max 1024px breed

### 3.5 Cowork MCP config template

Robin uses primair Cowork. The MCP config must daar juist ingesteld be:

**For Cowork:** Configuration via the Cowork plugin/MCP settings interface.

**For Claude Code (backup):** `~/.claude/settings.json`:
```json
{
  "mcpServers": {
    "tandem": {
      "command": "node",
      "args": ["/Users/robinwaslander/Documents/dev/tandem-browser/dist/mcp/server.js"]
    }
  }
}
```

---

## 4. New faseorder (5 fases)

The oude 7 fases are teruggebracht to **5 fases** door:
- Phase 3 (Claude Direct Backend) → **vervalt** (no API key)
- Phase 5 (Voice Flow) → **opgegaan** in phase 3 (Chat Router)
- Phase 4 (Event Stream) → **to voren** if phase 2

```
NIEUW PLAN (5 FASES):

Phase 1: MCP Server                    [2-3 sessions]
  → Claude Code/Cowork can Tandem bedienen via MCP tools
  → Activity feed to Kees panel
  → Content truncatie

Phase 2: Event Stream + Context        [1-2 sessions]
  → Real-time browser events beschikbaar for MCP
  → Extend existing ContextBridge
  → MCP resource notifications

Phase 3: Chat Router + Voice           [2-3 sessions]
  → OpenClaw refactoring to modulair system
  → Claude Activity Backend (shows MCP activiteit)
  → Voice → router koppeling
  → OpenClaw token dynamisch laden

Phase 4: Agent Autonomie               [2-3 sessions]
  → Task queue + approval system
  → Autonomous browse via MCP
  → Behavioral timing out X-Scout patterns

Phase 5: Multi-AI Coördinatie          [1-2 sessions]
  → OpenClaw + Claude parallel
  → @-mention routing
  → TabLockManager

TOTAAL: 8-13 sessions
```

### Why 5 in plaats or 7?

1. **No Claude API backend** = no phase 3/4 out oud plan
2. **Voice is triviaal** = no aparte fase, onderdeel or Chat Router
3. **MCP is krachtiger** = vervangt the noodzaak for directe API integratie
4. **Robin's Max Pro account** = onbeperkt Claude via Cowork, no kosten-optimalisatie nodig

---

## 5. Concrete aanbevelingen per fase

### Phase 1: MCP Server (2-3 sessions)

**Sessie 1.1: Basis MCP Server + Read/Navigatie Tools**

Pre-checks:
- [ ] Tandem draait op :8765 (`curl http://localhost:8765/status`)
- [ ] `npm install @modelcontextprotocol/sdk` succesvol
- [ ] API token exists (`cat ~/.tandem/api-token`)

Taken:
1. Maak `src/mcp/api-client.ts` — HTTP wrapper for Tandem API
   - Leest auth token out `~/.tandem/api-token`
   - Maar: auth middleware skipt no-origin requests, dus token is optional local
2. Maak `src/mcp/server.ts` — MCP server with stdio transport
   - **BELANGRIJK:** Usage `console.error()` for logging, NOOIT `console.log()` (stdout = MCP protocol)
3. Implementeer tools:
   - `tandem_navigate(url)` — URL openen
   - `tandem_go_back()` / `tandem_go_forward()` / `tandem_reload()`
   - `tandem_read_page()` — title + URL + text if markdown (NIET HTML)
   - `tandem_screenshot()` — base64 image with `image` content type
   - `tandem_get_links()` — alle links op the page (NIEUW, not in oud plan)
   - `tandem_wait_for_load()` — wait tot page geladen (NIEUW)
4. Voeg npm script toe: `"mcp": "node dist/mcp/server.js"`
5. Update tsconfig if nodig
6. **Activity logging:** Elke MCP tool call → `POST /chat` with from="claude", zodat Kees panel the shows

Verificatie:
- [ ] MCP server start without errors
- [ ] Cowork can `tandem_read_page()` aanroepen
- [ ] Cowork can navigeren and page verandert in Tandem
- [ ] Screenshot tool geeft zichtbare image terug
- [ ] Tool calls verschijnen in Kees panel activity log
- [ ] `npx tsc` — zero errors

Mogelijke obstakels:
- MCP SDK versie-incompatibiliteit → check latest docs, pin versie
- Tandem must draaien → duidelijke foutmelding if API not beschikbaar
- Screenshot formaat → usage MCP `image` content type

**Sessie 1.2: Interactie + Tabs + Chat Tools**

Pre-checks:
- [ ] Basis MCP server out 1.1 works
- [ ] Cowork can verbinden with MCP server

Taken:
1. Interactie tools:
   - `tandem_click(selector, text?)` — element clicking
   - `tandem_type(selector, text)` — text typen
   - `tandem_scroll(direction, amount?)` — scrollen
   - `tandem_execute_js(code)` — JavaScript uitvoeren op page
2. Tab tools:
   - `tandem_list_tabs()` — alle tabs with URL/title/source
   - `tandem_open_tab(url?)` — new tab
   - `tandem_close_tab(tabId)` — tab sluiten
   - `tandem_focus_tab(tabId)` — tab focussen
3. Chat tools:
   - `tandem_send_message(text)` — bericht in Kees panel
   - `tandem_get_chat_history(limit?)` — chat geschiedenis read
4. Extra tools (not in oud plan):
   - `tandem_search_bookmarks(query)` — bookmarks doorzoeken
   - `tandem_search_history(query)` — history doorzoeken
   - `tandem_get_context()` — alles in één call

Verificatie:
- [ ] Complete flow: navigeer → read → click → typ works end-to-end
- [ ] Tab management works (open, focus, close)
- [ ] Chat berichten verschijnen in Kees panel
- [ ] Bookmarks/history search works

**Sessie 1.3: MCP Resources + Config + Documentatie**

Taken:
1. MCP resources:
   - `tandem://page/current` — auto-updated page content
   - `tandem://tabs/list` — actuele tab list
   - `tandem://chat/history` — chat geschiedenis
   - `tandem://context` — full browser context
2. MCP config template:
   - `tandem-mcp-config.json` for Cowork
   - `~/.claude/settings.json` voorbeeld for Claude Code
3. Setup documentatie:
   - Hoe Cowork configureren
   - Hoe Tandem + MCP testen
   - Troubleshooting guide
4. Content truncatie in `tandem_read_page`:
   - Usage ContentExtractor for structured extraction
   - Max 2000 woorden per page
   - Markdown output (not HTML)

Verificatie:
- [ ] Resources leesbaar vanuit Cowork
- [ ] MCP config docs are duidelijk and werkend
- [ ] Content truncatie works bij grote page's

---

### Phase 2: Event Stream + Context (1-2 sessions)

**Sessie 2.1: EventStreamManager + SSE Endpoint**

Pre-checks:
- [ ] MCP server out phase 1 works
- [ ] Existing IPC events (`activity-webview-event`, `tab-update`, etc.) bestaan in main.ts

Taken:
1. Maak `src/events/stream.ts` — EventStreamManager class
2. Verzamel events out existing IPC channels:
   - `did-navigate` → navigation event
   - `did-finish-load` → page-loaded event (with content summary)
   - `tab-update` → tab-change event
   - `form-submitted` → form event
   - `activity-webview-event` → alle webview events
3. SSE endpoint: `GET /events/stream` (HTTP Server-Sent Events)
   - No WebSocket nodig — SSE is simpeler for server→client push
4. Debounce strategie:
   - Navigation/page-loaded/tab-switch: direct
   - Scroll: max 1 per 5 seconden
   - Click: only if the navigatie triggert
5. MCP notifications: push `notifications/resources/updated` to MCP server

Verificatie:
- [ ] `curl http://localhost:8765/events/stream` shows events
- [ ] Navigatie events komen door in real-time
- [ ] Tab switches be gerapporteerd
- [ ] Events bevatten nuttige data (URL, title, etc.)

**Sessie 2.2: ContextManager (extend ContextBridge)**

Pre-checks:
- [ ] Event stream out 2.1 works
- [ ] Existing `src/bridge/context-bridge.ts` is gelezen and begrepen

Taken:
1. Extend ContextBridge (NIET vervangen) with:
   - Real-time event subscriptions
   - `getContextSummary()` — compact text for MCP context resource (~500 tokens max)
   - Periodic screenshot caching (only if MCP actief)
2. Update MCP resources to ContextManager te use
3. Integratie with event stream: context auto-updated bij events

Verificatie:
- [ ] Context is always actueel na navigatie/tab switch
- [ ] `tandem://context` MCP resource contains actuele data
- [ ] No noticeable performance impact op browsing

---

### Phase 3: Chat Router + Voice (2-3 sessions)

**⚠️ Dit is the riskantste phase — 200+ rules inline WebSocket code refactoren.**

**Sessie 3.1: Interface + OpenClawBackend extractie**

Pre-checks:
- [ ] OpenClaw gateway draait (ws://127.0.0.1:18789)
- [ ] Chat in Kees panel works normaal (test for you begint!)

Taken:
1. **Step 1: Interface definiëren** (laag risk)
   - Maak `ChatBackend` interface
   - Maak `ChatRouter` class structuur
   - Change NOTHING in working code

2. **Step 2: OpenClawBackend extraheren** (HOOG risk)
   - Kopieer WebSocket logica out index.html (rules 1681-1894) to `OpenClawBackend` class
   - **Token dynamisch laden** out `~/.openclaw/openclaw.json` (FIX for punt 2.2)
   - Test that the class standalone works
   - Pas DAN pas shell/index.html about to the class te use
   - Test UITGEBREID: reconnect, streaming, history, typing indicator

3. **Step 3: Claude Activity Backend** (new, laag risk)
   - Maak `ClaudeActivityBackend` class
   - Luistert op Tandem's chat API for berichten with `from: "claude"`
   - Shows MCP tool calls if activiteit in the Kees panel
   - Robin can terugschrijven → chat history → Claude leest via MCP

Verificatie:
- [ ] OpenClaw works IDENTIEK about for the refactor
- [ ] No regressions in chat (reconnect, streaming, history)
- [ ] Claude activiteit visible in panel wanneer Cowork MCP tools uses

**Sessie 3.2: Router UI + Voice koppeling**

Taken:
1. Backend selector UI in Kees panel:
   - Dropdown/tabs boven chat: "🐙 Kees (OpenClaw)" | "🤖 Claude (Cowork)"
   - Connection status indicators (groen/rood)
   - State persistence in config
2. Voice koppeling (~30 rules):
   - Voice final transcript → `chatRouter.sendMessage(transcript)`
   - Works with alle backends
3. Unified chat history:
   - Alle berichten in één list
   - Elk bericht getagged with source: `robin` | `openclaw` | `claude`
   - Visual onderscheid (color/icon)

Verificatie:
- [ ] Backend selector works and wisselen is smooth
- [ ] Voice → actieve backend → antwoord in panel
- [ ] Chat history shows berichten or alle bronnen

---

### Phase 4: Agent Autonomie (2-3 sessions)

**Sessie 4.1: Task Queue + Approval System**

Pre-checks:
- [ ] MCP tools werken betrouwbaar
- [ ] Chat router works
- [ ] Event stream levert context

Taken:
1. Task queue system:
   - AITask interface (description, steps, status, results)
   - TaskStep with requiresApproval flag
   - Task opslag: `~/.tandem/tasks/`
2. Approval UI in Kees panel:
   - "Kees wil [actie] uitvoeren. Goedkeuren?"
   - Approve / Reject / Modify knoppen
3. Auto-approve settings per actie type:
   - Lezen/screenshots: always OK
   - Navigeren: meestal OK
   - Klikken/typen: question eerst
   - Formulieren: always questions
4. Noodrem: Escape = stop ALLE agent-activiteit

Verificatie:
- [ ] Claude can a taak starten via MCP
- [ ] Robin sees approval request in panel
- [ ] Goedkeuren/afwijzen works
- [ ] Noodrem stopt alles

**Sessie 4.2: Autonomous Browse Sessions**

Taken:
1. Browse session management:
   - Agents werken in own tabs (tab isolatie)
   - Visual indicator: welke tabs door AI bestuurd be (🤖 in tab header)
2. Menselijke timing (hergebruik X-Scout patterns):
   - Delays between acties (8-20s page wissels, 2-6s scroll pauze)
   - Later: sample from Robin's real behavioral data
3. Research capability via MCP:
   - `tandem_research(topic)` — high-level tool that zoekt, leest, samenvat
   - Opens own tabs, rapporteert via chat
4. Activity log: alles wat AI doet is gelogd and visible

Verificatie:
- [ ] Claude can zelfstandig 5 page's onderzoeken
- [ ] Robin sees voortgang real-time
- [ ] AI stopt if Robin ingrijpt (noodrem)
- [ ] Menselijke timing visible (no instant acties)

---

### Phase 5: Multi-AI Coördinatie (1-2 sessions)

**Sessie 5.1: Dual Backend + Message Routing**

Pre-checks:
- [ ] OpenClaw backend works
- [ ] Claude activity backend works
- [ ] Chat router ondersteunt backend switching

Taken:
1. "Beide" mode in chat router:
   - Bericht gaat to alle actieve backends
   - Antwoorden gelabeld: [🐙 Kees] / [🤖 Claude]
   - Visual onderscheid (color/border)
2. Selective routing:
   - "@claude zoek this op" → only to Claude (via MCP chat)
   - "@kees wat vind jij?" → only to OpenClaw
   - No prefix → to alle actieve backends
3. TabLockManager:
   - Voorkom that twee agents the same tab bedienen
   - Robin has always voorrang
   - First agent that claimt wint

Verificatie:
- [ ] Beide backends simultaneously actief
- [ ] @-mention routing works
- [ ] No tab conflicts

---

## 6. Dependencies & versies

| Package | Versie | Phase | Goal |
|---------|--------|------|------|
| `@modelcontextprotocol/sdk` | `^1.26.0` | 1 | MCP server |

**That is the.** No `@anthropic-ai/sdk` nodig (no directe API calls). No andere new dependencies. Express, ws, electron are er already.

---

## 7. Risk's gerangschikt

| # | Risk | Impact | Kans | Mitigation |
|---|--------|--------|------|-----------|
| 1 | Chat Router refactoring breekt OpenClaw | HOOG | MEDIUM | Stapsgewijze refactor, test na elke stap |
| 2 | MCP SDK v2 breaking changes | MEDIUM | MEDIUM | Pin v1.26.0, upgrade later |
| 3 | Grote page's overflow Claude's context | MEDIUM | HOOG | ContentExtractor + 2000 woorden limiet |
| 4 | Bot-detection bij autonomous browsing | HOOG | LAAG | Behavioral timing + stealth patches |
| 5 | Multiple agents conflict op tabs | MEDIUM | MEDIUM | TabLockManager + isolatie |
| 6 | Tandem not draaien = MCP broken | MEDIUM | MEDIUM | Duidelijke errors + startup docs |

**Opmerking:** Risk "Claude API kosten lopen op" is **VERWIJDERD** — Max Pro = vast bedrag.

---

## 8. Sessie-planning (totaal: 8-13 sessions)

```
Phase 1: MCP Server                    [3 sessions]
  1.1: Basis server + navigatie/read tools + activity logging
  1.2: Interactie + tabs + chat + bookmarks/history tools
  1.3: Resources + context + content truncatie + documentatie

Phase 2: Event Stream + Context        [1-2 sessions]
  2.1: EventStreamManager + SSE endpoint
  2.2: ContextManager (extend ContextBridge) + MCP resource updates

Phase 3: Chat Router + Voice           [2-3 sessions]
  3.1: Interface + OpenClawBackend extractie + Claude Activity Backend
  3.2: Router UI + voice koppeling + OpenClaw token fix

Phase 4: Agent Autonomie               [2-3 sessions]
  4.1: Task queue + approval UI + noodrem
  4.2: Autonomous browse + behavioral timing + research tool

Phase 5: Multi-AI Coördinatie          [1-2 sessions]
  5.1: Dual backend + @-mention routing + TabLockManager
```

---

## 9. Wat er NIET meer in the plan zit

This items out the originele plan are **removed or not or toepassing:**

| Item | Reden |
|------|-------|
| Claude Direct Backend (oude phase 3) | No API key, Max Pro account |
| API key management / safeStorage | Not nodig |
| Token budget / kosten monitoring | Max Pro = vast bedrag |
| Model selector (Haiku/Sonnet/Opus) | Cowork bepaalt the model |
| Anthropic SDK dependency | Not nodig |
| Claude conversation persistence | Cowork beheert this |
| System prompt management | Cowork beheert this |

---

## 10. First actie

Start with **Phase 1, Sessie 1.1.** Voorwaarden:

1. Tandem Browser draait (`npm start`)
2. `npm install @modelcontextprotocol/sdk`
3. Bouw MCP server with basis tools
4. Configureer Cowork to the MCP server te use
5. Test: "read the page that open staat in Tandem" via Cowork

---

*Dit plan is a levend document. Update the na elke session with bevindingen and wijzigingen.*
*Last update: 12 februari 2026 — herzien for Max Pro architectuur.*
