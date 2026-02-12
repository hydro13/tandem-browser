# Fase 4: Event Stream — Sessie Context

## Wat is dit?

Real-time event stream zodat AI altijd weet wat Robin doet in de browser. Niet alleen wanneer AI het vraagt, maar proactief: elke navigatie, elke tab switch, elke page load.

## Waarom?

Zonder event stream moet AI steeds vragen "wat zie je nu?". Met event stream weet AI het al. Dit maakt de samenwerking natuurlijker — alsof AI echt meekijkt.

## Bestaande Event Infrastructure

Tandem stuurt al events intern via IPC:

```typescript
// shell/index.html → main.ts (via preload)
tandem.sendWebviewEvent({ type, tabId, url?, title? })

// Event types die al bestaan:
'did-navigate'        // Navigatie naar nieuwe URL
'did-navigate-in-page' // Anchor/hash navigatie
'did-finish-load'     // Pagina geladen (met titel)
'loading-start'       // Pagina begint te laden
'loading-stop'        // Pagina klaar met laden
```

Daarnaast stuurt main.ts events naar renderer:
```typescript
win.webContents.send('activity-event', event)
```

## Nieuwe Componenten

### EventStreamManager

```typescript
class EventStreamManager {
  private listeners: Map<string, Set<(event: BrowserEvent) => void>>;
  private recentEvents: BrowserEvent[];  // Ring buffer, max 100

  // Events ontvangen van IPC
  handleWebviewEvent(data: { type, tabId, url?, title? }): void;
  handleTabEvent(data: { type, tabId }): void;

  // Events streamen naar consumers
  subscribe(callback: (event: BrowserEvent) => void): () => void;  // returns unsubscribe
  getRecent(limit?: number): BrowserEvent[];

  // Express middleware voor SSE
  sseHandler(req, res): void;
}
```

### BrowserEvent Types

```typescript
interface BrowserEvent {
  id: string;
  type: BrowserEventType;
  timestamp: number;
  tabId: string;
  data: Record<string, any>;
}

type BrowserEventType =
  | 'navigation'       // URL veranderd
  | 'page-loaded'      // Pagina klaar (met titel + content summary)
  | 'tab-opened'       // Nieuwe tab
  | 'tab-closed'       // Tab gesloten
  | 'tab-focused'      // Tab gefocust
  | 'click'            // Element geklikt (als gedetecteerd)
  | 'form-submit'      // Formulier verstuurd
  | 'scroll'           // Significante scroll
  | 'voice-input'      // Voice transcript ontvangen
  | 'screenshot'       // Screenshot genomen
  | 'error';           // Pagina error
```

### SSE Endpoint

```
GET /events/stream
Accept: text/event-stream

Response:
data: {"type":"navigation","tabId":"abc","data":{"url":"https://...","title":"..."}}

data: {"type":"page-loaded","tabId":"abc","data":{"title":"Google","url":"https://google.com"}}

data: {"type":"tab-focused","tabId":"def","data":{"url":"https://..."}}
```

### MCP Notifications

Voor Claude Code/Cowork via MCP:
```typescript
// MCP server stuurt notifications
server.notification({
  method: "notifications/resources/updated",
  params: { uri: "tandem://page/current" }
});
```

## Context Manager

Houdt een actueel beeld bij van de browser staat:

```typescript
class ContextManager {
  private context: BrowserContext;
  private eventStream: EventStreamManager;

  // Auto-update bij events
  constructor(eventStream: EventStreamManager) {
    eventStream.subscribe((event) => this.handleEvent(event));
  }

  // Getter voor AI backends
  getContext(): BrowserContext;
  getContextSummary(): string;  // Compact tekst voor system prompt

  // Periodic updates
  startPeriodicRefresh(intervalMs: number): void;
  stopPeriodicRefresh(): void;
}

interface BrowserContext {
  activeTab: {
    id: string;
    url: string;
    title: string;
    contentSummary?: string;  // Eerste ~500 woorden
    lastScreenshot?: string;  // Base64, periodic
  };
  tabs: Array<{ id, url, title, source }>;
  recentEvents: BrowserEvent[];  // Laatste 20
  voiceActive: boolean;
  drawMode: boolean;
  timestamp: number;
}
```

## Integratie Punten

### Met Claude Backend (Fase 3)
- Context injection bij elk bericht
- Event notifications voor proactieve responses
- Bijv: Robin navigeert naar een product pagina → Claude biedt spontaan aan om reviews te zoeken

### Met MCP Server (Fase 1)
- Resource `tandem://page/current` auto-updated
- Resource `tandem://context` voor volledig beeld
- Notifications bij significante events

### Met Chat Router (Fase 2)
- Events beschikbaar voor alle backends
- Backend kan kiezen welke events het wil ontvangen

## Performance Overwegingen

- **Debounce** scroll events (max 1 per 5 seconden)
- **Lazy load** page content (alleen als AI het nodig heeft)
- **Cache** screenshots (niet elke seconde een nieuwe)
- **Ring buffer** voor events (max 100, oudste vallen weg)
- **Geen** screenshots versturen tenzij expliciet gevraagd of bij key events

## Platform Overwegingen

- SSE: standaard HTTP, werkt overal
- EventEmitter: Node.js built-in, cross-platform
- Geen platform-specifieke code nodig
