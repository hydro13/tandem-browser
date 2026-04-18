# Tandem Browser

[![Verify](https://github.com/hydro13/tandem-browser/actions/workflows/verify.yml/badge.svg)](https://github.com/hydro13/tandem-browser/actions/workflows/verify.yml)
[![CodeQL](https://github.com/hydro13/tandem-browser/actions/workflows/codeql.yml/badge.svg)](https://github.com/hydro13/tandem-browser/actions/workflows/codeql.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Version](https://img.shields.io/github/package-json/v/hydro13/tandem-browser)](package.json)
[![Coverage](https://codecov.io/gh/hydro13/tandem-browser/branch/main/graph/badge.svg)](https://codecov.io/gh/hydro13/tandem-browser)
[![Ask a question](https://img.shields.io/badge/discussions-Q%26A-blue)](https://github.com/hydro13/tandem-browser/discussions/categories/q-a)

**A programmable workspace where human intent and AI capability meet — on the web that already exists.**

Tandem is a local-first Electron browser that shifts the AI from a sidebar next
to your browser into the browser itself. Same tabs, same cookies, same
logged-in sessions, same page you are looking at right now. The agent reads the
accessibility tree, watches the live network, can rewrite the UI of the site
you are on, and hands back to you when something needs a human. You are both
in one runtime.

That shift matters because it is what makes a bunch of things *actually
possible* for the first time:

- **Automate real SaaS without an API** — Gmail, Coolblue, Funda, your
  bank's portal, your internal admin tool. If you can use it in a browser,
  your agent can use it in Tandem, in your real logged-in session.
- **Rewrite live UI on any site** — &ldquo;add a price-per-square-meter
  column to this listing view&rdquo; becomes a userscript the agent injects
  into the real page while you keep scrolling.
- **See beyond pixels** — accessibility tree + DOM + live network log +
  DevTools. The agent can answer &ldquo;what API did this page just hit and
  what came back?&rdquo; without anything leaving your machine.
- **Real co-browsing** — you and one or more agents in the same browser at
  the same time, across tabs and workspaces, with tab locks and explicit
  handoffs.
- **Cold-start usable** — point a capable model (Claude, Cursor, a local
  Ollama model) at a fresh Tandem install and a normal web task works on day
  one. No per-site recipes to author, no retrain-per-flow phase.
- **Bring any AI** — Tandem is model-agnostic. Any agent that speaks MCP
  or HTTP works — Claude, GPT, Gemini, local Ollama, LM Studio, custom
  scripts. Swap models when a cheaper or faster one ships. Run two at
  once. Go fully offline with a local model. The browser doesn't care
  which brain you plug in.

It works on the web that already exists — no site has to opt in, no new
protocol has to land. Agents connect on the same machine or remotely over
**Tailscale**, and multiple agents can share one browser without stepping on
each other. An 8-layer security perimeter sits between web content and the
agent layer, because when an AI has access to a real browser, a hidden
instruction in a page is remote code execution without an exploit.

Connect via **MCP** (Claude Code, Claude Desktop, Cursor, Windsurf, Ollama,
any MCP client) or a **300+ endpoint HTTP API**. The everyday version of the
pitch: it feels like going on the internet with a brilliant teammate — not
like using a chatbot parked next to a browser.

### What Tandem is not

- **Not an AI sidebar.** A chat panel next to a browser still leaves the AI outside the page.
- **Not RPA or pixel automation.** No brittle coordinates, no record-and-replay macros. The agent works with structure.
- **Not screenshot-driven automation.** Screenshot loops are slow, fragile, and expensive. Tandem gives the agent the page as semantic structure first.
- **Not just another Chromium wrapper.** This is a daily-driver browser with a serious security perimeter around a first-class agent layer.
- **Not &ldquo;chat with this webpage.&rdquo;** The agent opens tabs, fills forms, logs in, hands back for a CAPTCHA, injects a userscript, and comes back to finish — as one continuous piece of work.
- **Not a cloud service.** Your browser, your machine, your sessions, your data. There is no Tandem backend.

## What's new now

Tandem Browser now supports:

- local MCP and local HTTP access
- remote MCP over Tailscale
- remote HTTP over Tailscale
- multiple agents connected to the same browser at once
- in-product pairing and onboarding through **Settings -> Connected Agents**

Want the fastest path in?
- **Try Tandem locally** -> [Quick Start](#quick-start)
- **Read the docs and API surfaces** -> [docs/](docs/) and [docs/INDEX.md](docs/INDEX.md)
- **Ask questions or share workflows** -> [GitHub Discussions](https://github.com/hydro13/tandem-browser/discussions)
- **Support development** -> [GitHub Sponsors](https://github.com/sponsors/hydro13)

![Tandem Browser — homescreen](docs/screenshots/tandem-homescreen-hero.jpg)

## What Can An Agent Do?

| Category | Tools | Examples |
|----------|-------|---------|
| **Navigation & Input** | 10 | Navigate, click, type, scroll, press keys, wait for load |
| **Tabs & Workspaces** | 13 | Open/close/focus tabs, emoji badges, create workspaces, move tabs between them |
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

**250 tools total** — full parity with the HTTP API.

## Why Not Just Use Playwright?

Playwright gives you a headless browser that you control. Tandem Browser gives you
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

## Tandem Browser vs WebMCP

WebMCP is an important new idea, but it solves a different layer of the stack.

| | WebMCP | Tandem Browser |
|---|---|---|
| Primary scope | Makes individual websites more agent-ready | Makes the real browser a shared workspace for humans and agents |
| Where it runs | Site/page level, via tools exposed by the site | Browser-wide, across tabs, sessions, workspaces, and existing sites |
| Adoption model | Requires site support | Works on the web as it exists today |
| Strength | Structured, site-defined actions | Shared context, authenticated sessions, security, and human handoffs |
| Best fit | Sites that want to expose cleaner agent tooling | Users and teams that want humans and agents working together in the same browser |

WebMCP helps websites become more agent-readable.
Tandem Browser helps humans and agents work together in the real browser, across the web.

These ideas can coexist. Tandem Browser is not anti-WebMCP. If more sites expose
cleaner agent surfaces, great. But Tandem Browser's job is broader: shared human-AI
browser work, local-first control, and governance around what the agent is
doing.

For the longer version, see [docs/tandem-browser-vs-webmcp.md](docs/tandem-browser-vs-webmcp.md).

## Quick Start

```bash
git clone https://github.com/hydro13/tandem-browser.git
cd tandem-browser
npm install
npm start
```

macOS is the primary platform. Linux works. Windows is validated as a remote agent host.

## Start Here

Depending on what you want to do:

- **Try Tandem locally** -> follow the Quick Start above
- **Connect an agent** -> see [Connect Your AI Agent](#connect-your-ai-agent)
- **Explore the API and docs** -> browse [docs/](docs/) and [docs/INDEX.md](docs/INDEX.md)
- **See the product story and website** -> visit [tandembrowser.org](https://tandembrowser.org)
- **Ask questions or share workflows** -> join [GitHub Discussions](https://github.com/hydro13/tandem-browser/discussions)
- **Support development** -> sponsor Tandem on [GitHub Sponsors](https://github.com/sponsors/hydro13)

## Connect Your AI Agent

**Tandem is model-agnostic.** Any agent that speaks MCP or HTTP works —
Claude, GPT, Gemini, local Ollama, LM Studio, custom scripts. Swap models,
combine models, run fully offline. The browser does not care which AI you
bring.

Tandem supports AI agents running on the same machine or on a remote machine
over a private Tailscale network. Both can be active at the same time.

The primary onboarding flow is now inside Tandem itself:

1. Open **Settings -> Connected Agents**
2. Choose **On this machine** or **On another machine**
3. Let Tandem generate the connection instructions
4. Paste those instructions into your AI agent

Tandem handles the setup-code flow and publishes its own bootstrap/discovery
surface for the agent at `/agent`, `/agent/manifest`, `/agent/version`, and
`/skill`.

### On the same machine (MCP or HTTP)

If your AI runs on the same machine as Tandem, the simplest path is:

1. Open **Settings -> Connected Agents**
2. Choose **On this machine**
3. Copy the generated instructions into your AI

**MCP** — Add to your MCP client configuration (Claude Code, Claude Desktop,
Cursor, Windsurf, or any MCP client):

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

Start Tandem, and 250 tools are available immediately.

**HTTP API** — Use the local API token directly:

```bash
TOKEN="$(cat ~/.tandem/api-token)"

curl -sS http://127.0.0.1:8765/status
curl -sS http://127.0.0.1:8765/tabs/list \
  -H "Authorization: Bearer $TOKEN"
```

300+ endpoints for everything the MCP tools can do, plus lower-level access.

### On another machine (Tailscale)

Remote agents connect over a private Tailscale network. Both machines must be
on the same tailnet. Tandem is never exposed to the public internet.

1. Open **Settings -> Connected Agents**
2. Choose **On another machine**
3. Tandem detects the Tailscale address and generates a ready-to-use instruction block
4. Paste that instruction block into your remote AI agent
5. The AI reads `/agent`, exchanges the setup code for a permanent token, and connects

The token stays valid until you pause, revoke, or remove it from the
Connected Agents UI.

**MCP** (recommended for Claude Code, Cursor, and other MCP clients):

```json
{
  "mcpServers": {
    "tandem": {
      "type": "streamable-http",
      "url": "http://<tandem-tailscale-ip>:8765/mcp",
      "headers": {
        "Authorization": "Bearer <your-binding-token>"
      }
    }
  }
}
```

**HTTP API** works the same way as local, using the binding token as Bearer auth.

Both transports give remote agents the same 250 tools and 300+ endpoints as local agents.

<details>
<summary>Manual pairing (for scripts or custom tooling)</summary>

```bash
# Exchange setup code for token
curl -X POST http://<tandem-tailscale-ip>:8765/pairing/exchange \
  -H "Content-Type: application/json" \
  -d '{"code":"TDM-XXXX-XXXX","machineId":"...","machineName":"...","agentLabel":"...","agentType":"..."}'

# Use the returned token
curl -sS http://<tandem-tailscale-ip>:8765/status \
  -H "Authorization: Bearer <token>"
```

</details>

### Discovery

A running Tandem instance publishes its own version-matched discovery surface:

- `GET /agent` — human-readable bootstrap page
- `GET /agent/manifest` — machine-readable endpoint manifest
- `GET /skill` — version-matched usage guide

These are public (no auth required) and use the request `Host` header, so they
return correct URLs whether accessed locally or over Tailscale.

## Security Model

Tandem Browser treats security as core architecture, not an afterthought. When an AI
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

Beyond the agent layer, Tandem Browser is a full daily-driver browser:

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
- Windows: validated as a remote agent host (VS Code + Claude Code over Tailscale)
- Binaries: not published yet (source-only)
- Current version: `0.75.0`
- Package metadata: [package.json](package.json)

## Community

Have a question, idea, or want to show what you've built with Tandem Browser?
Join [GitHub Discussions](https://github.com/hydro13/tandem-browser/discussions).

- **Q&A** — troubleshooting, "how do I…" questions
- **Ideas** — feature proposals before they become issues
- **Show and Tell** — your setups, workflows, and screenshots

For bugs and concrete feature requests, open an
[issue](https://github.com/hydro13/tandem-browser/issues).

If Tandem Browser is useful to you, or relevant to your company, sponsorship directly funds continued development and security work: [GitHub Sponsors](https://github.com/sponsors/hydro13).

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
| [Discussions](https://github.com/hydro13/tandem-browser/discussions) | Community Q&A, ideas, show & tell |
| [docs/](docs/) | Full documentation |

## License

MIT. See [LICENSE](LICENSE).
