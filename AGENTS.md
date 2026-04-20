# AGENTS.md — Tandem Browser Development Guide

> Internal development workflow document. This file exists for local developer
> and coding-agent operations and is not the primary public project guide.

## Who Are You?

You are a developer agent working on **Tandem Browser**: an Electron browser
built for human-AI symbiosis. The user (the human) and Wingman (the AI) browse
the web together. You write the code.

**Read `PROJECT.md` first.** It contains the full overview or what Tandem is,
how it works, and why it exists.

## The Project

- **Repo:** `hydro13/tandem-browser` (GitHub: hydro13)
- **Stack:** Electron 40 + TypeScript + Express.js API (`localhost:8765`) +
  MCP server (253 tools)
- **Goal:** An agent-first browser where any AI (via MCP, HTTP API, or
  WebSocket) and a human browse together
- **Philosophy:** Local-first, privacy-first, no cloud dependencies in the
  browser itself
- **Size:** Large TypeScript codebase with a substantial Electron shell,
  browser API surface, and security stack
- **Tests:** Vitest coverage for security and extension behavior
- **Versioning:** See `package.json` and `CHANGELOG.md` for the current release
  and full history

## Project Structure

```text
tandem-browser/
├── src/                          # TypeScript application code
│   ├── api/server.ts             # Express API bootstrap
│   ├── main.ts                   # Electron main process
│   ├── security/                 # 8-layer shield + intelligence upgrade
│   ├── extensions/               # Browser extension system (12 files)
│   ├── snapshot/                 # Accessibility tree with @refs
│   ├── network/                  # Inspector + mocking
│   ├── sessions/                 # Multi-session isolation
│   ├── mcp/                      # MCP server (253 tools, full API parity)
│   │   ├── server.ts             # MCP server entry point
│   │   └── tools/                # Tool definitions (one file per domain)
│   ├── agents/                   # TaskManager, X-Scout, TabLockManager
│   ├── devtools/                 # CDP bridge
│   └── ...                       # 28 other modules
├── shell/                        # Browser UI
├── cli/                          # tandem CLI (@hydro13/tandem-cli)
├── docs/
│   ├── internal/ROADMAP.md       # Sprint planning + feature backlog (internal)
│   ├── internal/STATUS.md        # Daily standup/progress tracker (internal)
│   ├── templates/                # Templates for new features
│   │   ├── design-template.md    # Template for design docs (plans/)
│   │   ├── LEES-MIJ-EERST-template.md  # Template for implementation tracks
│   │   ├── fase-template.md      # Template for phase documents
│   │   ├── multi-phase-track-template.md  # Self-tracking multi-phase handoff template
│   │   └── session-prompt-template.md  # Reusable universal prompt template
│   ├── implementations/          # Completed implementation plans
│   │   ├── ai-integratie/        # MCP, EventStream, ChatRouter, autonomy
│   │   ├── agent-browser-gaps/   # Snapshot, mock, sessions, CLI
│   │   ├── linux-portatie/       # Linux porting roadmap
│   │   ├── cdp-devtools/         # DevTools Bridge plans
│   │   ├── context-menu/         # Context menu plans
│   │   ├── wingman-vision/       # Wingman Vision plans
│   │   └── liquid-glass/         # Liquid Glass Lite docs
│   ├── plans/                    # Not-yet-implemented plans (design docs)
│   ├── research/                 # Opera gap analysis + feature inventories
│   ├── archive/                  # Historical documents
│   ├── Browser-extensions/       # Extension system (10 phases)
│   ├── agent-tools/              # Agent tools (3 phases + phase 4 TBD)
│   ├── security-fixes/           # Security fixes
│   ├── security-shield/          # Security Shield (5 layers)
│   └── security-upgrade/         # Security Intelligence (9 phases)
├── scripts/                      # Test & launch scripts
├── skill/                        # Agent skill file (SKILL.md)
├── release/                      # Local build artifacts (DMG, ZIP)
├── README.md
├── PROJECT.md
├── CHANGELOG.md
├── AGENTS.md                     # This file
└── TODO.md
```

## Rules — What You Must Do

### 1. Read First, Build Second

- Always read `TODO.md` before you start so you know the current priorities
- Always read the existing code in `src/` so you understand the architecture
- Read `PROJECT.md` if you need vision context for a design choice
- Check `docs/implementations/` for context on completed subsystems

### 2. Test Your Own Work

