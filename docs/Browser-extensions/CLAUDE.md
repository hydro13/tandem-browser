# Instructions for Claude Code — Browser Extension Sessions

## Session Rules

**Each phase = exactly 1 Claude Code session. Never span multiple phases in one session.**

### Before You Start

1. **Read STATUS.md first:** `docs/Browser-extensions/STATUS.md`
   - Check which phase is next (the first one with status `PENDING`)
   - Read notes from the previous phase — they contain critical context and wiring details
   - If the previous phase has status `FAILED` or `ISSUES`, stop and report to the user
2. **Read the phase doc:** `docs/Browser-extensions/phases/PHASE-{N}.md`
3. **Read the compatibility reference:** `docs/Browser-extensions/TOP30-EXTENSIONS.md` — contains extension IDs, compatibility status, and mechanism details
4. **Understand the codebase:**
   - `src/extensions/loader.ts` — ExtensionLoader (loads unpacked extensions via `session.loadExtension()`)
   - `src/api/server.ts` — Express API server (existing routes at `/extensions/list` and `/extensions/load`)
   - `src/main.ts` — App init (ExtensionLoader created at line ~281, extensions loaded at line ~343)

### While You Work

1. **Start the app with `npm start`** — never `npm run dev` or `npx electron .`
   (VSCode sets ELECTRON_RUN_AS_NODE which breaks Electron)
2. **Implement all deliverables** from the phase doc, in the order listed
3. **Test after each deliverable** — don't batch all testing to the end
4. **If you encounter a blocker:**
   - Document it in STATUS.md under "Issues encountered"
   - Try to solve it if the fix is within scope of this phase
   - If it requires changes to a previous phase's code, document it and stop
   - Never make changes outside the scope of your phase without documenting why

### After You Finish

1. **Run `npx tsc --noEmit`** — must be 0 errors
   - Pre-existing errors in `src/gateway/server.chat.gateway-server-chat-b.e2e.test.ts`
     lines 151 and 299 are safe to ignore (upstream issue, not Tandem)
2. **Review your own changes** — run `git diff` and read through every change you made:
   - Check for logic errors, typos, missing error handling
   - Verify no accidental deletions or unintended side effects
   - Confirm no hardcoded values that should be constants
   - Make sure no debug code (console.log, temporary hacks) is left in
   - If you find issues, fix them before proceeding
3. **Run the full verification checklist** from the phase doc — check every box
4. **Run regression checks** — verify previous phases still work:
   - App launches with `npm start`, browsing works
   - Extensions in `~/.tandem/extensions/` still load on startup
   - `GET /extensions/list` returns valid response
   - All API endpoints from completed phases respond correctly
5. **Update STATUS.md** — fill in all fields for this phase (date, commit, verification, notes)
6. **Commit and push** using this format:
   ```bash
   git commit -m "$(cat <<'EOF'
   feat(extensions): Phase <N> — <short description>

   <bullet points of what was added/changed>

   Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
   EOF
   )"
   git push origin main
   ```

## Security Stack Rules

Tandem has a 6-layer security stack (NetworkShield, OutboundGuard, ContentAnalyzer,
ScriptGuard, BehaviorMonitor, GatekeeperWebSocket) wired into the RequestDispatcher
in main.ts. Extensions MUST NOT break this.

Rules:

1. NEVER bypass the RequestDispatcher for extension network requests
2. Extensions that install declarativeNetRequest rules (ad blockers) conflict with
   NetworkShield — mark them as `⚠️ securityConflict: 'dnr-overlap'` in the gallery
3. OAuth popup windows (Phase 7) MUST use the `persist:tandem` session (`webPreferences: { session: ses }`)
4. Extensions run in `persist:tandem` only — they do NOT run in isolated sessions
   created by SessionManager (`persist:session-{name}`)
5. After `session.loadExtension()`, verify the assigned extension ID matches the
   expected Chrome Web Store ID (check that `manifest.json` has a `key` field)
6. OutboundGuard scans all POST/PUT/PATCH requests in the session — including those
   from extension content scripts and service workers — for credential exfiltration

## Coding Rules

1. **Extension code goes in `src/extensions/`** — don't scatter across the codebase
2. **API routes go in `src/api/server.ts`** — follow the existing Express route pattern
3. **Use the existing ExtensionLoader** — don't duplicate its `session.loadExtension()` logic
4. **Extensions dir is `~/.tandem/extensions/`** — all extension files go here, organized by extension ID
5. **Don't break existing functionality** — the existing loader and its API routes must still work
6. **No external API calls for core functionality** — CWS download uses Google's public CRX endpoint (no auth needed)
7. **TypeScript strict** — proper types, no `any`
8. **Error handling** — all file operations and network requests wrapped in try/catch
9. **Platform-aware** — Chrome profile paths differ per OS (macOS, Windows, Linux)

## What NOT to Do

- Do NOT modify files outside the scope of your phase without documenting why in STATUS.md
- Do NOT break the existing `ExtensionLoader.loadAllExtensions()` flow
- Do NOT call `session.loadExtension()` directly — use ExtensionLoader or ExtensionManager
- Do NOT implement features from future phases ("I'll just add this too since I'm here")
- Do NOT skip the TypeScript check or verification checklist
- Do NOT push without updating STATUS.md
- Do NOT add npm dependencies without documenting them in STATUS.md

## Debugging Tips

- **App won't start:** Check if `ELECTRON_RUN_AS_NODE` is set. Use `npm start` which cleans it.
- **Port 8765 in use:** Previous instance didn't shut down. `lsof -i :8765` and kill it.
- **Extension won't load:** Check `manifest.json` exists in the extension folder. Check Electron console for errors.
- **CRX download fails:** Test the URL with `curl -v` first. The CWS endpoint follows redirects.
- **Chrome profile not found:** Path varies by OS and profile name. Default profile is usually "Default".
- **TS errors:** Run `npx tsc --noEmit` frequently — don't wait until the end.

## Key Architecture Facts (Already Built)

- **ExtensionLoader** in `src/extensions/loader.ts` handles `session.loadExtension()` for all extensions
- **Extensions dir:** `~/.tandem/extensions/{extension-id}/` — each subfolder is an unpacked extension
- **API server** in `src/api/server.ts` — Express-based, routes at `/extensions/*`
- **Electron session** passed through init chain in `main.ts`
- **CRX format:** ZIP archive with a Cr24 header (CRX2 or CRX3) — strip header, extract ZIP
- **CWS download URL:** `https://clients2.google.com/service/update2/crx?response=redirect&prodversion=${process.versions.chrome}&x=id%3D{ID}%26uc` — use `process.versions.chrome` for `prodversion` (fallback: `'130.0.0.0'`)
- **Extension IDs:** 32 lowercase a-p characters (base16 in custom alphabet)

## Related Projects (DO NOT MODIFY)

- `docs/security-upgrade/` — Security upgrade project (COMPLETED)
- `docs/security-shield/` — Original security system build (COMPLETED)
- `docs/agent-tools/` — Agent tools project (separate scope)
