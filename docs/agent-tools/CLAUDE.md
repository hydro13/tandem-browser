# Instructions for Claude Code — Agent Tools Sessions

## Session Rules

**Each phase = exactly 1 Claude Code session. Never span multiple phases in one session.**

### Before You Start

1. **Read STATUS.md first:** `docs/agent-tools/STATUS.md`
   - Check which phase is next (first one with status `PENDING`)
   - Read notes from previous phase — they contain critical wiring details
   - If previous phase has status `FAILED` or `ISSUES`, stop and report
2. **Read the phase doc:** `docs/agent-tools/phases/PHASE-{N}.md`
3. **Understand the codebase:**
   - `src/api/server.ts` — Express routes, understand how other modules register routes
   - `src/main.ts` — Electron main process, IPC handlers, initialization order
   - `src/snapshot/manager.ts` — CDP accessibility tree (Phase 2 builds on this)
   - `src/devtools/manager.ts` — CDP bridge (Phase 2 + 3 use this)
   - `src/tabs/manager.ts` — Tab lifecycle (Phase 1 needs did-finish-load)

### While You Work

1. **Start the app with `npm start`** — never `npm run dev` or `npx electron .`
   (VSCode sets ELECTRON_RUN_AS_NODE which breaks Electron)
2. **Implement all deliverables** in the order listed in the phase doc
3. **Test after each endpoint** — don't batch all testing to the end
4. **If you hit a blocker:**
   - Document it in STATUS.md under "Issues encountered"
   - Try to solve it if within scope
   - If it requires touching a previous phase's code, document why and stop
   - Never silently skip a deliverable

### After You Finish

1. **Run TypeScript check:** `npx tsc --noEmit` — must be 0 errors
   - Pre-existing errors in `src/gateway/server.chat.gateway-server-chat-b.e2e.test.ts`
     lines 151 and 299 are safe to ignore (upstream issue, not Tandem)
2. **Run the verification checklist** from the phase doc — check every box
3. **Run regression checks** — verify previous phases still work:
   - Phase 1+: `GET /scripts` and `GET /styles` return arrays
   - Phase 2+: `POST /find {"by":"role","value":"button"}` returns result
   - Phase 3+: `GET /device/status` returns current state
4. **Update STATUS.md** — fill in all fields (date, commit, verification boxes)
5. **Commit and push** using exact commit message from the phase doc

## Coding Rules

1. **New files go in `src/scripts/`, `src/locators/`, `src/device/`** respectively — don't scatter
2. **All API routes follow the pattern in `src/api/server.ts`** — look at how SnapshotManager, NetworkMocker, SessionManager are registered (lines 2550+)
3. **CDP access goes through `src/devtools/manager.ts`** — never call `webContents.debugger.attach()` directly
4. **IPC for did-finish-load is in `src/main.ts`** — extend the existing `activity-webview-event` handler
5. **Don't break existing endpoints** — run `GET /snapshot`, `GET /screenshot`, `POST /execute-js` after each phase
6. **TypeScript strict** — no `any` except CDP params (those types aren't available)
7. **Error handling** — every route needs try/catch, returns `{error: string}` on failure

## What NOT to Do

- Do NOT modify `src/snapshot/manager.ts` internals unless Phase 2 explicitly says to
- Do NOT add dependencies without documenting in STATUS.md
- Do NOT implement features from future phases
- Do NOT skip the TypeScript check
- Do NOT push without updating STATUS.md
- Do NOT use `webContents.debugger.attach()` directly — always go through DevToolsManager

## Debugging Tips

- **App won't start:** Check `ELECTRON_RUN_AS_NODE`. Use `npm start`.
- **Port 8765 in use:** `lsof -i :8765` and kill the old instance.
- **CDP errors:** DevToolsManager must be attached to the active tab. CDP commands fail silently without an attached tab.
- **Script not re-injecting:** Check the IPC handler in main.ts — `did-finish-load` event must call `scriptInjector.reloadIntoTab(wc)`.
- **Locator finds nothing:** The accessibility tree may not be built yet after navigation. Add a short delay or wait for `did-finish-load`.
- **Device emulation not working:** `webContents.enableDeviceEmulation()` must be called AFTER the tab is fully loaded. Test on a blank page first.

## Key Design Decisions

- **Script persistence:** Store scripts in memory (Map<name, {code, enabled}>). Re-inject on every `did-finish-load`.
- **CSS persistence:** Use `webContents.insertCSS()` (returns a key for removal). Re-inject on every `did-finish-load`.
- **Locators:** Build on top of existing `SnapshotManager` accessibility tree — don't duplicate CDP logic.
- **Device emulation:** Use Electron's native `webContents.enableDeviceEmulation(params)` — NOT CDP. It's cleaner and fully supported.
- **Session awareness:** All 3 features must respect the `X-Session` header (use `getSessionWC(req)` pattern from server.ts).
