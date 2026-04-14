# Public Launch Kit

This file collects the short public-facing copy needed when opening the
repository to the public.

## GitHub Repository Description

The human-AI symbiotic browser. Shared browser context for humans and agents.

## Short Tagline

The local-first browser for shared human-AI browser context.

## Social / Announcement One-Liner

Tandem Browser is now public: the local-first browser for shared human-AI browser context, released as a developer preview.

## Launch Post

Tandem Browser is now public.

Tandem Browser is a local-first browser built for human-AI collaboration on the local
machine. The human browses normally. Any AI agent that speaks MCP (250 tools) or
HTTP (300+ endpoints) can operate inside the same real browser context for
navigation, extraction, automation, screenshots, session work, and observability,
while websites continue to see a normal Chromium browser instead of an "AI
browser" fingerprint.

That is the point of Tandem Browser's positioning: not generic browser automation, and
not a bet on waiting for every site to become agent-ready. Tandem Browser is the shared
browser layer where humans and agents can work together on the web that already
exists.

This is a public developer preview, not a polished end-user release yet.
macOS is the primary platform today, Linux is secondary, and there are still
known rough edges in some workflows. But the core repo, API surface, test
baseline, and product direction are now ready for public review.

The point of publishing this is also to let other contributors help improve the
browser. If you care about agent workflows, local-first browsing, MCP tooling, security,
or agent-facing browser infrastructure, contributions are welcome.

If you maintain MCP-compatible agents, browser tooling, Electron
infrastructure, or local-first agent products, this is the layer where those
concerns meet a real browser used by a real human.

Repository:
`https://github.com/hydro13/tandem-browser`

## Suggested GitHub Topics

- `mcp`
- `openclaw`
- `electron`
- `browser`
- `ai`
- `automation`
- `local-first`
- `typescript`
- `security`
- `agent-tools`
- `browser-automation`
- `mcp-server`

## Maintainer Notes

- Position Tandem Browser as the human-AI symbiotic browser and shared browser context layer.
- OpenClaw is the origin story and Wingman integration, not the exclusive focus.
- Keep the wording `developer preview` until packaging and remaining product
  rough edges are addressed.
- Avoid framing Tandem Browser as a gimmick, wrapper, or generic browser shell with AI
  chat bolted on later.
- Avoid framing Tandem Browser as just an MCP tool count or API surface.
