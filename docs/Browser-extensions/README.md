# Chrome Extension Support Project

> Add full Chrome Web Store extension support to Tandem: download, verify, install, manage, and browse a curated gallery — all without leaving the browser.

**Start:** TBD
**Status:** Not started

## Context

`src/extensions/loader.ts` — `ExtensionLoader` class already exists and works:
- Loads unpacked extensions from `~/.tandem/extensions/`
- Uses `session.loadExtension()` (Electron's native Chromium API)
- Called in `main.ts` during app init (line ~281)
- API routes exist: `GET /extensions/list`, `POST /extensions/load`

**The gap:** Users can't install extensions. They'd have to manually download, unzip, and place them in `~/.tandem/extensions/`. Nobody will do that.

**The solution:** Build the full installation pipeline with CRX signature verification, a toolbar UI for extension popups, auto-updates via Google's Update Protocol, and conflict detection with Tandem's security stack.

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
| [TOP30-EXTENSIONS.md](TOP30-EXTENSIONS.md) | Compatibility assessment + Electron API matrix for 30 popular extensions |

## Phase Documents

| Phase | Document | Description |
|-------|----------|-------------|
| 1 | [PHASE-1.md](phases/PHASE-1.md) | CRX Downloader + CRX3 Signature Verification + Extension Manager |
| 2 | [PHASE-2.md](phases/PHASE-2.md) | Extension API Routes |
| 3 | [PHASE-3.md](phases/PHASE-3.md) | Chrome Profile Importer (with auto-update registration) |
| 4 | [PHASE-4.md](phases/PHASE-4.md) | Curated Extension Gallery |
| 5a | [PHASE-5a.md](phases/PHASE-5a.md) | Settings Panel UI — Extensions |
| 5b | [PHASE-5b.md](phases/PHASE-5b.md) | Extension Toolbar + Action Popup UI |
| 6 | [PHASE-6.md](phases/PHASE-6.md) | Native Messaging Support |
| 7 | [PHASE-7.md](phases/PHASE-7.md) | chrome.identity OAuth Polyfill |
| 8 | [PHASE-8.md](phases/PHASE-8.md) | Testing & Verification |
| 9 | [PHASE-9.md](phases/PHASE-9.md) | Auto-Updates via Google Update Protocol |
| 10a | [PHASE-10a.md](phases/PHASE-10a.md) | Extension Conflict Detection |
| 10b | [PHASE-10b.md](phases/PHASE-10b.md) | DNR Reconciliation Layer (conditional) |

## Review Reports

| File | Reviewer | Date |
|------|----------|------|
| [KEES-REVIEW.md](archive/KEES-REVIEW.md) | Kees (security review) | Feb 25, 2026 |
| [CLAUDE-REVIEW.md](archive/CLAUDE-REVIEW.md) | Claude (verification of Kees' findings) | Feb 25, 2026 |

## Key Improvements Over Original Plan

Based on security review and architectural analysis:

1. **CRX3 signature verification** (Phase 1) — prevents MITM attacks on extension downloads
2. **Extension toolbar + popup UI** (Phase 5b) — without this, extensions are installed but invisible/unusable
3. **Google Update Protocol** (Phase 9) — checks versions without downloading full CRX (saves bandwidth)
4. **DNR reconciliation** (Phase 10b) — actively measures security telemetry gaps from ad-blocker extensions
5. **Chrome import auto-update registration** (Phase 3/9) — imported extensions don't become permanently stale
6. **Keyboard shortcut conflict detection** (Phase 10a) — prevents extension shortcuts overriding Tandem
7. **Electron API compatibility matrix** (TOP30) — documents which APIs work per extension, not just "loads OK"

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
