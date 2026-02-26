# Tandem Browser — Verfijnd AI Implementatie Plan

> Audit & optimalisatie door Cowork (Claude Opus) — 12 februari 2026
> Gebaseerd op cross-referentie van het originele plan tegen de werkelijke codebase.
> **HERZIEN:** Architectuur aangepast voor Claude Max Pro (geen API key, MCP-only).

---

## KRITIEKE ARCHITECTUURWIJZIGING

Robin heeft een **Claude Max Pro account** ($200/maand). Dit betekent:

- **GEEN Anthropic API key** — Claude werkt niet via directe API calls
- **GEEN API kosten** — flat rate subscription, onbeperkt gebruik
- **Claude werkt UITSLUITEND via Claude Code/Cowork** → MCP → Tandem API
- **Fase 3 (Claude Direct Backend) VERVALT** — er is geen API om aan te roepen

**Nieuwe architectuur:**
```
Robin spreekt/typt ──→ Cowork/Claude Code ──→ MCP Server ──→ Tandem API (:8765)
                                                    ↕
Robin ziet resultaat ←── Kees Panel ←── OpenClaw Gateway (:18789)
                                                    +
                             MCP tool calls verschijnen als activiteit in browser
```

**MCP is DE primaire Claude-integratie.** Alles wat Claude doet met Tandem gaat via MCP tools. Het Kees panel blijft voor OpenClaw, met een activity feed die laat zien wat Claude/Cowork aan het doen is.

---

## Samenvatting

Het originele plan (7 fases, 13 documenten) is **85% accuraat** voor API docs en architectuur. Maar de aanname dat Claude via directe API calls werkt is **fout** — Robin heeft geen API key en heeft die ook niet nodig.

Dit document bevat:
1. Wat klopt en we behouden
2. Wat fout is en we moeten fixen
3. Wat ontbreekt en we moeten toevoegen
4. De nieuwe fasevolgorde (5 fases in plaats van 7)
5. Concrete aanbevelingen per fase

---

## 1. Wat klopt (behouden)

**API endpoints:** Alle 118 endpoints zijn correct gedocumenteerd. De MCP server kan deze 1-op-1 wrappen.

**Twee-lagen architectuur:** De "webview is heilig terrein" filosofie is correct en cruciaal. AI-code hoort in Layer 2 (main process + shell), nooit in de webview.

**IPC bridge:** De `window.tandem.*` API heeft 25+ methodes en werkt. De preload bridge is volledig.

**Agent referentie:** `src/agents/x-scout.ts` bestaat als skeleton met goede timing-patronen die herbruikbaar zijn voor fase 4.

**Chat locatie:** OpenClaw WebSocket code zit op regels 1681-1894 in `shell/index.html`. Protocol details (RPC, streaming states, reconnect) zijn accuraat.

**Cross-platform aanpak:** De focus op `path.join()`, `os.homedir()`, en platform checks is goed.

---

## 2. Wat fout is (moet gefixed)

### 2.1 Auth middleware is permissiever dan gedocumenteerd

**Plan zegt:** "Localhost requests exempt from auth"

**Werkelijkheid:** De auth middleware in `server.ts` (regels 162-185) laat ALLE requests zonder `origin` header door:

```
if (!origin) return next();
```

Dit betekent dat **elke lokale process** (niet alleen localhost requests) de API kan aanroepen zonder token. Voor de MCP server is dit handig (MCP server stuurt geen origin header), maar het is een beveiligingsrisico als andere software op de machine draait.

**Aanbeveling:** Voor fase 1 is dit acceptabel (MCP server draait lokaal). Maar bij fase 4 (agent autonomie) moet dit strikter: ofwel altijd token vereisen, ofwel een whitelist van bekende callers.

### 2.2 OpenClaw token is hardcoded

**Plan documenteert:** `AUTH_TOKEN = 'de07381e...'` als hardcoded string in shell/index.html regel 1687.

