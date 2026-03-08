# Tandem Browser — AI Architectuur

## Huidige staat or the codebase

### API Server (src/api/server.ts)
- HTTP op `localhost:8765`
- Bearer token authenticatie (opgeslagen in `~/.tandem/api-token`)
- 60+ endpoints for full browser control

### Existing API Endpoints (relevant for AI)

#### Browser Control
| Method | Endpoint | Wat the doet |
|--------|----------|-------------|
| POST | `/navigate` | URL laden in actieve tab |
| POST | `/click` | Element clicking (CSS selector, menselijke delays) |
| POST | `/type` | Text typen (karakter for karakter, menselijk) |
| POST | `/scroll` | Page scrollen |
| POST | `/execute-js` | JavaScript uitvoeren op page |
| GET | `/page-content` | Page text, title, description extracten |
| GET | `/page-html` | Ruwe HTML ophalen |
| GET | `/screenshot` | Screenshot or actieve webview |

#### Tab Management
| Method | Endpoint | Wat the doet |
|--------|----------|-------------|
| POST | `/tabs/open` | New tab (source: robin/kees) |
| POST | `/tabs/close` | Tab sluiten |
| GET | `/tabs/list` | Alle tabs ophalen |
| POST | `/tabs/focus` | Tab focussen |

#### Chat & Panel
| Method | Endpoint | Wat the doet |
|--------|----------|-------------|
| GET | `/chat` | Chat berichten ophalen |
| POST | `/chat` | Bericht sturen (from=robin|kees) |
| POST | `/chat/typing` | Typing indicator |
| POST | `/panel/toggle` | Kees panel tonen/verbergen |

#### Screenshots & Content
| Method | Endpoint | Wat the doet |
|--------|----------|-------------|
| GET | `/screenshot/annotated` | Last annotated screenshot |
| POST | `/content/extract` | Gestructureerde content extractie |
| GET | `/screenshots` | List recente screenshots |

#### Voice
| Method | Endpoint | Wat the doet |
|--------|----------|-------------|
| POST | `/voice/start` | Spraakherkenning starten |
| POST | `/voice/stop` | Spraakherkenning stoppen |
| GET | `/voice/status` | Voice status |

### IPC Bridge (src/preload.ts)
Alle browser functies are beschikbaar via `window.tandem.*` in the renderer.
Zie the full list in the visie documentatie.

### OpenClaw Chat (shell/index.html, rules 1680-1880)
- WebSocket to `ws://127.0.0.1:18789`
- RPC protocol with `req/res/event` types
- Auth token: `[redacted leaked token]`
- Session key: `agent:main:main`
- Streaming responses via `chat` events with `delta/final/error` states

### Claude Integration (via MCP — NOT a direct API)

**BELANGRIJK:** Robin has a Max Pro account. Claude is NIET via the Anthropic API geïntegreerd but via MCP (Model Context Protocol).

**Werking:**
1. Cowork/Claude Code start → leest MCP config → start tandem-mcp server
2. tandem-mcp maakt HTTP calls to localhost:8765 (Tandem API)
3. Claude can via MCP tools the browser bedienen
4. MCP tool calls be gelogd to chat API → visible in Kees panel

**MCP Config (Cowork):** Via Cowork plugin/MCP settings
**MCP Config (Claude Code):** `~/.claude/settings.json`

**No `@anthropic-ai/sdk` dependency nodig.**

### Agent System (src/agents/)
- X-Scout agent if voorbeeld or autonome browser-agent
- Menselijke timing model (delays between acties)
- State management with approvals

---

## New Componenten (te bouwen)

### Component 1: MCP Server (`src/mcp/`)

**Goal:** Claude Code/Cowork can the browser bedienen via MCP tools.

**Technologie:** `@modelcontextprotocol/sdk` (npm package)

**Tools that exposed be:**

```typescript
// Navigatie
tandem_navigate(url: string)                    // URL openen
tandem_go_back()                                // Terug
tandem_go_forward()                             // Vooruit
tandem_reload()                                 // Herladen

// Page read
tandem_read_page()                              // Text + metadata or huidige page
tandem_read_html()                              // Ruwe HTML
tandem_screenshot()                             // Screenshot if base64 image
tandem_extract_content()                        // Gestructureerde content

// Interactie
tandem_click(selector: string)                  // Element clicking
tandem_type(selector: string, text: string)     // Text invoeren
tandem_scroll(direction: 'up'|'down', amount?)  // Scrollen
tandem_execute_js(code: string)                 // JavaScript uitvoeren

// Tabs
tandem_list_tabs()                              // Alle tabs
tandem_open_tab(url?: string)                   // New tab
tandem_close_tab(tabId: string)                 // Tab sluiten
tandem_focus_tab(tabId: string)                 // Tab focussen

// Chat
tandem_send_message(text: string)               // Bericht in Kees panel
tandem_get_chat_history(limit?: number)         // Chat geschiedenis

// Context
tandem_get_context()                            // Alles: huidige URL, title, tabs, etc.

// Bookmarks
tandem_bookmark(url: string, title: string)     // Bookmark add
tandem_search_bookmarks(query: string)          // Bookmarks zoeken
```

**Resources that exposed be:**
```typescript
tandem://page/current     // Huidige page content (auto-updated)
tandem://tabs/list        // List or open tabs
tandem://chat/history     // Chat geschiedenis
tandem://screenshot/last  // Last screenshot
```

