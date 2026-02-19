# Security Shield — Implementation Status

> This file tracks progress across Claude Code sessions. Each phase updates its section after completion.
> Read this file FIRST when starting a new session.

## Current State

**Next phase to implement:** Phase 5
**Last completed phase:** Phase 4
**Overall status:** IN PROGRESS

---

## Phase 0: Unified Request Dispatcher

- **Status:** COMPLETED
- **Date:** 2026-02-19
- **Commit:** 126d215
- **Branch:** main
- **Verification:**
  - [x] App launches with `npm start`
  - [x] Normal browsing works
  - [x] Google login works (auth bypass preserved — StealthManager deletes UA for Google domains)
  - [x] Stealth headers applied (StealthManager priority 10 via dispatcher)
  - [x] Network logging works (`/network/log` returns entries, `/network/domains` tracks 13+ domains)
  - [x] WebSocket connections work (WebSocketOriginFix consumer priority 50)
  - [x] Cookies persist (CookieFix consumer priority 10 on response headers)
  - [x] No console errors
  - [x] Late consumer registration works (NetworkInspector registers after attach → triggers reattach)
  - [x] Performance OK (no perceived slowdown, sub-ms dispatch times)
- **Issues encountered:** None
- **Notes for next phase:** Dispatcher is the sole webRequest handler. Register Guardian as priority 1 consumer via `dispatcher.registerBeforeRequest()`. The dispatcher module-level variable is accessible from both `createWindow()` and `startAPI()`.

---

## Phase 1: Security Core

- **Status:** COMPLETED
- **Date:** 2026-02-19
- **Commit:** 8eea6b5
- **Branch:** main
- **Verification:**
  - [x] shield.db created with correct schema (~/.tandem/security/shield.db, WAL mode)
  - [x] GET /security/status works (guardian status + blocklist stats + DB counts)
  - [x] Blocklist check detects known threats (phishing domains, ad domains correctly blocked)
  - [x] Blocked domain doesn't load (confirmed via blocklist/check API)
  - [x] Normal sites load fine (Google, GitHub, gstatic all work — no false positives)
  - [x] Events logged correctly (block events with timestamps, domain, details JSON)
  - [x] Domains tracked with trust (15 domains tracked after startup, trust levels working)
  - [x] Guardian mode switching works (POST /security/guardian/mode confirmed)
  - [x] NetworkInspector still works (GET /network/log returns entries, /network/domains tracks 13+ domains)
  - [x] Stealth still works (StealthManager priority 10 unaffected)
  - [x] Decision time < 5ms (avg 0.02ms — well under target)
  - [x] No performance degradation (sub-ms dispatch times)
- **Issues encountered:**
  - URLhaus blocklist contains malware URLs hosted on legitimate platforms (github.com, dropbox.com, etc.). Extracting domain-level blocks from these URLs caused false positives for major sites. Fixed by adding `URL_LIST_SAFE_DOMAINS` safelist in NetworkShield to skip hosting platform domains when parsing URL-based blocklists.
