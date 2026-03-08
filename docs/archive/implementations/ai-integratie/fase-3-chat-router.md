# Phase 3: Chat Router + Voice Koppeling

> 2-3 sessions | No new dependencies
> ⚠️ RISKANTSTE FASE — 200+ rules inline WebSocket code refactoren.

---

## Goal

The Kees panel can with multiple AI backends communicate: OpenClaw (live chat) and Claude (activity feed via MCP). Robin can switchen. Voice input gaat automatisch to the actieve backend.

## Huidige staat

The OpenClaw chat logica zit **inline** in `shell/index.html` (rules 1681-1894):
- WebSocket to `ws://127.0.0.1:18789`
- Token **HARDCODED**: `[redacted leaked token]` (MOET gefixt)
- RPC protocol: `{ type: 'req', method: 'chat.send', params: { sessionKey, message } }`
- Streaming: `delta` → `final` → `error` states
- Reconnect with exponential backoff
- Session key: `agent:main:main`

### DOM elementen
```
#chat-messages      — berichten container
#chat-input         — input textarea
#chat-send-btn      — send knop
#typing-indicator   — typing indicator
#ws-dot             — connection status dot
#ws-status-text     — status text
```

---

## Sessie 3.1: Interface + OpenClawBackend extractie

### Step 1: Interface definiëren (laag risk)

Define interfaces — change NOTHING in working code:

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

### Step 2: OpenClawBackend extraheren (HOOG risk)

**Order is cruciaal:**
1. Kopieer WebSocket logica to `OpenClawBackend` class
2. **FIX: Token dynamisch laden:**
   ```typescript
   private async getToken(): Promise<string> {
     // Read out ~/.openclaw/openclaw.json via API
     const res = await fetch('http://localhost:8765/config/openclaw-token');
     const data = await res.json();
     return data.token;
   }
   ```
   (Voeg endpoint toe about server.ts that `~/.openclaw/openclaw.json` leest)
3. Test that the class standalone works
4. Pas DAN pas shell/index.html about
5. **Test UITGEBREID:** reconnect, streaming, history, typing indicator

### Step 3: Claude Activity Backend (laag risk)

```typescript
class ClaudeActivityBackend implements ChatBackend {
  // Pollt GET /chat for berichten with from: "claude"
  // Shows MCP tool calls if activiteit
  // Robin can terugschrijven → POST /chat → Claude leest via MCP

  sendMessage(text: string): Promise<void> {
    // POST /chat with from: "robin"
    // Claude leest this via tandem_get_chat_history() MCP tool
  }
}
```

This creates a **chat loop**: Robin (browser) ↔ Claude (Cowork) WITHOUT a direct API.

### Step 4: ChatRouter

```typescript
class ChatRouter {
  private backends: Folder<string, ChatBackend>;
  private activeBackendId: string;

  register(backend: ChatBackend): void;
  setActive(id: string): void;
  getActive(): ChatBackend;
  sendMessage(text: string): Promise<void>;
  onMessage(cb: (msg: ChatMessage) => void): void;
}
```

### Verificatie
- [ ] OpenClaw works IDENTIEK about for the refactor
- [ ] No regressions (reconnect, streaming, history, typing)
- [ ] Claude activiteit visible wanneer Cowork MCP tools uses
- [ ] `npx tsc` — zero errors

---

## Sessie 3.2: Router UI + Voice koppeling

### Backend selector UI

Boven the chat berichten-window:
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
- Wisselen = smooth (no crashes, no lost messages)

### Voice koppeling (~30 rules)

Voice final transcript → router:
```javascript
// In the voice handler (already bestaand):
if (isFinal) {
  chatRouter.sendMessage(transcript);
}
```

Works automatisch with alle backends via the router.

### Unified chat history

- Alle berichten in één list
- Elk bericht getagged with `source`: `robin` | `openclaw` | `claude`
- Visual onderscheid:
```css
.chat-msg.source-openclaw { border-left: 3px solid #ff6b35; }
.chat-msg.source-claude   { border-left: 3px solid #7c3aed; }
.chat-msg.source-robin    { border-left: 3px solid #10b981; }
```

### Verificatie
- [ ] Backend selector works, wisselen is smooth
- [ ] Voice → actieve backend → antwoord in panel
- [ ] Chat history shows berichten or alle bronnen with visual onderscheid
- [ ] Chosen backend is onthouden na herstart
- [ ] `npx tsc` — zero errors