- **Always compile:** `npx tsc` must be error-free before you finish
- **Start the app:** `npm start` and verify startup without crashes
- **Test API endpoints:** Use `curl` for every new or changed endpoint
- **Test the UI:** Take a screenshot and verify it looks correct
- **Run tests:** `npx vitest run`; all existing tests must keep passing
- **Report:** Provide a summary or what you tested and the outcomes

### 3. Update Documentation

- **TODO.md:** Check off completed work and add newly discovered items
- **CHANGELOG.md:** Add an entry for each completed phase or feature
- **Code comments:** Use JSDoc for public functions and inline comments for
  complex logic
- **Multi-phase work:** If a task spans multiple sessions, create or update a
  self-tracking `LEES-MIJ-EERST.md` handoff file using
  `docs/templates/multi-phase-track-template.md` and reuse
  `docs/templates/session-prompt-template.md`

### 4. Git Discipline

- Commit after each completed sub-feature, not as one giant commit
- Default to a branch + pull request workflow, even for maintainer-owned work
- Do not push directly to `main` unless Robin explicitly asks for a direct
  bypass or the change is an urgent maintainer-only fix
- While Tandem is still effectively solo-maintained, prefer keeping required CI
  checks (`verify`, `CodeQL`) and using PRs as the review step; do not assume a
  second human reviewer will exist
- Any merged `feat:` change must bump the app version before the PR is merged
  (`minor`, e.g. `0.72.2` → `0.73.0`), and any merged `fix:` change must bump a
  `patch` version (e.g. `0.72.2` → `0.72.3`)
- Keep `CHANGELOG.md`, `package.json`, the in-app version, and the repo/docs
  version references on the same release number; do not leave new product
  surface under an old version header
- Before merging a PR, quickly review the diff for version bumps, changelog
  noise, release impact, and whether README / CONTRIBUTING / TODO need updates
- Commit message examples:
  - `feat: tab management with groups`
  - `fix: stealth UA mismatch`
  - `docs: update API endpoints`
  - `test: add curl coverage for /tabs endpoints`
- Merge to `main` only after the PR checks are green or Robin explicitly
  chooses to bypass them

### 4A. Release Policy

- Tandem is currently a **source-only developer preview**
- Do not publish official end-user binaries by default
- Do not attach old local `release/` artifacts to GitHub releases
- Source tags / GitHub releases are fine; binary releases should wait until
  packaging, naming, signing, notarization, and update metadata are deliberate
  and repeatable

### 5. Code Quality

- **TypeScript strict mode:** no `any` unless truly necessary, and document why
- **Error handling:** every API endpoint should catch errors and return JSON
- **No hardcoded paths:** use `path.join()`, `app.getPath()`, and related APIs
- **Separation or concerns:** each file should have one clear responsibility
- **Naming:** camelCase for variables/functions, PascalCase for classes,
  kebab-case for files

### 6. References to Code — Always Use Function Names, Never Line Numbers

- Forbidden: “see `server.ts` line 287” because line numbers change
- Required: “see `function startAPI()` in `main.ts`”
- Required: “add it to `class TandemAPI` and the `TandemAPIOptions` interface”
- Required: “look for `// === SECTION NAME ===` in `shell/index.html`”
- Use `grep -n "function name" file.ts` if you need to locate something

## Rules — What You Must Not Do

### Absolutely Not

- Do not add dependencies without calling it out; every new package needs
  approval
- Do not break existing endpoints; preserve backward compatibility
- Do not send data to external servers; everything stays local
- Do not use `rm -rf` or destructive filesystem operations
- Do not hardcode secrets or tokens; use environment variables or config files
- Do not rewrite entire files if a focused edit is sufficient

### Be Careful With

- Electron security: keep `nodeIntegration: false` and `contextIsolation: true`
- Webview partition: always use `persist:tandem`
- API binding: bind only to `127.0.0.1`, never `0.0.0.0`
- Stealth patches: do not remove or disable them

## Anti-Detection Architecture — Critical

### The Golden Rule

**Everything Wingman does must stay invisible from the web page’s JavaScript
context.**

The website should only ever see: “a human in Chrome on a Mac in Belgium.”
Wingman is looking over Robin’s shoulder, but the website must not know that.

### Two-Layer Architecture

- **Layer 1 (visible to the website):** normal Chromium webview, real session,
  human behavior
- **Layer 2 (invisible):** Electron main process + shell UI where Wingman
  operates

### Required Patterns

