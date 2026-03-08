# Phase 1: MCP Server — Claude Code/Cowork ↔ Tandem Bridge

> 2-3 sessions | Dependency: only `@modelcontextprotocol/sdk`
> Robin has Max Pro — Claude works via Cowork/Claude Code → MCP → Tandem API.

---

## Goal

Claude Code and Cowork can via MCP tools the Tandem Browser bedienen. MCP is DE primaire Claude-integratie — er is no directe API backend.

## Hoe the works

```
Robin opens Cowork → Cowork leest MCP config → start tandem-mcp bridge
tandem-mcp maakt HTTP calls to localhost:8765 → Tandem API antwoordt
Tandem MOET draaien for MCP works.
```

## Existing API (localhost:8765)

Auth: Bearer token in `~/.tandem/api-token`. Maar the middleware skipt requests without `origin` header, dus MCP server (local) has no token NODIG. Stuur the indeed mee if best practice.

```
POST /navigate          body: { url }
GET  /page-content      returns: { title, url, text, description }
GET  /page-html         returns: { html }
POST /click             body: { selector, text? }
POST /type              body: { selector, text }
POST /scroll            body: { direction, amount? }
POST /execute-js        body: { code }
GET  /screenshot        returns: PNG image
GET  /tabs/list         returns: { tabs: [...] }
POST /tabs/open         body: { url?, source? }
POST /tabs/close        body: { tabId }
POST /tabs/focus        body: { tabId }
GET  /chat              returns: { messages: [...] }
POST /chat              body: { message, from? }
POST /content/extract   returns: structured content
GET  /bookmarks/search  body: { query }
GET  /history/search    body: { query }
```

---

## Sessie 1.1: Basis MCP Server + Read/Navigatie Tools

### Pre-checks
- [ ] Tandem draait op :8765 (`curl http://localhost:8765/status`)
- [ ] `npm install @modelcontextprotocol/sdk` succesvol
- [ ] API token exists (`cat ~/.tandem/api-token`)

### Files

