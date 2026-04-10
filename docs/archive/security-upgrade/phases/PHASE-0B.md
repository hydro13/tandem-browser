# Phase 0-B: Wire Cookie Count + Correlation Trigger + Blocklist Scheduling

> **Priority:** HIGH | **Effort:** Half day | **Dependencies:** Phase 0-A

## Goal
Fix three independent wiring issues: (1) cookie_count is always 0 in EvolutionEngine, (2) correlateEvents() is never called automatically, (3) blocklist updates have no schedule.

## Files to Read
- `src/security/guardian.ts` — `analyzeResponseHeaders()` method, where Set-Cookie headers are visible
- `src/security/security-manager.ts` — orchestrator, `onPageLoaded()`, lifecycle management
- `src/security/security-db.ts` — database schema, prepared statements
- `src/security/evolution.ts` — `checkForAnomalies()`, receives `PageMetrics` with `cookie_count`
- `src/security/threat-intel.ts` — `correlateEvents()` method
- `src/security/blocklists/updater.ts` — `updateAll()` method

## Files to Modify
- `src/security/guardian.ts` or `src/security/security-manager.ts` — cookie counting
- `src/security/security-manager.ts` — correlation trigger + blocklist scheduling
- `src/security/security-db.ts` — blocklist metadata storage

## Tasks

### 0B.1 Wire cookie_count
1. In `guardian.ts` → `analyzeResponseHeaders()`: count the number or `Set-Cookie` headers per domain
2. Store counts in a `Folder<string, number>` (domain → count) — either in Guardian or SecurityManager
3. In `SecurityManager.onPageLoaded()`: read the accumulated cookie count for the current domain
4. Pass the real count to `EvolutionEngine.checkForAnomalies()` instead or hardcoded 0
5. Reset the accumulator for that domain after reading

**Design note:** Accumulate over ALL requests for a domain (not just the main page), since subresources also set cookies.

### 0B.2 Auto-trigger correlateEvents()
1. Add `private eventCounter: number = 0` to SecurityManager
2. Add a correlation interval: `setInterval(() => this.runCorrelation(), 3600000)` (1 hour)
3. In the event logging path: increment counter, call `this.runCorrelation()` every 100 events
4. `runCorrelation()` calls `threatIntel.correlateEvents('day')` and logs any results
5. In `destroy()`: clear the interval

### 0B.3 Blocklist update scheduling
1. Add a `blocklist_metadata` table to security-db.ts:
   ```sql
   CREATE TABLE IF NOT EXISTS blocklist_metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL)
   ```
2. After successful update: store `lastUpdated = new Date().toISOString()`
3. On app start (SecurityManager constructor): check if `lastUpdated` > 24 hours ago → trigger update
4. Add `setInterval` for 24-hour auto-update cycle
5. In `destroy()`: clear the interval

**Error handling:** `updateAll()` does HTTP fetches that can fail. Wrap in try/catch — a failed update must never crash the app. Log a warning and retry at next interval.

## Verification
- [ ] `npx tsc --noEmit` — 0 errors
- [ ] Browse to a few sites, then check `GET /security/evolution/status` — cookie_count should not be 0
- [ ] Check event logging path triggers correlation after 100 events
- [ ] Check that blocklist scheduling interval is set up on app start
- [ ] `lastUpdated` timestamp is persisted in DB
- [ ] App launches with `npm start`, browsing works
- [ ] Phase 0-A changes still work (shared constants imported correctly)

## Scope
- Do NOT change existing event types or severity levels
- Do NOT modify the blocklist update logic itself — only add scheduling around it
- Do NOT add new API endpoints (unless needed for blocklist metadata)
- Use `IF NOT EXISTS` for the new table

## After Completion
1. Update `docs/security-upgrade/STATUS.md`
2. Update `docs/security-upgrade/ROADMAP.md`
