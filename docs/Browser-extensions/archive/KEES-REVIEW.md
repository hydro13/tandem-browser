# Kees' Review — Extension Plan (Claude Code Rewrite)

**Date:** February 25, 2026
**Reviewer:** Kees
**Reviewed:** README.md, CLAUDE.md, STATUS.md, ROADMAP.md, PHASE-1.md through PHASE-8.md

---

## General Assessment

Structurally this is good work. The phasing is logical, CLAUDE.md is an excellent session instruction, the checklists are thorough, and the STATUS.md + ROADMAP.md approach for Claude Code sessions is exactly how you should orchestrate this kind of work. Claude Code will be able to work with this effectively.

**But there are 3 serious gaps that make this plan unsafe for Tandem specifically.** The rest are improvement points. Read especially the red points carefully.

---

## RED — CRITICAL — Must be resolved before implementation

### 1. Security stack is completely ignored — this is the biggest problem

The plan installs extensions in the same session as the entire browser (`persist:tandem`). This means they directly interact with your RequestDispatcher, NetworkShield, OutboundGuard, ScriptGuard, and BehaviorMonitor. There is not a single word about how this plays out.

**The conflict with uBlock Origin (and other ad blockers):**
Extensions like uBlock Origin install `declarativeNetRequest` rules. These fire **before** your `webRequest` handlers. This means: uBlock blocks a request → NetworkShield never sees it → SecurityDB never logs it → EvolutionEngine baseline becomes corrupt → threat scoring is no longer accurate.

You have 811,000 blocklist entries. If uBlock Origin also blocks 300,000 of those domains but earlier in the pipeline, your security layer misses all those events. You have no idea what was blocked and why.