**Probleem:** Dit token zou uit `~/.openclaw/openclaw.json` gelezen moeten worden. Bij een token-rotatie breekt de chat.

**Aanbeveling:** Bij fase 3 (Chat Router refactoring) het token dynamisch laden via een API call of IPC bridge:
```
GET /config/openclaw-token → leest ~/.openclaw/openclaw.json → gateway.auth.token
```

### 2.3 Context Bridge bestaat al, maar plan negeert dit

**Plan zegt:** "src/context/manager.ts moet gebouwd worden"

**Werkelijkheid:** `src/bridge/context-bridge.ts` bestaat al (162 regels) met:
- `recordSnapshot()` — pagina context opslaan
- `getRecent()` — recente pagina's ophalen
- `search()` — doorzoeken
- `getPage()` — specifieke URL context
- `addNote()` — handmatige notities
- Opslag in `~/.tandem/context/`

**Aanbeveling:** Extend de bestaande ContextBridge, bouw niet from scratch.

### 2.4 Voice is verder dan het plan denkt

**Plan zegt:** Hele fase nodig voor voice → AI pipeline

**Werkelijkheid:** Voice is al 80% klaar. Wat ontbreekt: alleen koppeling voice transcript → ChatRouter → actieve backend (~30 regels).

**Aanbeveling:** Samenvoegen met Chat Router fase.

### 2.5 OUDE FASE 3 (Claude Direct Backend) IS ONMOGELIJK

**Plan zegt:** Integreer de Anthropic Messages API direct als chat backend.

**Werkelijkheid:** Robin heeft geen API key. Hij heeft een Max Pro account. Claude werkt uitsluitend via Claude Code/Cowork → MCP.

**Oplossing:** Vervang de "Claude Direct Backend" met een **Claude Activity Feed** in het Kees panel. Dit toont wat Claude Code/Cowork aan het doen is wanneer het MCP tools gebruikt:

```
[🤖 Claude via Cowork]
  → tandem_navigate("https://google.com")
  → tandem_read_page() — "Google Search Results..."
  → tandem_click("#result-1")
  → "Ik heb het eerste resultaat geopend voor je."
```

Dit geeft Robin zichtbaarheid in wat Claude doet, zonder directe API integratie.

### 2.6 Geen API key management, geen token budget nodig

De hele sectie over API key opslag (safeStorage), token budgettering, model selectie, en kosten-monitoring is **niet van toepassing**. Claude Max Pro is een vast bedrag. Robin gebruikt wat hij wil.

Content truncatie is WEL nog relevant — grote pagina's vullen Claude's context window op, ook via MCP.

---

## 3. Wat ontbreekt (moet toegevoegd)

### 3.1 MCP Activity Feed in Kees Panel

Wanneer Claude Code/Cowork MCP tools aanroept, moet Robin dit ZIEN in het Kees panel. Dit is de "Claude" aanwezigheid in de browser.

**Implementatie:**
- De MCP server logt elke tool call naar Tandem's chat API (`POST /chat`)
- Kees panel toont deze als "[🤖 Claude] actie: navigeert naar google.com"
- Robin kan reageren in het panel (bericht gaat naar chat history, Claude leest dit via MCP resource)

**Bidirectioneel:**
- Robin typt in Kees panel → opgeslagen in chat history
- Claude Code leest chat via `tandem_get_chat_history()` MCP tool
- Claude Code stuurt antwoord via `tandem_send_message()` MCP tool
- Kees panel toont antwoord

Dit creëert een **chat loop** tussen Robin (browser) en Claude (Cowork) ZONDER directe API calls.

### 3.2 Fallback & error recovery

**Scenario's die niet gedekt zijn:**
- OpenClaw gateway is down → chat panel toont alleen errors
- Tandem API crash → MCP server krijgt connection refused
- MCP tool execution timeout → Claude Code wacht

