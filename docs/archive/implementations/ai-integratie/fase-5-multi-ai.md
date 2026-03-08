# Phase 5: Multi-AI Coördinatie

> 1-2 sessions | No new dependencies
> OpenClaw + Claude simultaneously actief, with @-mention routing.

---

## Goal

Multiple AI's simultaneously actief in Tandem. OpenClaw (Kees) and Claude werken parallel. Robin orchestrates wie wat doet.

---

## Sessie 5.1: Dual Backend + Message Routing

### "Beide" mode

Chat router stuurt berichten to alle actieve backends:

```typescript
class DualMode {
  async sendMessage(text: string): Promise<void> {
    if (text.startsWith('@claude ')) {
      await this.claudeBackend.sendMessage(text.slice(8));
    } else if (text.startsWith('@kees ')) {
      await this.openclawBackend.sendMessage(text.slice(6));
    } else {
      // To alle actieve backends
      await Promise.all([
        this.openclawBackend.sendMessage(text),
        this.claudeBackend.sendMessage(text),
      ]);
    }
  }
}
```

### Antwoorden tonen

```
Robin: Wat is the hoofdstad or Nederland?

[🐙 Kees]: Amsterdam is the hoofdstad, hoewel Den Haag the
regeringszetel is.

[🤖 Claude]: The grondwettelijke hoofdstad is Amsterdam.
Den Haag is zetel or regering and parlement.
```

### TabLockManager

Voorkom that twee agents the same tab bedienen:

```typescript
class TabLockManager {
  private locks: Folder<string, string>;  // tabId → agentId

  acquire(tabId: string, agentId: string): boolean;
  release(tabId: string, agentId: string): void;
  isLocked(tabId: string): boolean;
  getOwner(tabId: string): string | null;
}
```

Rules:
1. Robin has ALTIJD voorrang
2. First agent that claimt wint
3. Agents werken bij voorkeur in own tabs
4. Bij conflict → question Robin

### Backend selector update

Derde optie in the selector:
```
🐙 Kees | 🤖 Claude | 🐙🤖 Beide
```

### Verificatie
- [ ] Beide backends simultaneously actief without crashes
- [ ] Berichten correct gerouteerd
- [ ] @-mention routing works
- [ ] Antwoorden duidelijk gelabeld per bron
- [ ] No tab conflicts
- [ ] `npx tsc` — zero errors

---

## Toekomst (na phase 5)

Na the 5 fases, mogelijke uitbreidingen:
- Lokale LLM integratie (Ollama/llama.cpp if backend)
- Role-based agents (Researcher, Analyst, Writer)
- Agent-to-agent communicatie
- Workflow recorder (Robin doet for, AI herhaalt)
- Multi-window support
