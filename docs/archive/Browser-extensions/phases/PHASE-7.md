# Phase 7: chrome.identity OAuth Support

> **Priority:** LOW | **Effort:** ~half day | **Dependencies:** Phase 1

## Goal

Enable extensions that use `chrome.identity.launchWebAuthFlow()` (Grammarly, Notion Web Clipper, etc.) to authenticate users. Electron doesn't implement this API natively.

**Critical change from original plan:** The `session.setPreloads()` approach does NOT work for MV3 extensions. Preload scripts only run in renderer processes, but MV3 extensions use service workers (not renderers). Grammarly, Notion Web Clipper, and most modern extensions are MV3. This phase uses a different approach.

## Background

**The problem:**
Some extensions call `chrome.identity.launchWebAuthFlow({ url, interactive })` to trigger OAuth login. Electron doesn't provide this API, so extensions that depend on it show an error at login.

**Affected extensions from TOP30:**

- Grammarly (MV3 — uses `chrome.identity` for login)
- Notion Web Clipper (MV3 — uses `chrome.identity` for login)
- Other future extensions using this pattern

**Why `session.setPreloads()` doesn't work:**
Electron's preload scripts are injected into `BrowserWindow` and `webContents` renderer processes. MV3 service workers are NOT renderers — they run in a separate process type. A preload script will never reach them. This rules out the preload-based polyfill approach entirely.

## Files to Read

- `src/extensions/manager.ts` — understand session setup
- Chrome Extension API docs: `chrome.identity.launchWebAuthFlow()`
- Electron docs: `BrowserWindow`, `ses.protocol.handle()`

## Files to Create

- `src/extensions/identity-polyfill.ts` — chrome.identity support implementation (approach determined by Step 1)

## Files to Modify

- `src/extensions/manager.ts` — wire polyfill into extension session

## Tasks

### 7.1 Empirical Test — Do MV3 Extensions Have a Working Fallback?

**This step must be done FIRST, before writing any code.**

Many MV3 extensions have a fallback OAuth flow that opens a regular browser tab instead or using `chrome.identity`. If this fallback works in Electron, the entire polyfill may be unnecessary.

**Test procedure:**

1. Install Grammarly extension via `POST /extensions/install`
2. Click the Grammarly icon → attempt to log in
3. Document what happens:
   - **Scenario A:** Extension opens a regular tab for login → login works → **Phase 7 becomes documentation-only** (update gallery compatibility notes, no code needed)
   - **Scenario B:** Extension shows an error about `chrome.identity` → login completely
     fails → proceed to Step 2 (implement Option A — companion extension).
     If after 2 hours or work you cannot get `chrome.runtime.onMessageExternal`
     cross-extension messaging working between the companion and the target extension:
     STOP. Mark Phase 7 as BLOCKED in STATUS.md with exact error details.
     Report to Robin — do not proceed to Option B independently. Phase 7 is LOW priority
     and can be revisited later; the 22/30 extensions that don't use chrome.identity
     work fine without it.
   - **Scenario C:** Partial failure — some flow works, some doesn't → document exactly what fails
4. Repeat for Notion Web Clipper
5. Document results in STATUS.md

**If Scenario A for both:** Mark Phase 7 as COMPLETE with only documentation changes. Update `compatibilityNote` for these extensions in the gallery.

### 7.2 MV3-Compatible Polyfill (only if Step 1 shows failures)

If the fallback OAuth doesn't work, implement ONE or these approaches:

**Option A — Companion Extension (recommended):**

Create a small helper extension that provides `chrome.identity.launchWebAuthFlow` via cross-extension messaging:

1. Create a companion extension in `~/.tandem/extensions/_tandem-identity-helper/`
2. The companion listens for `chrome.runtime.onMessageExternal` with OAuth requests
3. Target extensions call `chrome.runtime.sendMessage(HELPER_ID, { type: 'launchWebAuthFlow', url, interactive })`
4. The helper opens a BrowserWindow (with `persist:tandem` session!) and monitors the OAuth redirect
5. Returns the redirect URL to the calling extension

**Option B — Protocol Interception (alternative):**

Use `ses.protocol.handle()` to intercept extension protocol requests. This works at a lower level than preloads and may intercept service worker requests. Research whether this can provide `chrome.identity` to MV3 service workers.

**Default to Option A (companion extension).** Only consider Option B if Option A
fails and Robin explicitly approves the switch. Document which approach was chosen
and why in STATUS.md.

### 7.3 OAuth BrowserWindow — MUST Use persist:tandem Session

**SECURITY REQUIREMENT:** Any BrowserWindow created for OAuth flows MUST use the `persist:tandem` session. Without this, the window has no security stack (no Guardian, no OutboundGuard, no NetworkShield).

```typescript
const popup = new BrowserWindow({
  width: 500,
  height: 700,
  webPreferences: {
    session: ses,  // MUST be persist:tandem — see Security Stack Rules in CLAUDE.md
  }
});
```

The session reference (`ses`) must be passed to the identity polyfill from ExtensionManager or obtained via `session.fromPartition('persist:tandem')`.

**OAuth flow in the BrowserWindow:**

1. Navigate to `options.url`
2. Listen for `will-navigate` and `will-redirect` events on the webContents
3. When the URL matches `https://*.chromiumapp.org/*`, capture it
4. Close the popup and return the captured URL
5. If `interactive: false` and the flow requires user interaction, reject immediately
6. Set a timeout (e.g. 5 minutes) to auto-close the popup if abandoned

### 7.4 Test with Known Extensions

After implementation (or after confirming fallback works), verify:

- **Grammarly:** Click extension icon → "Log in" → OAuth flow completes → extension shows logged-in state
- **Notion Web Clipper:** Click extension icon → "Log in to Notion" → OAuth flow → approve → clipper works
- **Extensions without `chrome.identity`:** Completely unaffected (uBlock, Dark Reader, etc.)

## Verification

- [ ] `npx tsc --noEmit` — 0 errors
- [ ] Step 1 empirical test completed and results documented in STATUS.md
- [ ] If fallback works: gallery compatibility notes updated, no polyfill code needed
- [ ] If polyfill needed: chosen approach documented with rationale
- [ ] OAuth BrowserWindow uses `persist:tandem` session (verify in code)
- [ ] OAuth popup closes automatically after redirect capture
- [ ] Timeout closes popup after 5 minutes or inactivity
- [ ] Grammarly login flow works (if Grammarly extension installed)
- [ ] Notion Web Clipper login flow works (if installed)
- [ ] Extensions not using `chrome.identity` work normally
- [ ] No memory leaks (popup windows are properly closed and GC'd)
- [ ] App launches, browsing works

## Scope

- ONLY implement `chrome.identity.launchWebAuthFlow()` support
- Do NOT polyfill other `chrome.identity` methods (`getProfileUserInfo`, `getAuthToken`, etc.) unless needed
- Do NOT modify extension code — the solution must work transparently
- Do NOT use `session.setPreloads()` — this does not work for MV3 service workers

## After Completion

1. Update `docs/Browser-extensions/STATUS.md`
2. Update `docs/Browser-extensions/ROADMAP.md` — check off completed tasks
3. **Commit and push** — follow the commit format in CLAUDE.md "After You Finish" section
