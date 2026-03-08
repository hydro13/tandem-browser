# Tandem Browser TODO

> Internal development backlog for active and upcoming work.
> Historical release summaries belong in `CHANGELOG.md`.
> Architecture and product context belong in `PROJECT.md`.

Last updated: March 8, 2026

## Purpose

- Keep this file forward-looking.
- Track active priorities, maintenance tasks, and unresolved questions.
- Avoid turning this file into a second changelog or a historical roadmap.

## Current Snapshot

- Current app version: `0.45.0`
- The codebase scope is larger than this backlog summary and includes major subsystems such as `sidebar`, `workspaces`, `pinboards`, `sync`, `headless`, and `sessions`.
- Scheduled browsing already exists in baseline form via `WatchManager` and the `/watch/*` API routes.
- Session isolation already exists in baseline form via `SessionManager` and the `/sessions/*` API routes.

## Current Priorities

### Product Features

- [ ] `WebSocket /watch/live` for live watch updates
- [ ] Show a notification when the Wingman panel is closed and Wingman replies
- [ ] Google Photos upload support for screenshots; the settings UI exists, but the upload path does not
- [ ] Configurable quick links on the new tab page; links are still hardcoded
- [ ] Configurable diff modes for watches beyond SHA-256 hash comparison
- [ ] HAR export for the network inspector
- [ ] Design and build the `Personal News` experience; the sidebar currently has a placeholder slot, but the actual panel and feed model are not implemented yet
- [ ] Full browsing session recording and replay; current code has behavior replay and audio recording, but not an end-to-end session recorder

### Maintenance Sweep

- [ ] Fix the `Snoze` typo in `docs/research/opera-browser-research.md` and do a quick spell-check in the same tab-snoozing section
- [ ] Harden extension update version comparison in `src/extensions/update-checker.ts`; `isNewerVersion()` still relies on `split('.')` and `Number`, which is fragile for suffixes such as `1.2.3-beta`
- [ ] Replace absolute local links in `README.md` for `AGENTS.md` and `TODO.md` with repo-relative links that work on GitHub
- [ ] Add focused tests for extension version comparison edge cases in `src/extensions/tests/`, including `1.2` vs `1.2.0`, `1.10.0` vs `1.9.9`, and pre-release suffix input

## Later

### Distribution and UX

- [ ] Full multi-profile UX on top or the existing `SessionManager` isolation model
- [ ] Auto-updater integration (`electron-updater`); `release/` still contains an old `0.1.0` manifest
- [ ] Production-ready DMG build for macOS with current naming and metadata
- [ ] AppImage build for Linux
- [ ] Documentation site
- [ ] Firefox import

### Stealth and Browser Fidelity

- [ ] Proxy support (SOCKS5 or HTTP, per-tab or global)
- [ ] User-facing request interception and header rewrite rules
- [ ] TLS / JA3 fingerprint matching
- [ ] Screen resolution spoofing
- [ ] Battery API masking
- [ ] Geolocation spoofing

## Open Questions

- [ ] Define what `Agent Tools Phase 4` should be; `docs/agent-tools/STATUS.md` still marks it as the next implementation target
- [ ] Define what `Security Fixes Phase 2` should be; `docs/security-fixes/STATUS.md` still leaves this open
- [ ] Re-validate the memory leak finding from `docs/archive/AUDIT-REPORT.md` against the current `app.on('web-contents-created')` lifecycle
- [ ] Decide whether the tab registration race from `docs/archive/AUDIT-REPORT.md` is now fully resolved or should be closed out explicitly in docs; the current code has `pendingTabRegister` plus a renderer rename flow

## Recently Completed

- [x] Password manager: local SQLite + AES-256-GCM vault, master password, autofill, password generator, and `GET /passwords/suggest`
- [x] Behavioral learning models: profile compiler, typing timing model, mouse trajectory replay, and fallback humanization behavior
- [x] SPA rendering fix for `/page-content` on dynamic pages; see `docs/archive/plans/spa-rendering-bug.md`
