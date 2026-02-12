# Fase 2: Chat Router — Sessie Context

## Wat is dit?

Het Kees chat panel kan nu alleen met OpenClaw praten. We maken een router zodat Robin kan kiezen welke AI backend actief is: OpenClaw, Claude, of beide.

## Huidige Chat Implementatie

De chat logica zit inline in `shell/index.html` (regels ~1680-1880). Dit is een groot blok code dat:

1. WebSocket verbinding opent naar `ws://127.0.0.1:18789`
2. Auth handshake doet met token
3. Berichten stuurt via `chat.send` RPC method
4. Streaming responses ontvangt via `chat` events
5. Reconnect logica heeft met exponential backoff

### Correcties uit audit (12 feb 2026)

**Hardcoded token:** Het OpenClaw token (`de07381e...`) op regel 1687 is hardcoded. Bij de refactoring moet dit dynamisch geladen worden uit `~/.openclaw/openclaw.json`.

**Claude backend:** In het originele plan was er een "ClaudeBackend" die de Anthropic API aanroept. Dit VERVALT (Max Pro, geen API key). In plaats daarvan komt een **ClaudeActivityBackend** die MCP tool calls toont als berichten in het Kees panel.

**Voice:** Voice koppeling wordt meegenomen in deze fase (~30 regels). Geen aparte fase 5 meer.

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
#ws-status-text      — "Connected" / "Disconnected" tekst
```

## Refactoring Aanpak

### Stap 1: ChatBackend Interface

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
  icon: string;            // Emoji of icon

  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;

  sendMessage(text: string): Promise<void>;

  onMessage(cb: (msg: ChatMessage) => void): void;
  onTyping(cb: (typing: boolean) => void): void;
  onConnectionChange(cb: (connected: boolean) => void): void;
}
```

### Stap 2: OpenClawBackend

Verplaats ALLE WebSocket logica uit `index.html` naar een class.
De class implementeert `ChatBackend`.

**Let op:** Dit is de meest risicovolle stap. De bestaande code werkt — breek het niet.

**Aanpak:**
1. Kopieer de WebSocket code naar een nieuwe class
2. Test dat de class werkt
3. Vervang de inline code door calls naar de class
4. Test opnieuw dat alles nog werkt

### Stap 3: ChatRouter

```typescript
class ChatRouter {
  private backends: Map<string, ChatBackend>;
  private activeBackendId: string;

  register(backend: ChatBackend): void;
  setActive(backendId: string): void;
  getActive(): ChatBackend;

  // Stuurt naar actieve backend(s)
  sendMessage(text: string): Promise<void>;

  // Merged events van alle backends
  onMessage(cb: (msg: ChatMessage) => void): void;
}
```

### Stap 4: UI Updates

Voeg toe boven het chat berichten-venster:

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
  <!-- Later: "Beide" knop -->
</div>
```

## Bekende Risico's

1. **Inline code refactoring:** De chat code verwijst naar veel DOM elementen. Zorg dat alle referenties intact blijven.
2. **Reconnect logica:** OpenClaw heeft complexe reconnect. Dit moet exact behouden blijven.
3. **Chat geschiedenis:** Overweeg: per backend of unified?
   - **Aanbeveling:** Unified chat, berichten getagged met bron
4. **Timing:** De refactoring kan meerdere sessies duren. Zorg dat na elke sessie de app stabiel is.

## Chat Geschiedenis Strategie

**Unified approach:**
- Alle berichten in één lijst
- Elk bericht heeft een `source` veld
- UI kan optioneel filteren per bron
- Opgeslagen in `~/.tandem/chat-history.json`

```typescript
interface StoredMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  source: 'robin' | 'openclaw' | 'claude';
  timestamp: number;
  backend: string;   // welke backend het antwoord gaf
}
```

## Platform Overwegingen

- Chat router is puur JavaScript — platform-onafhankelijk
- WebSocket API is standaard in alle browsers/Electron
- Geen file system operaties in de router zelf
- Config opslag via bestaande config manager
