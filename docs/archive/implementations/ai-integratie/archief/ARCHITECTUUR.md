# Tandem Browser — AI Architectuur

## Huidige staat van de codebase

### API Server (src/api/server.ts)
- HTTP op `localhost:8765`
- Bearer token authenticatie (opgeslagen in `~/.tandem/api-token`)
- 60+ endpoints voor volledige browser control

### Bestaande API Endpoints (relevant voor AI)

#### Browser Control
| Method | Endpoint | Wat het doet |
|--------|----------|-------------|
| POST | `/navigate` | URL laden in actieve tab |
| POST | `/click` | Element klikken (CSS selector, menselijke delays) |
| POST | `/type` | Tekst typen (karakter voor karakter, menselijk) |
| POST | `/scroll` | Pagina scrollen |
| POST | `/execute-js` | JavaScript uitvoeren op pagina |
| GET | `/page-content` | Pagina tekst, titel, beschrijving extracten |
| GET | `/page-html` | Ruwe HTML ophalen |
| GET | `/screenshot` | Screenshot van actieve webview |

#### Tab Management
| Method | Endpoint | Wat het doet |
|--------|----------|-------------|
| POST | `/tabs/open` | Nieuwe tab (source: robin/kees) |
| POST | `/tabs/close` | Tab sluiten |
| GET | `/tabs/list` | Alle tabs ophalen |
| POST | `/tabs/focus` | Tab focussen |

#### Chat & Panel
| Method | Endpoint | Wat het doet |
|--------|----------|-------------|
| GET | `/chat` | Chat berichten ophalen |
| POST | `/chat` | Bericht sturen (from=robin|kees) |
| POST | `/chat/typing` | Typing indicator |
| POST | `/panel/toggle` | Kees panel tonen/verbergen |

#### Screenshots & Content
| Method | Endpoint | Wat het doet |
|--------|----------|-------------|
| GET | `/screenshot/annotated` | Laatste annotated screenshot |
| POST | `/content/extract` | Gestructureerde content extractie |
| GET | `/screenshots` | Lijst recente screenshots |

#### Voice
| Method | Endpoint | Wat het doet |
|--------|----------|-------------|
| POST | `/voice/start` | Spraakherkenning starten |
| POST | `/voice/stop` | Spraakherkenning stoppen |
| GET | `/voice/status` | Voice status |

### IPC Bridge (src/preload.ts)
Alle browser functies zijn beschikbaar via `window.tandem.*` in de renderer.
Zie de volledige lijst in de visie documentatie.

### OpenClaw Chat (shell/index.html, regels 1680-1880)
- WebSocket naar `ws://127.0.0.1:18789`
- RPC protocol met `req/res/event` types
- Auth token: `[redacted leaked token]`
- Session key: `agent:main:main`
- Streaming responses via `chat` events met `delta/final/error` states

### Claude Integratie (via MCP — GEEN directe API)

**BELANGRIJK:** Robin heeft een Max Pro account. Claude wordt NIET via de Anthropic API geïntegreerd maar via MCP (Model Context Protocol).

**Werking:**
1. Cowork/Claude Code start → leest MCP config → start tandem-mcp server
2. tandem-mcp maakt HTTP calls naar localhost:8765 (Tandem API)
3. Claude kan via MCP tools de browser bedienen
4. MCP tool calls worden gelogd naar chat API → zichtbaar in Kees panel

**MCP Config (Cowork):** Via Cowork plugin/MCP settings
**MCP Config (Claude Code):** `~/.claude/settings.json`

**Geen `@anthropic-ai/sdk` dependency nodig.**

### Agent System (src/agents/)
- X-Scout agent als voorbeeld van autonome browser-agent
- Menselijke timing model (delays tussen acties)
- State management met approvals

---

## Nieuwe Componenten (te bouwen)

### Component 1: MCP Server (`src/mcp/`)

**Doel:** Claude Code/Cowork kan de browser bedienen via MCP tools.

**Technologie:** `@modelcontextprotocol/sdk` (npm package)

**Tools die exposed worden:**

