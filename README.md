# Tandem Browser

[![Verify](https://github.com/hydro13/tandem-browser/actions/workflows/verify.yml/badge.svg)](https://github.com/hydro13/tandem-browser/actions/workflows/verify.yml)
[![CodeQL](https://github.com/hydro13/tandem-browser/actions/workflows/codeql.yml/badge.svg)](https://github.com/hydro13/tandem-browser/actions/workflows/codeql.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Version](https://img.shields.io/github/package-json/v/hydro13/tandem-browser)](package.json)

Tandem Browser is a local-first Electron browser built specifically for
human-AI collaboration with OpenClaw.

This repository is a public `developer preview`.

The human browses normally. OpenClaw gets a local API on `127.0.0.1:8765` for
navigation, extraction, automation, and observability. Tandem is not a generic
"AI browser" shell with OpenClaw added later. It is an OpenClaw-first browser
environment designed so the human and OpenClaw can browse together on the same
machine.

Tandem is built by an OpenClaw maintainer with OpenClaw as the primary AI
runtime.

Tandem is built around a two-layer model:

- visible layer: Chromium webviews, tabs, sidebar tools, downloads, and the
  human-facing shell
- invisible layer: Electron services, the local HTTP API, security systems,
  OpenClaw integration, and agent tooling

## Why Tandem For OpenClaw?

OpenClaw users usually hit the same limit with generic browsers and one-off
automation scripts: the agent can do isolated actions, but it does not get a
shared browser environment that stays observable, controllable, and close to
the human.

Tandem exists to close that gap.

With Tandem, OpenClaw gets:

- a local browser API for tabs, navigation, snapshots, sessions, devtools, and
  controlled automation
- a browser that is designed from the start for human + agent collaboration on
  the same machine
- a local-first workflow that does not depend on a remote browser vendor or a
  cloud automation service
- a browser surface where the human stays in the loop for ambiguous or risky
  situations instead of silently handing everything to the agent

For OpenClaw users, the point is not "AI inside a browser". The point is a
browser that OpenClaw can work with seriously.

## Status

Tandem is currently a public `developer preview`.

- primary platform: macOS
- secondary platform: Linux
- Windows is not actively validated yet
- current version: `0.57.9`
- current release history: [CHANGELOG.md](CHANGELOG.md)

The repository is intended to be public and usable by contributors, but not
everything is polished to end-user distribution quality yet.

The goal of making the repository public is not just to show the project. It is
also to let other contributors, maintainers, and OpenClaw-adjacent builders
help improve the browser over time.

If you are an OpenClaw maintainer or power user, the intended reading of this
repo is:

- real project
- early public state
- open for contributors
- not yet positioned as a polished mass-user browser release

## OpenClaw-First Positioning

Tandem is built around collaboration with OpenClaw.

- the right-side Wingman workflow is designed around OpenClaw as the primary AI runtime
- the local browser API exists so OpenClaw can inspect, navigate, extract, and automate safely
- the security model is shaped by the fact that OpenClaw has access to a live browser
- Tandem is built by an OpenClaw maintainer with OpenClaw as the primary AI runtime
- the repository may still be useful for general Electron browser experimentation, but the product itself is intentionally OpenClaw-first

## Typical OpenClaw Workflows

Tandem is most useful when OpenClaw needs more than a single scripted page
action.

Examples:

- research workflows across multiple tabs, where OpenClaw opens, inspects, and
  summarizes pages while the human keeps browsing
- SPA inspection, where OpenClaw uses snapshots, DOM search, and network or
  devtools surfaces instead of guessing from raw HTML alone
- session-aware tasks, where OpenClaw can operate inside the human's real
  authenticated browser context
- human-in-the-loop workflows, where captchas, risky actions, or uncertain
  cases are surfaced back to the human instead of hidden

## What Tandem Does

- Human + AI shared browsing with one local browser session
- Local HTTP API for tabs, navigation, screenshots, content extraction,
  sessions, devtools surfaces, and automation
- Security-by-default browsing with multi-layer filtering and review points
- OpenClaw-first runtime integration for chat, browser control, and local agent workflows
- Local-first persistence for sessions, history, workspaces, bookmarks, and
  settings
- Chrome-style extension loading and related compatibility work

## Key Product Surfaces

- left sidebar for workspaces, communication panels, bookmarks, history,
  downloads, and utilities
- main Chromium browsing surface with multi-tab session management
- right-side Wingman panel for chat, activity, screenshots, and agent context
- shell-level overlays for screenshots and annotations that stay outside the
  page JavaScript context

## Security Principles

Tandem treats security as part of the OpenClaw integration story, not as a
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

## First OpenClaw Check

If you want the shortest possible proof that Tandem is useful to OpenClaw, do
this:

```bash
npm install
npm start

TOKEN="$(cat ~/.tandem/api-token)"

curl -sS http://127.0.0.1:8765/status
curl -sS http://127.0.0.1:8765/tabs/list \
  -H "Authorization: Bearer $TOKEN"
```

If those return live JSON, Tandem is up and OpenClaw has a usable control
surface.

## OpenClaw Integration

Tandem is designed first and foremost for OpenClaw.

The browser can run without OpenClaw for shell or API development work, but the
full product experience expects a local OpenClaw gateway and configuration on
the same machine.

If you are only working on browser shell, tabs, screenshots, security, or API
behavior, you do not need every OpenClaw feature running first.

If you are evaluating Tandem as a product, assume OpenClaw integration is a
core part of the intended workflow rather than an optional extra. Tandem should
be understood as a first-party OpenClaw companion browser.

## How OpenClaw Connects To Tandem

OpenClaw does not discover Tandem automatically just because both are installed.
The connection works when these pieces are in place on the same machine:

- Tandem is running and serving its local API on `http://127.0.0.1:8765`
- OpenClaw uses the Tandem skill and sends requests to that local API
- OpenClaw reads the Tandem bearer token from `~/.tandem/api-token`
- For the in-app Wingman chat experience, the local OpenClaw gateway also needs
  to be running on `ws://127.0.0.1:18789`

In practice, Tandem is the browser surface and local API. OpenClaw is the agent
runtime that uses that API.

## Minimum Setup For Testers

If you want to test Tandem with an existing OpenClaw installation, the minimum
setup is:

- Tandem Browser checked out and started locally
- a valid Tandem API token in `~/.tandem/api-token`
- OpenClaw installed on the same machine
- the updated Tandem skill available to the OpenClaw agent

For full Wingman chat integration inside Tandem, also ensure:

- the OpenClaw gateway is running locally
- `~/.openclaw/openclaw.json` exists and contains the gateway auth token

## Verify The Connection

Use these commands to verify that Tandem is reachable and that OpenClaw has the
information it needs:

```bash
TOKEN="$(cat ~/.tandem/api-token)"

curl -sS http://127.0.0.1:8765/status

curl -sS http://127.0.0.1:8765/tabs/list \
  -H "Authorization: Bearer $TOKEN"

test -f ~/.openclaw/openclaw.json && echo "OpenClaw config found"
```

Expected result:

- `/status` returns a live Tandem status payload
- `/tabs/list` returns JSON instead of `401 Unauthorized`
- the OpenClaw config file exists if you want Wingman chat inside Tandem

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

## Contributing Focus

This repo is public because Tandem should be buildable with other OpenClaw
maintainers and contributors, not only observed from a distance.

Good contribution areas right now:

- OpenClaw workflow polish and skill ergonomics
- browser API improvements for tabs, snapshots, sessions, and devtools
- Linux quality and cross-platform testing
- security review and containment hardening
- UI polish for the shared human + OpenClaw browsing workflow

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
OpenClaw-first browser, start with [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT. See [LICENSE](LICENSE).
