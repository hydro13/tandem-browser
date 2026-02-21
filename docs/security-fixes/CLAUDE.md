# Instructions for Claude Code — Security Fixes Sessions

## Session Rules

**Each phase = exactly 1 Claude Code session. Never span multiple phases in one session.**

### Before You Start

1. **Read STATUS.md first:** `docs/security-fixes/STATUS.md`
   - Check which phase is next (first one with status `PENDING`)
   - Read notes from previous phase — they contain critical wiring details
   - If previous phase has `FAILED` or `ISSUES`, stop and report
2. **Read the phase doc:** `docs/security-fixes/phases/PHASE-{N}.md`
3. **Understand the codebase before touching anything:**
   - `src/network/dispatcher.ts` — ALL webRequest hooks go through here. Read it fully.
   - `src/security/guardian.ts` — Core request checker. Read the `setup()` method and all private methods.
   - `src/security/outbound-guard.ts` — Outbound request analysis. Read `analyzeWebSocket()`.
   - `src/api/server.ts` — Only if the phase adds API endpoints.

### While You Work

1. **Start the app with `npm start`** — never `npm run dev` or `npx electron .`
   (VSCode sets ELECTRON_RUN_AS_NODE which breaks Electron)
2. **Implement deliverables in the order listed** in the phase doc
3. **Run `npx tsc --noEmit` after every file change** — don't batch TS checks to the end
4. **If you hit a blocker:**
   - Document it in STATUS.md under "Issues encountered"
   - Try to solve it if within scope
   - Never silently skip a deliverable

### After You Finish

1. **Run `npx tsc --noEmit`** — must be 0 errors
   - Pre-existing errors in `src/gateway/server.chat.gateway-server-chat-b.e2e.test.ts`
     lines 151 and 299 are safe to ignore (upstream issue, not Tandem)
2. **Run the full verification checklist** from the phase doc — check every box
3. **Update STATUS.md** — fill in all fields (date, commit hash, verification boxes, notes)
4. **Commit and push** using the exact commit message from the phase doc

## Coding Rules

1. **All security code stays in `src/security/`** — don't scatter
2. **All webRequest hooks go through `src/network/dispatcher.ts`** — never call `session.webRequest.onX()` directly
3. **Don't break existing functionality** — the existing Guardian, NetworkShield, and OutboundGuard must still work after your changes
4. **Performance matters** — all synchronous handlers must stay under 5ms
5. **Log everything** — every block/cancel decision goes to the `events` table via `this.db.logEvent()`
6. **TypeScript strict** — no `any` except where existing code already uses it
7. **Don't add dependencies** without documenting them in STATUS.md

## What NOT to Do

- Do NOT modify `docs/security-shield/STATUS.md` — that's a separate project, don't touch it
- Do NOT call `session.webRequest.onX()` directly — always go through RequestDispatcher
- Do NOT add async/await inside webRequest handler callbacks
- Do NOT implement features from future phases
- Do NOT skip the TypeScript check
- Do NOT push without updating STATUS.md

## Debugging Tips

- **App won't start:** Check `ELECTRON_RUN_AS_NODE`. Use `npm start`.
- **Port 8765 in use:** `lsof -i :8765` and kill the old instance.
- **SQLite errors:** Check `~/.tandem/security/shield.db` exists. Delete to reset.
- **Dispatcher not firing:** Check the consumer is registered in `guardian.ts` setup() and that `dispatcher.attach()` is called after registration.
- **TS errors in dispatcher.ts:** The `HeadersReceivedConsumer` interface change must be backward-compatible — the return type is a union, not a breaking change.

## Key Architecture Facts

- `RequestDispatcher` is the only way to hook webRequests — it wraps `session.webRequest.*`
- Consumer priority: lower number = runs first. Guardian:RedirectBlock must be priority 5 (before Guardian at 20).
- `onHeadersReceived` supports `cancel: true` in Electron — this is what makes real redirect blocking possible
- `onBeforeRedirect` does NOT support cancel — it's observational only
- The existing `checkRedirect()` method in guardian.ts fires via `onBeforeRedirect` — keep it as fallback logging, but the new `checkRedirectHeaders()` does the actual blocking
- `computeRiskScore()`, `extractDomain()`, `this.shield`, `this.db`, `this.stats` are all accessible from within Guardian — use them
