# Phase 6: Agent Autonomie — Sessie Context

## Wat is this?

AI can zelfstandig browsen and taken uitvoeren — with Robin's toestemming and oversight. Robin geeft a opdracht, AI voert the out, rapporteert terug.

## Voorbeeld Scenario's

### Research Agent
> Robin: "Zoek the beste deals for a MacBook Pro M4"
> Kees: opens Google, zoekt, leest 5 winkels, vergelijkt prijzen, rapporteert

### Monitoring Agent
> Robin: "Check elke 30 minuten or er new vacatures op that LinkedIn page stand"
> Kees: bezoekt periodiek, vergelijkt with vorige keer, meldt changes

### Form Agent
> Robin: "Vul this contactformulier in with mijn gegevens"
> Kees: leest the formulier, shows Robin wat he gaat invullen, wait op approval

## Existing Referentie: X-Scout Agent

In `src/agents/x-scout.ts` staat a voorbeeld agent that:
- Menselijke timing uses (delays between acties)
- State bijhoudt (wat already gezien, wat pending)
- Approval system has (actions wachten op approval)
- Via API communiceert (POST /chat for rapportage)

## Task Queue System

```typescript
interface AITask {
  id: string;
  description: string;         // "Zoek MacBook Pro deals"
  createdBy: string;           // 'robin' | 'claude' | 'openclaw'
  assignedTo: string;          // 'claude' | 'openclaw'
  status: 'pending' | 'running' | 'paused' | 'waiting-approval' | 'done' | 'failed';
  steps: TaskStep[];
  currentStep: number;
  results: TaskResult[];
  createdAt: number;
  updatedAt: number;
}

interface TaskStep {
  id: string;
  description: string;        // "Open Google and zoek"
  action: BrowserAction;      // { type: 'navigate', url: '...' }
  requiresApproval: boolean;  // true for risk-acties
  status: 'pending' | 'running' | 'done' | 'skipped';
  result?: any;
}

interface BrowserAction {
  type: 'navigate' | 'click' | 'type' | 'scroll' | 'read' | 'screenshot' | 'wait';
  params: Record<string, any>;
}
```

## Approval System

### Risk Niveaus

| Niveau | Acties | Default |
|--------|--------|---------|
| **No risk** | Lezen, screenshots, scrollen | Auto-approve |
| **Laag risk** | Navigeren, tabs openen | Auto-approve (configureerbaar) |
| **Medium risk** | Klikken, selecteren | Question bij onbekende sites |
| **Hoog risk** | Typen, formulieren, bestellen | Altijd questions |

### Approval UI

In the Kees panel, if actie approval nodig has:

```
┌─────────────────────────────────────┐
│ 🤖 Kees wil a actie uitvoeren:   │
│                                     │
│ ✏️ Text typen in zoekveld:        │
│ "MacBook Pro M4 best price"         │
│                                     │
│ Op: google.com                      │
│                                     │
│  ✅ Goedkeuren   ❌ Afwijzen       │
│  📝 Aanpassen                       │
└─────────────────────────────────────┘
```

### Auto-Approve Settings

In settings UI:
```
AI Autonomie:
  ☑ Page's read without questions
  ☑ Navigeren without questions
  ☐ Klikken without questions
  ☐ Text typen without questions
  ☐ Formulieren invullen without questions

Vertrouwde sites:
  + google.com
  + wikipedia.org
  + [Add...]
```

## Tab Ownership

AI can tabs "claimen" — visual duidelijk for Robin welke tabs door AI bestuurd be:

```
[🙂 Robin's Tab] [🤖 Kees: Google Zoeken] [🤖 Kees: Amazon]
```

### Implementatie
- `tabSource` property per tab: `'robin' | 'kees'`
- Visual indicator in tab header (icon or color)
- Existing `POST /tabs/source` endpoint use
- Robin can always a AI tab overnemen (click = claim terug)

## Menselijke Timing

AI must browsen if a mens — not instant. Dit voorkomt bot-detection.

```typescript
const HUMAN_TIMING = {
  beforeNavigate:  { min: 500,  max: 2000 },    // Denktijd for click
  afterPageLoad:   { min: 2000, max: 5000 },     // Page "read"
  beforeType:      { min: 300,  max: 800 },      // Vingers to toetsenbord
  typingSpeed:     { min: 30,   max: 80 },        // ms per karakter
  beforeClick:     { min: 200,  max: 600 },       // Muis bewegen to element
  scrollPause:     { min: 1000, max: 3000 },      // Pauzeren na scroll
  betweenActions:  { min: 500,  max: 2000 },      // Algemene pauze
};

function humanDelay(timing: { min: number, max: number }): Promise<void> {
  const ms = timing.min + Math.random() * (timing.max - timing.min);
  return new Promise(resolve => setTimeout(resolve, ms));
}
```

## Activity Log

Alles wat AI doet is gelogd:

```typescript
interface ActivityEntry {
  id: string;
  timestamp: number;
  agent: string;           // 'claude' | 'openclaw'
  taskId?: string;
  action: string;          // 'navigate', 'click', 'type', etc.
  target?: string;         // URL, selector, etc.
  details?: string;        // Extra info
  approved?: boolean;      // Was er approval nodig?
  approvedBy?: string;     // 'robin' | 'auto'
}
```

Zichtbaar in the Activity panel (bestaand in Kees panel).

## Platform Considerations

- Task queue: in-memory + file persistence (`~/.tandem/tasks/`)
- Timing delays: `setTimeout` — cross-platform
- No platform-specific code needed
- File paths via `path.join()` and `os.homedir()`
