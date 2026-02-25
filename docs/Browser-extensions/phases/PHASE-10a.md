# Phase 10a: Extension Conflict Detection

> **Priority:** LOW | **Effort:** ~half day | **Dependencies:** Phase 1, 4

## Goal

Detect and communicate when browser extensions conflict with Tandem's security stack or with each other. This phase creates the detection engine and API — Phase 10b builds the active reconciliation layer for DNR conflicts.

## Background

### The DNR Conflict

Tandem's security stack is wired into the `persist:tandem` session via the RequestDispatcher in `main.ts`. The Guardian (priority 1) sees every request via Electron's `session.webRequest` hooks. Extensions that use `declarativeNetRequest` (uBlock Origin, AdBlock Plus, AdBlock, Privacy Badger, Ghostery, DuckDuckGo Privacy) install rules that may block requests **before** the `webRequest` hooks fire.

**The impact:**
- NetworkShield has 811,000+ blocklist entries. If uBlock Origin also blocks 300,000 of those domains but earlier in the pipeline, Guardian never sees those requests.
- SecurityDB never logs them → EvolutionEngine baseline becomes inaccurate → threat scoring drifts
- The user has less security visibility, not more, despite installing a "security" extension

**The empirical question:**
Whether DNR rules fire before or after Electron's `session.webRequest` depends on Chromium internals. This was tested in Phase 1 — the results inform this phase and Phase 10b.

### The Isolated Session Gap

Extensions load in `persist:tandem` only. Isolated sessions created by SessionManager (`persist:session-{name}`) have neither extensions nor the security stack. This is a known limitation documented in STATUS.md.

## Files to Read

- `src/security/guardian.ts` — Guardian hook registration and priority system
- `src/network/dispatcher.ts` — RequestDispatcher consumer priorities
- `src/extensions/gallery-defaults.ts` — gallery entries with `securityConflict` field
- `src/extensions/manager.ts` — ExtensionManager for installed extension info
- `src/sessions/manager.ts` — SessionManager for isolated session creation
- `docs/Browser-extensions/STATUS.md` — Phase 1 DNR test results

## Files to Create

- `src/extensions/conflict-detector.ts` — conflict detection logic

## Files to Modify

- `src/extensions/manager.ts` — integrate conflict detection
- `src/api/server.ts` — add conflict info to extension endpoints

## Tasks

### 10a.1 Create Conflict Detector

Create `src/extensions/conflict-detector.ts`:

```typescript
export type ConflictType =
  | 'dnr-overlap'
  | 'native-messaging'
  | 'content-script-broad'
  | 'keyboard-shortcut';

export interface ExtensionConflict {
  extensionId: string;
  extensionName: string;
  conflictType: ConflictType;
  severity: 'info' | 'warning' | 'critical';
  description: string;
  recommendation: string;
}

export class ConflictDetector {
  /**
   * Analyze an extension's manifest for potential conflicts with the security stack.
   */
  analyzeManifest(manifestPath: string): ExtensionConflict[]

  /**
   * Get conflicts for all installed extensions.
   */
  analyzeAll(extensionsDir: string): Map<string, ExtensionConflict[]>
}
```

**Detection rules:**

1. **DNR overlap (warning or critical):**
   - Check `manifest.json` for `declarative_net_request` permission or `declarativeNetRequest` in `permissions` array
   - Check for `rule_resources` in `declarative_net_request` manifest key
   - If found → `conflictType: 'dnr-overlap'`, severity based on Phase 1 test results:
     - If Phase 1 showed Guardian still fires → `severity: 'warning'` ("Extension may reduce security telemetry accuracy")
     - If Phase 1 showed Guardian misses requests → `severity: 'critical'` ("Extension blocks requests before security stack can analyze them")

2. **Native messaging dependency (warning):**
   - Check for `nativeMessaging` in `permissions`
   - If found → `conflictType: 'native-messaging'`, `severity: 'warning'` ("Extension requires a desktop companion app that may not be installed")

3. **Broad content script injection (warning):**
   - Check `content_scripts` for `matches: ["<all_urls>"]` or very broad patterns like `*://*/*`
   - Combined with `permissions` that include `webRequest` or `webRequestBlocking`
   - If found → `conflictType: 'content-script-broad'`, `severity: 'warning'` ("Extension injects scripts into all pages — verify it's trusted")
   - **Security integration:** Log these broad content scripts as known-trusted in ScriptGuard context. This creates a whitelist so ScriptGuard doesn't flag extension-injected scripts as suspicious.

