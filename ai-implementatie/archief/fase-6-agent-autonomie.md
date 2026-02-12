# Fase 6: Agent Autonomie — Sessie Context

## Wat is dit?

AI kan zelfstandig browsen en taken uitvoeren — met Robin's toestemming en oversight. Robin geeft een opdracht, AI voert het uit, rapporteert terug.

## Voorbeeld Scenario's

### Research Agent
> Robin: "Zoek de beste deals voor een MacBook Pro M4"
> Kees: opent Google, zoekt, leest 5 winkels, vergelijkt prijzen, rapporteert

### Monitoring Agent
> Robin: "Check elke 30 minuten of er nieuwe vacatures op die LinkedIn pagina staan"
> Kees: bezoekt periodiek, vergelijkt met vorige keer, meldt changes

### Form Agent
> Robin: "Vul dit contactformulier in met mijn gegevens"
> Kees: leest het formulier, toont Robin wat hij gaat invullen, wacht op goedkeuring

## Bestaande Referentie: X-Scout Agent

In `src/agents/x-scout.ts` staat een voorbeeld agent die:
- Menselijke timing gebruikt (delays tussen acties)
- State bijhoudt (wat al gezien, wat pending)
- Approval systeem heeft (actions wachten op goedkeuring)
- Via API communiceert (POST /chat voor rapportage)

## Task Queue Systeem

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
  description: string;        // "Open Google en zoek"
  action: BrowserAction;      // { type: 'navigate', url: '...' }
  requiresApproval: boolean;  // true voor risico-acties
  status: 'pending' | 'running' | 'done' | 'skipped';
  result?: any;
}

interface BrowserAction {
  type: 'navigate' | 'click' | 'type' | 'scroll' | 'read' | 'screenshot' | 'wait';
  params: Record<string, any>;
}
```

## Approval Systeem

### Risico Niveaus

| Niveau | Acties | Default |
|--------|--------|---------|
| **Geen risico** | Lezen, screenshots, scrollen | Auto-approve |
| **Laag risico** | Navigeren, tabs openen | Auto-approve (configureerbaar) |
| **Medium risico** | Klikken, selecteren | Vraag bij onbekende sites |
| **Hoog risico** | Typen, formulieren, bestellen | Altijd vragen |

### Approval UI

In het Kees panel, als actie goedkeuring nodig heeft:

```
┌─────────────────────────────────────┐
│ 🤖 Kees wil een actie uitvoeren:   │
│                                     │
│ ✏️ Tekst typen in zoekveld:        │
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
  ☑ Pagina's lezen zonder vragen
  ☑ Navigeren zonder vragen
  ☐ Klikken zonder vragen
  ☐ Tekst typen zonder vragen
  ☐ Formulieren invullen zonder vragen

Vertrouwde sites:
  + google.com
  + wikipedia.org
  + [Toevoegen...]
```

## Tab Ownership

AI kan tabs "claimen" — visueel duidelijk voor Robin welke tabs door AI bestuurd worden:

```
[🙂 Robin's Tab] [🤖 Kees: Google Zoeken] [🤖 Kees: Amazon]
```

### Implementatie
- `tabSource` property per tab: `'robin' | 'kees'`
- Visuele indicator in tab header (icoon of kleur)
- Bestaande `POST /tabs/source` endpoint gebruiken
- Robin kan altijd een AI tab overnemen (klik = claim terug)

## Menselijke Timing

AI moet browsen als een mens — niet instant. Dit voorkomt bot-detectie.

```typescript
const HUMAN_TIMING = {
  beforeNavigate:  { min: 500,  max: 2000 },    // Denktijd voor klik
  afterPageLoad:   { min: 2000, max: 5000 },     // Pagina "lezen"
  beforeType:      { min: 300,  max: 800 },      // Vingers naar toetsenbord
  typingSpeed:     { min: 30,   max: 80 },        // ms per karakter
  beforeClick:     { min: 200,  max: 600 },       // Muis bewegen naar element
  scrollPause:     { min: 1000, max: 3000 },      // Pauzeren na scroll
  betweenActions:  { min: 500,  max: 2000 },      // Algemene pauze
};

function humanDelay(timing: { min: number, max: number }): Promise<void> {
  const ms = timing.min + Math.random() * (timing.max - timing.min);
  return new Promise(resolve => setTimeout(resolve, ms));
}
```

## Activity Log

Alles wat AI doet wordt gelogd:

```typescript
interface ActivityEntry {
  id: string;
  timestamp: number;
  agent: string;           // 'claude' | 'openclaw'
  taskId?: string;
  action: string;          // 'navigate', 'click', 'type', etc.
  target?: string;         // URL, selector, etc.
  details?: string;        // Extra info
  approved?: boolean;      // Was er goedkeuring nodig?
  approvedBy?: string;     // 'robin' | 'auto'
}
```

Zichtbaar in het Activity panel (bestaand in Kees panel).

## Platform Overwegingen

- Task queue: in-memory + file persistence (`~/.tandem/tasks/`)
- Timing delays: `setTimeout` — cross-platform
- Geen platform-specifieke code nodig
- File paths via `path.join()` en `os.homedir()`
