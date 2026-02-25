# Phase 7: chrome.identity OAuth Polyfill

> **Priority:** LOW | **Effort:** ~half day | **Dependencies:** Phase 1

## Goal
Polyfill `chrome.identity.launchWebAuthFlow()` so extensions that use Chrome's OAuth API (Grammarly, Notion Web Clipper, etc.) can authenticate users. Electron doesn't implement this API natively.

## Background

**The problem:**
Some extensions call `chrome.identity.launchWebAuthFlow({ url, interactive })` to trigger OAuth login. This API opens a special Chrome popup that handles the OAuth redirect flow. Electron doesn't provide this API, so extensions that depend on it show an error at login.

**Affected extensions from TOP30:**
- Grammarly (uses `chrome.identity` for login)
- Notion Web Clipper (uses `chrome.identity` for login)
- Other future extensions using this pattern

**The solution:**
Intercept `chrome.identity.launchWebAuthFlow()` calls and implement the flow using a standard Electron `BrowserWindow` as the OAuth popup.

## Files to Read
- Electron docs: `BrowserWindow`, `session.setPreloads()`, `webContents.on('will-navigate')`
- `src/extensions/manager.ts` — understand session setup
- Chrome Extension API docs: `chrome.identity.launchWebAuthFlow()`

## Files to Create
- `src/extensions/identity-polyfill.ts` — chrome.identity polyfill implementation

## Files to Modify
- `src/extensions/manager.ts` — wire polyfill into extension session

## Tasks

### 7.1 Implement `chrome.identity.launchWebAuthFlow()` polyfill

Create `src/extensions/identity-polyfill.ts`:

**How `launchWebAuthFlow` works in Chrome:**
1. Extension calls `chrome.identity.launchWebAuthFlow({ url: authUrl, interactive: true }, callback)`
2. Chrome opens a popup window navigating to `authUrl`
3. User completes the OAuth flow (login, approve permissions)
4. OAuth provider redirects to a URL matching `https://{extension-id}.chromiumapp.org/*`
5. Chrome captures the redirect URL and passes it to the callback
6. Extension extracts the token from the redirect URL

**Polyfill implementation:**
```typescript
export class IdentityPolyfill {
  /**
   * Handle launchWebAuthFlow by opening a BrowserWindow.
   * Monitor navigation for the redirect URL pattern.
   * Return the redirect URL to the caller.
   */
  async launchWebAuthFlow(options: {
    url: string;
    interactive?: boolean;
  }): Promise<string>
}
```

**Steps:**
1. Create a new `BrowserWindow` (popup style: ~500x700, no menu bar)
2. Navigate to `options.url`
3. Listen for `will-navigate` and `will-redirect` events on the webContents
4. When the URL matches `https://*.chromiumapp.org/*`, capture it
5. Close the popup and return the captured URL
6. If `interactive: false` and the flow requires user interaction, reject immediately
7. Set a timeout (e.g. 5 minutes) to auto-close the popup if abandoned

**Redirect URL pattern:**
The redirect URL for extension OAuth is typically:
```
https://{extension-id}.chromiumapp.org/{path}?{query-with-token}
```

Match against: `/\.chromiumapp\.org/`

### 7.2 Wire polyfill into extension session

In `ExtensionManager.init()` or during session setup:

**Option A: Preload script (preferred)**
- Create a preload script that adds `chrome.identity.launchWebAuthFlow` to the extension's context
- Register via `session.setPreloads([polyfillPath])` for the extension session
- The preload script communicates with the main process via IPC

**Option B: Extension API hook**
- Use `session.on('extension-api-call')` or similar Electron API to intercept the call
- Route the call to the polyfill

**IPC flow:**
1. Extension background script calls `chrome.identity.launchWebAuthFlow()`
2. Preload script intercepts and sends IPC message to main process
3. Main process opens BrowserWindow, monitors redirect
4. Main process sends redirect URL back via IPC
5. Preload script resolves the callback/promise

### 7.3 Test with known extensions

After implementation, verify:
- **Grammarly:** Click the extension icon → "Log in" → OAuth popup opens → complete login → extension shows logged-in state
- **Notion Web Clipper:** Click extension icon → "Log in to Notion" → OAuth popup → approve → clipper works
- **Extensions without `chrome.identity`:** Completely unaffected (uBlock, Dark Reader, etc.)

## Verification
- [ ] `npx tsc --noEmit` — 0 errors
- [ ] `launchWebAuthFlow()` opens a popup window at the OAuth URL
- [ ] Redirect URL captured when OAuth flow completes
- [ ] Popup closes automatically after redirect capture
- [ ] Timeout closes popup after 5 minutes of inactivity
- [ ] `interactive: false` rejects immediately if interaction needed
- [ ] Grammarly login flow works (if Grammarly extension installed)
- [ ] Notion Web Clipper login flow works (if installed)
- [ ] Extensions not using `chrome.identity` work normally
- [ ] No memory leaks (popup windows are properly closed and GC'd)
- [ ] App launches, browsing works

## Scope
- ONLY implement the `chrome.identity.launchWebAuthFlow()` polyfill
- Do NOT polyfill other `chrome.identity` methods (`getProfileUserInfo`, `getAuthToken`, etc.) unless needed
- Do NOT modify extension code — the polyfill must work transparently
- Do NOT implement `chrome.identity.getRedirectURL()` — extensions that call this usually have a fallback

## After Completion
1. Update `docs/Browser-extensions/STATUS.md`
2. Update `docs/Browser-extensions/ROADMAP.md` — check off completed tasks
