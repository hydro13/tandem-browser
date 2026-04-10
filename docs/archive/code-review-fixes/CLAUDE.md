# Instructions for Claude Code — Code Review Fixes Sessions

## Session Rules

**Each phase = exactly 1 Claude Code session. Never span multiple phases in one session.**

### Before You Start

1. **Read STATUS.md first:** `docs/code-review-fixes/STATUS.md`
   - Check which phase you're implementing (the first one with status `PENDING`)
   - Read notes from the previous phase — they contain critical context
   - If the previous phase has status `FAILED` or `ISSUES`, stop and report to the user
2. **Read the phase doc:** `docs/code-review-fixes/phases/PHASE-{N}.md`
3. **Read the original review:** `docs/CODE-REVIEW-2026-02-26.md` — contains the full issue descriptions and rationale
4. **Understand the codebase:**
   - `src/main.ts` — Electron main process, initialization order, IPC handlers
   - `src/api/server.ts` — Express API server, auth middleware, 60+ routes
   - `src/network/dispatcher.ts` — Unified webRequest handler (all hooks go through here)
   - `src/security/guardian.ts` — Core request decision pipeline
   - `src/security/security-manager.ts` — Security orchestrator, lifecycle management
   - `src/tabs/manager.ts` — Tab lifecycle
   - `shell/index.html` — Browser shell UI (HTML + inline JS)

### While You Work

1. **Start the app with `npm start`** — never `npm run dev` or `npx electron .`
   (VSCode sets ELECTRON_RUN_AS_NODE which breaks Electron)
2. **This is a bugfix project, not a feature project.** Every change must be minimal and surgical.
   Do NOT refactor surrounding code, add features, or "improve" things that aren't broken.
3. **Implement all fixes** from the phase doc, in the order listed
4. **Test after each fix** — don't batch all testing to the end
5. **If you encounter a blocker:**
   - Document it in STATUS.md under "Issues encountered"
   - Try to solve it if the fix is within scope or this phase
   - If it requires changes outside this phase's scope, document it and stop
   - Never make changes outside the scope or your phase without documenting why

### After You Finish

1. **Run `npx tsc --noEmit`** — must be 0 errors
   - Pre-existing errors in `src/gateway/server.chat.gateway-server-chat-b.e2e.test.ts`
     lines 151 and 299 are safe to ignore (upstream issue, not Tandem)
2. **Review your own changes** — run `git diff` and read through every change you made:
   - Check for logic errors, typos, missing error handling
   - Verify no accidental deletions or unintended side effects
   - Make sure no debug code is left in
   - If you find issues, fix them before proceeding
3. **Run the full verification checklist** from the phase doc — check every box
4. **Run regression checks** — verify all previous phases still work:
   - App launches with `npm start`, browsing works
   - Navigate to a few sites (Google, GitHub, YouTube)
   - Open the side panel (chat works)
   - Security status: `curl http://127.0.0.1:8765/security/status` (with token after Phase 3)
5. **Update STATUS.md** — fill in all fields for this phase (date, commit, verification, notes)
6. **Commit and push** using this format:
   ```bash
   git commit -m "$(cat <<'EOF'
   fix(review): Phase <N> — <short description>

   <bullet points or what was fixed>

   Ref: docs/CODE-REVIEW-2026-02-26.md

   Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
   EOF
   )"
   git push origin main
   ```

## Coding Rules

1. **Minimal changes only** — fix the issue, don't refactor the neighborhood
2. **Don't add features** — this is a fix project. If you see something else that needs fixing, document it in STATUS.md notes, don't fix it now
3. **Don't add dependencies** — all fixes use existing code/libraries
4. **Don't break existing functionality** — every fix must be backward compatible
5. **TypeScript strict** — no `any` except CDP params
6. **Test after each fix** — not after all fixes
7. **Use `escapeHtml()` for all user/page-supplied data rendered in innerHTML** — the function already exists in shell/index.html

## What NOT to Do

- Do NOT refactor code that isn't part or a fix
- Do NOT add new files unless absolutely necessary
- Do NOT modify files outside the scope or your phase without documenting why in STATUS.md
- Do NOT skip the verification checklist
- Do NOT push without updating STATUS.md
- Do NOT change the order or fixes within a phase (they are ordered for a reason)
- Do NOT implement fixes from future phases
- Do NOT add comments explaining what you fixed (the git commit message does that)

## Debugging Tips

- **App won't start:** Check if `ELECTRON_RUN_AS_NODE` is set. Use `npm start` which cleans it.
- **Port 8765 in use:** Previous instance didn't shut down. `lsof -i :8765` and kill it.
- **Auth broken after Phase 3:** Check that the shell's file:// origin is still whitelisted. Test with `curl -H "Authorization: Bearer $(cat ~/.tandem/api-token)" http://127.0.0.1:8765/security/status`
- **Shell not loading after sandbox change (Phase 6):** The preload script may use Node.js APIs that need sandbox=false. If so, move those to the main process via IPC and document the change.
- **TS errors:** Run `npx tsc --noEmit` after each file change — don't wait until the end.

## Key Architecture Facts

- **RequestDispatcher** wraps Electron's singleton webRequest handlers with priority-based consumers
- **DevToolsManager** wraps CDP with subscriber system for event dispatch
- **Auth token** stored at `~/.tandem/api-token`, read on API server startup
- **SecurityDB** uses better-sqlite3 in WAL mode at `~/.tandem/security/shield.db`
- **Shell** is `shell/index.html` loaded via `mainWindow.loadFile()` — it has `sandbox: false` currently
- **API server** listens on `127.0.0.1:8765` — not exposed externally
- **MCP server** in `src/mcp/server.ts` — stdio transport, calls API via localhost
- **`escapeHtml()`** already defined in `shell/index.html` at ~line 2568

## Related Documents

- `docs/CODE-REVIEW-2026-02-26.md` — Original review with all 24 findings
- `docs/security-shield/CLAUDE.md` — Security system coding rules (for reference)
- `docs/Browser-extensions/CLAUDE.md` — Extension system coding rules (for reference)