```typescript
// Navigatie
tandem_navigate(url: string)                    // URL openen
tandem_go_back()                                // Terug
tandem_go_forward()                             // Vooruit
tandem_reload()                                 // Herladen

// Pagina lezen
tandem_read_page()                              // Tekst + metadata van huidige pagina
tandem_read_html()                              // Ruwe HTML
tandem_screenshot()                             // Screenshot als base64 image
tandem_extract_content()                        // Gestructureerde content

// Interactie
tandem_click(selector: string)                  // Element klikken
tandem_type(selector: string, text: string)     // Tekst invoeren
tandem_scroll(direction: 'up'|'down', amount?)  // Scrollen
tandem_execute_js(code: string)                 // JavaScript uitvoeren

// Tabs
tandem_list_tabs()                              // Alle tabs
tandem_open_tab(url?: string)                   // Nieuwe tab
tandem_close_tab(tabId: string)                 // Tab sluiten
tandem_focus_tab(tabId: string)                 // Tab focussen

// Chat
tandem_send_message(text: string)               // Bericht in Kees panel
tandem_get_chat_history(limit?: number)         // Chat geschiedenis

// Context
tandem_get_context()                            // Alles: huidige URL, titel, tabs, etc.

// Bookmarks
tandem_bookmark(url: string, title: string)     // Bookmark toevoegen
tandem_search_bookmarks(query: string)          // Bookmarks zoeken
```

**Resources die exposed worden:**
```typescript
tandem://page/current     // Huidige pagina content (auto-updated)
tandem://tabs/list        // Lijst van open tabs
tandem://chat/history     // Chat geschiedenis
tandem://screenshot/last  // Laatste screenshot
```

**Transport:** stdio (voor Claude Code/Cowork integratie)

---

### Component 2: Chat Router (`src/chat/router.ts`)

**Doel:** Kees panel kan met meerdere AI backends praten.

**Backends:**
```typescript
interface ChatBackend {
  id: string;                              // 'openclaw' | 'claude' | ...
  name: string;                            // Display naam
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  sendMessage(text: string): Promise<void>;
  onMessage(callback: (msg) => void): void;
  onTyping(callback: (typing) => void): void;
  isConnected(): boolean;
}
```

**Implementaties:**
1. `OpenClawBackend` — bestaande WebSocket logica, gerefactored
2. `ClaudeBackend` — directe Anthropic API calls met tools
3. `DualBackend` — stuurt naar beiden, merged responses

**UI Changes (Kees Panel):**
- Dropdown/selector boven de chat om backend te kiezen
- Status indicator per backend (connected/disconnected)
- Optie "Beide" om parallel te chatten

---

### Component 3: Claude Direct Backend (`src/chat/backends/claude.ts`)

**Doel:** Claude API direct aanroepen vanuit de browser, zonder Cowork.

**Werking:**
1. Anthropic API key opgeslagen in config
2. System prompt met Tandem context + beschikbare acties
3. Tool use: Claude kan browser-tools aanroepen via de lokale API
4. Streaming responses voor real-time chat

**System Prompt Template:**
```
Je bent Kees, Robin's AI co-pilot in Tandem Browser.
Je kunt de browser bedienen met de volgende tools:
[... tool definities ...]

Je ziet momenteel:
- URL: {current_url}
- Titel: {page_title}
- Tabs: {tab_list}

Reageer altijd in het Nederlands tenzij anders gevraagd.
```

---

### Component 4: Event Stream (`src/events/stream.ts`)

**Doel:** AI krijgt real-time updates van wat Robin doet.

**Events:**
```typescript
interface BrowserEvent {
  type: 'navigation' | 'page-loaded' | 'click' | 'scroll' |
        'tab-switch' | 'tab-open' | 'tab-close' | 'form-submit' |
        'voice-input' | 'screenshot-taken';
  timestamp: number;
  tabId: string;
  data: {
    url?: string;
    title?: string;
    selector?: string;
    text?: string;
    screenshot?: string;  // base64, alleen bij key events
  };
}
```

**Transport opties:**
1. **SSE (Server-Sent Events)** — `GET /events/stream` voor HTTP clients
2. **WebSocket** — voor real-time bidirectioneel
3. **MCP Notifications** — voor Claude Code/Cowork
4. **In-memory** — voor lokale backends (Claude Direct)

---

### Component 5: Context Manager (`src/context/manager.ts`)

