# ⚠️ VERVALLEN — NIET IMPLEMENTEREN

> Dit document beschrijft directe Anthropic API integratie.
> Robin has a Max Pro account — no API key beschikbaar.
> Claude works via Cowork/Claude Code → MCP → Tandem API.
> Zie `VERFIJND-PLAN.md` for the correcte architectuur.
> The "Claude" aanwezigheid in the Kees panel is a Activity Feed
> that shows MCP tool calls, NOT a direct API backend.

---

# Phase 3: Claude Direct Backend — Sessie Context

## Wat is this?

Claude API direct integreren if chat backend in Tandem. No IDE nodig — Claude praat rechtstreeks in the Kees panel and can the browser bedienen via tool use.

## Verschil with MCP (Phase 1)

| | MCP Server (Phase 1) | Claude Backend (Phase 3) |
|---|---|---|
| **Waar draait Claude?** | In IDE (Cowork/Code) | In the browser zelf |
| **Communicatie** | stdio (MCP protocol) | HTTP (Anthropic API) |
| **Wie start the?** | User start Cowork | Automatisch bij chat |
| **Tools** | MCP tools | Anthropic tool use |
| **Voordeel** | IDE integratie | Standalone, always beschikbaar |

## Anthropic Messages API

**Endpoint:** `https://api.anthropic.com/v1/messages`

**Basis request:**
```typescript
{
  model: "claude-sonnet-4-5-20250929",  // or ander model
  max_tokens: 4096,
  system: "...",
  messages: [
    { role: "user", content: "..." },
    { role: "assistant", content: "..." }
  ],
  tools: [...],
  stream: true
}
```

**Tool Use Flow:**
1. Stuur bericht with tools
2. Claude antwoordt with `tool_use` content block
3. Voer tool out (call Tandem API)
4. Stuur `tool_result` terug
5. Claude verwerkt result and antwoordt
6. Herhaal tot Claude complete is (no tool_use meer)

### Tool Definitie Formaat (Anthropic)

```typescript
{
  name: "tandem_navigate",
  description: "Navigeer to a URL in the actieve browser tab",
  input_schema: {
    type: "object",
    properties: {
      url: { type: "string", description: "The URL to naartoe te navigeren" }
    },
    required: ["url"]
  }
}
```

### Streaming Response

```typescript
// Event types in the stream:
'message_start'      → Bericht begint
'content_block_start' → Content block begint (text or tool_use)
'content_block_delta' → Incrementeel text ('text_delta') or tool input ('input_json_delta')
'content_block_stop'  → Block complete
'message_delta'       → Stop reason update
'message_stop'        → Bericht compleet
```

## Implementatie

### ClaudeBackend Class

```typescript
class ClaudeBackend implements ChatBackend {
  private apiKey: string;
  private model: string;
  private conversation: Message[];
  private systemPrompt: string;
  private tools: Tool[];

  async sendMessage(text: string): Promise<void> {
    // 1. Voeg user message toe about conversation
    // 2. Bouw request with system prompt + context
    // 3. Stream response
    // 4. If tool_use: voer out, stuur result, herhaal
    // 5. If text: toon in chat
  }
}
```

### System Prompt

```
You bent Kees, Robin's AI co-pilot in Tandem Browser.
You helpt Robin with browsen, onderzoeken, and taken uitvoeren.

## Jouw capabilities
You kunt the browser bedienen with tools:
- Navigeren to URL's
- Page's read and analyseren
- Klikken op elementen
- Text typen in velden
- Screenshots maken
- Tabs beheren

## Context
Huidige page: {url} - {title}
Open tabs: {tab_list}

## Rules
- Reageer in the Nederlands tenzij anders gevraagd
- Question toestemming for ingrijpende acties (formulieren invullen, bestellen, etc.)
- Geef korte, duidelijke antwoorden
- If you iets not kunt, zeg that eerlijk
- You bent a co-pilot, not the piloot. Robin beslist.
```

### API Key Management

**Opslag:** In `~/.tandem/config.json`
```json
{
  "ai": {
    "claude": {
      "apiKey": "sk-ant-...",
      "model": "claude-sonnet-4-5-20250929",
      "maxTokens": 4096
    }
  }
}
```

**BELANGRIJK:** API key NOOIT in the renderer process. Altijd via main process.

**Flow:**
1. Settings UI: invoerveld for API key
2. Main process slaat key op in config
3. ClaudeBackend draait in main process
4. Chat berichten via IPC to renderer

### Tool Execution

```typescript
async function executeTool(name: string, input: any): Promise<any> {
  const apiBase = 'http://localhost:8765';
  const token = getApiToken();

  switch (name) {
    case 'tandem_navigate':
      return apiCall('POST', '/navigate', { url: input.url });
    case 'tandem_read_page':
      return apiCall('GET', '/page-content');
    case 'tandem_click':
      return apiCall('POST', '/click', { selector: input.selector });
    case 'tandem_type':
      return apiCall('POST', '/type', { selector: input.selector, text: input.text });
    case 'tandem_screenshot':
      const img = await apiCall('GET', '/screenshot');
      return { type: 'image', data: img };
    // ... etc
  }
}
```

## Token Management / Kosten

**Aandachtspunten:**
- Grote page's = veel tokens. Truncate to ~2000 woorden
- Screenshots: stuur if `image` content, not if base64 text
- Conversation history: max ~20 berichten, after that samenvatten
- Model choice: Sonnet for snelheid/kosten, Opus for complexe taken
- **Configureerbaar:** Laat Robin the model kiezen in settings

**Schatting kosten:**
- Gemiddeld gesprek: ~5000 input tokens + 1000 output tokens per beurt
- With tools: +2000 tokens per tool call
- ~$0.01-0.05 per beurt (Sonnet), ~$0.10-0.50 per beurt (Opus)

## Bekende Valkuilen

1. **CORS:** Anthropic API calls must vanuit main process (Node.js), not vanuit renderer (browser). Usage IPC bridge.
2. **Streaming:** SSE parsing is tricky. Usage `@anthropic-ai/sdk` that this afhandelt.
3. **Tool loops:** Claude can in a loop raken or tool calls. Stel a maximum in (bijv. 10 tool calls per beurt).
4. **Rate limits:** Anthropic has rate limits. Implementeer retry with backoff.
5. **Context overflow:** Bij lange gesprekken runs the context vol. Implementeer message pruning.

## Platform Considerations

- `@anthropic-ai/sdk` is purely Node.js — works op alle platforms
- API key opslag via cross-platform config manager
- No platform-specific code needed
