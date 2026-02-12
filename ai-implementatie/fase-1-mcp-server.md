# Fase 1: MCP Server — Sessie Context

## Wat is dit?

Een MCP (Model Context Protocol) server die Claude Code en Claude Cowork in staat stelt de Tandem Browser te bedienen via tools. MCP is Anthropic's standaard protocol voor tool-integratie.

## Waarom MCP?

- Claude Code/Cowork ondersteunen MCP native
- Standaard protocol, goed gedocumenteerd
- Tools zijn typesafe en self-documenting
- Resources bieden auto-updating context

## Bestaande API die gewrapped wordt

Tandem heeft een HTTP API op `localhost:8765`. De MCP server is een dunne wrapper daaromheen.

**API Authenticatie:**
- Token in `~/.tandem/api-token` (32-byte hex)
- Header: `Authorization: Bearer <token>`
- Localhost requests zijn exempt van auth

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

Bestand: `src/mcp/api-client.ts`

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

Bestand: `src/mcp/server.ts`

Gebruik `@modelcontextprotocol/sdk` met stdio transport.
Definieer tools per categorie.

**Referentie:** https://modelcontextprotocol.io/docs/concepts/tools

### 4. Claude Code MCP Config

Bestand template: `tandem-mcp-config.json`

```json
{
  "mcpServers": {
    "tandem-browser": {
      "command": "node",
      "args": ["<pad-naar-tandem>/dist/mcp/server.js"],
      "env": {}
    }
  }
}
```

Dit moet gemerged worden in:
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Linux: `~/.config/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

Of voor Claude Code: `.claude/settings.json` in het project of `~/.claude/settings.json` globally.

### 5. TypeScript Config

Voeg toe aan `tsconfig.json`:
```json
{
  "include": ["src/**/*.ts"]  // moet src/mcp/ includen
}
```

## Test Strategie

### Handmatig testen
1. Start Tandem: `npm start`
2. Start MCP server apart: `node dist/mcp/server.js`
3. Test met Claude Code: configureer MCP, vraag Claude om pagina te lezen

### Automatisch testen
Maak een test script: `scripts/test-mcp.ts`
```typescript
// Roep elke tool aan en check het result
// Vergelijk met directe API call resultaten
```

## Bekende Valkuilen

1. **MCP SDK versie:** Check de latest versie, API kan veranderd zijn
2. **stdio transport:** MCP server moet op stdin/stdout communiceren, geen console.log gebruiken voor debugging (gebruik stderr)
3. **Tandem moet draaien:** MCP server faalt als API niet beschikbaar is — geef duidelijke error
4. **Screenshot formaat:** MCP tools ondersteunen `image` content type — gebruik dit voor screenshots
5. **Async tools:** Alle API calls zijn async, MCP tools moeten dit correct afhandelen

## Definities & Links

- **MCP:** Model Context Protocol — https://modelcontextprotocol.io/
- **MCP SDK:** `@modelcontextprotocol/sdk` — npm package
- **stdio transport:** Communicatie via stdin/stdout, standaard voor CLI tools
- **Tool:** Een functie die Claude kan aanroepen met parameters
- **Resource:** Een data bron die Claude kan lezen (auto-updating)
