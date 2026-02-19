# Instructions for Claude Code — Security Shield Sessions

## Session Rules

**Each phase = exactly 1 Claude Code session. Never span multiple phases in one session.**

### Before You Start

1. **Read STATUS.md first:** `docs/security-shield/STATUS.md`
   - Check which phase you're implementing (the first one with status `PENDING`)
   - Read notes from the previous phase — they contain critical context
   - If the previous phase has status `FAILED` or `ISSUES`, stop and report to the user
2. **Read the phase doc:** `docs/security-shield/phases/PHASE-{N}.md`
3. **Read the architecture:** `docs/security-shield/specs/ARCHITECTURE.md`
4. **Understand the codebase:**
   - `src/main.ts` — Electron main process, initialization order
   - `src/network/dispatcher.ts` — Unified webRequest handler (Phase 0+)
   - `src/api/server.ts` — Express API (look at how other modules register routes)
   - `src/network/inspector.ts` — Network hooks (DON'T break this)
   - `src/stealth/manager.ts` — Anti-detection (DON'T break this)
   - `src/devtools/manager.ts` — CDP bridge (Phase 3+ — extend, don't replace)

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

1. **Run the full verification checklist** from the phase doc
2. **Run regression checks** — verify all previous phases still work:
   - Phase 0: `npm start` launches, browsing works, stealth active, network logging works
   - Phase 1+: `GET /security/status` returns valid response
   - Phase 2+: `GET /security/outbound/stats` returns valid response
   - Phase 3+: `GET /security/page/analysis` returns valid response
   - Phase 4+: `GET /security/gatekeeper/status` returns valid response
3. **Update STATUS.md** — fill in all fields for this phase (see template in phase doc)
4. **Commit and push** — use the exact commit message from the phase doc

## Coding Rules

1. **All security code goes in `src/security/`** — don't scatter across the codebase
2. **All webRequest hooks go through `src/network/dispatcher.ts`** — never call `session.webRequest.onX()` directly
3. **All CDP access goes through `src/devtools/manager.ts`** — never call `webContents.debugger.attach()` directly
4. **Don't modify `server.ts` beyond adding the SecurityManager import + init**
5. **Don't break existing functionality** — Guardian hooks via dispatcher, not directly
6. **Privacy first** — no external API calls by default (local blocklists only)
7. **Performance matters** — rule-based checks must be < 5ms (synchronous handlers only)
8. **Log everything** — every block/allow decision goes to the events table
9. **TypeScript strict mode** — proper types, no `any` (except CDP params where types aren't available)
10. **Prepared statements** — use `db.prepare(sql)` for all hot-path queries

## Commit Convention

Every phase gets exactly ONE commit (unless the pre-commit hook fails, then fix and make a new commit):

```bash
git commit -m "$(cat <<'EOF'
<type>(security): Phase <N> — <short description>

<bullet points of what was added/changed>

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
git push origin main
```

Types: `refactor` for Phase 0, `feat` for Phase 1-5.

## What NOT to Do

- Do NOT create files outside `src/security/` and `src/network/` (except minimal changes to `main.ts` and `server.ts`)
- Do NOT modify files from previous phases unless documenting why in STATUS.md
- Do NOT add dependencies without documenting them in the phase doc
- Do NOT skip the verification checklist
- Do NOT skip the regression checks
- Do NOT push without updating STATUS.md
- Do NOT implement features from future phases ("I'll just add this too since I'm here")
- Do NOT use async/await inside webRequest handler callbacks

## Debugging Tips

- **App won't start:** Check if `ELECTRON_RUN_AS_NODE` is set. Use `npm start` which cleans it.
- **Port 8765 in use:** Previous instance didn't shut down. Check `lsof -i :8765` and kill it.
- **SQLite errors:** Check `~/.tandem/security/shield.db` exists and is writable. Delete it to reset.
- **Blocklist files missing:** Run the curl commands from the phase doc to download them.
- **Stealth broken:** Check dispatcher consumer priority order. StealthManager must be priority 10 (runs first on headers).
- **NetworkInspector broken:** Check it's registered as dispatcher consumer priority 100.
- **CDP errors:** Check DevToolsManager is attached to the active tab. CDP commands fail silently if no tab attached.

## Key Design Decisions (Already Made)

- **SQLite** via better-sqlite3 (synchronous, already in package.json)
- **Local blocklists** only (no Google Safe Browsing API — privacy)
- **Guardian modes:** strict/balanced/permissive per domain
- **Banking/login domains** auto-elevated to strict
- **Trust scores:** 0-100, new domains start at 30 ("unknown"), up slowly (+1), down fast (-10/-15), never above 90 without user action
- **WebSocket** for real-time AI agent communication (Phase 4)
- **All code in TypeScript**, matching Tandem's existing style
- **RequestDispatcher** for all webRequest hooks (Phase 0 — Electron limitation)
- **DevToolsManager subscribers** for all CDP access (Phase 3 — singleton debugger)
