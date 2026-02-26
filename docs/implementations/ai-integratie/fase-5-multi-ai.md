# Fase 5: Multi-AI Coördinatie

> 1-2 sessies | Geen nieuwe dependencies
> OpenClaw + Claude tegelijk actief, met @-mention routing.

---

## Doel

Meerdere AI's tegelijk actief in Tandem. OpenClaw (Kees) en Claude werken parallel. Robin orkestreert wie wat doet.

---

## Sessie 5.1: Dual Backend + Message Routing

### "Beide" mode

Chat router stuurt berichten naar alle actieve backends:

```typescript
class DualMode {
  async sendMessage(text: string): Promise<void> {
    if (text.startsWith('@claude ')) {
      await this.claudeBackend.sendMessage(text.slice(8));
    } else if (text.startsWith('@kees ')) {
      await this.openclawBackend.sendMessage(text.slice(6));
    } else {
      // Naar alle actieve backends
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
Robin: Wat is de hoofdstad van Nederland?

[🐙 Kees]: Amsterdam is de hoofdstad, hoewel Den Haag de
regeringszetel is.

[🤖 Claude]: De grondwettelijke hoofdstad is Amsterdam.
Den Haag is zetel van regering en parlement.
```

### TabLockManager

Voorkom dat twee agents dezelfde tab bedienen:

```typescript
class TabLockManager {
  private locks: Map<string, string>;  // tabId → agentId

  acquire(tabId: string, agentId: string): boolean;
  release(tabId: string, agentId: string): void;
  isLocked(tabId: string): boolean;
  getOwner(tabId: string): string | null;
}
```

Regels:
1. Robin heeft ALTIJD voorrang
2. Eerste agent die claimt wint
3. Agents werken bij voorkeur in eigen tabs
4. Bij conflict → vraag Robin

### Backend selector update

Derde optie in de selector:
```
🐙 Kees | 🤖 Claude | 🐙🤖 Beide
```

### Verificatie
- [ ] Beide backends tegelijk actief zonder crashes
- [ ] Berichten correct gerouteerd
- [ ] @-mention routing werkt
- [ ] Antwoorden duidelijk gelabeld per bron
- [ ] Geen tab conflicten
- [ ] `npx tsc` — zero errors

---

## Toekomst (na fase 5)

Na de 5 fases, mogelijke uitbreidingen:
- Lokale LLM integratie (Ollama/llama.cpp als backend)
- Role-based agents (Researcher, Analyst, Writer)
- Agent-to-agent communicatie
- Workflow recorder (Robin doet voor, AI herhaalt)
- Multi-window support
