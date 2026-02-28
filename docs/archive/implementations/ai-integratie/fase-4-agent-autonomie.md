# Fase 4: Agent Autonomie

> 2-3 sessies | Geen nieuwe dependencies
> AI kan zelfstandig browsen — met Robin's toestemming en oversight.

---

## Doel

Claude (via MCP/Cowork) kan zelfstandig taken uitvoeren: zoeken, lezen, vergelijken, rapporteren. Robin geeft een opdracht, ziet de voortgang real-time, en kan op elk moment ingrijpen.

## Bestaande referentie: X-Scout (src/agents/x-scout.ts)

Herbruikbare patronen:
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

### Approval Systeem

Risico-niveaus:

| Niveau | Acties | Default |
|--------|--------|---------|
| Geen risico | Lezen, screenshots, scrollen | Auto-approve |
| Laag risico | Navigeren, tabs openen | Auto-approve (configureerbaar) |
| Medium risico | Klikken, selecteren | Vraag bij onbekende sites |
| Hoog risico | Typen, formulieren, bestellen | Altijd vragen |

UI in Kees panel:
```
┌─────────────────────────────────────┐
│ 🤖 Kees wil een actie uitvoeren:   │
│                                     │
│ ✏️ Tekst typen in zoekveld:        │
│ "MacBook Pro M4 best price"         │
│ Op: google.com                      │
│                                     │
│  ✅ Goedkeuren   ❌ Afwijzen       │
│  📝 Aanpassen                       │
└─────────────────────────────────────┘
```

### Noodrem

**Escape** of dedicated knop = stop ALLE agent-activiteit onmiddellijk.
- Alle running tasks → paused
- Alle pending tool calls → cancelled
- Chat notificatie: "Agent activiteit gestopt door Robin"

### Settings UI

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

### Verificatie
- [ ] Claude kan taak starten via MCP
- [ ] Robin ziet approval request in panel
- [ ] Goedkeuren/afwijzen werkt
- [ ] Noodrem stopt alles
- [ ] `npx tsc` — zero errors

---

## Sessie 4.2: Autonomous Browse Sessions

### Tab isolatie

Agents werken in eigen tabs:
```
[🙂 Robin's Tab] [🤖 Kees: Google] [🤖 Kees: Amazon]
```

- `tabSource` property: `'robin' | 'kees'`
- Visuele indicator in tab header
- Robin kan altijd een AI tab overnemen (klik = claim)
- AI werkt NOOIT in Robin's actieve tab tenzij expliciet gevraagd

### Menselijke timing

Hergebruik X-Scout patronen. Later: sample uit Robin's echte behavioral data via BehaviorObserver.

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
- Opent eigen tabs
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
- [ ] Claude kan zelfstandig 5 pagina's onderzoeken
- [ ] Robin ziet voortgang real-time
- [ ] AI stopt als Robin ingrijpt (noodrem)
- [ ] Menselijke timing zichtbaar
- [ ] Activity log toont alle acties
- [ ] `npx tsc` — zero errors
