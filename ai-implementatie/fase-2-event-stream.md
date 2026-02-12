# Fase 2: Event Stream + Context Manager

> 1-2 sessies | Geen nieuwe dependencies
> Bouwt voort op bestaande IPC events en ContextBridge.

---

## Doel

AI krijgt real-time updates van wat Robin doet in de browser. Niet alleen on-demand via MCP tools, maar proactief: elke navigatie, tab switch, page load wordt automatisch doorgestuurd.

## Bestaande infrastructuur

### IPC Events (main.ts, al gebouwd)
```
tab-update              — tab info verandert
tab-register            — nieuwe tab
chat-send               — chat bericht
voice-transcript        — voice transcriptie
voice-status-update     — voice status
activity-webview-event  — webview activiteit (navigatie, load, etc.)
form-submitted          — formulier verstuurd
```

### ContextBridge (src/bridge/context-bridge.ts, al gebouwd — 162 regels)
```typescript
recordSnapshot()    // Pagina context opslaan
getRecent()         // Recente pagina's ophalen
search()            // Alle contexten doorzoeken
getPage()           // Context voor specifieke URL
addNote()           // Handmatige notities
// Opslag: ~/.tandem/context/
```

**BELANGRIJK:** We EXTENDEN de bestaande ContextBridge. We bouwen NIET from scratch.

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

  sseHandler(req, res): void;         // Express middleware voor SSE
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
   - Geen WebSocket nodig — SSE is simpeler voor server→client push
   - Content-Type: `text/event-stream`

4. Debounce strategie:
   - Navigation/page-loaded/tab-switch: **direct**
   - Scroll: max 1 per **5 seconden**
   - Click: alleen als het navigatie triggert

5. Wire in main.ts: IPC events → EventStreamManager

### Verificatie
- [ ] `curl http://localhost:8765/events/stream` toont events
- [ ] Navigatie events komen door in real-time
- [ ] Tab switches worden gerapporteerd
- [ ] Events bevatten URL, titel, tabId
- [ ] `npx tsc` — zero errors

---

## Sessie 2.2: ContextManager (extend ContextBridge)

### Taken

1. Extend ContextBridge met:
   - Event subscriptions (luistert op EventStreamManager)
   - `getContextSummary()` — compact tekst voor MCP (~500 tokens max):
     ```
     Actieve tab: Google Search - https://google.com (tab-abc)
     Open tabs: 4 (Google, LinkedIn, GitHub, Tandem Settings)
     Laatste events: navigatie naar google.com (2s geleden), tab switch (15s geleden)
     Voice: inactief
     ```
   - Periodic screenshot caching (alleen als MCP client actief)

2. Update MCP resources:
   - `tandem://context` gebruikt ContextManager
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
- [ ] `tandem://context` MCP resource bevat actuele data
- [ ] Geen merkbare performance impact
- [ ] `npx tsc` — zero errors

---

## Performance regels

- Ring buffer: max 100 events, oudste vallen weg
- Lazy load page content: alleen als AI het vraagt
- Cache screenshots: niet elke seconde een nieuwe
- Geen screenshots versturen tenzij expliciet gevraagd