**Toevoegen:**
- Per-backend health check (ping elke 30s)
- Tool execution timeout: 30s per tool call
- Graceful degradation: duidelijke foutmelding als Tandem niet draait
- MCP server geeft context-rijke errors terug

### 3.3 MCP Server lifecycle

Claude Code/Cowork starten de MCP server zelf via hun config. Tandem moet alleen draaien (API op :8765).

**Correct model:**
```
1. Robin start Tandem Browser (npm start) → API draait op :8765
2. Robin opent Cowork → Cowork leest MCP config → start tandem-mcp bridge
3. tandem-mcp maakt HTTP calls naar localhost:8765
4. Als Tandem niet draait → MCP server geeft foutmelding
```

**Documenteer dit duidelijk** in de MCP setup guide.

### 3.4 Slim content trunceren

Pagina's kunnen 50.000+ woorden zijn. Ook via MCP vult dit Claude's context.

**Strategie:**
1. Gebruik de bestaande `ContentExtractor` (src/content/extractor.ts) voor structured extraction
2. Prioriteer: titel → headings → main content → sidebar
3. Strip navigatie, footer, ads
4. `tandem_read_page` stuurt markdown, niet HTML (~60% minder tokens)
5. `tandem_screenshot` resize naar max 1024px breed

### 3.5 Cowork MCP config template

Robin gebruikt primair Cowork. De MCP config moet daar juist ingesteld worden:

**Voor Cowork:** Configuratie via de Cowork plugin/MCP settings interface.

**Voor Claude Code (backup):** `~/.claude/settings.json`:
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

## 4. Nieuwe fasevolgorde (5 fases)

De oude 7 fases zijn teruggebracht naar **5 fases** door:
- Fase 3 (Claude Direct Backend) → **vervalt** (geen API key)
- Fase 5 (Voice Flow) → **opgegaan** in fase 3 (Chat Router)
- Fase 4 (Event Stream) → **naar voren** als fase 2

```
NIEUW PLAN (5 FASES):

Fase 1: MCP Server                    [2-3 sessies]
  → Claude Code/Cowork kan Tandem bedienen via MCP tools
  → Activity feed naar Kees panel
  → Content truncatie

Fase 2: Event Stream + Context        [1-2 sessies]
  → Real-time browser events beschikbaar voor MCP
  → Extend bestaande ContextBridge
  → MCP resource notifications

Fase 3: Chat Router + Voice           [2-3 sessies]
  → OpenClaw refactoring naar modulair systeem
  → Claude Activity Backend (toont MCP activiteit)
  → Voice → router koppeling
  → OpenClaw token dynamisch laden

Fase 4: Agent Autonomie               [2-3 sessies]
  → Task queue + approval systeem
  → Autonomous browse via MCP
  → Behavioral timing uit X-Scout patronen

Fase 5: Multi-AI Coördinatie          [1-2 sessies]
  → OpenClaw + Claude parallel
  → @-mention routing
  → TabLockManager

TOTAAL: 8-13 sessies
```

### Waarom 5 in plaats van 7?

1. **Geen Claude API backend** = geen fase 3/4 uit oud plan
2. **Voice is triviaal** = geen aparte fase, onderdeel van Chat Router
3. **MCP is krachtiger** = vervangt de noodzaak voor directe API integratie
4. **Robin's Max Pro account** = onbeperkt Claude via Cowork, geen kosten-optimalisatie nodig

---

## 5. Concrete aanbevelingen per fase

### Fase 1: MCP Server (2-3 sessies)

**Sessie 1.1: Basis MCP Server + Lees/Navigatie Tools**

Pre-checks:
- [ ] Tandem draait op :8765 (`curl http://localhost:8765/status`)
- [ ] `npm install @modelcontextprotocol/sdk` succesvol
- [ ] API token bestaat (`cat ~/.tandem/api-token`)

