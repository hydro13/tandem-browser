# Chrome Extension Support Project

> Add full Chrome Web Store extension support to Tandem: download, install, manage, and browse a curated gallery — all without leaving the browser.

**Start:** TBD
**Status:** Not started

## Context

`src/extensions/loader.ts` — `ExtensionLoader` class already exists and works:
- Loads unpacked extensions from `~/.tandem/extensions/`
- Uses `session.loadExtension()` (Electron's native Chromium API)
- Called in `main.ts` during app init (line ~281)
- API routes exist: `GET /extensions/list`, `POST /extensions/load`

**The gap:** Users can't install extensions. They'd have to manually download, unzip, and place them in `~/.tandem/extensions/`. Nobody will do that.

**The solution:** Build the full installation pipeline. The loading is done — we just need to get extensions *into* the folder automatically, and provide a UI for discovery.

## How It Works

1. A new Claude Code session automatically reads `CLAUDE.md` (session instructions)
2. The session reads `STATUS.md` to find the next phase to implement
3. The session reads `phases/PHASE-{N}.md` for the detailed specification
4. After completion, the session updates `STATUS.md` with results

## Documentation

| File | Purpose |
|------|---------|
| [CLAUDE.md](CLAUDE.md) | Instructions for Claude Code sessions (auto-loaded) |
| [STATUS.md](STATUS.md) | Progress tracking per phase (read this FIRST) |
| [ROADMAP.md](ROADMAP.md) | Detailed task checklist with checkboxes per sub-task |
| [TOP30-EXTENSIONS.md](TOP30-EXTENSIONS.md) | Compatibility assessment of 30 popular extensions |

## Phase Documents

| Phase | Document | Description |
|-------|----------|-------------|
| 1 | [PHASE-1.md](phases/PHASE-1.md) | CRX Downloader + Extension Manager |
| 2 | [PHASE-2.md](phases/PHASE-2.md) | Extension API Routes |
| 3 | [PHASE-3.md](phases/PHASE-3.md) | Chrome Profile Importer |
| 4 | [PHASE-4.md](phases/PHASE-4.md) | Curated Extension Gallery |
| 5 | [PHASE-5.md](phases/PHASE-5.md) | Settings Panel UI — Extensions |
| 6 | [PHASE-6.md](phases/PHASE-6.md) | Native Messaging Support |
| 7 | [PHASE-7.md](phases/PHASE-7.md) | chrome.identity OAuth Polyfill |
| 8 | [PHASE-8.md](phases/PHASE-8.md) | Testing & Verification |

## Compatibility Summary

From [TOP30-EXTENSIONS.md](TOP30-EXTENSIONS.md):

| Status | Count | Examples |
|--------|-------|---------|
| Works out of the box | **22/30** | uBlock, Bitwarden, Dark Reader, React DevTools, MetaMask |
| Partial (1 issue) | **5/30** | Grammarly (OAuth), LastPass (native msg), Loom (screen capture) |
| Needs implementation | **2/30** | 1Password (native msg), Postman Interceptor (native msg) |
| Blocked | **0/30** | — |

**73% work without any extra code. After Phase 6 + 7, coverage reaches ~97%.**

See [STATUS.md](STATUS.md) for the current status per phase.
