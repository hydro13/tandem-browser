# Instructions for Claude Code — Security Upgrade Sessions

## Session Rules

**Each phase = exactly 1 Claude Code session. Never span multiple phases in one session.**

### Before You Start

1. **Read STATUS.md first:** `docs/security-upgrade/STATUS.md`
   - Check which phase is next (the first one with status `PENDING`)
   - Read notes from the previous phase — they contain critical context and wiring details
   - If the previous phase has status `FAILED` or `ISSUES`, stop and report to the user
2. **Read the phase doc:** `docs/security-upgrade/phases/PHASE-{N}.md`
3. **Read the analysis report:** `docs/security-upgrade/REPORT.md` — contains architectural context and rationale
4. **Understand the codebase:**
   - `src/security/types.ts` — All shared interfaces and constants (single source or truth for shared lists)
   - `src/security/security-manager.ts` — Orchestrator (32+ API routes, lifecycle management)
   - `src/security/security-db.ts` — SQLite persistence layer (6 tables, 40+ prepared statements)
   - `src/security/guardian.ts` — Core request decision pipeline (priority 1 on dispatcher)
   - `src/security/script-guard.ts` — CDP-based script tracking + monitor injection
   - `src/security/content-analyzer.ts` — Page-level phishing/tracker analysis
   - `src/network/dispatcher.ts` — Unified webRequest handler (ALL hooks go through here)
   - `src/devtools/manager.ts` — CDP bridge (ALL CDP access goes through here)

### While You Work

1. **Start the app with `npm start`** — never `npm run dev` or `npx electron .`
   (VSCode sets ELECTRON_RUN_AS_NODE which breaks Electron)
2. **Implement all deliverables** from the phase doc, in the order listed
3. **Test after each deliverable** — don't batch all testing to the end
4. **If you encounter a blocker:**
   - Document it in STATUS.md under "Issues encountered"
   - Try to solve it if the fix is within scope or this phase
   - If it requires changes to a previous phase's code, document it and stop
   - Never make changes outside the scope or your phase without documenting why

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
4. **Run regression checks** — verify all previous phases still work:
   - App launches with `npm start`, browsing works
   - `GET /security/status` returns valid response
   - `GET /security/outbound/stats` returns valid response
   - `GET /security/page/analysis` returns valid response (if a page is loaded)
   - `GET /security/gatekeeper/status` returns valid response
   - No false positives on normal sites (Google, GitHub)
5. **Update STATUS.md** — fill in all fields for this phase (date, commit, verification, notes)
6. **Commit and push** using this format:
   ```bash
   git commit -m "$(cat <<'EOF'
   feat(security): Phase <N> — <short description>

   <bullet points or what was added/changed>

   Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
   EOF
   )"
   git push origin main
   ```

## Coding Rules

1. **All security code goes in `src/security/`** — don't scatter across the codebase
2. **All webRequest hooks go through `src/network/dispatcher.ts`** — never call `session.webRequest.onX()` directly
3. **All CDP access goes through `src/devtools/manager.ts`** — never call `webContents.debugger.attach()` directly
4. **Shared constants go in `src/security/types.ts`** — never duplicate lists (KNOWN_TRACKERS, URL_LIST_SAFE_DOMAINS, etc.)
5. **Don't break existing functionality** — all 6 security modules must still work after your changes
6. **Privacy first** — no external API calls by default (local analysis only)
7. **Performance matters** — synchronous handlers must stay < 5ms, async analysis is fine post-page-load
8. **Log everything** — every detection goes to the events table via `db.logEvent()`
9. **TypeScript strict** — proper types, no `any` (except CDP params where types aren't available)
10. **Prepared statements** — use `db.prepare(sql)` for all hot-path queries
11. **Backward compatible DB changes** — use `IF NOT EXISTS` for new tables, `ALTER TABLE ADD COLUMN` for new columns

## What NOT to Do

- Do NOT modify files outside the scope or your phase without documenting why in STATUS.md
- Do NOT modify `docs/security-shield/STATUS.md` or `docs/security-fixes/STATUS.md` — those are separate projects
- Do NOT call `session.webRequest.onX()` directly — always go through RequestDispatcher
- Do NOT add async/await inside webRequest handler callbacks (synchronous handlers only)
- Do NOT implement features from future phases ("I'll just add this too since I'm here")
- Do NOT change the GatekeeperWebSocket protocol messages (breaking change for AI agents)
- Do NOT change RequestDispatcher consumer priorities without explicit instruction
- Do NOT skip the TypeScript check or verification checklist
- Do NOT push without updating STATUS.md
- Do NOT add npm dependencies without documenting them in STATUS.md

## Debugging Tips

- **App won't start:** Check if `ELECTRON_RUN_AS_NODE` is set. Use `npm start` which cleans it.
- **Port 8765 in use:** Previous instance didn't shut down. `lsof -i :8765` and kill it.
- **SQLite errors:** Check `~/.tandem/security/shield.db` exists and is writable. Delete it to reset.
- **CDP errors:** DevToolsManager must be attached to the active tab. CDP commands fail silently without attachment.
- **Stealth broken:** Check dispatcher consumer priority order. StealthManager must be priority 10.
- **TS errors:** Run `npx tsc --noEmit` frequently — don't wait until the end.

## Key Architecture Facts (Already Built)

- **5-phase security system:** NetworkShield → OutboundGuard → ScriptGuard+ContentAnalyzer+BehaviorMonitor → GatekeeperWS → EvolutionEngine
- **SQLite** via better-sqlite3 at `~/.tandem/security/shield.db` (WAL mode, synchronous queries)
- **Local blocklists** only (URLhaus, PhishTank, Steven Black — no Google Safe Browsing)
- **Guardian modes:** strict/balanced/permissive per domain (banking auto-elevated to strict)
- **Trust scores:** 0-100, new domains start at 30, +1 clean visit (max 90), -10 anomaly, -15 blocked
- **RequestDispatcher** wraps Electron's singleton webRequest handlers with priority-based consumers
- **DevToolsManager** wraps CDP with subscriber system for event dispatch
- **32 API routes** under `/security/*` — see `security-manager.ts` for full list
- **Gatekeeper WebSocket** at `/security/gatekeeper` — async, non-blocking, fail-open

## Related Projects (DO NOT MODIFY)

- `docs/security-shield/` — Original security system build (COMPLETED)
- `docs/security-fixes/` — Security bug fixes (IN PROGRESS)
- `docs/agent-tools/` — Agent tools project (separate scope)