Taken:
1. Maak `src/mcp/api-client.ts` — HTTP wrapper voor Tandem API
   - Leest auth token uit `~/.tandem/api-token`
   - Maar: auth middleware skipt no-origin requests, dus token is optioneel lokaal
2. Maak `src/mcp/server.ts` — MCP server met stdio transport
   - **BELANGRIJK:** Gebruik `console.error()` voor logging, NOOIT `console.log()` (stdout = MCP protocol)
3. Implementeer tools:
   - `tandem_navigate(url)` — URL openen
   - `tandem_go_back()` / `tandem_go_forward()` / `tandem_reload()`
   - `tandem_read_page()` — titel + URL + tekst als markdown (NIET HTML)
   - `tandem_screenshot()` — base64 image met `image` content type
   - `tandem_get_links()` — alle links op de pagina (NIEUW, niet in oud plan)
   - `tandem_wait_for_load()` — wacht tot pagina geladen (NIEUW)
4. Voeg npm script toe: `"mcp": "node dist/mcp/server.js"`
5. Update tsconfig als nodig
6. **Activity logging:** Elke MCP tool call → `POST /chat` met from="claude", zodat Kees panel het toont

Verificatie:
- [ ] MCP server start zonder errors
- [ ] Cowork kan `tandem_read_page()` aanroepen
- [ ] Cowork kan navigeren en pagina verandert in Tandem
- [ ] Screenshot tool geeft zichtbare image terug
- [ ] Tool calls verschijnen in Kees panel activity log
- [ ] `npx tsc` — zero errors

Mogelijke obstakels:
- MCP SDK versie-incompatibiliteit → check latest docs, pin versie
- Tandem moet draaien → duidelijke foutmelding als API niet beschikbaar
- Screenshot formaat → gebruik MCP `image` content type

**Sessie 1.2: Interactie + Tabs + Chat Tools**

Pre-checks:
- [ ] Basis MCP server uit 1.1 werkt
- [ ] Cowork kan verbinden met MCP server

Taken:
1. Interactie tools:
   - `tandem_click(selector, text?)` — element klikken
   - `tandem_type(selector, text)` — tekst typen
   - `tandem_scroll(direction, amount?)` — scrollen
   - `tandem_execute_js(code)` — JavaScript uitvoeren op pagina
2. Tab tools:
   - `tandem_list_tabs()` — alle tabs met URL/titel/source
   - `tandem_open_tab(url?)` — nieuwe tab
   - `tandem_close_tab(tabId)` — tab sluiten
   - `tandem_focus_tab(tabId)` — tab focussen
3. Chat tools:
   - `tandem_send_message(text)` — bericht in Kees panel
   - `tandem_get_chat_history(limit?)` — chat geschiedenis lezen
4. Extra tools (niet in oud plan):
   - `tandem_search_bookmarks(query)` — bookmarks doorzoeken
   - `tandem_search_history(query)` — history doorzoeken
   - `tandem_get_context()` — alles in één call

Verificatie:
- [ ] Complete flow: navigeer → lees → klik → typ werkt end-to-end
- [ ] Tab management werkt (open, focus, close)
- [ ] Chat berichten verschijnen in Kees panel
- [ ] Bookmarks/history search werkt

**Sessie 1.3: MCP Resources + Config + Documentatie**

Taken:
1. MCP resources:
   - `tandem://page/current` — auto-updated pagina content
   - `tandem://tabs/list` — actuele tab lijst
   - `tandem://chat/history` — chat geschiedenis
   - `tandem://context` — volledige browser context
2. MCP config template:
   - `tandem-mcp-config.json` voor Cowork
   - `~/.claude/settings.json` voorbeeld voor Claude Code
3. Setup documentatie:
   - Hoe Cowork configureren
   - Hoe Tandem + MCP testen
   - Troubleshooting guide
4. Content truncatie in `tandem_read_page`:
   - Gebruik ContentExtractor voor structured extraction
   - Max 2000 woorden per pagina
   - Markdown output (niet HTML)

