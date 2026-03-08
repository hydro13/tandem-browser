# Phase 2: Event Stream + Context Manager

> 1-2 sessions | No new dependencies
> Bouwt voort op existing IPC events and ContextBridge.

---

## Goal

AI gets real-time updates or wat Robin doet in the browser. Not only on-demand via MCP tools, but proactief: elke navigatie, tab switch, page load is automatisch doorgestuurd.

## Existing infrastructuur

### IPC Events (main.ts, already built)
```
tab-update              — tab info verandert
tab-register            — new tab
chat-send               — chat bericht
voice-transcript        — voice transcriptie
voice-status-update     — voice status
activity-webview-event  — webview activiteit (navigatie, load, etc.)
form-submitted          — formulier verstuurd
```

### ContextBridge (src/bridge/context-bridge.ts, already built — 162 rules)
```typescript
recordSnapshot()    // Page context save
getRecent()         // Recente page's ophalen
search()            // Alle contexten doorzoeken
getPage()           // Context for specific URL
addNote()           // Handmatige notes
// Opslag: ~/.tandem/context/
```

**BELANGRIJK:** We EXTENDEN the existing ContextBridge. We bouwen NIET from scratch.

---

## Sessie 2.1: EventStreamManager + SSE Endpoint

### Taken

1. Maak `src/events/stream.ts`:
```typescript
class EventStreamManager {
  private listeners: Set<(event: BrowserEvent) => void>;
  private recentEvents: BrowserEvent[];  // Ring buffer, max 100

  handleWebviewEvent(data): void;    // Vanuit IPC
  handleTabEvent(data): void;         // Vanuit IPC

  subscribe(cb): () => void;          // Returns unsubscribe
  getRecent(limit?): BrowserEvent[];

  sseHandler(req, res): void;         // Express middleware for SSE
}
```

2. Event types:
```typescript
type BrowserEventType =
  | 'navigation'     | 'page-loaded'   | 'tab-opened'
  | 'tab-closed'     | 'tab-focused'   | 'click'
  | 'form-submit'    | 'scroll'        | 'voice-input'
  | 'screenshot'     | 'error';
```

3. SSE endpoint: `GET /events/stream`
   - No WebSocket nodig — SSE is simpeler for server→client push
   - Content-Type: `text/event-stream`

4. Debounce strategie:
   - Navigation/page-loaded/tab-switch: **direct**
   - Scroll: max 1 per **5 seconden**
   - Click: only if the navigatie triggert

5. Wire in main.ts: IPC events → EventStreamManager

### Verificatie
- [ ] `curl http://localhost:8765/events/stream` shows events
- [ ] Navigatie events komen door in real-time
- [ ] Tab switches be gerapporteerd
- [ ] Events bevatten URL, title, tabId
- [ ] `npx tsc` — zero errors

---

## Sessie 2.2: ContextManager (extend ContextBridge)

### Taken

1. Extend ContextBridge with:
   - Event subscriptions (luistert op EventStreamManager)
   - `getContextSummary()` — compact text for MCP (~500 tokens max):
     ```
     Actieve tab: Google Search - https://google.com (tab-abc)
     Open tabs: 4 (Google, LinkedIn, GitHub, Tandem Settings)
     Last events: navigatie to google.com (2s geleden), tab switch (15s geleden)
     Voice: inactief
     ```
   - Periodic screenshot caching (only if MCP client actief)

2. Update MCP resources:
   - `tandem://context` uses ContextManager
   - `tandem://page/current` auto-updated bij navigatie

3. MCP notifications bij events:
```typescript
server.notification({
  method: "notifications/resources/updated",
  params: { uri: "tandem://page/current" }
});
```

### Verificatie
- [ ] Context is actueel na navigatie/tab switch
- [ ] `tandem://context` MCP resource contains actuele data
- [ ] No noticeable performance impact
- [ ] `npx tsc` — zero errors

---

## Performance rules

- Ring buffer: max 100 events, oudste vallen weg
- Lazy load page content: only if AI the asks
- Cache screenshots: not elke seconde a new
- No screenshots versturen tenzij expliciet gevraagd
