# Tandem Browser — AI Integration Vision

## Core Idea

Tandem Browser is not a normal browser. It is a **human-AI fusion interface** where Robin and the AI become one user together. The browser is the place where human agency and AI capabilities meet.

### Why This Works

- Robin operates the browser as a human → no bot detection, no AI blocks
- The AI watches, reads, and thinks along → superhuman browsing capability
- The AI can operate the browser as if it were Robin's hands
- Sites see one user: a human with a browser. That is also correct — Robin IS there.

### The "Together as One" Philosophy

```
Robin (human)  +  AI (Claude/OpenClaw)  =  One User
   ↕                    ↕                      ↕
 eyes/hands       thinking/reading        browsing/acting
 voice/choices    analyzing               deciding together
```

## What the AI Must Be Able to Do

Everything a human can do with a browser:

| Category | Actions |
|-----------|--------|
| **Navigation** | Open URLs, go back/forward, manage tabs, use bookmarks |
| **Reading** | Read page content, extract text, view screenshots |
| **Interaction** | Click, type, scroll, fill forms |
| **Communication** | Chat with Robin through the Kees panel, process voice input |
| **Analysis** | Summarize pages, extract data, recognize patterns |
| **Autonomy** | Browse independently, investigate, report back to Robin |
| **Collaboration** | Watch live, make suggestions, take over tasks |

## AI Backends

### 1. Claude (Anthropic API / Cowork / Code)
- Strongest reasoning and analysis
- Can control the browser via MCP tools
- Cowork: collaborative session from the IDE
- Code: command-line interface

### 2. OpenClaw
- Existing WebSocket gateway (`ws://127.0.0.1:18789`)
- Custom agent platform
- Its own capabilities and personality (Kees)

### 3. Future
- Other LLM backends (local models, open-source)
- Specialized agents for specific tasks
- Multi-agent coordination

## Architecture Overview

```
┌────────────────────────────────────────────────────────────┐
│                    Tandem Browser (Electron)                │
│                                                            │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────────┐ │
│  │   Webview     │  │  Kees Panel  │  │   API Server    │ │
│  │  (browsing)   │  │  (chat UI)   │  │   :8765         │ │
│  │              │  │              │  │                 │ │
│  │  Robin sees  │  │  Chat +      │  │  REST endpoints │ │
│  │  & controls  │  │  Voice +     │  │  for everything │ │
│  │              │  │  Controls    │  │                 │ │
│  └──────┬───────┘  └──────┬───────┘  └────────┬────────┘ │
│         │                 │                    │          │
│         │          ┌──────┴───────┐            │          │
│         │          │ Chat Router  │            │          │
│         │          │              │            │          │
│         │          │ Select:      │            │          │
│         │          │ • OpenClaw   │            │          │
│         │          │ • Claude     │            │          │
│         │          │ • Both       │            │          │
│         │          └──┬───────┬───┘            │          │
│         │             │       │                │          │
└─────────┼─────────────┼───────┼────────────────┼──────────┘
          │             │       │                │
          │    ┌────────┘       └─────────┐      │
          │    ▼                          ▼      ▼
          │  ┌──────────┐       ┌─────────────────────┐
          │  │ OpenClaw │       │   Claude Ecosystem  │
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
    │ Stream     │──→ All AIs receive live updates
    │ (SSE/WS)   │    about what Robin does
    └────────────┘
```

## Cross-Platform Strategy

Tandem is being built for:
1. **macOS** (current development environment)
2. **Linux** (second priority, docs in `/Linux-version/`)
3. **Windows** (later)

All AI integration code must be platform-independent:
- No hardcoded paths
- `process.platform` checks where needed
- Standard web APIs where possible
- Node.js APIs for filesystem operations

## Privacy & Security

- All AI communication is **local** (localhost API, local WebSocket)
- API token authentication for external access
- No data goes to third parties without Robin's explicit consent
- Robin always has final control
- The AI can act only within the browser context