Verificatie:
- [ ] Resources leesbaar vanuit Cowork
- [ ] MCP config docs zijn duidelijk en werkend
- [ ] Content truncatie werkt bij grote pagina's

---

### Fase 2: Event Stream + Context (1-2 sessies)

**Sessie 2.1: EventStreamManager + SSE Endpoint**

Pre-checks:
- [ ] MCP server uit fase 1 werkt
- [ ] Bestaande IPC events (`activity-webview-event`, `tab-update`, etc.) bestaan in main.ts

Taken:
1. Maak `src/events/stream.ts` — EventStreamManager class
2. Verzamel events uit bestaande IPC channels:
   - `did-navigate` → navigation event
   - `did-finish-load` → page-loaded event (met content summary)
   - `tab-update` → tab-change event
   - `form-submitted` → form event
   - `activity-webview-event` → alle webview events
3. SSE endpoint: `GET /events/stream` (HTTP Server-Sent Events)
   - Geen WebSocket nodig — SSE is simpeler voor server→client push
4. Debounce strategie:
   - Navigation/page-loaded/tab-switch: direct
   - Scroll: max 1 per 5 seconden
   - Click: alleen als het navigatie triggert
5. MCP notifications: push `notifications/resources/updated` naar MCP server

Verificatie:
- [ ] `curl http://localhost:8765/events/stream` toont events
- [ ] Navigatie events komen door in real-time
- [ ] Tab switches worden gerapporteerd
- [ ] Events bevatten nuttige data (URL, titel, etc.)

**Sessie 2.2: ContextManager (extend ContextBridge)**

Pre-checks:
- [ ] Event stream uit 2.1 werkt
- [ ] Bestaande `src/bridge/context-bridge.ts` is gelezen en begrepen

Taken:
1. Extend ContextBridge (NIET vervangen) met:
   - Real-time event subscriptions
   - `getContextSummary()` — compact tekst voor MCP context resource (~500 tokens max)
   - Periodic screenshot caching (alleen als MCP actief)
2. Update MCP resources om ContextManager te gebruiken
3. Integratie met event stream: context auto-updated bij events

Verificatie:
- [ ] Context is altijd actueel na navigatie/tab switch
- [ ] `tandem://context` MCP resource bevat actuele data
- [ ] Geen merkbare performance impact op browsing

---

### Fase 3: Chat Router + Voice (2-3 sessies)

**⚠️ Dit is de riskantste fase — 200+ regels inline WebSocket code refactoren.**

**Sessie 3.1: Interface + OpenClawBackend extractie**