**`src/mcp/api-client.ts`** — HTTP wrapper for Tandem API:
```typescript
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const API_BASE = 'http://localhost:8765';

function getToken(): string {
  const tokenPath = path.join(os.homedir(), '.tandem', 'api-token');
  return fs.readFileSync(tokenPath, 'utf-8').trim();
}

export async function apiCall(method: string, endpoint: string, body?: any) {
  const token = getToken();
  const response = await fetch(`${API_BASE}${endpoint}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: body ? JSON.stringify(body) : undefined
  });

  if (!response.ok) {
    throw new Error(`Tandem API error: ${response.status} ${response.statusText}`);
  }

  const contentType = response.headers.get('content-type');
  if (contentType?.includes('image/')) {
    const buffer = await response.arrayBuffer();
    return Buffer.from(buffer).toString('base64');
  }

  return response.json();
}
```

**`src/mcp/server.ts`** — MCP server with stdio transport.

### Tools session 1.1

| Tool | Parameters | API Endpoint | Return |
|------|-----------|--------------|--------|
| `tandem_navigate` | `url: string` | `POST /navigate` | success/error |
| `tandem_go_back` | - | `POST /navigate` with back | success/error |
| `tandem_go_forward` | - | `POST /navigate` with forward | success/error |
| `tandem_reload` | - | `POST /navigate` with reload | success/error |
| `tandem_read_page` | - | `GET /page-content` | title + URL + markdown text (max 2000 woorden) |
| `tandem_screenshot` | - | `GET /screenshot` | base64 image (`image` content type) |
| `tandem_get_links` | - | `GET /page-content` or JS exec | alle links op page |
| `tandem_wait_for_load` | `timeout?: number` | polling op page status | success wanneer geladen |

### Kritieke rules

1. **NOOIT `console.log()`** — stdout = MCP protocol. Usage `console.error()` for debugging.
2. **Screenshot if `image` content type** returnen:
   ```typescript
   { content: [{ type: "image", data: base64, mimeType: "image/png" }] }
   ```
3. **Content truncatie:** `tandem_read_page()` stuurt markdown (not HTML), max 2000 woorden. Usage ContentExtractor.
4. **Activity logging:** Elke tool call → `POST /chat` with `from: "claude"` zodat Robin the sees in the Kees panel.
5. **Error if Tandem not draait:** `"Tandem Browser is not actief. Start Tandem with 'npm start' and probeer again."`

### Package.json
```json
"mcp": "node dist/mcp/server.js"
```

### Verificatie
- [ ] MCP server start without errors
- [ ] Cowork can `tandem_read_page()` aanroepen
- [ ] Cowork can navigeren and page verandert in Tandem
- [ ] Screenshot geeft zichtbare image
- [ ] Tool calls verschijnen in Kees panel
- [ ] `npx tsc` — zero errors

---

## Sessie 1.2: Interactie + Tabs + Chat + Extra Tools

### Pre-checks
- [ ] Basis MCP server out 1.1 works
- [ ] Cowork can verbinden

### Tools session 1.2

| Tool | Parameters | API Endpoint |
|------|-----------|--------------|
| `tandem_click` | `selector: string, text?: string` | `POST /click` |
| `tandem_type` | `selector: string, text: string` | `POST /type` |
| `tandem_scroll` | `direction: 'up'\|'down', amount?: number` | `POST /scroll` |
| `tandem_execute_js` | `code: string` | `POST /execute-js` |
| `tandem_list_tabs` | - | `GET /tabs/list` |
| `tandem_open_tab` | `url?: string` | `POST /tabs/open` |
| `tandem_close_tab` | `tabId: string` | `POST /tabs/close` |
| `tandem_focus_tab` | `tabId: string` | `POST /tabs/focus` |
| `tandem_send_message` | `text: string` | `POST /chat` with `from: "claude"` |
| `tandem_get_chat_history` | `limit?: number` | `GET /chat` |
| `tandem_search_bookmarks` | `query: string` | `GET /bookmarks/search` |
| `tandem_search_history` | `query: string` | `GET /history/search` |
| `tandem_get_context` | - | multiple calls gecombineerd |

### Verificatie
- [ ] Complete flow: navigeer → read → click → typ works end-to-end
- [ ] Tab management works (open, focus, close)
- [ ] Chat berichten verschijnen in Kees panel
- [ ] Bookmarks/history search works
- [ ] `npx tsc` — zero errors

---

## Sessie 1.3: MCP Resources + Config + Documentatie

### MCP Resources

| URI | Inhoud | Update trigger |
|-----|--------|----------------|
| `tandem://page/current` | Huidige page content | Bij navigatie |
| `tandem://tabs/list` | Alle open tabs | Bij tab change |
| `tandem://chat/history` | Chat berichten | Bij new bericht |
| `tandem://context` | Fully browser overzicht | Bij elk event |

### MCP Config

**For Cowork:** Via Cowork plugin/MCP settings interface.

**For Claude Code:** `~/.claude/settings.json`:
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

### Content truncatie

Implementeer in `tandem_read_page`:
1. Usage existing `ContentExtractor` (src/content/extractor.ts)
2. HTML → markdown via `turndown` (already geïnstalleerd)
3. Max 2000 woorden
4. Prioriteer: title → headings → main content
5. Strip navigatie, footer, ads

### Verificatie
- [ ] Resources leesbaar vanuit Cowork
- [ ] Config docs are duidelijk
- [ ] Content truncatie works bij grote page's
- [ ] Setup guide geschreven

---

## Valkuilen

1. **MCP SDK versie:** Pin `^1.26.0`, not `latest`
2. **stdio transport:** stdout = protocol, stderr = debug logging
3. **Tandem must draaien:** Geef duidelijke error if API not beschikbaar
4. **Screenshot formaat:** Usage MCP `image` content type
5. **Async:** Alle API calls are async, MCP tools must this afhandelen
