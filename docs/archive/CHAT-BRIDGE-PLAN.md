# Chat Bridge: Tandem ↔ Kees (OpenClaw) — Real-time Verbinding

> **Status:** PLAN  
> **Doel:** Als Robin een bericht stuurt in Tandem's chat panel (of via "Ask Kees" context menu), moet Kees het **direct** ontvangen — niet pas bij de volgende heartbeat.

---

## Huidige Situatie

```
Robin klikt "Ask Kees about Selection"
  → chat panel opent, tekst in input
  → Robin drukt Enter
  → chat-send IPC → panelManager.addChatMessage('robin', text)
  → bericht opgeslagen in JSON bestand
  → ... stilte ...
  → Kees pollt /chat elke 30-60 min via heartbeat
  → Kees leest bericht (30-60 min te laat)
```

## Gewenste Situatie

```
Robin klikt "Ask Kees about Selection"
  → chat panel opent, tekst in input
  → Robin drukt Enter
  → chat-send IPC → panelManager.addChatMessage('robin', text)
  → panelManager stuurt webhook naar OpenClaw
  → OpenClaw injecteert bericht in Kees' sessie
  → Kees antwoordt binnen seconden
  → Antwoord via POST /chat → verschijnt in Tandem chat panel
```

## Architectuur

```
┌─────────────┐     webhook POST      ┌──────────────┐
│   Tandem    │ ──────────────────────→│   OpenClaw   │
│ PanelMgr   │   localhost:18789      │   Gateway    │
│             │←──────────────────────│              │
│ POST /chat  │   Kees antwoordt      │  Kees sessie │
└─────────────┘                       └──────────────┘
```

**Waarom webhook (niet SSE/WebSocket):**
- OpenClaw heeft al een lokale HTTP server op port 18789
- Eén simpele POST = klaar, geen persistent connection nodig
- PanelManager hoeft geen subscriber-state bij te houden
- Failsafe: als OpenClaw niet draait, faalt de POST stil → geen crash

---

## Implementatie — 1 Claude Code Run

### Wat er moet gebeuren:

1. **Config uitbreiden** — `webhook` sectie toevoegen aan TandemConfig
2. **PanelManager uitbreiden** — na `addChatMessage('robin', ...)` webhook firen
3. **API endpoint toevoegen** — `POST /chat/webhook/test` om de verbinding te testen

### Bestanden te wijzigen:
- `src/config/manager.ts` — webhook config
- `src/panel/manager.ts` — webhook dispatch
- `src/api/server.ts` — test endpoint

---

## Claude Code Prompt

