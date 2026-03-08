# Phase 1: MCP Server — Sessie Context

## Wat is this?

A MCP (Model Context Protocol) server that Claude Code and Claude Cowork in staat stelt the Tandem Browser te bedienen via tools. MCP is Anthropic's default protocol for tool-integratie.

## Why MCP?

- Claude Code/Cowork ondersteunen MCP native
- Default protocol, goed gedocumenteerd
- Tools are typesafe and self-documenting
- Resources bieden auto-updating context

## Existing API that gewrapped is

Tandem has a HTTP API op `localhost:8765`. The MCP server is a dunne wrapper daaromheen.

**API Authenticatie:**
- Token in `~/.tandem/api-token` (32-byte hex)
- Header: `Authorization: Bearer <token>`
- Localhost requests are exempt or auth

### Correcties out audit (12 feb 2026)

**Auth:** The auth middleware skips requests without an `origin` header. This means the MCP server (which sends no origin) does NOT need a token for local calls. Still send the token as a best practice.

**Extra tools (not in origineel plan):**
- `tandem_get_links()` — alle links op the page
- `tandem_wait_for_load()` — wait tot page geladen na navigatie
- `tandem_search_bookmarks(query)` — bookmarks doorzoeken
- `tandem_search_history(query)` — history doorzoeken
- `tandem_get_context()` — alles in één call

**Activity logging:** Elke MCP tool call → `POST /chat` with `from: "claude"` zodat Robin in the Kees panel sees wat Claude about the doen is.

**Content truncatie:** `tandem_read_page()` must markdown returnen (not HTML), max 2000 woorden, via ContentExtractor.

**Logging:** Usage `console.error()` for debugging, NOOIT `console.log()` (stdout = MCP protocol).

**Relevante endpoints:**

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
```

## Implementatie Stappen

### 1. Installeer MCP SDK

```bash
npm install @modelcontextprotocol/sdk
```

### 2. Maak API Client

File: `src/mcp/api-client.ts`

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
    throw new Error(`API error: ${response.status} ${response.statusText}`);
  }

  const contentType = response.headers.get('content-type');
  if (contentType?.includes('image/')) {
    const buffer = await response.arrayBuffer();
    return Buffer.from(buffer).toString('base64');
  }

  return response.json();
}
```

### 3. Maak MCP Server

File: `src/mcp/server.ts`

Usage `@modelcontextprotocol/sdk` with stdio transport.
Definieer tools per categorie.

**Referentie:** https://modelcontextprotocol.io/docs/concepts/tools

### 4. Claude Code MCP Config

File template: `tandem-mcp-config.json`

```json
{
  "mcpServers": {
    "tandem-browser": {
      "command": "node",
      "args": ["<pad-to-tandem>/dist/mcp/server.js"],
      "env": {}
    }
  }
}
```

Dit must gemerged be in:
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Linux: `~/.config/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

Or for Claude Code: `.claude/settings.json` in the project or `~/.claude/settings.json` globally.

### 5. TypeScript Config

Voeg toe about `tsconfig.json`:
```json
{
  "include": ["src/**/*.ts"]  // must src/mcp/ includen
}
```

## Test Strategie

### Handmatig testen
1. Start Tandem: `npm start`
2. Start MCP server apart: `node dist/mcp/server.js`
3. Test with Claude Code: configureer MCP, question Claude to page to read

### Automatisch testen
Maak a test script: `scripts/test-mcp.ts`
```typescript
// Roep elke tool about and check the result
// Vergelijk with directe API call resultaten
```

## Bekende Valkuilen

1. **MCP SDK versie:** Check the latest versie, API can veranderd are
2. **stdio transport:** MCP server must op stdin/stdout communicate, no console.log use for debugging (usage stderr)
3. **Tandem must draaien:** MCP server faalt if API not beschikbaar is — geef duidelijke error
4. **Screenshot formaat:** MCP tools ondersteunen `image` content type — usage this for screenshots
5. **Async tools:** Alle API calls are async, MCP tools must this correct afhandelen

## Definities & Links

- **MCP:** Model Context Protocol — https://modelcontextprotocol.io/
- **MCP SDK:** `@modelcontextprotocol/sdk` — npm package
- **stdio transport:** Communicatie via stdin/stdout, default for CLI tools
- **Tool:** A function that Claude can aanroepen with parameters
- **Resource:** A data bron that Claude can read (auto-updating)
