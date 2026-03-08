# Tandem Browser

Tandem Browser is a local-first Electron browser built for human-AI
collaboration with OpenClaw as a first-class runtime. The human browses
normally. The AI gets a local API on `127.0.0.1:8765` for navigation,
extraction, automation, and observability. Websites should only see an
ordinary Chromium browser on macOS or Linux, not an “AI browser”.

Tandem is opinionated about security. If an AI can read and act on live web
content, the browser becomes part or the threat model. Tandem puts a six-layer
security system between external content and the agent, with local-only data
handling and no cloud dependency in the browser itself. Those layers are built
so OpenClaw can operate against the live web with tighter guardrails than a
normal desktop browser shell.

## What It Does

- Human + AI shared browsing: a normal browser UI for the human, a local HTTP API for the agent
- OpenClaw-first runtime: Tandem is designed so OpenClaw can browse, inspect, and automate safely on the local machine
- Local API for automation: navigation, page content, screenshots, tabs, sessions, devtools-style endpoints, and more
- Security-by-default browsing: blocklists, outbound checks, script analysis, behavior monitoring, and an agent decision layer
- Extension support: Chrome-style extension loading, native messaging compatibility work, and extension update management
- Local-first data model: sessions, settings, history, workspaces, and browser state stay on the machine

## UI Highlights

The browser surface is broader than a simple tab shell.

- Left sidebar: workspaces, messenger-style panels, bookmarks, history, downloads, and other utility surfaces
- Main browsing area: Chromium webviews with tab management and session state
- Right-side Wingman panel: AI chat, activity, screenshots, and related agent tools
- Overlay tooling: annotations, screenshots, and other shell-level controls that stay out or the page context

## Current Status

- Primary platform: macOS
- Secondary platform: Linux
- Windows: not actively validated yet
- Current release: see [package.json](package.json) and [CHANGELOG.md](CHANGELOG.md)

## Architecture

Tandem runs two layers in parallel:

1. The visible browsing layer: Chromium webviews, tabs, downloads, bookmarks, workspaces, and the human-facing UI.
2. The invisible control layer: Electron main process services, the local HTTP API, security systems, OpenClaw integration, and the agent tooling.

This split matters because Tandem is designed to keep AI control out or the page
JavaScript context whenever possible while still giving OpenClaw a useful local
browser surface.

For the broader system overview, see [PROJECT.md](PROJECT.md).

## Quick Start

### Prerequisites

- Node.js
- npm
- macOS or Linux

### Install

```bash
npm install
```

### Compile

```bash
npm run compile
```

### Start

```bash
npm start
```

On macOS, the start script clears Electron quarantine flags before launch.

## Development

Useful commands:

```bash
npm run compile
npm test
npm run lint
npm run build
```

The local API binds to `127.0.0.1:8765`.

## Public API Snapshot

Examples:

```bash
curl http://127.0.0.1:8765/status

curl -X POST http://127.0.0.1:8765/navigate \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://example.com"}'

curl http://127.0.0.1:8765/page-content

curl http://127.0.0.1:8765/screenshot --output screen.png

curl -X POST http://127.0.0.1:8765/sessions/fetch \
  -H 'Content-Type: application/json' \
  -d '{"tabId":"tab-7","url":"/api/me","method":"GET"}'
```

## Security Model

Tandem treats external web content as hostile by default. The current stack includes:

- network-level blocking and threat feeds
- outbound request checks
- runtime script inspection
- behavior monitoring
- an AI-facing decision layer for ambiguous cases

This is a browser for agent-assisted work, so the project is intentionally more
paranoid than a normal desktop browser shell.

## Repository Guide

- [PROJECT.md](PROJECT.md): product vision, OpenClaw positioning, and architecture overview
- [docs/README.md](docs/README.md): documentation folder
- [CHANGELOG.md](CHANGELOG.md): release history
- [CONTRIBUTING.md](CONTRIBUTING.md): contribution workflow
- [SECURITY.md](SECURITY.md): vulnerability reporting

Internal workflow files such as [AGENTS.md](AGENTS.md) and [TODO.md](TODO.md) are kept for local development operations and are not the primary public documentation surface. The `docs/` tree also contains historical contributor packs with files such as `CLAUDE.md` and `LEES-MIJ-EERST.md`; those are retained for maintainers, not as end-user documentation.

## License

MIT. See [LICENSE](LICENSE).
