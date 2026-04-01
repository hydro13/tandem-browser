# Tandem Browser

[![Verify](https://github.com/hydro13/tandem-browser/actions/workflows/verify.yml/badge.svg)](https://github.com/hydro13/tandem-browser/actions/workflows/verify.yml)
[![CodeQL](https://github.com/hydro13/tandem-browser/actions/workflows/codeql.yml/badge.svg)](https://github.com/hydro13/tandem-browser/actions/workflows/codeql.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Version](https://img.shields.io/github/package-json/v/hydro13/tandem-browser)](package.json)

Tandem Browser is a local-first Electron browser built specifically for
human-AI collaboration with OpenClaw.

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

The human browses normally. OpenClaw gets a local API on `127.0.0.1:8765` for
navigation, extraction, automation, and observability. Tandem is not a generic
"AI browser" shell with OpenClaw added later. It is an OpenClaw-first browser
environment designed so the human and OpenClaw can browse together on the same
machine.

Tandem is built by an OpenClaw maintainer with OpenClaw as the primary AI
runtime.

**The left sidebar brings your communication and tools into the browser.** Built-in panels for Telegram, WhatsApp, Discord, Slack, Gmail, Google Calendar, Instagram, and X — all persistent, all in their own isolated session alongside your main browsing. Next to the messengers: Workspaces, Pinboards, Bookmarks, History, Downloads, and Personal News. The sidebar is resizable, pinnable, and rendered with frosted glass so it stays out of the way when you don't need it.

**The right-side Wingman panel** is where OpenClaw lives. Chat, activity feed, screenshots, and agent context — all in one place, connected to the local API so the agent can see what you're looking at and act on it.

## Why Tandem For OpenClaw?

OpenClaw does not need Tandem in order to use a real browser context. Tandem
exists because raw browser access alone is not the product goal.

Tandem adds the missing layer: a browser built for human + AI collaboration on
the real web, with multiple security layers, review points, and a shared live
workflow that keeps both the human and the agent safer.

With Tandem, OpenClaw gets:

- a browser designed from the start for human + agent collaboration on the
  same machine
- a 300+ endpoint local API for tabs, navigation, snapshots, sessions,
  devtools, network mocking, and controlled automation
- an eight-layer security model built around the fact that an AI has access to
  live web content — including the first browser-level prompt injection defense
- a browser surface where the human stays in the loop for ambiguous or risky
  situations, with explicit handoff points instead of silent automation
- a local-first workflow with no dependency on a remote browser vendor or
  cloud automation service

Tandem and OpenClaw's built-in browser tools are complementary. Use whichever
fits the task.

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

The goal of making the repository public is to let other contributors, maintainers, and OpenClaw-adjacent builders help improve the browser over time — not just to show it.
If you want to help shape Tandem, now is the right time. The browser still has
rough edges, and extra engineering eyes on bugs, architecture, UX, Linux
behavior, extension compatibility, and OpenClaw workflow polish would be
genuinely useful.

## OpenClaw-First Positioning

Tandem is built around collaboration with OpenClaw.

- the right-side Wingman workflow is designed around OpenClaw as the primary AI runtime
- the local browser API exists so OpenClaw can inspect, navigate, extract, and automate safely
- the security model is shaped by the fact that OpenClaw has access to a live browser
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
- Background-tab-safe API targeting via `X-Tab-Id` for snapshots, page reads,
  JS evaluation, waits, links, and form inspection without forcing focus
- Security-by-default browsing with multi-layer filtering and review points
- OpenClaw-first runtime integration for chat, browser control, and local agent workflows
- Local-first persistence for sessions, history, workspaces, bookmarks, and
  settings
- Chrome-style extension loading and related compatibility work


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
be understood as a purpose-built OpenClaw companion browser.

## How OpenClaw Connects To Tandem

OpenClaw does not discover Tandem automatically just because both are installed.
The connection works when these pieces are in place on the same machine:

- Tandem is running and serving its local API on `http://127.0.0.1:8765`
- OpenClaw uses the Tandem skill and sends requests to that local API
- OpenClaw reads the Tandem bearer token from `~/.tandem/api-token`
- For the in-app Wingman chat experience, the local OpenClaw gateway also needs
  to be running on `ws://127.0.0.1:18789`
- No extra local Tandem chat bridge, polling job, or custom OpenClaw skill is
  required for stock Wingman chat

In practice, Tandem is the browser surface and local API. OpenClaw is the agent
runtime that uses that API.

## Minimum Setup For Testers

If you want to test Tandem with an existing OpenClaw installation, the minimum
setup is:

- Tandem Browser checked out and started locally
- a valid Tandem API token in `~/.tandem/api-token`
- OpenClaw installed on the same machine
- the Tandem skill available to the OpenClaw agent

For full Wingman chat integration inside Tandem, also ensure:

- the OpenClaw gateway is running locally
- `~/.openclaw/openclaw.json` exists and contains the gateway auth token
- do not add a separate legacy Tandem `/chat` polling or webhook bridge unless
  you are debugging an old local setup

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
- Public releases are currently source-only; no official end-user binaries are
  published yet

## Contributing Focus

This repo is public because Tandem should be buildable with other OpenClaw
maintainers and contributors, not only observed from a distance.

Good contribution areas right now:

- OpenClaw workflow polish and skill ergonomics
- browser API improvements for tabs, snapshots, sessions, and devtools
- Linux quality and cross-platform testing
- security review and containment hardening
- UI polish for the shared human + OpenClaw browsing workflow
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
OpenClaw-first browser, start with [CONTRIBUTING.md](CONTRIBUTING.md). Even if
you are not ready to ship a large feature, smaller fixes, validation work,
security review, Linux testing, docs improvements, and focused issue reports
are all useful contributions.

## License

MIT. See [LICENSE](LICENSE).
