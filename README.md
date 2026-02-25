# Tandem Browser

**Version 0.9.0** · Human-AI symbiotic browser with built-in security intelligence

> The browser where you and your AI work as one — and where external content is hostile by default.

Tandem is built around a simple premise: AI agents with real system access need a browser that treats every byte of external content as potentially adversarial. Not as a policy setting. As a first principle.

It started as a collaboration layer — a browser where a human handles detection gates and judgment calls while an AI handles navigation, extraction, and automation. It grew into something more: a browser with a full security intelligence stack designed specifically for the AI agent threat model.

When an AI agent browses the web with system-level access, a hidden instruction in a page's HTML is not a nuisance. It is remote code execution without an exploit. Tandem's security layer sits between every byte of external content and the AI — YARA-style threat rules, AST fingerprinting, cross-domain script correlation, entropy analysis, and a confidence-weighted pipeline that knows what to resolve locally and what to escalate.

## Why?

Platforms block AI crawlers. LinkedIn returns 403. Twitter walls off bots. Cloudflare challenges everything.

A browser with a real human behind it passes every gate. Tandem combines that with AI-powered automation. But beyond bypassing detection — as AI systems gain real capabilities and real access, the browser becomes the most dangerous attack surface they interact with. Tandem is built to make that surface defensible.

## Core Principles

- **External content is hostile by default** — nothing is trusted without verification
- **Human + AI as equals** — the human handles gates and judgment; the AI handles scale and precision
- **Local and sovereign** — 811K+ threat entries, 51 automated tests, zero telemetry, all data stays on your machine

## Platform Support

| Platform | Status | Notes |
|----------|--------|-------|
| macOS    | ✅ Stable | Primary development platform |
| Linux    | ✅ Supported | Use `scripts/run-linux.sh` for best results |
| Windows  | ❓ Untested | Should work with Electron, PRs welcome |

## Quick Start

### macOS

```bash
cd tandem-browser
npm install
npm run dev
```

### Linux

```bash
cd tandem-browser
npm install
npm run compile
./scripts/run-linux.sh
```

**Linux notes:**
- Uses `--no-sandbox` flag (required for many Linux setups)
- Wayland users: automatically falls back to X11 for stability
- Headless environments: GPU is disabled automatically

The browser opens. The API starts on `localhost:8765`.

## Configuration

Tandem stores config in `~/.tandem/config.json`. Key settings:

```json
{
  "general": {
    "agentName": "Copilot",
    "agentDisplayName": "AI Copilot",
    "copilotPanelPosition": "right",
    "copilotPanelDefaultOpen": false,
    "activeBackend": "openclaw"
  }
}
```

The `agentName` and `agentDisplayName` customize how the AI is referred to throughout the UI.

## Security Intelligence

Tandem's security system runs as a layered pipeline on every request, script, and page load:

| Layer | Components | What it catches |
|-------|-----------|----------------|
| Network | Guardian + NetworkShield | 811K+ blocked domains/URLs, <5ms sync decision |
| Outbound | OutboundGuard | Credential exfiltration, data leaks in POST bodies |
| Runtime | ScriptGuard + ContentAnalyzer + BehaviorMonitor | Malicious scripts, hidden iframes, crypto miners |
| AI Bridge | GatekeeperWebSocket | Routes ambiguous events to AI agent for decision |
| Learning | EvolutionEngine + ThreatIntel | Per-domain trust scores, anomaly baselines |

**Script analysis** (v0.9.0): 25 YARA-style threat rules, Shannon entropy detection, Acorn AST fingerprinting (obfuscation-resistant), cross-domain script correlation, confidence-weighted Gatekeeper routing.

**Test coverage**: 51 automated tests via Vitest — entropy, normalization, AST hashing, cosine similarity, and every threat rule validated with true-positive and true-negative samples.

Security API: `GET localhost:8765/security/status`

## Compatible AI Agents

Tandem works with any HTTP-capable AI agent:
- **OpenClaw** — full integration with webhooks and activity streaming
- **Claude Code** — via MCP server or HTTP API
- **Any custom agent** — just talk to `localhost:8765`

## API

Your AI copilot controls the browser through a local HTTP API:

### Navigation & Content

```bash
# Status (includes active tab info)
curl localhost:8765/status

# Navigate
curl -X POST localhost:8765/navigate -H 'Content-Type: application/json' -d '{"url":"https://linkedin.com"}'

# Read the page
curl localhost:8765/page-content

# Get raw HTML
curl localhost:8765/page-html

# List all links
curl localhost:8765/links

# List all forms
curl localhost:8765/forms
```

### Interaction (anti-detect: sendInputEvent, Event.isTrusted = true)