**Doel:** Houdt een actueel beeld bij van de browser staat voor AI consumption.

```typescript
interface BrowserContext {
  activeTab: {
    id: string;
    url: string;
    title: string;
    content?: string;        // Geextraheerde tekst (lazy loaded)
    screenshot?: string;     // Base64 (periodic of on-demand)
  };
  tabs: Array<{id, url, title, source}>;
  chat: Array<{role, text, timestamp}>;
  recentEvents: BrowserEvent[];   // Laatste 50 events
  voiceActive: boolean;
  drawMode: boolean;
}
```

**Update triggers:**
- Navigatie → update URL/titel
- Page load → update content
- Tab switch → update activeTab
- Periodic (30s) → update screenshot als AI actief is

---

## Data Flow: Compleet Scenario

### Robin zegt "zoek informatie over X" via voice

```
1. Robin spreekt → Voice API → speech-to-text
2. Tekst verschijnt in Kees chat input
3. Chat Router stuurt naar actieve backend(s)
4. Backend (Claude/OpenClaw) ontvangt bericht + browser context
5. AI besluit: "Ik ga Google doorzoeken"
6. AI roept tandem_navigate("https://google.com/search?q=X") aan
7. Browser navigeert, Event Stream stuurt 'navigation' event
8. Pagina laadt, Event Stream stuurt 'page-loaded' met content
9. AI leest resultaten via tandem_read_page()
10. AI klikt op eerste resultaat via tandem_click("h3 a")
11. Pagina laadt, AI leest content
12. AI stuurt samenvatting naar Kees chat
13. Robin ziet antwoord in Kees panel
```

### Claude Cowork sessie in de IDE

```
1. Robin opent Claude Code/Cowork in VSCode
2. MCP server verbindt met Tandem API (:8765)
3. Robin zegt: "Kijk eens naar de LinkedIn pagina die open staat"
4. Cowork roept tandem_screenshot() + tandem_read_page() aan
5. Cowork ziet de pagina content en screenshot
6. Cowork analyseert en geeft feedback in de IDE
7. Robin: "Open ook hun website in een nieuwe tab"
8. Cowork roept tandem_open_tab("https://company.com") aan
9. Browser opent nieuwe tab
10. Cowork leest beide pagina's en vergelijkt
```

---

## Bestandsstructuur (nieuw)

```
src/
├── mcp/
│   ├── server.ts              # MCP server entry point
│   ├── tools/
│   │   ├── navigation.ts      # navigate, back, forward, reload
│   │   ├── reading.ts         # read_page, screenshot, extract
│   │   ├── interaction.ts     # click, type, scroll, execute_js
│   │   ├── tabs.ts            # list, open, close, focus
│   │   └── chat.ts            # send_message, get_history
│   └── resources/
│       ├── page.ts            # tandem://page/* resources
│       └── context.ts         # tandem://context resource
│
├── chat/
│   ├── router.ts              # Chat backend routing logic
│   ├── backends/
│   │   ├── openclaw.ts        # OpenClaw WebSocket backend
│   │   ├── claude.ts          # Claude API direct backend
│   │   └── types.ts           # Shared interfaces
│   └── manager.ts             # Chat state management
│
├── events/
│   ├── stream.ts              # Event streaming (SSE + WS)
│   └── types.ts               # Event type definitions
│
├── context/
│   └── manager.ts             # Browser context aggregation
│
└── agents/
    └── x-scout.ts             # Bestaande agent (refactor later)
```

---

## Platform Overwegingen

### Alle platforms (macOS, Linux, Windows)
- MCP server: puur Node.js, geen platform-specifieke code
- Chat router: puur JavaScript/TypeScript
- Claude API: HTTP calls, platform-onafhankelijk
- Event stream: standaard web protocols (SSE, WebSocket)
- Voice: Web Speech API (browser-provided)

### Platform-specifieke aandachtspunten
- **Paden:** Gebruik altijd `path.join()` en `os.homedir()`
- **MCP config locatie:**
  - macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
  - Linux: `~/.config/Claude/claude_desktop_config.json`
  - Windows: `%APPDATA%\Claude\claude_desktop_config.json`
- **Processen:** Port cleanup verschilt per platform (zie Linux-version docs)
