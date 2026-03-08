# Phase 4: Event Stream — Sessie Context

## Wat is this?

Real-time event stream zodat AI always weet wat Robin doet in the browser. Not only wanneer AI the asks, but proactief: elke navigatie, elke tab switch, elke page load.

## Why?

Without event stream must AI steeds questions "wat zie you nu?". With event stream weet AI the already. Dit maakt the samenwerking natuurlijker — alsof AI echt meekijkt.

## Existing Event Infrastructure

Tandem stuurt already events intern via IPC:

```typescript
// shell/index.html → main.ts (via preload)
tandem.sendWebviewEvent({ type, tabId, url?, title? })

// Event types that already bestaan:
'did-navigate'        // Navigatie to new URL
'did-navigate-in-page' // Anchor/hash navigatie
'did-finish-load'     // Page geladen (with title)
'loading-start'       // Page begint te laden
'loading-stop'        // Page complete with laden
```

Daarnaast stuurt main.ts events to renderer:
```typescript
win.webContents.send('activity-event', event)
```

## New Componenten

### EventStreamManager

```typescript
class EventStreamManager {
  private listeners: Folder<string, Set<(event: BrowserEvent) => void>>;
  private recentEvents: BrowserEvent[];  // Ring buffer, max 100

  // Events ontvangen or IPC
  handleWebviewEvent(data: { type, tabId, url?, title? }): void;
  handleTabEvent(data: { type, tabId }): void;

  // Events streamen to consumers
  subscribe(callback: (event: BrowserEvent) => void): () => void;  // returns unsubscribe
  getRecent(limit?: number): BrowserEvent[];

  // Express middleware for SSE
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
  | 'page-loaded'      // Page complete (with title + content summary)
  | 'tab-opened'       // New tab
  | 'tab-closed'       // Tab closed
  | 'tab-focused'      // Tab gefocust
  | 'click'            // Element geklikt (if gedetecteerd)
  | 'form-submit'      // Formulier verstuurd
  | 'scroll'           // Significante scroll
  | 'voice-input'      // Voice transcript ontvangen
  | 'screenshot'       // Screenshot genomen
  | 'error';           // Page error
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

For Claude Code/Cowork via MCP:
```typescript
// MCP server stuurt notifications
server.notification({
  method: "notifications/resources/updated",
  params: { uri: "tandem://page/current" }
});
```

## Context Manager

Houdt a actueel beeld bij or the browser staat:

```typescript
class ContextManager {
  private context: BrowserContext;
  private eventStream: EventStreamManager;

  // Auto-update bij events
  constructor(eventStream: EventStreamManager) {
    eventStream.subscribe((event) => this.handleEvent(event));
  }

  // Getter for AI backends
  getContext(): BrowserContext;
  getContextSummary(): string;  // Compact text for system prompt

  // Periodic updates
  startPeriodicRefresh(intervalMs: number): void;
  stopPeriodicRefresh(): void;
}

interface BrowserContext {
  activeTab: {
    id: string;
    url: string;
    title: string;
    contentSummary?: string;  // First ~500 woorden
    lastScreenshot?: string;  // Base64, periodic
  };
  tabs: Array<{ id, url, title, source }>;
  recentEvents: BrowserEvent[];  // Last 20
  voiceActive: boolean;
  drawMode: boolean;
  timestamp: number;
}
```

## Integratie Punten

### With Claude Backend (Phase 3)
- Context injection bij elk bericht
- Event notifications for proactieve responses
- Bijv: Robin navigeert to a product page → Claude biedt spontaan about to reviews te zoeken

### With MCP Server (Phase 1)
- Resource `tandem://page/current` auto-updated
- Resource `tandem://context` for fully beeld
- Notifications bij significante events

### With Chat Router (Phase 2)
- Events beschikbaar for alle backends
- Backend can kiezen welke events the wil ontvangen

## Performance Considerations

- **Debounce** scroll events (max 1 per 5 seconden)
- **Lazy load** page content (only if AI the nodig has)
- **Cache** screenshots (not elke seconde a new)
- **Ring buffer** for events (max 100, oudste vallen weg)
- **No** screenshots versturen tenzij expliciet gevraagd or bij key events

## Platform Considerations

- SSE: default HTTP, works overal
- EventEmitter: Node.js built-in, cross-platform
- No platform-specific code needed
