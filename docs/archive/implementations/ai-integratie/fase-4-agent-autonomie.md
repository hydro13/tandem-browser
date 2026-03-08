# Phase 4: Agent Autonomie

> 2-3 sessions | No new dependencies
> AI can zelfstandig browsen — with Robin's toestemming and oversight.

---

## Goal

Claude (via MCP/Cowork) can zelfstandig taken uitvoeren: zoeken, read, vergelijken, rapporteren. Robin geeft a opdracht, sees the voortgang real-time, and can op elk moment ingrijpen.

## Existing referentie: X-Scout (src/agents/x-scout.ts)

Herbruikbare patterns:
```typescript
const TIMING = {
  betweenPages: { min: 8000, max: 20000 },
  readingTime:  { min: 5000, max: 15000 },
  scrollPause:  { min: 2000, max: 6000 },
  beforeAction: { min: 1000, max: 3000 },
};
```

---

## Sessie 4.1: Task Queue + Approval System

### Task Queue

```typescript
interface AITask {
  id: string;
  description: string;
  createdBy: 'robin' | 'claude' | 'openclaw';
  assignedTo: 'claude' | 'openclaw';
  status: 'pending' | 'running' | 'paused' | 'waiting-approval' | 'done' | 'failed';
  steps: TaskStep[];
  currentStep: number;
  results: any[];
  createdAt: number;
}

interface TaskStep {
  id: string;
  description: string;
  action: { type: string; params: Record<string, any> };
  requiresApproval: boolean;
  status: 'pending' | 'running' | 'done' | 'skipped';
}
```

Opslag: `~/.tandem/tasks/`

### Approval System

Risk-niveaus:

| Niveau | Acties | Default |
|--------|--------|---------|
| No risk | Lezen, screenshots, scrollen | Auto-approve |
| Laag risk | Navigeren, tabs openen | Auto-approve (configureerbaar) |
| Medium risk | Klikken, selecteren | Question bij onbekende sites |
| Hoog risk | Typen, formulieren, bestellen | Altijd questions |

UI in Kees panel:
```
┌─────────────────────────────────────┐
│ 🤖 Kees wil a actie uitvoeren:   │
│                                     │
│ ✏️ Text typen in zoekveld:        │
│ "MacBook Pro M4 best price"         │
│ Op: google.com                      │
│                                     │
│  ✅ Goedkeuren   ❌ Afwijzen       │
│  📝 Aanpassen                       │
└─────────────────────────────────────┘
```

### Noodrem

**Escape** or dedicated knop = stop ALLE agent-activiteit onmiddellijk.
- Alle running tasks → paused
- Alle pending tool calls → cancelled
- Chat notificatie: "Agent activiteit gestopt door Robin"

### Settings UI

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

### Verificatie
- [ ] Claude can taak starten via MCP
- [ ] Robin sees approval request in panel
- [ ] Goedkeuren/afwijzen works
- [ ] Noodrem stopt alles
- [ ] `npx tsc` — zero errors

---

## Sessie 4.2: Autonomous Browse Sessions

### Tab isolatie

Agents werken in own tabs:
```
[🙂 Robin's Tab] [🤖 Kees: Google] [🤖 Kees: Amazon]
```

- `tabSource` property: `'robin' | 'kees'`
- Visual indicator in tab header
- Robin can always a AI tab overnemen (click = claim)
- AI works NOOIT in Robin's actieve tab tenzij expliciet gevraagd

### Menselijke timing

Reuse X-Scout patterns. Later: sample from Robin's real behavioral data via `BehaviorObserver`.

```typescript
function humanDelay(timing: { min: number, max: number }): Promise<void> {
  const ms = timing.min + Math.random() * (timing.max - timing.min);
  return new Promise(resolve => setTimeout(resolve, ms));
}
```

### Research capability

MCP high-level tool:
```
tandem_research(topic: string, maxPages?: number)
```
- Opens own tabs
- Zoekt via Google/DuckDuckGo
- Leest top resultaten
- Samenvat bevindingen
- Rapporteert via chat

### Activity log

Alles wat AI doet:
```typescript
interface ActivityEntry {
  timestamp: number;
  agent: string;
  taskId?: string;
  action: string;
  target?: string;
  approved?: boolean;
  approvedBy?: 'robin' | 'auto';
}
```

Zichtbaar in Kees panel activity tab.

### Verificatie
- [ ] Claude can zelfstandig 5 page's onderzoeken
- [ ] Robin sees voortgang real-time
- [ ] AI stopt if Robin ingrijpt (noodrem)
- [ ] Menselijke timing visible
- [ ] Activity log shows alle acties
- [ ] `npx tsc` — zero errors