```bash
# Click — uses OS-level mouse events with humanized delays
curl -X POST localhost:8765/click -H 'Content-Type: application/json' -d '{"selector":"button.sign-in"}'

# Type — char-by-char sendInputEvent with gaussian timing (30-120ms per key)
curl -X POST localhost:8765/type -H 'Content-Type: application/json' -d '{"selector":"#email","text":"user@example.com","clear":true}'

# Scroll — uses mouseWheel input event
curl -X POST localhost:8765/scroll -H 'Content-Type: application/json' -d '{"direction":"down","amount":500}'

# Wait for element or page load
curl -X POST localhost:8765/wait -H 'Content-Type: application/json' -d '{"selector":".results","timeout":10000}'

# Execute arbitrary JS in page
curl -X POST localhost:8765/execute-js -H 'Content-Type: application/json' -d '{"code":"document.title"}'
```

### Screenshot & Cookies

```bash
# Screenshot (via capturePage — main process, not detectable)
curl localhost:8765/screenshot --output screen.png

# Save to file
curl "localhost:8765/screenshot?save=/tmp/screen.png"

# Cookies
curl localhost:8765/cookies
curl "localhost:8765/cookies?url=https://linkedin.com"
```

### Tabs

```bash
# Open a new tab
curl -X POST localhost:8765/tabs/open -H 'Content-Type: application/json' -d '{"url":"https://example.com"}'

# List all tabs and groups
curl localhost:8765/tabs/list

# Focus a tab
curl -X POST localhost:8765/tabs/focus -H 'Content-Type: application/json' -d '{"tabId":"tab-2"}'

# Close a tab
curl -X POST localhost:8765/tabs/close -H 'Content-Type: application/json' -d '{"tabId":"tab-2"}'

# Group tabs (with color)
curl -X POST localhost:8765/tabs/group -H 'Content-Type: application/json' -d '{"groupId":"work","name":"Work","color":"#4285f4","tabIds":["tab-1","tab-2"]}'
```

### Copilot Alerts

```bash
# Ask the human for help (shows notification)
curl -X POST localhost:8765/copilot-alert -H 'Content-Type: application/json' -d '{"title":"Captcha!","body":"There is a captcha on LinkedIn, can you solve it?"}'
```

### Copilot Panel

```bash
# Get activity log
curl localhost:8765/activity-log

# Toggle panel
curl -X POST localhost:8765/panel/toggle -H 'Content-Type: application/json' -d '{}'

# Send chat message as the copilot
curl -X POST localhost:8765/chat -H 'Content-Type: application/json' -d '{"text":"Hey, check out this page!"}'

# Get chat history
curl localhost:8765/chat
```

### Draw/Annotation Tool

```bash
# Toggle draw mode
curl -X POST localhost:8765/draw/toggle -H 'Content-Type: application/json' -d '{}'

# Take annotated screenshot
curl -X POST localhost:8765/screenshot/annotated

# Get last annotated screenshot (PNG)
curl localhost:8765/screenshot/annotated -o screenshot.png

# List recent screenshots
curl localhost:8765/screenshots
```

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| Cmd/Ctrl+T | New tab |
| Cmd/Ctrl+W | Close tab |
| Cmd/Ctrl+1-9 | Switch to tab 1-9 |
| Cmd/Ctrl+K | Toggle Copilot panel |
| Cmd/Ctrl+D | Toggle draw mode |

## Architecture

```
Tandem Browser (Electron)
├── Tab Bar ← Multiple tabs with favicons, groups, colors
├── Browser UI (Chromium webviews) ← You see and navigate
├── Copilot Panel (shell layer) ← Activity log, chat, screenshots
├── Draw Overlay (shell layer) ← Annotations on top of webview
├── Tandem API (localhost:8765) ← AI copilot sends commands
├── Input Layer ← sendInputEvent (OS-level, Event.isTrusted=true)
├── Stealth Layer ← Anti-detection (UA, headers, navigator)
└── Copilot Alerts ← AI asks you for help
```

## Anti-Detection

All automated interactions use `webContents.sendInputEvent()` which produces OS-level events:
- **Click**: mouseMove → mouseDown → mouseUp with gaussian delays (80-300ms)
- **Type**: char-by-char with gaussian typing rhythm (30-120ms per key)
- **Scroll**: mouseWheel events
- **Screenshot**: `capturePage()` from main process (invisible to page)
- All events have `Event.isTrusted = true` — indistinguishable from human input

## Philosophy

- **Real browser** — Not headless, not Puppeteer. A browser you actually use.
- **API-first** — Everything the copilot does goes through the HTTP API.
- **Local only** — No cloud, no external services. Your data stays yours.
- **Tandem** — Together stronger than apart.

## License

MIT