4. **Keyboard shortcut conflicts (info):**
   - Check `commands` in manifest.json for keyboard shortcuts
   - Compare against Tandem's own keyboard shortcuts (read from keybinding config)
   - Known Tandem shortcuts to check: Cmd+K (chat), Cmd+L (URL bar), Cmd+T (new tab), Cmd+W (close tab), Cmd+Shift+T (reopen), Cmd+1-9 (tab focus)
   - If overlap found → `conflictType: 'keyboard-shortcut'`, `severity: 'info'` ("Extension shortcut {key} conflicts with Tandem's {action}")
   - Document which takes priority (Tandem's shortcuts should win since they're registered at the BrowserWindow level)

### 10a.2 Integrate with Extension Manager

Update `ExtensionManager` to run conflict detection:

- After `install()`: run `conflictDetector.analyzeManifest()` on the new extension
- Include conflicts in the install result (new field on `InstallResult`)
- On `list()`: include conflicts per extension in the response

### 10a.3 Add Conflict Info to API

Update extension API endpoints:

**`GET /extensions/list`** — add `conflicts` array per extension:

```typescript
{
  loaded: [
    {
      id: "cjpalhdlnbpafiamejdnhcphjbkeiagm",
      name: "uBlock Origin",
      version: "1.57.0",
      conflicts: [
        {
          conflictType: "dnr-overlap",
          severity: "warning",
          description: "Uses declarativeNetRequest rules that may overlap with NetworkShield",
          recommendation: "Tandem's NetworkShield already blocks malicious domains. This extension is redundant for security but useful for ad blocking."
        }
      ]
    }
  ]
}
```

**`GET /extensions/gallery`** — the `securityConflict` field already exists from Phase 4. Ensure consistency between the gallery's static conflict info and the dynamic detection.

**`GET /extensions/conflicts`** — new endpoint:

```typescript
// Returns all detected conflicts across installed extensions
// Returns: {
//   conflicts: ExtensionConflict[],
//   summary: { info: number, warnings: number, critical: number }
// }
```

### 10a.4 Isolated Session Extension Loading (Foundation)

Lay the groundwork for loading extensions in isolated sessions:

- Add a method to `ExtensionManager`: `loadInSession(session: Session): Promise<void>`
  - Calls `session.loadExtension()` for each installed extension on the given session
  - Optionally selective: respect a per-extension "load in isolated sessions" flag
- **Do NOT wire this into SessionManager yet** — that requires careful consideration of:
  - Security stack: isolated sessions also need a RequestDispatcher + Guardian
  - Performance: loading 10+ extensions per session has startup cost
  - User preference: not all users want extensions in isolated sessions
- Document the method and its intended use in code comments
- Add to ROADMAP.md as a future integration point

## Verification

- [ ] `npx tsc --noEmit` — 0 errors
- [ ] ConflictDetector correctly identifies extensions with `declarativeNetRequest` permissions
- [ ] ConflictDetector correctly identifies extensions with `nativeMessaging` permissions
- [ ] ConflictDetector correctly identifies broad content script injection patterns
- [ ] ConflictDetector correctly identifies keyboard shortcut conflicts with Tandem
- [ ] Conflict severity matches Phase 1 DNR test results
- [ ] `GET /extensions/list` includes conflicts per extension
- [ ] `GET /extensions/conflicts` returns all conflicts with summary counts
- [ ] Gallery `securityConflict` field is consistent with dynamic detection
- [ ] `ExtensionManager.loadInSession()` method exists and loads extensions into a given session
- [ ] Install result includes detected conflicts for newly installed extensions
- [ ] App launches, browsing works

## Scope

- ONLY implement conflict detection and API exposure
- Do NOT wire extension loading into SessionManager — that's a future task
- Do NOT block extension installation based on conflicts — warn only
- Do NOT modify the security stack (Guardian, NetworkShield) — detection only
- Do NOT build UI for conflict management — that coordinates with Phase 5a
- Do NOT build the DNR reconciliation layer — that's Phase 10b

## After Completion

1. Update `docs/Browser-extensions/STATUS.md`
2. Update `docs/Browser-extensions/ROADMAP.md` — check off completed tasks
3. **Commit and push** — follow the commit format in CLAUDE.md "After You Finish" section