Pre-checks:
- [ ] OpenClaw gateway draait (ws://127.0.0.1:18789)
- [ ] Chat in Kees panel werkt normaal (test voor je begint!)

Taken:
1. **Stap 1: Interface definiëren** (laag risico)
   - Maak `ChatBackend` interface
   - Maak `ChatRouter` class structuur
   - Nog NIETS wijzigen aan werkende code

2. **Stap 2: OpenClawBackend extraheren** (HOOG risico)
   - Kopieer WebSocket logica uit index.html (regels 1681-1894) naar `OpenClawBackend` class
   - **Token dynamisch laden** uit `~/.openclaw/openclaw.json` (FIX voor punt 2.2)
   - Test dat de class standalone werkt
   - Pas DAN pas shell/index.html aan om de class te gebruiken
   - Test UITGEBREID: reconnect, streaming, history, typing indicator

3. **Stap 3: Claude Activity Backend** (nieuw, laag risico)
   - Maak `ClaudeActivityBackend` class
   - Luistert op Tandem's chat API voor berichten met `from: "claude"`
   - Toont MCP tool calls als activiteit in het Kees panel
   - Robin kan terugschrijven → chat history → Claude leest via MCP

Verificatie:
- [ ] OpenClaw werkt IDENTIEK aan voor de refactor
- [ ] Geen regressies in chat (reconnect, streaming, history)
- [ ] Claude activiteit zichtbaar in panel wanneer Cowork MCP tools gebruikt

**Sessie 3.2: Router UI + Voice koppeling**

Taken:
1. Backend selector UI in Kees panel:
   - Dropdown/tabs boven chat: "🐙 Kees (OpenClaw)" | "🤖 Claude (Cowork)"
   - Connection status indicators (groen/rood)
   - State persistence in config
2. Voice koppeling (~30 regels):
   - Voice final transcript → `chatRouter.sendMessage(transcript)`
   - Werkt met alle backends
3. Unified chat history:
   - Alle berichten in één lijst
   - Elk bericht getagged met source: `robin` | `openclaw` | `claude`
   - Visueel onderscheid (kleur/icon)

Verificatie:
- [ ] Backend selector werkt en wisselen is smooth
- [ ] Voice → actieve backend → antwoord in panel
- [ ] Chat history toont berichten van alle bronnen

---

### Fase 4: Agent Autonomie (2-3 sessies)

**Sessie 4.1: Task Queue + Approval System**

Pre-checks:
- [ ] MCP tools werken betrouwbaar
- [ ] Chat router werkt
- [ ] Event stream levert context

Taken:
1. Task queue systeem:
   - AITask interface (description, steps, status, results)
   - TaskStep met requiresApproval flag
   - Task opslag: `~/.tandem/tasks/`
2. Approval UI in Kees panel:
   - "Kees wil [actie] uitvoeren. Goedkeuren?"
   - Approve / Reject / Modify knoppen
3. Auto-approve settings per actie type:
   - Lezen/screenshots: altijd OK
   - Navigeren: meestal OK
   - Klikken/typen: vraag eerst
   - Formulieren: altijd vragen
4. Noodrem: Escape = stop ALLE agent-activiteit

Verificatie:
- [ ] Claude kan een taak starten via MCP
- [ ] Robin ziet approval request in panel
- [ ] Goedkeuren/afwijzen werkt
- [ ] Noodrem stopt alles

**Sessie 4.2: Autonomous Browse Sessions**

Taken:
1. Browse session management:
   - Agents werken in eigen tabs (tab isolatie)
   - Visuele indicator: welke tabs door AI bestuurd worden (🤖 in tab header)
2. Menselijke timing (hergebruik X-Scout patronen):
   - Delays tussen acties (8-20s pagina wissels, 2-6s scroll pauze)
   - Later: sample uit Robin's echte behavioral data
3. Research capability via MCP:
   - `tandem_research(topic)` — high-level tool die zoekt, leest, samenvat
   - Opent eigen tabs, rapporteert via chat
4. Activity log: alles wat AI doet wordt gelogd en zichtbaar

Verificatie:
- [ ] Claude kan zelfstandig 5 pagina's onderzoeken
- [ ] Robin ziet voortgang real-time
- [ ] AI stopt als Robin ingrijpt (noodrem)
- [ ] Menselijke timing zichtbaar (geen instant acties)

---

### Fase 5: Multi-AI Coördinatie (1-2 sessies)

**Sessie 5.1: Dual Backend + Message Routing**

Pre-checks:
- [ ] OpenClaw backend werkt
- [ ] Claude activity backend werkt
- [ ] Chat router ondersteunt backend switching

Taken:
1. "Beide" mode in chat router:
   - Bericht gaat naar alle actieve backends
   - Antwoorden gelabeld: [🐙 Kees] / [🤖 Claude]
   - Visueel onderscheid (kleur/border)
2. Selective routing:
   - "@claude zoek dit op" → alleen naar Claude (via MCP chat)
   - "@kees wat vind jij?" → alleen naar OpenClaw
   - Geen prefix → naar alle actieve backends
3. TabLockManager:
   - Voorkom dat twee agents dezelfde tab bedienen
   - Robin heeft altijd voorrang
   - Eerste agent die claimt wint

Verificatie:
- [ ] Beide backends tegelijk actief
- [ ] @-mention routing werkt
- [ ] Geen tab conflicten

---

## 6. Dependencies & versies

| Package | Versie | Fase | Doel |
|---------|--------|------|------|
| `@modelcontextprotocol/sdk` | `^1.26.0` | 1 | MCP server |

**Dat is het.** Geen `@anthropic-ai/sdk` nodig (geen directe API calls). Geen andere nieuwe dependencies. Express, ws, electron zijn er al.

---

## 7. Risico's gerangschikt

| # | Risico | Impact | Kans | Mitigatie |
|---|--------|--------|------|-----------|
| 1 | Chat Router refactoring breekt OpenClaw | HOOG | MEDIUM | Stapsgewijze refactor, test na elke stap |
| 2 | MCP SDK v2 breaking changes | MEDIUM | MEDIUM | Pin v1.26.0, upgrade later |
| 3 | Grote pagina's overflow Claude's context | MEDIUM | HOOG | ContentExtractor + 2000 woorden limiet |
| 4 | Bot-detectie bij autonomous browsing | HOOG | LAAG | Behavioral timing + stealth patches |
| 5 | Meerdere agents conflict op tabs | MEDIUM | MEDIUM | TabLockManager + isolatie |
| 6 | Tandem niet draaien = MCP broken | MEDIUM | MEDIUM | Duidelijke errors + startup docs |

**Opmerking:** Risico "Claude API kosten lopen op" is **VERWIJDERD** — Max Pro = vast bedrag.

---

## 8. Sessie-planning (totaal: 8-13 sessies)

```
Fase 1: MCP Server                    [3 sessies]
  1.1: Basis server + navigatie/lees tools + activity logging
  1.2: Interactie + tabs + chat + bookmarks/history tools
  1.3: Resources + context + content truncatie + documentatie

Fase 2: Event Stream + Context        [1-2 sessies]
  2.1: EventStreamManager + SSE endpoint
  2.2: ContextManager (extend ContextBridge) + MCP resource updates

Fase 3: Chat Router + Voice           [2-3 sessies]
  3.1: Interface + OpenClawBackend extractie + Claude Activity Backend
  3.2: Router UI + voice koppeling + OpenClaw token fix

Fase 4: Agent Autonomie               [2-3 sessies]
  4.1: Task queue + approval UI + noodrem
  4.2: Autonomous browse + behavioral timing + research tool

Fase 5: Multi-AI Coördinatie          [1-2 sessies]
  5.1: Dual backend + @-mention routing + TabLockManager
```

---

## 9. Wat er NIET meer in het plan zit

Deze items uit het originele plan zijn **verwijderd of niet van toepassing:**

| Item | Reden |
|------|-------|
| Claude Direct Backend (oude fase 3) | Geen API key, Max Pro account |
| API key management / safeStorage | Niet nodig |
| Token budget / kosten monitoring | Max Pro = vast bedrag |
| Model selector (Haiku/Sonnet/Opus) | Cowork bepaalt het model |
| Anthropic SDK dependency | Niet nodig |
| Claude conversation persistence | Cowork beheert dit |
| System prompt management | Cowork beheert dit |

---

## 10. Eerste actie

Start met **Fase 1, Sessie 1.1.** Voorwaarden:

1. Tandem Browser draait (`npm start`)
2. `npm install @modelcontextprotocol/sdk`
3. Bouw MCP server met basis tools
4. Configureer Cowork om de MCP server te gebruiken
5. Test: "lees de pagina die open staat in Tandem" via Cowork

---

*Dit plan is een levend document. Update het na elke sessie met bevindingen en wijzigingen.*
*Laatste update: 12 februari 2026 — herzien voor Max Pro architectuur.*
