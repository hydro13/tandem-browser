# Fase 7: Multi-AI Coördinatie — Sessie Context

## Wat is dit?

Meerdere AI's tegelijk actief in Tandem. OpenClaw en Claude werken samen, of meerdere Claude instanties met verschillende rollen. Robin orkestreert.

## Scenario's

### Dual Backend: OpenClaw + Claude
- Robin stelt een vraag
- Beide AI's antwoorden (gelabeld)
- Robin kiest het beste antwoord of combineert
- AI's kunnen elkaars antwoorden lezen en aanvullen

### Gespecialiseerde Agents
- **Research Claude:** zoekt informatie op het web
- **Analyst Claude:** analyseert data en pagina's
- **OpenClaw Kees:** persoonlijke assistent, kent Robin's voorkeuren

### Parallel Onderzoek
- Robin: "Vergelijk deze 3 producten"
- Agent 1 → Tab 1: Product A onderzoeken
- Agent 2 → Tab 2: Product B onderzoeken
- Agent 3 → Tab 3: Product C onderzoeken
- Alle agents rapporteren → unified vergelijking

## Message Routing

### Berichten Sturen

```typescript
class DualBackend implements ChatBackend {
  private backends: ChatBackend[];

  async sendMessage(text: string): Promise<void> {
    // Check voor @-mentions
    if (text.startsWith('@claude ')) {
      const claude = this.backends.find(b => b.id === 'claude');
      await claude?.sendMessage(text.slice(8));
    } else if (text.startsWith('@kees ')) {
      const openclaw = this.backends.find(b => b.id === 'openclaw');
      await openclaw?.sendMessage(text.slice(6));
    } else {
      // Stuur naar alle actieve backends
      await Promise.all(
        this.backends.map(b => b.sendMessage(text))
      );
    }
  }
}
```

### Antwoorden Tonen

```
Robin: Wat is de hoofdstad van Nederland?

[🐙 Kees]: Amsterdam is de hoofdstad van Nederland, hoewel
Den Haag de regeringszetel is.

[🤖 Claude]: De hoofdstad van Nederland is Amsterdam (grondwettelijk
vastgelegd). Den Haag is de zetel van de regering en het parlement.
```

### Visueel Onderscheid

```css
.chat-msg.source-openclaw {
  border-left: 3px solid #ff6b35;  /* OpenClaw oranje */
}
.chat-msg.source-claude {
  border-left: 3px solid #7c3aed;  /* Claude paars */
}
.chat-msg.source-robin {
  border-left: 3px solid #10b981;  /* Robin groen */
}
```

## Inter-AI Communicatie

### Context Sharing
Wanneer beide AI's actief zijn, moeten ze elkaars context kennen:

```typescript
// Bij elk bericht naar Claude, voeg toe:
system_context += `\n\n## Andere actieve AI\nOpenClaw (Kees) is ook actief.
Zijn laatste antwoord was: "${lastOpenClawResponse}"`;

// Bij elk bericht naar OpenClaw, voeg toe als context:
// (via het chat protocol dat OpenClaw al heeft)
```

### Taak Delegatie
AI's kunnen taken aan elkaar delegeren:
```
Claude: "Kees, kun jij even de prijs op die Amazon pagina checken?"
→ Router stuurt dit als instructie naar OpenClaw
→ OpenClaw voert uit en rapporteert
→ Claude verwerkt het antwoord
```

## Role-Based Agents (Uitbreiding)

### Agent Definitie

```typescript
interface AgentRole {
  id: string;
  name: string;
  description: string;
  backend: 'claude' | 'openclaw';
  systemPromptAddition: string;    // Extra instructies
  capabilities: string[];          // Welke tools mag deze agent gebruiken
  autoApprove: string[];           // Welke acties auto-approve
}

const ROLES: AgentRole[] = [
  {
    id: 'researcher',
    name: 'Researcher',
    description: 'Zoekt en leest informatie op het web',
    backend: 'claude',
    systemPromptAddition: 'Je bent gespecialiseerd in web research...',
    capabilities: ['navigate', 'read_page', 'screenshot', 'open_tab'],
    autoApprove: ['navigate', 'read_page', 'screenshot']
  },
  {
    id: 'analyst',
    name: 'Analyst',
    description: 'Analyseert pagina content en data',
    backend: 'claude',
    systemPromptAddition: 'Je analyseert webpagina content...',
    capabilities: ['read_page', 'execute_js', 'screenshot'],
    autoApprove: ['read_page', 'screenshot']
  },
  {
    id: 'assistant',
    name: 'Persoonlijke Assistent',
    description: 'Kent Robin, helpt met dagelijkse taken',
    backend: 'openclaw',
    systemPromptAddition: '',  // OpenClaw heeft eigen personality
    capabilities: ['*'],
    autoApprove: ['navigate', 'read_page']
  }
];
```

### Agent Management UI

In Kees panel, een "Agents" tab:

```
┌─────────────────────────────────────┐
│ 🤖 Actieve Agents                   │
│                                     │
│ ✅ Researcher (Claude)    [Stop]    │
│    → Tab 2: Zoekt MacBook deals     │
│                                     │
│ ✅ Kees (OpenClaw)        [Stop]    │
│    → Standby                        │
│                                     │
│ ⬚ Analyst (Claude)        [Start]  │
│ ⬚ Navigator (Claude)      [Start]  │
│                                     │
│ [+ Nieuwe Agent Rol]                │
└─────────────────────────────────────┘
```

## Conflict Resolution

Wat als twee AI's tegelijkertijd dezelfde tab willen bedienen?

### Regels:
1. **Robin heeft altijd voorrang** — als Robin een tab gebruikt, AI wacht
2. **Eerste claimt wint** — AI die een tab eerst claimt, mag ermee werken
3. **Eigen tabs** — AI's werken bij voorkeur in hun eigen tabs
4. **Escalatie** — bij conflict, vraag Robin

### Implementatie:
```typescript
class TabLockManager {
  private locks: Map<string, string>;  // tabId → agentId

  acquire(tabId: string, agentId: string): boolean;
  release(tabId: string, agentId: string): void;
  isLocked(tabId: string): boolean;
  getOwner(tabId: string): string | null;
}
```

## Platform Overwegingen

- Message routing: puur JavaScript, cross-platform
- UI updates: standaard DOM manipulatie
- Inter-AI communicatie: via in-memory events
- Geen platform-specifieke code nodig
- Agent state persistence: `~/.tandem/agents/` (cross-platform path)

## Kosten Overwegingen

Met meerdere Claude instanties actief:
- Elk agent-bericht kost tokens
- Parallel agents = parallel kosten
- **Budgettering:** configureerbaar max tokens per uur/dag
- **Monitoring:** toon token usage in UI

```typescript
interface TokenBudget {
  maxTokensPerHour: number;    // Default: 100000
  maxTokensPerDay: number;     // Default: 1000000
  currentHourUsage: number;
  currentDayUsage: number;
  warningThreshold: number;    // 0.8 = waarschuw bij 80%
}
```