```
Read these files first:
- src/panel/manager.ts (hele bestand)
- src/config/manager.ts (hele bestand)
- src/api/server.ts (alleen regels 683-730, de /chat routes)

## Context
Tandem Browser has a chat panel where Robin (the human user) talks to Kees (an AI copilot). Kees runs in OpenClaw, a separate process on localhost. Currently Kees only reads chat messages by polling GET /chat — which means messages can take 30-60 minutes to arrive. We need real-time delivery.

OpenClaw has a local gateway that accepts wake events. When a wake event is sent, OpenClaw immediately processes it in the active session.

## Task: Add webhook notification to PanelManager

### Step 1: Add webhook config to TandemConfig (config/manager.ts)

Add a new section to the TandemConfig interface:
```typescript
// Webhook — notify external systems on chat events
webhook: {
  enabled: boolean;
  url: string;          // e.g. "http://127.0.0.1:18789"
  secret: string;       // shared secret for auth (future use)
  notifyOnRobinChat: boolean;  // fire webhook when Robin sends a message
};
```

Add defaults in the getDefaultConfig() method:
```typescript
webhook: {
  enabled: true,
  url: 'http://127.0.0.1:18789',
  secret: '',
  notifyOnRobinChat: true,
},
```

### Step 2: Add webhook dispatch to PanelManager (panel/manager.ts)

Add a private method and call it from addChatMessage:

```typescript
import { ConfigManager } from '../config/manager';
```

The constructor needs to accept a ConfigManager instance. Check if it already does — if not, add it as an optional parameter.

Add these methods to PanelManager:

```typescript
/** Fire webhook to notify OpenClaw of new chat message */
private async fireWebhook(msg: ChatMessage): Promise<void> {
  if (!this.configManager) return;
  const config = this.configManager.getConfig();
  if (!config.webhook?.enabled || !config.webhook?.url) return;
  if (msg.from !== 'robin' && !config.webhook.notifyOnRobinChat) return;
  // Only notify for robin messages (kees messages come FROM OpenClaw, no need to echo back)
  if (msg.from !== 'robin') return;

  const url = config.webhook.url.replace(/\/$/, '');
  
  try {
    // Use Node's built-in fetch (available in Node 18+/Electron 28+)
    const response = await fetch(`${url}/api/sessions/main/events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(config.webhook.secret ? { 'Authorization': `Bearer ${config.webhook.secret}` } : {}),
      },
      body: JSON.stringify({
        type: 'tandem-chat',
        text: `[Tandem Chat] Robin: ${msg.text}`,
        metadata: {
          messageId: msg.id,
          from: msg.from,
          timestamp: msg.timestamp,
          source: 'tandem-browser',
        },
      }),
      signal: AbortSignal.timeout(5000), // 5s timeout
    });
    
    if (!response.ok) {
      console.warn(`⚠️ Webhook failed (${response.status}): ${response.statusText}`);
    }
  } catch (e: any) {
    // Silent fail — OpenClaw might not be running
    if (e.name !== 'AbortError') {
      console.warn('⚠️ Webhook dispatch failed (OpenClaw not running?):', e.message);
    }
  }
}
```

Now modify addChatMessage to call the webhook:

```typescript
addChatMessage(from: 'robin' | 'kees' | 'claude', text: string): ChatMessage {
  const msg: ChatMessage = {
    id: ++this.chatCounter,
    from,
    text,
    timestamp: Date.now(),
  };
  this.chatMessages.push(msg);
  this.saveChatHistory();
  this.win.webContents.send('chat-message', msg);
  if (from === 'kees' && this.keesTyping) {
    this.setKeesTyping(false);
  }
  
  // Fire webhook for robin messages (async, non-blocking)
  this.fireWebhook(msg).catch(() => {});
  
  return msg;
}
```

### Step 3: Pass ConfigManager to PanelManager

In src/main.ts, find where PanelManager is constructed (around line ~170 in startAPI). It currently receives only `win`. Add configManager:

If PanelManager constructor is `constructor(win: BrowserWindow)`, change it to:
```typescript
constructor(win: BrowserWindow, configManager?: ConfigManager)
```
Store it as `private configManager?: ConfigManager`.

In main.ts startAPI(), ConfigManager is created BEFORE PanelManager, so pass it:
```typescript
panelManager = new PanelManager(win, configManager!);
```

### Step 4: Add webhook test endpoint (api/server.ts)

Add near the other /chat routes:

```typescript
/** Test webhook connectivity */
this.app.post('/chat/webhook/test', async (_req: Request, res: Response) => {
  try {
    const config = this.configManager.getConfig();
    if (!config.webhook?.enabled || !config.webhook?.url) {
      res.json({ ok: false, error: 'Webhook not configured or disabled' });
      return;
    }
    
    const url = config.webhook.url.replace(/\/$/, '');
    const response = await fetch(`${url}/api/health`, {
      signal: AbortSignal.timeout(5000),
    });
    
    res.json({ 
      ok: response.ok, 
      status: response.status,
      url: config.webhook.url,
    });
  } catch (e: any) {
    res.json({ ok: false, error: e.message });
  }
});
```

### Important notes:
- The webhook URL `http://127.0.0.1:18789/api/sessions/main/events` is the OpenClaw gateway events endpoint. If this exact path doesn't exist, we'll adjust it later. For now, implement the webhook dispatch infrastructure.
- Use Node's built-in `fetch` — do NOT add axios or node-fetch as a dependency.
- All webhook calls MUST be non-blocking (fire-and-forget with .catch(() => {})).
- All webhook failures MUST be silent (console.warn only, no throws, no user-facing errors).
- ConfigManager instance in PanelManager should be optional to avoid breaking existing tests or code.

After all changes: run `npm run compile` and fix any TypeScript errors.
Do NOT run `npm start` or `npm run dev`.
```

---

## Na de Claude Code Run

### Kees-kant (OpenClaw configuratie)

Na de Tandem build moet Kees' kant geconfigureerd worden:

1. **Testen of webhook aankomt** — `curl -X POST http://127.0.0.1:8765/chat/webhook/test`
2. **OpenClaw webhook endpoint bepalen** — het juiste pad voor incoming events uitzoeken
3. **HEARTBEAT.md updaten** — Tandem chat polling kan weg als webhook werkt
4. **TOOLS.md updaten** — webhook flow documenteren

### Verificatie Flow

```bash
# 1. Start Tandem
npm start

# 2. Open chat panel (Cmd+K)
# 3. Type een bericht als Robin
# 4. Check Tandem console voor webhook log:
#    ✅ Geen "Webhook failed" waarschuwing = POST gelukt
#    ⚠️ "OpenClaw not running?" = OpenClaw is uit (verwacht als die niet draait)

# 5. Test endpoint:
curl -s http://127.0.0.1:8765/chat/webhook/test | jq .
```
