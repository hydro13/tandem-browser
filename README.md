# Tandem Browser

[![Verify](https://github.com/hydro13/tandem-browser/actions/workflows/verify.yml/badge.svg)](https://github.com/hydro13/tandem-browser/actions/workflows/verify.yml)
[![CodeQL](https://github.com/hydro13/tandem-browser/actions/workflows/codeql.yml/badge.svg)](https://github.com/hydro13/tandem-browser/actions/workflows/codeql.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Version](https://img.shields.io/github/package-json/v/hydro13/tandem-browser)](package.json)

**236 MCP tools. Plug in any AI. No scraping. No API wrangling.**

Tandem is a local-first Electron browser where a human and an AI agent browse
together. The agent sees what you see, navigates your tabs, reads your pages,
and operates inside your authenticated sessions — while an 8-layer security
model keeps web content from attacking the agent layer.

Connect via **MCP** (Claude Code, Claude Desktop, Cursor, Windsurf, Ollama, any
MCP client) or a **300+ endpoint HTTP API**. Works with any AI that speaks
either protocol.

![Tandem Browser — homescreen](docs/screenshots/tandem-homescreen-hero.jpg)

## What Can An Agent Do?

| Category | Tools | Examples |
|----------|-------|---------|
| **Navigation & Input** | 10 | Navigate, click, type, scroll, press keys, wait for load |
| **Tabs & Workspaces** | 10 | Open/close/focus tabs, create workspaces, move tabs between them |
| **Page Content** | 8 | Read page, get HTML, extract content, get links, forms, screenshots |
| **Accessibility Snapshots** | 7 | Accessibility tree with `@ref` IDs, click/fill by ref, semantic find |
| **DevTools** | 12 | Console logs, network requests, DOM queries, XPath, performance, storage |
| **Network Inspector** | 9 | Network log, API discovery, HAR export, request mocking |
| **Sessions & Auth** | 12 | Isolated sessions, session fetch relay, auth state detection |
| **Bookmarks & History** | 15 | Full bookmark CRUD, history search, site memory |
| **Passwords & Forms** | 9 | Vault management, password generation, form autofill |
| **Extensions** | 13 | List, install, import from Chrome, gallery, updates, conflicts |
| **Workflows & Tasks** | 18 | Multi-step workflows, task approval, agent autonomy, tab locks |
| **Previews** | 4 | Create live HTML pages in the browser, update with instant reload |
| **Media & UI** | 19 | Voice, audio, screenshots, draw mode, sidebar config, panel toggle |
| **Device Emulation** | 4 | Emulate phones/tablets, custom viewports |
| **Data & Config** | 16 | Export/import, downloads, watches, pinboards, browser config |
| **System** | 6 | Browser status, headless mode, Google Photos, security overrides |
| **Awareness** | 2 | Activity digest, real-time focus detection — the AI knows what you're doing |

**236 tools total** — full parity with the HTTP API.

## Why Not Just Use Playwright?

Playwright gives you a headless browser that you control. Tandem gives you
the user's **real browser** — their tabs, their sessions, their cookies,
their extensions. The agent doesn't start from scratch; it joins what's
already there.

Plus:

- **Security model**: 8 layers between web content and the agent, including
  prompt injection defense. Playwright has none.
- **Shared context**: the agent sees what the human is doing and vice versa
- **Stealth**: websites see a normal Chrome browser, not an automation tool
- **Background tabs**: operate on any tab without stealing focus
- **Human-in-the-loop**: captchas, risky actions, and ambiguous cases go
  back to the human

## Quick Start

```bash
git clone https://github.com/hydro13/tandem-browser.git
cd tandem-browser
npm install
npm start
```

macOS is the primary platform. Linux works. Windows is not validated yet.

## Connect Your AI Agent

### Claude Code / Claude Desktop (MCP)

Add to your MCP configuration:

**Claude Code** (`.mcp.json` in project root or `~/.claude/settings.json`):
```json
{
  "mcpServers": {
    "tandem": {
      "command": "node",
      "args": ["/path/to/tandem-browser/dist/mcp/server.js"]
    }
  }
}
```

**Claude Desktop** (`~/Library/Application Support/Claude/claude_desktop_config.json`):
```json
{
  "mcpServers": {
    "tandem": {
      "command": "node",
      "args": ["/path/to/tandem-browser/dist/mcp/server.js"]
    }
  }
}
```

Start Tandem, and 236 tools are available immediately.

### Cursor / Windsurf / Other MCP Clients

Same config — point your MCP client at `dist/mcp/server.js`. Any client
that implements the MCP protocol works.

### HTTP API (for custom integrations)

```bash
TOKEN="$(cat ~/.tandem/api-token)"

curl -sS http://127.0.0.1:8765/status
curl -sS http://127.0.0.1:8765/tabs/list \
  -H "Authorization: Bearer $TOKEN"
```

300+ endpoints for everything the MCP tools can do, plus lower-level access.

## Security Model

Tandem treats security as core architecture, not an afterthought. When an AI
has access to your browser, every ad network, tracking pixel, and malicious
domain is in the agent's attack surface.

**8 security layers:**

1. Network shield with domain/IP blocklists
2. Outbound guard scanning POST bodies for credential leaks
3. AST-level JavaScript analysis on runtime scripts
4. Behavior monitoring per tab
5. Gatekeeper channel for ambiguous cases
6. Prompt injection defense on page content
7. Layer separation — pages cannot fingerprint the agent
8. Human-in-the-loop for risky or blocked actions

Strict layer separation means page JavaScript cannot observe or fingerprint
the agent layer. That's not something you bolt onto Chrome after the fact.

## The Browser

Beyond the agent layer, Tandem is a full daily-driver browser:

- **Left sidebar**: Telegram, WhatsApp, Discord, Slack, Gmail, Calendar,
  Instagram, X — all in isolated sessions alongside your browsing
- **Workspaces**: organize tabs into separate spaces (the agent gets its own)
- **Pinboards**: collect and organize links, images, quotes
- **Bookmarks & History**: with Chrome import and sync
- **Chrome extensions**: load from disk or install from Chrome Web Store
- **URL autocomplete**: Chrome-style suggestions from browsing history
- **Password manager**: local vault with AES-256-GCM encryption
- **Video recorder**: application and region capture
- **Device emulation**: test responsive designs

All local-first. No cloud dependency.

## Typical Agent Workflows

- **Research**: agent opens multiple tabs, reads and summarizes pages while
  you keep browsing
- **Autonomous workspace**: agent creates its own workspace, manages tabs
  independently, and alerts you when human help is needed
- **SPA inspection**: accessibility snapshots and semantic locators instead
  of guessing from raw HTML
- **Session-aware tasks**: agent operates inside your real authenticated
  browser context
- **Live previews**: agent builds HTML pages and shows them to you in the
  browser with instant live reload

## Status

Public **developer preview** — real project, early public state, open for
contributors, not yet a polished mass-user release.

![Tandem Browser — browsing](docs/screenshots/tandem-browser-interaction.png)

- Primary platform: macOS
- Secondary platform: Linux
- Windows: not actively validated
- Binaries: not published yet (source-only)
- Current version: see [package.json](package.json)

## Contributing

Good contribution areas:

- MCP tool improvements and new tool proposals
- Browser API improvements
- Linux quality and cross-platform testing
- Security review and hardening
- UI polish for human + agent workflows
- Bug reports with reproduction steps

Start with [CONTRIBUTING.md](CONTRIBUTING.md) and [PROJECT.md](PROJECT.md).

## Repository Guide

| File | What |
|------|------|
| [PROJECT.md](PROJECT.md) | Product vision and architecture |
| [CHANGELOG.md](CHANGELOG.md) | Release history |
| [CONTRIBUTING.md](CONTRIBUTING.md) | How to contribute |
| [skill/SKILL.md](skill/SKILL.md) | Agent instruction manual |
| [SECURITY.md](SECURITY.md) | Vulnerability reporting |
| [docs/](docs/) | Full documentation |

## License

MIT. See [LICENSE](LICENSE).
