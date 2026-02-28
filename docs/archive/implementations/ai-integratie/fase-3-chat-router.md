# Fase 3: Chat Router + Voice Koppeling

> 2-3 sessies | Geen nieuwe dependencies
> ⚠️ RISKANTSTE FASE — 200+ regels inline WebSocket code refactoren.

---

## Doel

Het Kees panel kan met meerdere AI backends communiceren: OpenClaw (live chat) en Claude (activity feed via MCP). Robin kan switchen. Voice input gaat automatisch naar de actieve backend.

## Huidige staat

De OpenClaw chat logica zit **inline** in `shell/index.html` (regels 1681-1894):
- WebSocket naar `ws://127.0.0.1:18789`
- Token **HARDCODED**: `[redacted leaked token]` (MOET gefixt)
- RPC protocol: `{ type: 'req', method: 'chat.send', params: { sessionKey, message } }`
- Streaming: `delta` → `final` → `error` states
- Reconnect met exponential backoff
- Session key: `agent:main:main`

### DOM elementen
```
#chat-messages      — berichten container
#chat-input         — input textarea
#chat-send-btn      — send knop
#typing-indicator   — typing indicator
#ws-dot             — connection status dot
#ws-status-text     — status tekst
```

---

## Sessie 3.1: Interface + OpenClawBackend extractie

### Stap 1: Interface definiëren (laag risico)

Maak interfaces — NIETS wijzigen aan werkende code:

```typescript
interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  source: 'robin' | 'openclaw' | 'claude';
  timestamp: number;
}

interface ChatBackend {
  id: string;
  name: string;
  icon: string;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
  sendMessage(text: string): Promise<void>;
  onMessage(cb: (msg: ChatMessage) => void): void;
  onTyping(cb: (typing: boolean) => void): void;
  onConnectionChange(cb: (connected: boolean) => void): void;
}
```

### Stap 2: OpenClawBackend extraheren (HOOG risico)

**Volgorde is cruciaal:**
1. Kopieer WebSocket logica naar `OpenClawBackend` class
2. **FIX: Token dynamisch laden:**
   ```typescript
   private async getToken(): Promise<string> {
     // Lees uit ~/.openclaw/openclaw.json via API
     const res = await fetch('http://localhost:8765/config/openclaw-token');
     const data = await res.json();
     return data.token;
   }
   ```
   (Voeg endpoint toe aan server.ts dat `~/.openclaw/openclaw.json` leest)
3. Test dat de class standalone werkt
4. Pas DAN pas shell/index.html aan
5. **Test UITGEBREID:** reconnect, streaming, history, typing indicator

### Stap 3: Claude Activity Backend (laag risico)

```typescript
class ClaudeActivityBackend implements ChatBackend {
  // Pollt GET /chat voor berichten met from: "claude"
  // Toont MCP tool calls als activiteit
  // Robin kan terugschrijven → POST /chat → Claude leest via MCP

  sendMessage(text: string): Promise<void> {
    // POST /chat met from: "robin"
    // Claude leest dit via tandem_get_chat_history() MCP tool
  }
}
```

Dit creëert een **chat loop**: Robin (browser) ↔ Claude (Cowork) ZONDER directe API.

### Stap 4: ChatRouter

```typescript
class ChatRouter {
  private backends: Map<string, ChatBackend>;
  private activeBackendId: string;

  register(backend: ChatBackend): void;
  setActive(id: string): void;
  getActive(): ChatBackend;
  sendMessage(text: string): Promise<void>;
  onMessage(cb: (msg: ChatMessage) => void): void;
}
```

### Verificatie
- [ ] OpenClaw werkt IDENTIEK aan voor de refactor
- [ ] Geen regressies (reconnect, streaming, history, typing)
- [ ] Claude activiteit zichtbaar wanneer Cowork MCP tools gebruikt
- [ ] `npx tsc` — zero errors

---

## Sessie 3.2: Router UI + Voice koppeling

### Backend selector UI

Boven het chat berichten-venster:
```html
<div class="chat-backend-selector">
  <button class="backend-option active" data-backend="openclaw">
    <span class="backend-dot connected"></span>
    🐙 Kees
  </button>
  <button class="backend-option" data-backend="claude">
    <span class="backend-dot"></span>
    🤖 Claude
  </button>
</div>
```

- Connection status indicators (groen/rood)
- State persistence in config (`general.activeBackend`)
- Wisselen = smooth (geen crashes, geen lost messages)

### Voice koppeling (~30 regels)

Voice final transcript → router:
```javascript
// In de voice handler (al bestaand):
if (isFinal) {
  chatRouter.sendMessage(transcript);
}
```

Werkt automatisch met alle backends via de router.

### Unified chat history

- Alle berichten in één lijst
- Elk bericht getagged met `source`: `robin` | `openclaw` | `claude`
- Visueel onderscheid:
```css
.chat-msg.source-openclaw { border-left: 3px solid #ff6b35; }
.chat-msg.source-claude   { border-left: 3px solid #7c3aed; }
.chat-msg.source-robin    { border-left: 3px solid #10b981; }
```

### Verificatie
- [ ] Backend selector werkt, wisselen is smooth
- [ ] Voice → actieve backend → antwoord in panel
- [ ] Chat history toont berichten van alle bronnen met visueel onderscheid
- [ ] Gekozen backend wordt onthouden na herstart
- [ ] `npx tsc` — zero errors
