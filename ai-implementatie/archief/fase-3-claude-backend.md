# ⚠️ VERVALLEN — NIET IMPLEMENTEREN

> Dit document beschrijft directe Anthropic API integratie.
> Robin heeft een Max Pro account — geen API key beschikbaar.
> Claude werkt via Cowork/Claude Code → MCP → Tandem API.
> Zie `VERFIJND-PLAN.md` voor de correcte architectuur.
> De "Claude" aanwezigheid in het Kees panel wordt een Activity Feed
> die MCP tool calls toont, GEEN directe API backend.

---

# Fase 3: Claude Direct Backend — Sessie Context

## Wat is dit?

Claude API direct integreren als chat backend in Tandem. Geen IDE nodig — Claude praat rechtstreeks in het Kees panel en kan de browser bedienen via tool use.

## Verschil met MCP (Fase 1)

| | MCP Server (Fase 1) | Claude Backend (Fase 3) |
|---|---|---|
| **Waar draait Claude?** | In IDE (Cowork/Code) | In de browser zelf |
| **Communicatie** | stdio (MCP protocol) | HTTP (Anthropic API) |
| **Wie start het?** | Gebruiker start Cowork | Automatisch bij chat |
| **Tools** | MCP tools | Anthropic tool use |
| **Voordeel** | IDE integratie | Standalone, altijd beschikbaar |

## Anthropic Messages API

**Endpoint:** `https://api.anthropic.com/v1/messages`

**Basis request:**
```typescript
{
  model: "claude-sonnet-4-5-20250929",  // of ander model
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
1. Stuur bericht met tools
2. Claude antwoordt met `tool_use` content block
3. Voer tool uit (call Tandem API)
4. Stuur `tool_result` terug
5. Claude verwerkt result en antwoordt
6. Herhaal tot Claude klaar is (geen tool_use meer)

### Tool Definitie Formaat (Anthropic)

```typescript
{
  name: "tandem_navigate",
  description: "Navigeer naar een URL in de actieve browser tab",
  input_schema: {
    type: "object",
    properties: {
      url: { type: "string", description: "De URL om naartoe te navigeren" }
    },
    required: ["url"]
  }
}
```

### Streaming Response

```typescript
// Event types in de stream:
'message_start'      → Bericht begint
'content_block_start' → Content block begint (text of tool_use)
'content_block_delta' → Incrementeel tekst ('text_delta') of tool input ('input_json_delta')
'content_block_stop'  → Block klaar
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
    // 1. Voeg user message toe aan conversation
    // 2. Bouw request met system prompt + context
    // 3. Stream response
    // 4. Als tool_use: voer uit, stuur result, herhaal
    // 5. Als text: toon in chat
  }
}
```

### System Prompt

```
Je bent Kees, Robin's AI co-pilot in Tandem Browser.
Je helpt Robin met browsen, onderzoeken, en taken uitvoeren.

## Jouw capabilities
Je kunt de browser bedienen met tools:
- Navigeren naar URL's
- Pagina's lezen en analyseren
- Klikken op elementen
- Tekst typen in velden
- Screenshots maken
- Tabs beheren

## Context
Huidige pagina: {url} - {title}
Open tabs: {tab_list}

## Regels
- Reageer in het Nederlands tenzij anders gevraagd
- Vraag toestemming voor ingrijpende acties (formulieren invullen, bestellen, etc.)
- Geef korte, duidelijke antwoorden
- Als je iets niet kunt, zeg dat eerlijk
- Je bent een co-pilot, niet de piloot. Robin beslist.
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

**BELANGRIJK:** API key NOOIT in de renderer process. Altijd via main process.

**Flow:**
1. Settings UI: invoerveld voor API key
2. Main process slaat key op in config
3. ClaudeBackend draait in main process
4. Chat berichten via IPC naar renderer

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
- Grote pagina's = veel tokens. Truncate naar ~2000 woorden
- Screenshots: stuur als `image` content, niet als base64 text
- Conversation history: max ~20 berichten, daarna samenvatten
- Model keuze: Sonnet voor snelheid/kosten, Opus voor complexe taken
- **Configureerbaar:** Laat Robin het model kiezen in settings

**Schatting kosten:**
- Gemiddeld gesprek: ~5000 input tokens + 1000 output tokens per beurt
- Met tools: +2000 tokens per tool call
- ~$0.01-0.05 per beurt (Sonnet), ~$0.10-0.50 per beurt (Opus)

## Bekende Valkuilen

1. **CORS:** Anthropic API calls moeten vanuit main process (Node.js), niet vanuit renderer (browser). Gebruik IPC bridge.
2. **Streaming:** SSE parsing is tricky. Gebruik `@anthropic-ai/sdk` die dit afhandelt.
3. **Tool loops:** Claude kan in een loop raken van tool calls. Stel een maximum in (bijv. 10 tool calls per beurt).
4. **Rate limits:** Anthropic heeft rate limits. Implementeer retry met backoff.
5. **Context overflow:** Bij lange gesprekken loopt de context vol. Implementeer message pruning.

## Platform Overwegingen

- `@anthropic-ai/sdk` is puur Node.js — werkt op alle platforms
- API key opslag via cross-platform config manager
- Geen platform-specifieke code nodig
