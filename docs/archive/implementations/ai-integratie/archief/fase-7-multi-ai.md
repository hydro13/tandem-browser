# Phase 7: Multi-AI Coördinatie — Sessie Context

## Wat is this?

Multiple AI's simultaneously actief in Tandem. OpenClaw and Claude werken together, or multiple Claude instanties with verschillende rollen. Robin orchestrates.

## Scenario's

### Dual Backend: OpenClaw + Claude
- Robin stelt a question
- Beide AI's antwoorden (gelabeld)
- Robin chooses the beste antwoord or combineert
- AI's can elkaars antwoorden read and aanvullen

### Gespecialiseerde Agents
- **Research Claude:** zoekt informatie op the web
- **Analyst Claude:** analyseert data and page's
- **OpenClaw Kees:** persoonlijke assistent, kent Robin's voorkeuren

### Parallel Onderzoek
- Robin: "Vergelijk this 3 producten"
- Agent 1 → Tab 1: Product A onderzoeken
- Agent 2 → Tab 2: Product B onderzoeken
- Agent 3 → Tab 3: Product C onderzoeken
- Alle agents rapporteren → unified comparison

## Message Routing

### Berichten Sturen

```typescript
class DualBackend implements ChatBackend {
  private backends: ChatBackend[];

  async sendMessage(text: string): Promise<void> {
    // Check for @-mentions
    if (text.startsWith('@claude ')) {
      const claude = this.backends.find(b => b.id === 'claude');
      await claude?.sendMessage(text.slice(8));
    } else if (text.startsWith('@kees ')) {
      const openclaw = this.backends.find(b => b.id === 'openclaw');
      await openclaw?.sendMessage(text.slice(6));
    } else {
      // Stuur to alle actieve backends
      await Promise.all(
        this.backends.folder(b => b.sendMessage(text))
      );
    }
  }
}
```

### Antwoorden Tonen

```
Robin: Wat is the hoofdstad or Nederland?

[🐙 Kees]: Amsterdam is the hoofdstad or Nederland, hoewel
Den Haag the regeringszetel is.

[🤖 Claude]: The hoofdstad or Nederland is Amsterdam (grondwettelijk
vastgelegd). Den Haag is the zetel or the regering and the parlement.
```

### Visual Onderscheid

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
Wanneer beide AI's actief are, must ze elkaars context kennen:

```typescript
// Bij elk bericht to Claude, voeg toe:
system_context += `\n\n## Andere actieve AI\nOpenClaw (Kees) is also actief.
Are last antwoord was: "${lastOpenClawResponse}"`;

// Bij elk bericht to OpenClaw, voeg toe if context:
// (via the chat protocol that OpenClaw already has)
```

### Taak Delegatie
AI's can taken about elkaar delegeren:
```
Claude: "Kees, can jij even the prijs op that Amazon page checken?"
→ Router stuurt this if instructie to OpenClaw
→ OpenClaw voert out and rapporteert
→ Claude verwerkt the antwoord
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
  capabilities: string[];          // Welke tools mag this agent use
  autoApprove: string[];           // Welke acties auto-approve
}

const ROLES: AgentRole[] = [
  {
    id: 'researcher',
    name: 'Researcher',
    description: 'Zoekt and leest informatie op the web',
    backend: 'claude',
    systemPromptAddition: 'You bent gespecialiseerd in web research...',
    capabilities: ['navigate', 'read_page', 'screenshot', 'open_tab'],
    autoApprove: ['navigate', 'read_page', 'screenshot']
  },
  {
    id: 'analyst',
    name: 'Analyst',
    description: 'Analyseert page content and data',
    backend: 'claude',
    systemPromptAddition: 'You analyseert webpagina content...',
    capabilities: ['read_page', 'execute_js', 'screenshot'],
    autoApprove: ['read_page', 'screenshot']
  },
  {
    id: 'assistant',
    name: 'Persoonlijke Assistent',
    description: 'Kent Robin, helpt with dagelijkse taken',
    backend: 'openclaw',
    systemPromptAddition: '',  // OpenClaw has own personality
    capabilities: ['*'],
    autoApprove: ['navigate', 'read_page']
  }
];
```

### Agent Management UI

In Kees panel, a "Agents" tab:

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
│ [+ New Agent Rol]                │
└─────────────────────────────────────┘
```

## Conflict Resolution

Wat if twee AI's at the same time the same tab willen bedienen?

### Rules:
1. **Robin has always voorrang** — if Robin a tab uses, AI wait
2. **First claimt wint** — AI that a tab eerst claimt, mag ermee werken
3. **Own tabs** — AI's werken bij voorkeur in hun own tabs
4. **Escalatie** — bij conflict, question Robin

### Implementatie:
```typescript
class TabLockManager {
  private locks: Folder<string, string>;  // tabId → agentId

  acquire(tabId: string, agentId: string): boolean;
  release(tabId: string, agentId: string): void;
  isLocked(tabId: string): boolean;
  getOwner(tabId: string): string | null;
}
```

## Platform Considerations

- Message routing: purely JavaScript, cross-platform
- UI updates: default DOM manipulatie
- Inter-AI communicatie: via in-memory events
- No platform-specific code needed
- Agent state persistence: `~/.tandem/agents/` (cross-platform path)

## Kosten Considerations

With multiple Claude instanties actief:
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