- **Notes for next phase:** SecurityManager is initialized in startAPI() via late registration pattern (same as NetworkInspector). Guardian registers as priority 1 on beforeRequest, priority 20 on beforeSendHeaders and headersReceived. All 9 API routes registered under /security/*. Database uses prepared statements for all hot-path queries. OutboundGuard (Phase 2) should register via dispatcher.registerBeforeRequest() with priority 5.
- **Blocklist stats:**
  - URLhaus: 11,806 domains (1,447 hosting platform entries skipped)
  - PhishTank: 728,917 domains
  - Steven Black: 80,916 domains
  - Total unique in memory: 811,812 domains

---

## Phase 2: Outbound Data Guard

- **Status:** COMPLETED
- **Date:** 2026-02-19
- **Commit:** 0bfa2ed
- **Branch:** main
- **Verification:**
  - [x] Normal forms work (same-origin POST always allowed — Google, GitHub, login flows unaffected)
  - [x] Cross-origin credentials blocked (CREDENTIAL_PATTERN regex detects password/token/secret fields → auto_block)
  - [x] Same-origin credentials allowed (same-origin check runs first, returns allow before body analysis)
  - [x] Tracker blocking per mode (KNOWN_TRACKERS set, strict=block, balanced/permissive=flag)
  - [x] Stats API accurate (GET /security/outbound/stats returns totalChecked/allowed/blocked/flagged)
  - [x] No false positives (Google, GitHub, gstatic domains all pass normally — 0 false blocks during test)
  - [x] WebSocket monitoring works (ws:// and wss:// upgrade requests detected and flagged/allowed appropriately)
  - [x] Phase 0+1 regression OK (NetworkInspector logs 100+ entries, 12+ domains tracked, blocklist check works, stealth active)
- **Issues encountered:** None
- **Notes for next phase:** OutboundGuard is called from within Guardian's checkRequest() (not registered as a separate dispatcher consumer). Guardian priority 1 handles both blocklist checks and outbound analysis. OutboundGuard analyzes POST/PUT/PATCH bodies for credentials and monitors WebSocket upgrades. Tandem's own internal WebSocket (127.0.0.1:18789) is flagged as unknown-ws-endpoint — consider adding localhost to KNOWN_WS_SERVICES or whitelisting in Phase 3 if this creates noise. 12 API routes now registered under /security/*. The events table supports category-filtered queries (GET /security/events?category=outbound).

---

## Phase 3: Script & Content Guard

- **Status:** COMPLETED
- **Date:** 2026-02-19
- **Commit:** 7339b9f
- **Branch:** main
- **Verification:**
  - [x] CDP subscriber system works (ScriptGuard + ScriptGuard:Alerts subscribers registered, events dispatched correctly)
  - [x] Script fingerprinting active (210 fingerprints stored after visiting GitHub + Google)
  - [x] New-script-on-known-domain flagging (logs event when visitCount > 3 and script not in DB)
  - [x] Typosquatting detection (Levenshtein distance ≤ 2 + common substitutions against 20 high-value targets)
  - [x] Permission monitoring (setPermissionRequestHandler installed — blocks camera/mic in strict, notifications from first-visit sites)
  - [x] Crypto miner detection (WASM instantiation tracking + CPU spike correlation via Performance.getMetrics every 10s)
  - [x] Security injections don't break sites (tested GitHub, Google — 0 false blocks, 1815+ requests processed cleanly)
  - [x] Stealth + Copilot Vision unaffected (navigator.webdriver=false, __tandemScroll binding active, security monitors in separate APIs)
  - [x] Phase 0-2 regression OK (blocklist 811,812 entries, Guardian active, outbound guard working, all 12 previous routes working)
- **Issues encountered:** None
- **Notes for next phase:**
  - SecurityManager now has `setDevToolsManager(dtm)` method called in main.ts after DevToolsManager creation (SecurityManager is created before DevToolsManager in init order)
  - `securityManager.onTabAttached()` is called after `devToolsManager.attachToTab()` in both tab-register and tab-focus handlers
  - `securityManager.setupPermissionHandler(session)` is called after session is available in startAPI
  - Guardian.getModeForDomain is now public (needed by BehaviorMonitor)
  - DevToolsManager.getAttachedWebContents() is the new public accessor for security modules
  - 19 API routes total under /security/* (12 from Phase 1-2 + 7 new)
  - Tandem's internal WebSocket (127.0.0.1:18789) still flagged as unknown-ws-endpoint (Phase 2 note — not addressed, not causing issues)
- **DevToolsManager changes:**
  - Added `CDPSubscriber` interface (exported) — { name, events[], handler(method, params) }
  - Added `subscribers: CDPSubscriber[]` private field
  - Added `subscribe(subscriber)` — registers subscriber, removes duplicates by name
  - Added `unsubscribe(name)` — removes subscriber by name
  - Added `enableSecurityDomains()` — enables Debugger.enable + Performance.enable (not enabled by default)
  - Added `getAttachedWebContents()` — returns attached WC or null (for security modules)
  - Modified `handleCDPEvent()` — now dispatches ALL events to subscribers after internal handling; Runtime.bindingCalled no longer early-returns (falls through to subscribers for security bindings while still handling copilot bindings internally)

---

## Phase 4: AI Gatekeeper Agent

- **Status:** COMPLETED
- **Date:** 2026-02-19
- **Commit:** b752cd1
- **Gatekeeper secret location:** ~/.tandem/security/gatekeeper.secret
- **Verification:**
  - [x] WebSocket server active (`/security/gatekeeper` path on port 8765)
  - [x] Auth works (invalid token → 401 rejection, valid token → connection accepted)
  - [x] Agent connect + receive events (trust_update, mode_change, escalate all processed)
  - [x] Decisions processed correctly (agent decisions applied via Guardian.submitDecision)
  - [x] Timeout fallback works (30s timeout → defaultAction executed, decision logged in history)
  - [x] Queue replay on reconnect (pending decisions replayed to newly connected agent)
  - [x] Browser works without agent (0 pending decisions during normal browsing, all Phase 1-3 rules active)
  - [x] REST fallback works (POST /security/gatekeeper/decide with proper validation — 400/404/200)
  - [x] Phase 0-3 regression OK (18/18 endpoint tests passed, 811,812 blocklist entries, Guardian avg 0.04ms)
- **Issues encountered:**
  - Initial "uncertain" heuristic (trust < 40) was too broad — caught all new domains (default trust=30). Tightened to trust < 20 (actively suspicious) or strict-mode scripts with trust < 50. Target: ~5% of requests.
  - Tandem's own localhost API requests (chat polling every 2s) were being queued. Fixed by excluding localhost/127.0.0.1 from gatekeeper queueing.
- **Notes for next phase:**
  - GatekeeperWebSocket is initialized AFTER Express server starts (needs HttpServer reference). Order: SecurityManager → TandemAPI.start() → securityManager.initGatekeeper(httpServer)
  - TandemAPI now has `getHttpServer()` public method (minimal change to server.ts)
  - 24 API routes total under /security/* (19 from Phase 1-3 + 5 new)
  - Decision history is kept in-memory (MAX_HISTORY=500). For Phase 5, consider persisting to DB.
  - Pending queue cap: MAX_QUEUE=1000 with FIFO eviction (oldest gets defaultAction)
  - Guardian's `queueForGatekeeper()` is non-blocking — requests are always allowed immediately, agent adjusts trust/mode for FUTURE requests
  - `decisionCallbacks` Map in Guardian is ready for future use (async decision flow), currently unused since all decisions are fire-and-forget
- **Agent setup instructions:**
  1. Get the secret: `curl http://127.0.0.1:8765/security/gatekeeper/secret`
  2. Connect via WebSocket: `ws://127.0.0.1:8765/security/gatekeeper?token=<secret>`
  3. Or use header: `X-Gatekeeper-Token: <secret>`
  4. Agent receives: `decision_needed`, `anomaly`, `event`, `stats` messages
  5. Agent sends: `decision`, `trust_update`, `mode_change`, `escalate` messages
  6. REST fallback: `POST /security/gatekeeper/decide` with `{id, action, reason, confidence}`
  7. Monitor: `GET /security/gatekeeper/status` for connection state

---

## Phase 5: Evolution Engine + Agent Fleet

- **Status:** PENDING (blocked by Phase 4)
- **Date:** —
- **Commit:** —
- **Verification:**
  - [ ] Baselines build correctly
  - [ ] Anomaly detection works
  - [ ] Trust evolution correct (asymmetric)
  - [ ] Zero-day candidate logging
  - [ ] Report generation works
  - [ ] Blocklist auto-update works
  - [ ] Event pruning works
  - [ ] Phase 0-4 regression OK
- **Issues encountered:** —
- **Agent fleet status:**
  - Sentinel: NOT CONFIGURED
  - Scanner: NOT CONFIGURED
  - Updater: NOT CONFIGURED
- **Post-implementation notes:** —

---

## Known Issues & Workarounds

> Add any cross-phase issues, workarounds, or gotchas here.

| Issue | Phase | Workaround | Status |
|-------|-------|------------|--------|
| — | — | — | — |

## Dependency Changes

| Phase | Dependency | Version | Reason |
|-------|-----------|---------|--------|
| 0 | @electron/rebuild (dev) | ^3.7.0 | Native module rebuild for better-sqlite3 |
| 4 | ws | ^8.16.0 | WebSocket server for Gatekeeper (**verified: NOT bundled in Electron 28**) |
| 4 | @types/ws (dev) | ^8.5.0 | TypeScript types for ws |

## File Inventory

> Updated after each phase. Lists all files created or modified.

### Phase 0

- [ ] `src/network/dispatcher.ts` — NEW
- [ ] `src/network/inspector.ts` — MODIFIED (refactored to dispatcher consumer)
- [ ] `src/stealth/manager.ts` — MODIFIED (refactored to dispatcher consumer)
- [ ] `src/main.ts` — MODIFIED (dispatcher init, hook refactor)
- [ ] `package.json` — MODIFIED (@electron/rebuild added)

### Phase 1

- [ ] `src/security/types.ts` — NEW
- [ ] `src/security/security-db.ts` — NEW
- [ ] `src/security/network-shield.ts` — NEW
- [ ] `src/security/guardian.ts` — NEW
- [ ] `src/security/security-manager.ts` — NEW
- [ ] `~/.tandem/security/blocklists/urlhaus.txt` — DOWNLOADED (not in git)
- [ ] `~/.tandem/security/blocklists/phishing.txt` — DOWNLOADED (not in git)
- [ ] `~/.tandem/security/blocklists/hosts.txt` — DOWNLOADED (not in git)
- [ ] `.gitignore` — MODIFIED (add src/security/blocklists/data/)
- [ ] `src/main.ts` — MODIFIED (SecurityManager init)
- [ ] `src/api/server.ts` — MODIFIED (SecurityManager routes)

### Phase 2

- [ ] `src/security/outbound-guard.ts` — NEW
- [ ] `src/security/guardian.ts` — MODIFIED (outbound checking)
- [ ] `src/security/security-manager.ts` — MODIFIED (new routes)
- [ ] `src/security/types.ts` — MODIFIED (new types)

### Phase 3

- [ ] `src/security/script-guard.ts` — NEW
- [ ] `src/security/content-analyzer.ts` — NEW
- [ ] `src/security/behavior-monitor.ts` — NEW
- [ ] `src/devtools/manager.ts` — MODIFIED (subscriber system + sendCommand)
- [ ] `src/security/security-manager.ts` — MODIFIED (new modules + routes)

### Phase 4

- [ ] `src/security/gatekeeper-ws.ts` — NEW
- [ ] `src/security/guardian.ts` — MODIFIED (decision queue)
- [ ] `src/security/security-manager.ts` — MODIFIED (WS init + routes)
- [ ] `src/security/types.ts` — MODIFIED (new types)
- [ ] `package.json` — MODIFIED (ws dependency)

### Phase 5

- [ ] `src/security/evolution.ts` — NEW
- [ ] `src/security/threat-intel.ts` — NEW
- [ ] `src/security/blocklists/updater.ts` — NEW
- [ ] `src/security/security-manager.ts` — MODIFIED (evolution integration + routes)
- [ ] `src/security/types.ts` — MODIFIED (new types)
