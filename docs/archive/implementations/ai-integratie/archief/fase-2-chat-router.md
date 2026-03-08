# Phase 2: Chat Router — Sessie Context

## Wat is this?

The Kees chat panel can nu only with OpenClaw praten. We maken a router zodat Robin can kiezen welke AI backend actief is: OpenClaw, Claude, or beide.

## Huidige Chat Implementatie

The chat logica zit inline in `shell/index.html` (rules ~1680-1880). Dit is a large blok code that:

1. WebSocket verbinding opens to `ws://127.0.0.1:18789`
2. Auth handshake doet with token
3. Berichten stuurt via `chat.send` RPC method
4. Streaming responses ontvangt via `chat` events
5. Reconnect logica has with exponential backoff

### Correcties out audit (12 feb 2026)

**Hardcoded token:** The OpenClaw token (`de07381e...`) op regel 1687 is hardcoded. Bij the refactoring must this dynamisch geladen be out `~/.openclaw/openclaw.json`.

**Claude backend:** In the originele plan was er a "ClaudeBackend" that the Anthropic API aanroept. Dit VERVALT (Max Pro, no API key). In plaats daarvan comes a **ClaudeActivityBackend** that MCP tool calls shows if berichten in the Kees panel.

**Voice:** Voice koppeling is meegenomen in this phase (~30 rules). No aparte phase 5 meer.

### WebSocket Protocol (OpenClaw)

```javascript
// Bericht sturen
{ type: 'req', id: uuid, method: 'chat.send', params: { sessionKey, message, idempotencyKey } }

// Streaming antwoord
{ type: 'event', event: 'chat', payload: { state: 'delta', message: { text: '...' } } }
{ type: 'event', event: 'chat', payload: { state: 'final' } }
{ type: 'event', event: 'chat', payload: { state: 'error', message: { text: '...' } } }
```

### Chat UI Elementen

```
#panel-chat          — Chat panel container
#oc-messages         — Berichten container
#oc-input            — Chat input textarea
#oc-send             — Send knop
#oc-typing           — Typing indicator
#ws-dot              — Connection status dot
#ws-status-text      — "Connected" / "Disconnected" text
```

## Refactoring Approach

### Step 1: ChatBackend Interface

```typescript
interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  source: string;          // 'openclaw' | 'claude' | 'robin'
  timestamp: number;
}

interface ChatBackend {
  id: string;              // 'openclaw' | 'claude'
  name: string;            // 'OpenClaw (Kees)' | 'Claude'
  icon: string;            // Emoji or icon

  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;

  sendMessage(text: string): Promise<void>;

  onMessage(cb: (msg: ChatMessage) => void): void;
  onTyping(cb: (typing: boolean) => void): void;
  onConnectionChange(cb: (connected: boolean) => void): void;
}
```

### Step 2: OpenClawBackend

Verplaats ALLE WebSocket logica out `index.html` to a class.
The class implementeert `ChatBackend`.

**Let op:** Dit is the meest risicovolle stap. The existing code works — breek the not.

**Approach:**
1. Kopieer the WebSocket code to a new class
2. Test that the class works
3. Vervang the inline code door calls to the class
4. Test again that alles still works

### Step 3: ChatRouter

```typescript
class ChatRouter {
  private backends: Folder<string, ChatBackend>;
  private activeBackendId: string;

  register(backend: ChatBackend): void;
  setActive(backendId: string): void;
  getActive(): ChatBackend;

  // Stuurt to actieve backend(s)
  sendMessage(text: string): Promise<void>;

  // Merged events or alle backends
  onMessage(cb: (msg: ChatMessage) => void): void;
}
```

### Step 4: UI Updates

Voeg toe boven the chat berichten-window:

```html
<div class="chat-backend-selector">
  <button class="backend-option active" data-backend="openclaw">
    <span class="backend-dot connected"></span>
    🐙 Kees
  </button>
  <button class="backend-option" data-backend="claude">
    <span class="backend-dot disconnected"></span>
    🤖 Claude
  </button>
  <!-- Later: "Both" button -->
</div>
```

## Bekende Risk's

1. **Inline code refactoring:** The chat code verwijst to veel DOM elementen. Zorg that alle referenties intact blijven.
2. **Reconnect logica:** OpenClaw has complexe reconnect. Dit must exact behouden blijven.
3. **Chat geschiedenis:** Overweeg: per backend or unified?
   - **Aanbeveling:** Unified chat, berichten getagged with bron
4. **Timing:** The refactoring can multiple sessions duren. Zorg that na elke session the app stabiel is.

## Chat Geschiedenis Strategie

**Unified approach:**
- Alle berichten in één list
- Elk bericht has a `source` field
- UI can optional filteren per bron
- Opgeslagen in `~/.tandem/chat-history.json`

```typescript
interface StoredMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  source: 'robin' | 'openclaw' | 'claude';
  timestamp: number;
  backend: string;   // welke backend the antwoord gaf
}
```

## Platform Considerations

- Chat router is purely JavaScript — platform-onafhankelijk
- WebSocket API is default in alle browsers/Electron
- No file system operaties in the router zelf
- Config opslag via existing config manager
