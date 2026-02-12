# Tandem Browser — AI Integratie Visie

## Kernidee

Tandem Browser is geen gewone browser. Het is een **mens-AI fusie interface** waar Robin en AI samen één gebruiker worden. De browser is het punt waar menselijke agency en AI-capaciteiten samenkomen.

### Waarom dit werkt

- Robin bestuurt de browser als mens → geen bot-detectie, geen AI-blokkades
- AI kijkt mee, leest mee, denkt mee → superhuman browse-capaciteit
- AI kan de browser bedienen alsof het Robin's handen zijn
- Sites zien één gebruiker: een mens met een browser. Dat klopt ook — Robin IS er.

### De "Samen Eén" Filosofie

```
Robin (mens)  +  AI (Claude/OpenClaw)  =  Eén Gebruiker
   ↕                    ↕                      ↕
 ogen/handen      denken/lezen            browsen/handelen
 stem/keuzes      analyseren              samen beslissen
```

## Wat AI moet kunnen

Alles wat een mens kan met een browser:

| Categorie | Acties |
|-----------|--------|
| **Navigatie** | URL's openen, terug/vooruit, tabs beheren, bookmarks gebruiken |
| **Lezen** | Pagina-inhoud lezen, tekst extracten, screenshots bekijken |
| **Interactie** | Klikken, typen, scrollen, formulieren invullen |
| **Communicatie** | Chat met Robin via Kees panel, voice input verwerken |
| **Analyse** | Pagina's samenvatten, data extracten, patronen herkennen |
| **Autonomie** | Zelfstandig browsen, onderzoeken, rapporteren aan Robin |
| **Samenwerking** | Live meekijken, suggesties doen, taken overnemen |

## AI Backends

### 1. Claude (Anthropic API / Cowork / Code)
- Sterkste redenering en analyse
- Kan via MCP tools de browser bedienen
- Cowork: collaborative sessie vanuit IDE
- Code: command-line interface

### 2. OpenClaw
- Bestaande WebSocket gateway (ws://127.0.0.1:18789)
- Custom agent platform
- Eigen capabilities en personality (Kees)

### 3. Toekomstig
- Andere LLM backends (lokale modellen, open-source)
- Gespecialiseerde agents voor specifieke taken
- Multi-agent coördinatie

## Architectuur Overzicht

```
┌────────────────────────────────────────────────────────────┐
│                    Tandem Browser (Electron)                │
│                                                            │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────────┐ │
│  │   Webview     │  │  Kees Panel  │  │   API Server    │ │
│  │  (browsing)   │  │  (chat UI)   │  │   :8765         │ │
│  │              │  │              │  │                 │ │
│  │  Robin ziet  │  │  Chat +      │  │  REST endpoints │ │
│  │  & bedient   │  │  Voice +     │  │  voor alles     │ │
│  │              │  │  Controls    │  │                 │ │
│  └──────┬───────┘  └──────┬───────┘  └────────┬────────┘ │
│         │                 │                    │          │
│         │          ┌──────┴───────┐            │          │
│         │          │ Chat Router  │            │          │
│         │          │              │            │          │
│         │          │ Selecteer:   │            │          │
│         │          │ • OpenClaw   │            │          │
│         │          │ • Claude     │            │          │
│         │          │ • Beide      │            │          │
│         │          └──┬───────┬───┘            │          │
│         │             │       │                │          │
└─────────┼─────────────┼───────┼────────────────┼──────────┘
          │             │       │                │
          │    ┌────────┘       └─────────┐      │
          │    ▼                          ▼      ▼
          │  ┌──────────┐       ┌─────────────────────┐
          │  │ OpenClaw │       │   Claude Ecosystem   │
          │  │ Gateway  │       │                     │
          │  │ :18789   │       │  ┌───────────────┐  │
          │  └──────────┘       │  │ MCP Server    │  │
          │                     │  │ (Tandem tools)│  │
          │                     │  └───────┬───────┘  │
          │                     │          │          │
          │                     │  ┌───────┴───────┐  │
          │                     │  │ Claude Code / │  │
          │                     │  │ Cowork        │  │
          │                     │  └───────────────┘  │
          │                     │          +          │
          │                     │  ┌───────────────┐  │
          │                     │  │ Anthropic API │  │
          │                     │  │ (direct chat) │  │
          │                     │  └───────────────┘  │
          │                     └─────────────────────┘
          │
    ┌─────┴──────┐
    │ Event      │
    │ Stream     │──→ Alle AI's krijgen live updates
    │ (SSE/WS)   │    van wat Robin doet
    └────────────┘
```

## Cross-Platform Strategie

Tandem wordt gebouwd voor:
1. **macOS** (huidige ontwikkelomgeving)
2. **Linux** (tweede prioriteit, docs in `/Linux-version/`)
3. **Windows** (later)

Alle AI-integratie code moet platform-onafhankelijk zijn:
- Geen hardcoded paden
- `process.platform` checks waar nodig
- Standaard web-APIs waar mogelijk
- Node.js APIs voor filesystem operaties

## Privacy & Beveiliging

- Alle AI communicatie is **lokaal** (localhost API, lokale WebSocket)
- API token authenticatie voor externe toegang
- Geen data naar derden zonder Robin's expliciete toestemming
- Robin heeft altijd de finale controle
- AI kan alleen handelen binnen de browser context