**Transport:** stdio (for Claude Code/Cowork integratie)

---

### Component 2: Chat Router (`src/chat/router.ts`)

**Goal:** Kees panel can with multiple AI backends praten.

**Backends:**
```typescript
interface ChatBackend {
  id: string;                              // 'openclaw' | 'claude' | ...
  name: string;                            // Display name
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  sendMessage(text: string): Promise<void>;
  onMessage(callback: (msg) => void): void;
  onTyping(callback: (typing) => void): void;
  isConnected(): boolean;
}
```

**Implementaties:**
1. `OpenClawBackend` — existing WebSocket logica, gerefactored
2. `ClaudeBackend` — directe Anthropic API calls with tools
3. `DualBackend` — stuurt to beiden, merged responses

**UI Changes (Kees Panel):**
- Dropdown/selector boven the chat to backend te kiezen
- Status indicator per backend (connected/disconnected)
- Optie "Beide" to parallel te chatten

---

### Component 3: Claude Direct Backend (`src/chat/backends/claude.ts`)

**Goal:** Claude API direct aanroepen vanuit the browser, without Cowork.

**Werking:**
1. Anthropic API key opgeslagen in config
2. System prompt with Tandem context + beschikbare acties
3. Tool use: Claude can browser-tools aanroepen via the lokale API
4. Streaming responses for real-time chat

**System Prompt Template:**
```
You bent Kees, Robin's AI co-pilot in Tandem Browser.
You kunt the browser bedienen with the next tools:
[... tool definities ...]

You sees currently:
- URL: {current_url}
- Title: {page_title}
- Tabs: {tab_list}

Reageer always in the Nederlands tenzij anders gevraagd.
```

---

### Component 4: Event Stream (`src/events/stream.ts`)

**Goal:** AI gets real-time updates or wat Robin doet.

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
    screenshot?: string;  // base64, only bij key events
  };
}
```

**Transport opties:**
1. **SSE (Server-Sent Events)** — `GET /events/stream` for HTTP clients
2. **WebSocket** — for real-time bidirectioneel
3. **MCP Notifications** — for Claude Code/Cowork
4. **In-memory** — for lokale backends (Claude Direct)

---

### Component 5: Context Manager (`src/context/manager.ts`)

**Goal:** Houdt a actueel beeld bij or the browser staat for AI consumption.

```typescript
interface BrowserContext {
  activeTab: {
    id: string;
    url: string;
    title: string;
    content?: string;        // Geextraheerde text (lazy loaded)
    screenshot?: string;     // Base64 (periodic or on-demand)
  };
  tabs: Array<{id, url, title, source}>;
  chat: Array<{role, text, timestamp}>;
  recentEvents: BrowserEvent[];   // Last 50 events
  voiceActive: boolean;
  drawMode: boolean;
}
```

**Update triggers:**
- Navigatie → update URL/title
- Page load → update content
- Tab switch → update activeTab
- Periodic (30s) → update screenshot if AI actief is

---

## Data Flow: Compleet Scenario

### Robin zegt "zoek informatie over X" via voice

```
1. Robin spreekt → Voice API → speech-to-text
2. Text appears in Kees chat input
3. Chat Router stuurt to actieve backend(s)
4. Backend (Claude/OpenClaw) ontvangt bericht + browser context
5. AI besluit: "Ik ga Google doorzoeken"
6. AI roept tandem_navigate("https://google.com/search?q=X") about
7. Browser navigeert, Event Stream stuurt 'navigation' event
8. Page loads, Event Stream stuurt 'page-loaded' with content
9. AI leest resultaten via tandem_read_page()
10. AI clicks op first resultaat via tandem_click("h3 a")
11. Page loads, AI leest content
12. AI stuurt samenvatting to Kees chat
13. Robin sees antwoord in Kees panel
```

### Claude Cowork session in the IDE

```
1. Robin opens Claude Code/Cowork in VSCode
2. MCP server verbindt with Tandem API (:8765)
3. Robin zegt: "Kijk eens to the LinkedIn page that open staat"
4. Cowork roept tandem_screenshot() + tandem_read_page() about
5. Cowork sees the page content and screenshot
6. Cowork analyseert and geeft feedback in the IDE
7. Robin: "Open also hun website in a new tab"
8. Cowork roept tandem_open_tab("https://company.com") about
9. Browser opens new tab
10. Cowork leest beide page's and vergelijkt
```

---

## Bestandsstructuur (new)

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
    └── x-scout.ts             # Existing agent (refactor later)
```

---

## Platform Considerations

### Alle platforms (macOS, Linux, Windows)
- MCP server: purely Node.js, no platform-specific code
- Chat router: purely JavaScript/TypeScript
- Claude API: HTTP calls, platform-onafhankelijk
- Event stream: default web protocols (SSE, WebSocket)
- Voice: Web Speech API (browser-provided)

### Platform-specific aandachtspunten
- **Paden:** Usage always `path.join()` and `os.homedir()`
- **MCP config locatie:**
  - macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
  - Linux: `~/.config/Claude/claude_desktop_config.json`
  - Windows: `%APPDATA%\Claude\claude_desktop_config.json`
- **Processen:** Port cleanup verschilt per platform (zie Linux-version docs)