**What needs to be done:**
- Define an "extension trust policy" for the security stack: do extension requests go through all security layers or not?
- Consider: actively exclude ad-blocker extensions from the gallery (Tandem already has NetworkShield — uBlock is redundant and destructive to your telemetry), or at least strongly mark them as "conflicts with Tandem Security"
- Extension service worker `fetch()` requests DO go through your webRequest hooks (Electron's webRequest catches everything in the session) — but `declarativeNetRequest` blocks earlier. This must be documented and tested.

**Also required:** Verify that OutboundGuard's POST body scanning also catches extension-initiated POSTs. A malicious script via an extension that exfiltrates data should be caught by OutboundGuard, not bypass it.

---

### 2. Phase 7 (chrome.identity polyfill) does NOT work for MV3 extensions

Phase 7 proposes using `session.setPreloads()` to inject the polyfill. This only works for MV2 background pages (which are regular renderers). **Grammarly is MV3.** MV3 extensions use service workers as their background script, and preloads do NOT run in service workers — only in renderer processes.

Concretely: if you implement this as described, it works for no modern extension. Grammarly, Notion Web Clipper — all MV3 nowadays.

**Correct approach:**
Option A (simple): Implement the polyfill as a separate "companion extension" that offers `chrome.identity.launchWebAuthFlow` via `chrome.runtime.sendMessage` cross-extension messaging. Extensions can then call it.

Option B (correct but complex): In Electron you can intercept `chrome-extension://` protocol requests via `ses.protocol.handle()`. This works better for MV3 service workers. But this requires deep Electron understanding.

Option C (pragmatic for now): Mark extensions that use `chrome.identity` as `Partial` in the gallery, with a note "Login works via tab" — many extensions have a fallback where they open a regular browser tab for OAuth. Grammarly does this too. Test whether the fallback works before building the entire polyfill.

**Recommendation:** Option C first. Verify whether Grammarly's fallback works in Electron. If it works, Phase 7 can be much simpler than planned.

---

### 3. OAuth popup in Phase 7 is a security hole

The plan creates a `new BrowserWindow()` for the OAuth flow. That window has:
- No NetworkShield
- No ScriptGuard
- No OutboundGuard
- No ContentAnalyzer

An attacker who compiles an extension with a malicious OAuth URL can open a completely unprotected browser window in Tandem. That is a direct bypass of your entire security stack.

**Fix:** The BrowserWindow for OAuth MUST use the same session as the main browser, so the RequestDispatcher also covers it. Add to Phase 7:
```typescript
const popup = new BrowserWindow({
  webPreferences: {
    session: ses, // ← SAME session as the main browser
    ...
  }
});
```

---

## YELLOW — IMPORTANT — Must be addressed

### 4. Extension ID preservation — OAuth breaks if ID is wrong

When you extract a CRX and load it via `session.loadExtension()`, Electron uses the `key` field in `manifest.json` to calculate the extension ID (same algorithm as Chrome). CWS extensions always contain this key in their manifest.json.

**But the plan verifies this nowhere.** If the `key` field is missing after extraction (bug in the CRX extractor, truncated download, etc.), the extension gets a random Electron-generated ID. OAuth redirects then stop working — because the OAuth app has the real Chrome extension ID whitelisted (`{chrome-id}.chromiumapp.org`), not the Electron-generated ID.

**Add to Phase 1 verification:**
- After extraction: verify that `manifest.json` has a `key` field
- Log the extension ID that Electron assigns after `session.loadExtension()`
- Compare that ID with the ID in the CWS URL — they must be equal

---

### 5. `session.removeExtension()` does exist in Electron 40

Phase 2 says uninstall "may require a restart (Electron limitation)". That is no longer true for Electron 40 — `session.removeExtension(extensionId)` is available. Use it. This unloads an extension immediately without restart.

---

### 6. Session isolation — extensions don't work in isolated sessions

Tandem's SessionManager creates isolated sessions (`session.fromPartition('persist:session-xxx')`). Extensions are loaded in `persist:tandem` — the main session. They are NOT available in isolated sessions.

This is not a blocker now, but as soon as users start using extensions and then also use `POST /sessions/create` for isolated browsing, they expect their ad blocker to work there too. It doesn't.

**Add to Phase 1 or a separate Phase 1.5:** Document this behavior explicitly in STATUS.md as a known limitation. Later a "load extensions in all sessions" option can be added.

---

### 7. `prodversion` is hardcoded — must be dynamic

```
prodversion=130.0.0.0
```

This is hardcoded in the plan. Electron 40 runs Chromium 130, so it's correct now — but when Electron updates to 41 (Chromium 132), Tandem may download the wrong CRX version (MV3 format-wise).

**Fix:** `process.versions.chrome` returns the Chromium version in Electron. Use that:
```typescript
const chromiumVersion = process.versions.chrome?.split('.')[0] + '.0.0.0' ?? '130.0.0.0';
const crxUrl = `...&prodversion=${chromiumVersion}&...`;
```

---

### 8. No update mechanism — security risk

Installed extensions don't auto-update. Chrome does this itself via the CRX server. When an extension receives a security fix (and this happens regularly — uBlock Origin and Grammarly update constantly), Tandem's installation falls behind.

This is not a Phase 1 problem but must be in the roadmap. Add to ROADMAP.md:

**Phase 9 (future): Extension Auto-Updates**
- Weekly check: for each installed extension, download the current CRX and compare manifest version
- If newer: update automatically (remove old, install new)
- CRX hash verification to prevent supply chain attacks

---

### 9. Future extensions — gallery is hardcoded TypeScript

The gallery in `gallery.ts` is a hardcoded array in TypeScript code. Adding every new popular extension requires a code change + deploy.

**Better approach:** `~/.tandem/extensions/gallery.json` that is loaded at startup, optionally updatable without rebuild. Or an optional remote gallery endpoint (privacy-preserving — no tracking, just a static JSON file on a CDN).

---

## GREEN — WHAT'S GOOD

- **CLAUDE.md is excellent** — the "one session per phase" rule, STATUS.md as entry point, the scope limitations per phase, the "do NOT do" list — this is exactly how you should use Claude Code for a large project
- **CRX header parsing** — CRX2 and CRX3 are both correctly described (version 2 vs 3, header byte layout)
- **npm is correct** — Tandem has package-lock.json, so `npm install adm-zip` is right (not pnpm)
- **`npm start` rule** — the warning about `ELECTRON_RUN_AS_NODE` is gold, Claude Code gets this wrong if you don't explicitly state it
- **Platform-aware Chrome paths** — macOS/Windows/Linux all three correct
- **Version subfolder logic** in Chrome importer — sorted + reversed for latest version is correct
- **`fs.cpSync`** — correct, available from Node 16.7+, Tandem runs Node 25
- **Graceful degradation** for native messaging — correct approach
- **Pre-existing TypeScript errors** in tests mentioned — this is a real pitfall that Claude Code otherwise sees as a blocker
- **Phase scope limitations** — each phase has an explicit "do NOT do" list, this prevents scope creep between sessions

---

## Recommended changes to the plan

### Add to CLAUDE.md (Security Rules section):

```markdown
## Security Stack Rules

Tandem has a 6-layer security stack (NetworkShield, OutboundGuard, ContentAnalyzer,
ScriptGuard, BehaviorMonitor, GatekeeperWebSocket) wired into the RequestDispatcher
in main.ts. Extensions MUST NOT break this.

Rules:
1. NEVER bypass the RequestDispatcher for extension network requests
2. Extensions that install declarativeNetRequest rules (ad blockers) conflict with
   NetworkShield — mark them as warning in the gallery with a conflict warning
3. OAuth popup windows (Phase 7) MUST use the same session as the main browser
4. Extensions run in persist:tandem — they do NOT run in isolated sessions
5. After session.loadExtension(), verify the assigned extension ID matches the
   expected Chrome Store ID (check manifest.json has a 'key' field)
```

### Add to PHASE-1.md (verification checklist):

```
- [ ] manifest.json in extracted extension contains 'key' field
- [ ] Extension ID assigned by Electron matches the CWS extension ID (log both)
- [ ] Extension network requests are visible in RequestDispatcher logs
- [ ] Security stack is not bypassed by extension requests
```

### PHASE-7.md — complete rewrite of the polyfill mechanism:

Replace the `session.setPreloads()` approach with:
1. First test whether Grammarly's fallback OAuth (via regular browser tab) already works in Electron
2. If it works — done, no polyfill needed for Phase 7
3. If not — MV2 background pages: preload works; MV3 service workers: companion extension needed

### Add to ROADMAP.md:

```markdown
## Phase 9 (Future): Extension Auto-Updates
- Weekly version check via CWS CRX endpoint
- Automatic update if newer version available
- CRX hash verification

## Phase 10 (Future): Extension Conflict Management
- Detect when ad-blocker extensions conflict with NetworkShield
- Show warning in gallery for conflicting extensions
- Option to run extension in isolated session (separate from main session)
```

---

## Conclusion

**Start Phase 1 — but with the security rules added to CLAUDE.md first.** The CRX downloader and ExtensionManager are correctly designed and will work. Phase 2 too. Phase 3 too.

**Phase 7 must be rewritten** before implementation — the preload approach doesn't work for MV3 service workers.

**The OAuth popup BrowserWindow fix** (same session) must be in Phase 7 for security.

**The extension/security-stack conflicts** are the biggest long-term risk. Don't solve everything now, but document it and ensure the gallery marks ad-blocker extensions as conflicting with NetworkShield.

The plan is 85% ready. The missing 15% are exactly the things that make Tandem different from a regular browser — the security stack and the agent-browser architecture. That's also why Claude Code missed them: it didn't fully read the Tandem-specific context.

— Kees