| Task | Forbidden | Required |
|-----|-----------|----------|
| Screenshot | Canvas API in the webview | `webContents.capturePage()` in the main process |
| Click | `el.click()` / `dispatchEvent()` in the webview | `webContents.sendInputEvent()` at OS level |
| Type | `el.value = "text"` in the webview | `sendInputEvent({type:'char'})` per character |
| Read page | Injected DOM crawler script | Minimal `executeJavaScript()` from the main process |
| Draw overlay | Canvas inside the webview | Canvas in the shell above the webview |
| Voice | Web Speech API in the webview | Web Speech API in the shell |
| Wingman panel | iframe/element in the webview | Separate Electron panel outside the webview |
| Activity tracking | MutationObserver in the page | Electron webview events |

### What Websites Can Detect

- `Event.isTrusted`: programmatic events become `false`, so use
  `sendInputEvent`
- `document.hasFocus()`: if the Wingman panel steals focus, mock focus must stay
  consistent
- `performance.now()` timing: too fast looks like a bot, so use randomized
  80-300ms delays
- Injected DOM elements: anything not from the site itself must never live in
  the webview
- WebSocket to localhost: the page must never call our API directly from the
  webview
- `window.process` / `window.require`: Electron giveaways must be `undefined`
- `navigator.userAgentData`: must match real Chrome
- `localhost:8765` port scans: use strict CORS and no cross-origin responses

### Fundamental Rule: No Unique Fingerprint

Tandem must never have a recognizable fingerprint. If platforms such as Meta,
Google, or LinkedIn can identify Tandem as an “AI browser,” it is game over for
all users.

Tandem must be indistinguishable from real Chrome on macOS.

- Every Electron-specific API must be hidden or patched
- No custom headers, no custom properties, no detectable patterns
- Consider migration toward a Chrome Extension model if Electron cannot remain
  stealth-safe enough

### Headless Mode = “Minimized With a Dead-Man Switch”

Background browsing is never fully autonomous:

- On detection or captcha, the tab becomes visible to Robin
- Robin resolves it, then the tab returns to the background
- Robin is always the dead-man switch and the bodyguard

### Humanization Timing — Behavioral Learning

Tandem learns Robin’s real behavior patterns and replicates them for automated
actions.

**Observation layer** (always active, passive):

- Track through Electron main-process events, never inside the webview
- Mouse movement paths, click delays, scroll patterns, typing rhythm
- Storage: `~/.tandem/behavior/` (raw data + compiled profile)

**The profile contains:**

- Typing bigram timing (interval per key combination)
- Click hesitation distribution (hover → click delay)
- Scroll patterns (speed, pauses, reading time)
- Mouse path curves (Bezier templates)
- Day-cycle variation (night = slower)
- Per-site behavior clusters

**During automated actions:**

- Sample from Robin’s real distributions, not hardcoded ranges
- Mouse movement: Bezier curves based on learned paths
- Typing: Robin’s own key-combination rhythm plus variation
- Fallback if the profile is still sparse: Gaussian random 80-300ms click
  delays and 30-120ms typing delays

**Golden rule:** the resulting behavior should be statistically
indistinguishable from Robin’s real browsing.

## Chat Architecture — Important

The Wingman panel has a Chat tab that lets Robin and Wingman communicate. It
connects **directly via WebSocket** to the OpenClaw gateway
(`ws://127.0.0.1:18789`).

### How It Works

1. Open a WebSocket to `ws://127.0.0.1:18789`
2. Wait for the `connect.challenge` event
3. Send the `connect` request with the gateway token from
   `~/.openclaw/openclaw.json`
4. Load history via `chat.history` with session key `agent:main:main`
5. Send messages via `chat.send`
6. Receive streaming updates via `chat` events (`delta` → `final`)

### Do Not Do This — Lessons Learned

We tried three other approaches that did not work:

1. **Cron polling `localhost:8765/chat`**: too slow, and it wastes API tokens
   on every poll
2. **Iframe embedding or OpenClaw webchat**: blocked by `X-Frame-Options: DENY`
   and `Content-Security-Policy: frame-ancestors 'none'`, plus auth token
   issues
3. **Webview with localStorage token injection**: separate partition
   (`persist:openclaw-chat`) does not share storage with the main partition, and
   the token structure is too fragile

**Direct WebSocket is the only correct approach.** It is simple, fast, and
real-time. The gateway token lives in `~/.openclaw/openclaw.json` under
`gateway.auth.token`.

### Chat Code Location

All chat WebSocket code lives in `shell/index.html` inside the `ocChat` IIFE.
Look for `// === OpenClaw WebSocket Chat ===` or `ocChat`.

## macOS Quarantine — Important

