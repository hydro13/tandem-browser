# Fase 1: MCP Server — Claude Code/Cowork ↔ Tandem Bridge

> 2-3 sessies | Dependency: alleen `@modelcontextprotocol/sdk`
> Robin heeft Max Pro — Claude werkt via Cowork/Claude Code → MCP → Tandem API.

---

## Doel

Claude Code en Cowork kunnen via MCP tools de Tandem Browser bedienen. MCP is DE primaire Claude-integratie — er is geen directe API backend.

## Hoe het werkt

```
Robin opent Cowork → Cowork leest MCP config → start tandem-mcp bridge
tandem-mcp maakt HTTP calls naar localhost:8765 → Tandem API antwoordt
Tandem MOET draaien voor MCP werkt.
```

## Bestaande API (localhost:8765)

Auth: Bearer token in `~/.tandem/api-token`. Maar de middleware skipt requests zonder `origin` header, dus MCP server (lokaal) heeft geen token NODIG. Stuur het wel mee als best practice.

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

## Sessie 1.1: Basis MCP Server + Lees/Navigatie Tools

### Pre-checks
- [ ] Tandem draait op :8765 (`curl http://localhost:8765/status`)
- [ ] `npm install @modelcontextprotocol/sdk` succesvol
- [ ] API token bestaat (`cat ~/.tandem/api-token`)

### Bestanden

**`src/mcp/api-client.ts`** — HTTP wrapper voor Tandem API:
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

**`src/mcp/server.ts`** — MCP server met stdio transport.

### Tools sessie 1.1

| Tool | Parameters | API Endpoint | Return |
|------|-----------|--------------|--------|
| `tandem_navigate` | `url: string` | `POST /navigate` | success/error |
| `tandem_go_back` | - | `POST /navigate` met back | success/error |
| `tandem_go_forward` | - | `POST /navigate` met forward | success/error |
| `tandem_reload` | - | `POST /navigate` met reload | success/error |
| `tandem_read_page` | - | `GET /page-content` | titel + URL + markdown tekst (max 2000 woorden) |
| `tandem_screenshot` | - | `GET /screenshot` | base64 image (`image` content type) |
| `tandem_get_links` | - | `GET /page-content` of JS exec | alle links op pagina |
| `tandem_wait_for_load` | `timeout?: number` | polling op page status | success wanneer geladen |

### Kritieke regels

1. **NOOIT `console.log()`** — stdout = MCP protocol. Gebruik `console.error()` voor debugging.
2. **Screenshot als `image` content type** returnen:
   ```typescript
   { content: [{ type: "image", data: base64, mimeType: "image/png" }] }
   ```
3. **Content truncatie:** `tandem_read_page()` stuurt markdown (niet HTML), max 2000 woorden. Gebruik ContentExtractor.
4. **Activity logging:** Elke tool call → `POST /chat` met `from: "claude"` zodat Robin het ziet in het Kees panel.
5. **Error als Tandem niet draait:** `"Tandem Browser is niet actief. Start Tandem met 'npm start' en probeer opnieuw."`

### Package.json
```json
"mcp": "node dist/mcp/server.js"
```

### Verificatie
- [ ] MCP server start zonder errors
- [ ] Cowork kan `tandem_read_page()` aanroepen
- [ ] Cowork kan navigeren en pagina verandert in Tandem
- [ ] Screenshot geeft zichtbare image
- [ ] Tool calls verschijnen in Kees panel
- [ ] `npx tsc` — zero errors

---

## Sessie 1.2: Interactie + Tabs + Chat + Extra Tools

### Pre-checks
- [ ] Basis MCP server uit 1.1 werkt
- [ ] Cowork kan verbinden

### Tools sessie 1.2

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
| `tandem_send_message` | `text: string` | `POST /chat` met `from: "claude"` |
| `tandem_get_chat_history` | `limit?: number` | `GET /chat` |
| `tandem_search_bookmarks` | `query: string` | `GET /bookmarks/search` |
| `tandem_search_history` | `query: string` | `GET /history/search` |
| `tandem_get_context` | - | meerdere calls gecombineerd |

### Verificatie
- [ ] Complete flow: navigeer → lees → klik → typ werkt end-to-end
- [ ] Tab management werkt (open, focus, close)
- [ ] Chat berichten verschijnen in Kees panel
- [ ] Bookmarks/history search werkt
- [ ] `npx tsc` — zero errors

---

## Sessie 1.3: MCP Resources + Config + Documentatie

### MCP Resources

| URI | Inhoud | Update trigger |
|-----|--------|----------------|
| `tandem://page/current` | Huidige pagina content | Bij navigatie |
| `tandem://tabs/list` | Alle open tabs | Bij tab change |
| `tandem://chat/history` | Chat berichten | Bij nieuw bericht |
| `tandem://context` | Volledig browser overzicht | Bij elk event |

### MCP Config

**Voor Cowork:** Via Cowork plugin/MCP settings interface.

**Voor Claude Code:** `~/.claude/settings.json`:
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
1. Gebruik bestaande `ContentExtractor` (src/content/extractor.ts)
2. HTML → markdown via `turndown` (al geïnstalleerd)
3. Max 2000 woorden
4. Prioriteer: titel → headings → main content
5. Strip navigatie, footer, ads

### Verificatie
- [ ] Resources leesbaar vanuit Cowork
- [ ] Config docs zijn duidelijk
- [ ] Content truncatie werkt bij grote pagina's
- [ ] Setup guide geschreven

---

## Valkuilen

1. **MCP SDK versie:** Pin `^1.26.0`, niet `latest`
2. **stdio transport:** stdout = protocol, stderr = debug logging
3. **Tandem moet draaien:** Geef duidelijke error als API niet beschikbaar
4. **Screenshot formaat:** Gebruik MCP `image` content type
5. **Async:** Alle API calls zijn async, MCP tools moeten dit afhandelen
