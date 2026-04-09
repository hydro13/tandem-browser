# Tandem Browser

[![Verify](https://github.com/hydro13/tandem-browser/actions/workflows/verify.yml/badge.svg)](https://github.com/hydro13/tandem-browser/actions/workflows/verify.yml)
[![CodeQL](https://github.com/hydro13/tandem-browser/actions/workflows/codeql.yml/badge.svg)](https://github.com/hydro13/tandem-browser/actions/workflows/codeql.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Version](https://img.shields.io/github/package-json/v/hydro13/tandem-browser)](package.json)

Tandem Browser is a local-first Electron browser built for human-AI
collaboration. Any AI agent that speaks MCP or HTTP can control it.

![Tandem Browser — homescreen with OpenClaw sidebar](docs/screenshots/tandem-homescreen-hero.jpg)

**The real strength is the security model.**

Tandem puts a full security stack between web content and the
agent: network shield with domain/IP blocklists, outbound guard that scans POST
bodies for credential leaks, AST-level JavaScript analysis on runtime scripts,
behavior monitoring per tab, and a gatekeeper channel that surfaces ambiguous
cases back to the human instead of silently proceeding. Strict layer separation
means page JavaScript cannot fingerprint or observe the agent layer.

That is not something you bolt onto Chrome after the fact. It has to be in the
browser.

The human browses normally. AI agents connect via a built-in **MCP server**
(82 tools) or a **local HTTP API** (300+ endpoints) on `127.0.0.1:8765` for
navigation, extraction, automation, and observability. Tandem is not a generic
"AI browser" shell — it is an agent-first browser environment designed so a
human and an AI can browse together on the same machine.

Tandem was originally built for OpenClaw and continues to be developed by an
OpenClaw maintainer, but the MCP server makes it equally accessible to Claude
Code, Cursor, Windsurf, or any other MCP-compatible agent.

**The left sidebar brings your communication and tools into the browser.** Built-in panels for Telegram, WhatsApp, Discord, Slack, Gmail, Google Calendar, Instagram, and X — all persistent, all in their own isolated session alongside your main browsing. Next to the messengers: Workspaces, Pinboards, Bookmarks, History, Downloads, and Personal News. The sidebar is resizable, pinnable, and rendered with frosted glass so it stays out of the way when you don't need it.

**The right-side Wingman panel** is where the AI agent lives. Chat, activity feed, screenshots, and agent context — all in one place, connected to the local API so the agent can see what you're looking at and act on it.

## Why Tandem?

Raw browser access alone is not the product goal. Tandem adds the missing
layer: a browser built for human + AI collaboration on the real web, with
multiple security layers, review points, and a shared live workflow that keeps
both the human and the agent safer.

With Tandem, any AI agent gets:

- a browser designed from the start for human + agent collaboration on the
  same machine
- a **82-tool MCP server** for direct integration with Claude Code, Cursor,
  Windsurf, or any MCP-compatible client
- a **300+ endpoint HTTP API** for tabs, navigation, snapshots, sessions,
  devtools, network mocking, and controlled automation
- an eight-layer security model built around the fact that an AI has access to
  live web content — including the first browser-level prompt injection defense
- a browser surface where the human stays in the loop for ambiguous or risky
  situations, with explicit handoff points instead of silent automation
- a local-first workflow with no dependency on a remote browser vendor or
  cloud automation service

## Status

This repository is a public `developer preview` — real project, early public state, open for contributors, not yet a polished mass-user release.

![Tandem Browser — browsing with OpenClaw](docs/screenshots/tandem-browser-interaction.png)

- primary platform: macOS
- secondary platform: Linux
- Windows is not actively validated yet
- current version: see [package.json](package.json)
- current release history: [CHANGELOG.md](CHANGELOG.md)
- official release format today: source code only
- official binaries: not published yet

The goal of making the repository public is to let other contributors and builders help improve the browser over time — not just to show it.
If you want to help shape Tandem, now is the right time. The browser still has
rough edges, and extra engineering eyes on bugs, architecture, UX, Linux
behavior, extension compatibility, and agent workflow polish would be
genuinely useful.

## Agent-First Positioning

Tandem is built around collaboration with AI agents.

- **MCP server** (82 tools): the recommended way for Claude Code, Cursor, and other MCP clients to connect — zero config, full browser control
- **HTTP API** (300+ endpoints): for agents that prefer direct HTTP, or for custom integrations
- the right-side Wingman workflow supports OpenClaw as a primary runtime, with the MCP server opening Tandem to any agent ecosystem
- the security model is shaped by the fact that an AI agent has access to a live browser
- the repository may still be useful for general Electron browser experimentation, but the product itself is intentionally agent-first

## Typical Agent Workflows

Tandem is most useful when an AI agent needs more than a single scripted page
action.

Examples:

- research workflows across multiple tabs, where the agent opens, inspects, and
  summarizes pages while the human keeps browsing
- autonomous agent workspace, where the agent creates its own dedicated
  workspace, opens and manages tabs there independently from the user's
  browsing, and calls `tandem_wingman_alert` to instantly surface the right
  workspace to the user when human help is needed
- SPA inspection, where the agent uses accessibility snapshots, semantic
  locators, and devtools surfaces instead of guessing from raw HTML alone
- session-aware tasks, where the agent can operate inside the human's real
  authenticated browser context
- human-in-the-loop workflows, where captchas, risky actions, or uncertain
  cases are surfaced back to the human instead of hidden

## What Tandem Does

- Human + AI shared browsing with one local browser session
- **MCP server** with 82 tools for direct agent integration (snapshots,
  devtools, network, sessions, workspaces, tab locks, and more)
- **HTTP API** with 300+ endpoints for tabs, navigation, screenshots, content
  extraction, sessions, devtools surfaces, and automation
- Background-tab-safe targeting via `X-Tab-Id` for snapshots, page reads,
  JS evaluation, waits, links, and form inspection without forcing focus
- Security-by-default browsing with multi-layer filtering and review points
- Agent-first runtime integration for chat, browser control, and local workflows
- Local-first persistence for sessions, history, workspaces, bookmarks, and
  settings
- Chrome-style extension loading and related compatibility work

## Security Principles

Tandem treats security as part of the agent integration story, not as a
separate afterthought.

The high-level rules are:

- local-first: the browser runtime itself does not depend on a Tandem cloud
- local API only: the Tandem API binds to `127.0.0.1`
- human remains the dead-man switch: risky or blocked flows can be surfaced back
  to the user
- hostile-content mindset: web content is treated as potentially adversarial
- separation of layers: browser pages should not directly observe or fingerprint
  the agent layer

Current protections include network filtering, outbound request checks, runtime
script inspection, behavior monitoring, and agent-facing decision points for
ambiguous cases.

## Quick Start

### Prerequisites

- Node.js 20+
- npm
- macOS or Linux

### Install

```bash
npm install
```

### Verify

```bash
npm run verify
```

### Start

```bash
npm start
```

On macOS, the start script clears Electron quarantine flags before launch.

## Connecting An Agent

### Option 1: MCP (recommended for Claude Code, Cursor, etc.)

Add to your MCP client configuration (e.g. `~/.claude/settings.json`):

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

Start Tandem (`npm start`), and the agent has 82 tools available immediately.

### Option 2: HTTP API (for custom integrations)

```bash
npm install
npm start

TOKEN="$(cat ~/.tandem/api-token)"

curl -sS http://127.0.0.1:8765/status
curl -sS http://127.0.0.1:8765/tabs/list \
  -H "Authorization: Bearer $TOKEN"
```

If those return live JSON, Tandem is up and the agent has a usable control
surface.

### Option 3: OpenClaw (Wingman chat integration)

Tandem was originally built for OpenClaw and includes deep integration:

- Tandem serves its local API on `http://127.0.0.1:8765`
- OpenClaw uses the Tandem skill and sends requests to that local API
- OpenClaw reads the Tandem bearer token from `~/.tandem/api-token`
- For the in-app Wingman chat experience, the local OpenClaw gateway also needs
  to be running on `ws://127.0.0.1:18789`

The easiest way to get OpenClaw working with Tandem is to point it at this
repository. Clone it, run `npm install && npm start`, then tell OpenClaw:
"read `skill/SKILL.md` in the Tandem repo — that is your instruction manual for
working with this browser."

## Verify The Connection

```bash
TOKEN="$(cat ~/.tandem/api-token)"

curl -sS http://127.0.0.1:8765/status

curl -sS http://127.0.0.1:8765/tabs/list \
  -H "Authorization: Bearer $TOKEN"
```

Expected result:

- `/status` returns a live Tandem status payload
- `/tabs/list` returns JSON instead of `401 Unauthorized`

## Public API Snapshot

Examples:

```bash
curl http://127.0.0.1:8765/status

curl -X POST http://127.0.0.1:8765/tabs/open \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"url":"https://example.com","focus":false}'

curl http://127.0.0.1:8765/snapshot?compact=true \
  -H "Authorization: Bearer $TOKEN"

curl -X POST http://127.0.0.1:8765/find \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"by":"text","value":"Sign in"}'

curl -X POST http://127.0.0.1:8765/sessions/fetch \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"tabId":"tab-7","url":"/api/me","method":"GET"}'
```

The local API binds to `127.0.0.1:8765`.

## Known Limitations

- `Personal News` exists as a sidebar slot but is not a finished panel
- Linux video recording still has desktop audio limitations due to Electron
  process isolation
- Windows support is not actively validated
- Packaging and auto-update flows are still less mature than the core browser
  and API surface
- Public releases are currently source-only; no official end-user binaries are
  published yet

## Contributing Focus

This repo is public because Tandem should be buildable with contributors, not
only observed from a distance.

Good contribution areas right now:

- MCP tool improvements and new tool proposals
- browser API improvements for tabs, snapshots, sessions, and devtools
- Linux quality and cross-platform testing
- security review and containment hardening
- UI polish for the shared human + agent browsing workflow
- bug reports with reproduction steps and logs
- code review, issue triage, and docs cleanup

If you want the project map first, start with:

- [PROJECT.md](PROJECT.md)
- [CONTRIBUTING.md](CONTRIBUTING.md)
- [skill/SKILL.md](skill/SKILL.md)

## Repository Guide

- [PROJECT.md](PROJECT.md): product vision and architecture overview
- [docs/README.md](docs/README.md): documentation map
- [CHANGELOG.md](CHANGELOG.md): release history
- [CONTRIBUTING.md](CONTRIBUTING.md): contribution workflow
- [SECURITY.md](SECURITY.md): vulnerability reporting
- [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md): collaboration expectations

Files such as [AGENTS.md](AGENTS.md), [TODO.md](TODO.md), and several archived
documents are maintainer workflow material. They remain in the repository for
engineering context, but they are not the primary public entry points.

Contributions are welcome. If you want to help improve Tandem as an
agent-first browser, start with [CONTRIBUTING.md](CONTRIBUTING.md). Even if
you are not ready to ship a large feature, smaller fixes, validation work,
security review, Linux testing, docs improvements, and focused issue reports
are all useful contributions.

## License

MIT. See [LICENSE](LICENSE).