Electron on macOS gets killed by Gatekeeper (SIGKILL after roughly 4 seconds) if
quarantine flags are present. **Always** do this before launching:

```bash
xattr -cr node_modules/electron/dist/Electron.app
```

Run it after every `npm install` or whenever Electron is re-downloaded. Bake it
into start scripts.

## Development Workflow

> For new features: Kees writes the docs, Claude Code implements them.
> See `docs/internal/ROADMAP.md` for the active sprint backlog.

```text
1. Read the phase file for this session (docs/implementations/{feature}/fase-N.md)
2. Read LEES-MIJ-EERST.md in the same directory
3. Read only the files listed by the phase file, nothing more
4. Write the code
5. Run npx tsc and fix all type errors
6. Run npx vitest run and keep all tests passing
7. Run npm start and test manually (not npm run dev)
8. Use curl to test every new endpoint (see acceptance criteria in the phase file)
9. Update CHANGELOG.md (see format below)
10. Create the git commit (see commit format below)
11. Push
12. Report: built / tested / problems / next step
```

**Session discipline:**

- Read only what the phase file tells you to read; do not wander through the
  codebase
- Refer to **function names**, never line numbers
- Use `grep` to locate functions if you do not know where they are

---

## Commit Message Format — Required

### Format

```text
<type>: <short description> (<scope>)

What was built/changed:
- New files: src/sidebar/manager.ts, src/sidebar/types.ts
- Modified files: src/registry.ts, src/main.ts, src/api/server.ts
- New API endpoints: GET /sidebar/config, POST /sidebar/state, etc.
- Deleted files: (if applicable)

Why this approach:
- Short explanation or the architecture choices

Tested:
- npx tsc: zero errors
- npx vitest run: all tests pass
- Manual: [what was tested]
```

### Types (These Determine the Version Bump)

| Type | Version bump | Use |
|------|--------------|-----|
| `feat:` | minor (`0.15.0` → `0.16.0`) | new feature |
| `feat!:` | major (`0.15.0` → `1.0.0`) | breaking change |
| `fix:` | patch (`0.15.0` → `0.15.1`) | bug fix |
| `chore:` | none | dependencies, build, tooling |
| `docs:` | none | documentation |
| `refactor:` | none | code restructuring |
| `test:` | none | tests |

### Emoji in Commit Messages

The auto-versioning hook strips leading emoji, so both forms work:

```text
✅ feat: sidebar manager + config API
✅ 🗂️ feat: sidebar manager          ← hook strips the emoji prefix
✅ feat: sidebar manager 🗂️           ← also fine
```

### CHANGELOG.md Format

For every `feat:` or `fix:` commit, add this structure at the top:

```markdown
## [v0.16.0] - 2026-02-28

### Added
- **Sidebar Infrastructure** (`src/sidebar/`) — SidebarManager with JSON config storage
  - 12 sidebar items: 6 utility panels + 6 messenger webviews
  - 6 REST API endpoints (GET/POST /sidebar/config, /state, /reorder, etc.)
  - 3 sidebar modes: hidden / narrow / wide
  - Config persisted in `~/.tandem/sidebar-config.json`

### Changed
- `src/registry.ts` — added `sidebarManager` to ManagerRegistry
- `src/main.ts` — SidebarManager instantiation in `startAPI()` + will-quit cleanup
- `src/api/server.ts` — added `registerSidebarRoutes`

### Technical Details
- Manager pattern: load/save via `tandemDir()` + `ensureDir()`
- 12 default items: workspaces, news, pinboards, bookmarks, history, downloads + 6 messengers
```

## How You Should Report

After each session, provide:

```text
## Built
- [feature 1]: what it does
- [feature 2]: what it does

## Tested
- ✅ npx tsc — no errors
- ✅ npx vitest run — all tests pass
- ✅ npm start — app starts without crashes
- ✅ curl localhost:8765/new-endpoint — response OK
- ⚠️ [any issues found]

## Documentation
- TODO.md updated
- CHANGELOG.md updated

## Next Step
- [what is next according to TODO.md]
```

## Communication With Robin

Robin is the product owner. He:

- Decides design choices when there are multiple valid options
- Must be informed about new dependencies
- Tests the UI visually while you test the code
- Speaks Dutch; you may reply to Robin in Dutch, but all repository content must remain in English
- No exceptions for repository language: code, comments, commit messages, docs, plans, TODOs, changelog entries, and handoff files must all be written in English

If you are unsure, ask. One extra question is better than a wrong assumption.
