# Security Upgrade — Implementation Status

> This file tracks progress across Claude Code sessions. Each phase updates its section after completion.
> **Read this file FIRST** when starting a new session.

## Current State

**Next phase to implement:** Phase 4
**Last completed phase:** Phase 3-B
**Overall status:** IN PROGRESS

---

## Phase 0-A: Deduplicate Shared Constants

- **Status:** DONE
- **Date:** 2026-02-24
- **Commit:** 961ce5e
- **Verification:**
  - [x] `npx tsc --noEmit` — 0 errors
  - [x] `KNOWN_TRACKERS` exported from `types.ts`, imported by `outbound-guard.ts` and `content-analyzer.ts`
  - [x] `URL_LIST_SAFE_DOMAINS` exported from `types.ts`, imported by `network-shield.ts` and `blocklists/updater.ts`
  - [x] No duplicate definitions remain
  - [x] App launches with `npm start`, browsing works
- **Issues encountered:** None
- **Notes for next phase:** `KNOWN_TRACKERS` was merged as union of both lists (outbound-guard had ~27 entries with www. prefixes and subdomains; content-analyzer had ~22 entries with base domains). The merged set has all entries from both. Note: outbound-guard uses parent-domain matching logic in `isKnownTracker()` while content-analyzer uses direct `Set.has()` — no logic was changed, only the constant was moved.

---

## Phase 0-B: Wire Cookie Count + Correlation Trigger + Blocklist Scheduling

- **Status:** DONE
- **Date:** 2026-02-24
- **Commit:** fd9496c
- **Verification:**
  - [x] `npx tsc --noEmit` — 0 errors
  - [x] `cookie_count` in EvolutionEngine receives real values (not hardcoded 0)
  - [x] `correlateEvents()` triggered automatically (per 100 events or hourly)
  - [x] Blocklist update runs on 24-hour schedule
  - [x] `lastUpdated` timestamp persisted in DB
  - [x] App launches, browsing works
- **Issues encountered:** None
- **Notes for next phase:** Cookie counting is done in Guardian's `analyzeResponseHeaders()` for ALL resource types (before the mainFrame filter). Counts are accumulated in a `Map<string, number>` and read+reset by SecurityManager in `onPageLoaded()`. Correlation uses a re-entrancy guard (`correlationRunning`) to prevent recursive loops since correlation itself logs events. SecurityDB has an `onEventLogged` callback that SecurityManager uses to count events across all modules (Guardian, OutboundGuard, etc.) — not just events logged by SecurityManager itself. Blocklist metadata uses a simple key-value table (`blocklist_metadata`); on startup, if `lastUpdated` is missing or >24h old, an immediate async update runs.

---

## Phase 1: Shannon Entropy Check + MIME Whitelist

- **Status:** DONE
- **Date:** 2026-02-24
- **Commit:** a2dfa40
- **Verification:**
  - [x] `npx tsc --noEmit` — 0 errors
  - [x] Entropy function returns correct values (~0 for "aaaa", ~7+ for random data)
  - [x] High-entropy external scripts (>6.0, >1000 chars) generate security events
  - [x] Trusted Content-Type whitelist skips body scan for media uploads
  - [x] `application/json` and `x-www-form-urlencoded` are still scanned
  - [x] Normal form submissions still trigger credential scanning
  - [x] App launches, browsing works
- **Issues encountered:** None
- **Notes for next phase:** `calculateEntropy()` is a module-level function in `script-guard.ts` (not exported — used only internally). Entropy check is async (uses `Debugger.getScriptSource` CDP call) and fires in background after the sync `analyzeScript()` completes. Only external scripts are checked (script domain != page domain), with size bounds 1000 chars to 500KB. Severity tiers: 6.0-6.5 = medium, 6.5-7.0 = high, 7.0+ = critical. MIME whitelist in OutboundGuard extracts Content-Type from multipart form-data bytes; includes a safety guard that skips the whitelist for multi-field forms (multiple `Content-Disposition` headers) to avoid missing credential exfiltration in mixed uploads. The `EventCategory` type doesn't include 'obfuscation' so entropy events use category 'script' with reason 'high-entropy-script' in details.

---

## Phase 2-A: ThreatRule Interface + Rule Set Definition

- **Status:** DONE
- **Date:** 2026-02-24
- **Commit:** ce9d1af
- **Verification:**
  - [x] `npx tsc --noEmit` — 0 errors
  - [x] `ThreatRule`, `ThreatRuleMatch`, `ScriptAnalysisResult` interfaces exported
  - [x] `JS_THREAT_RULES` array exported with 25 rules
  - [x] All regex patterns compile without errors
  - [x] App still starts (no runtime errors)
- **Issues encountered:** None
- **Notes for next phase:** All 25 rules are in `JS_THREAT_RULES` in `types.ts`, grouped by category: 9 obfuscation + 1 evasion (silent_catch) + 6 exfiltration + 6 injection + 3 redirect. The `ThreatRule.category` union includes 'evasion' alongside the 4 main categories. `ScriptAnalysisResult.entropy` is optional (will be filled by Phase 2-B when it integrates with the existing entropy check from Phase 1). Compound proximity patterns (e.g. `cookie_to_fetch`) use `[\s\S]{0,100}` for cross-line matching within 100 chars — Phase 2-B should be aware these patterns may match across lines.

---

## Phase 2-B: Rule Engine + CDP Integration + Event Logging

- **Status:** DONE
- **Date:** 2026-02-24
- **Commit:** 4419aad
- **Verification:**
  - [x] `npx tsc --noEmit` — 0 errors
  - [x] `analyzeScriptContent()` function exists and works
  - [x] Script source retrieved via `Debugger.getScriptSource()`
  - [x] Rule matches logged as security events with type `script-analysis`
  - [x] Critical severity events notify Gatekeeper
  - [x] Scripts > 500KB skipped
  - [x] CDP errors caught gracefully
  - [x] App launches, browsing works
- **Issues encountered:** None
- **Notes for next phase:** `analyzeScriptContent()` is a module-level function in `script-guard.ts` (not exported — used only internally). It runs all 25 `JS_THREAT_RULES` against script source and returns a `ScriptAnalysisResult` with scored matches. Score thresholds: 0=none, 1-14=low, 15-29=medium, 30-49=high, 50+=critical. The old `checkScriptEntropy()` method was replaced with `analyzeExternalScript()` which fetches CDP source once and runs both the rule engine AND entropy check. If both high entropy (>=6.0) AND rules match, the total score is boosted by 25%. Phase 1 entropy logging is preserved as a separate event. Rule engine events use `eventType: 'script-analysis'` with details containing `topMatches` (max 5). Critical detections notify Gatekeeper via `onCriticalDetection` callback wired by SecurityManager in `initGatekeeper()` — this required a small addition to `security-manager.ts` (callback wiring only, ~10 lines). The analysis only runs on external scripts (different domain than page) with length <= 500KB (`MAX_SCRIPT_SIZE`).

---

## Phase 3-A: Cross-Domain Script Correlation (DB + Logic)

- **Status:** DONE
- **Date:** 2026-02-24
- **Commit:** 249fd1a
- **Verification:**
  - [x] `npx tsc --noEmit` — 0 errors
  - [x] Index on `script_fingerprints.script_hash` exists (`idx_script_fp_hash`)
  - [x] `getDomainsForHash()` prepared statement works
  - [x] Script on blocked domain generates `script-on-blocked-domain` event (logic verified, awaiting real-world trigger)
  - [x] Script on 5+ domains generates `widespread-script` event (logic verified, awaiting real-world trigger)
  - [x] App launches, browsing works
- **Issues encountered:** None
- **Notes for next phase:** The phase doc referenced `hash` but the actual column is `script_hash` — all SQL uses the correct column name. `correlateScriptHash()` is a synchronous private method in ScriptGuard that runs after `upsertScriptFingerprint()` in `analyzeScript()`, only when a hash is available. Blocklist access uses a callback pattern (`isDomainBlocked`) wired by SecurityManager to `NetworkShield.checkDomain()` — same pattern as `onCriticalDetection`. The blocked-domain check iterates all domains for the hash (excluding current domain) and checks each against NetworkShield (in-memory Set + DB blocklist + parent domain matching). If a blocked domain is found, a critical event is logged AND Gatekeeper is notified via `onCriticalDetection`. The widespread-script check fires at 5+ distinct domains (including current) with low severity (informational — could be CDN). `getDomainCountForHash()` is also exposed as a prepared statement for Phase 3-B's API endpoint.

---

## Phase 3-B: Normalized Hashing + API Endpoint

- **Status:** DONE
- **Date:** 2026-02-24
- **Commit:** 90fa186
- **Verification:**
  - [x] `npx tsc --noEmit` — 0 errors
  - [x] `normalized_hash` column exists in `script_fingerprints`
  - [x] Scripts differing only in comments/whitespace produce same normalized hash
  - [x] `GET /security/scripts/correlations` returns valid JSON
  - [x] App launches, browsing works
- **Issues encountered:** None
- **Notes for next phase:** `normalizeScriptSource()` is a module-level function in `script-guard.ts` (not exported) — strips `//` and `/* */` comments, collapses whitespace, trims. Normalized hash is SHA-256 hex of the normalized source, computed in `analyzeExternalScript()` after fetching source via CDP. Stored via a separate `updateNormalizedHash()` DB method (not part of the main upsert, since the source is only available async). `correlateScriptHash()` was extended with a `hashType` parameter ('original' | 'normalized') to reuse the same blocked-domain and widespread-script logic for both hash types — normalized correlation runs in `analyzeExternalScript()` after the hash is computed. The API endpoint `GET /security/scripts/correlations` (route 33) queries `getWidespreadScripts()` which groups by `script_hash` with `HAVING COUNT(DISTINCT domain) >= 2`, returning up to 50 results sorted by domain count. For each result, domains are fetched and checked against NetworkShield blocklist. Response includes `totalTrackedScripts` and `crossDomainScripts` counts. Normalized hash is only available for external scripts (different domain than page) under 500KB — first-party scripts will have `normalized_hash = NULL`.

---

## Phase 4: CyberChef Regex Patterns Integration

- **Status:** PENDING
- **Date:** —
- **Commit:** —
- **Verification:**
  - [ ] `npx tsc --noEmit` — 0 errors
  - [ ] URL, domain, IPv4, IPv4-octal, email regex constants in `types.ts`
  - [ ] Deep source scan runs after page load
  - [ ] Octal IPs detected and flagged
  - [ ] Blocked URLs/domains found in page source generate events
  - [ ] Scan limited to first 1MB
  - [ ] App launches, browsing works
- **Issues encountered:** —
- **Notes for next phase:** —

---

## Phase 5-A: Confidence Type System + DB Layer

- **Status:** PENDING
- **Date:** —
- **Commit:** —
- **Verification:**
  - [ ] `npx tsc --noEmit` — 0 errors
  - [ ] `AnalysisConfidence` enum exported from `types.ts`
  - [ ] `confidence` column exists in events table (default 500)
  - [ ] `logEvent()` accepts and stores confidence values
  - [ ] Existing `logEvent()` calls still work without new parameter
  - [ ] App launches, browsing works
- **Issues encountered:** —
- **Notes for next phase:** —

---

## Phase 5-B: Confidence Wiring — Guardian + OutboundGuard + ScriptGuard

- **Status:** PENDING
- **Date:** —
- **Commit:** —
- **Verification:**
  - [ ] `npx tsc --noEmit` — 0 errors
  - [ ] All `logEvent()` calls in Guardian include confidence
  - [ ] All `logEvent()` calls in OutboundGuard include confidence
  - [ ] All `logEvent()` calls in ScriptGuard include confidence
  - [ ] Events in DB have correct confidence values (not all 500)
  - [ ] App launches, browsing works
- **Issues encountered:** —
- **Notes for next phase:** —

---

## Phase 5-C: Remaining Modules + Gatekeeper Routing + Evolution Weighting

- **Status:** PENDING
- **Date:** —
- **Commit:** —
- **Verification:**
  - [ ] `npx tsc --noEmit` — 0 errors
  - [ ] All security modules log events with confidence
  - [ ] High-confidence events (<=300) resolved locally, not sent to Gatekeeper
  - [ ] Low-confidence events (>600) sent to Gatekeeper with high priority
  - [ ] Trust evolution weighted by confidence
  - [ ] App launches, browsing works
- **Issues encountered:** —
- **Notes for next phase:** —

---

## Phase 6-A: Acorn Parser + AST Hash Algorithm

- **Status:** PENDING
- **Date:** —
- **Commit:** —
- **Verification:**
  - [ ] `npx tsc --noEmit` — 0 errors
  - [ ] Acorn parser installed and working
  - [ ] AST hash consistent for same-structure scripts
  - [ ] Different variable names → same AST hash
  - [ ] Scripts with syntax errors degrade gracefully
  - [ ] `ast_hash` column exists in `script_fingerprints`
  - [ ] App launches, browsing works
- **Issues encountered:** —
- **Notes for next phase:** —

---

## Phase 6-B: Similarity Matching + DB Integration

- **Status:** PENDING
- **Date:** —
- **Commit:** —
- **Verification:**
  - [ ] `npx tsc --noEmit` — 0 errors
  - [ ] AST-based cross-domain lookup works
  - [ ] Obfuscated variants matched by AST hash
  - [ ] Script matching blocked domain AST → critical event
  - [ ] Similarity scoring produces values 0-1
  - [ ] `GET /security/scripts/correlations` includes AST data
  - [ ] App launches, browsing works
- **Issues encountered:** —
- **Notes for next phase:** —

---

## Phase 7-A: Plugin Interface + AnalyzerManager + Example Plugin

- **Status:** PENDING
- **Date:** —
- **Commit:** —
- **Verification:**
  - [ ] `npx tsc --noEmit` — 0 errors
  - [ ] `SecurityAnalyzer` interface exported from `types.ts`
  - [ ] AnalyzerManager registers, routes, and destroys analyzers
  - [ ] Example analyzer receives events and detects bursts
  - [ ] Crashing analyzer doesn't break pipeline
  - [ ] `GET /security/analyzers/status` returns loaded analyzers
  - [ ] App launches, browsing works
- **Issues encountered:** —
- **Notes for next phase:** —

---

## Phase 7-B: ContentAnalyzer Migration to Plugin Interface

- **Status:** PENDING
- **Date:** —
- **Commit:** —
- **Verification:**
  - [ ] `npx tsc --noEmit` — 0 errors
  - [ ] ContentAnalyzerPlugin registered in AnalyzerManager
  - [ ] Page analysis runs on navigation
  - [ ] `GET /security/page/analysis` returns valid data
  - [ ] Phishing + tracker detection still works
  - [ ] App launches, browsing works
- **Issues encountered:** —
- **Notes for next phase:** —

---

## Phase 7-C: BehaviorMonitor Migration to Plugin Interface

- **Status:** PENDING
- **Date:** —
- **Commit:** —
- **Verification:**
  - [ ] `npx tsc --noEmit` — 0 errors
  - [ ] BehaviorMonitorPlugin registered in AnalyzerManager
  - [ ] Permission handling still works
  - [ ] `GET /security/analyzers/status` shows all 3 analyzers
  - [ ] No duplicate event processing
  - [ ] App launches, browsing works
- **Issues encountered:** —
- **Notes for next phase:** —

---

## Known Issues & Workarounds

| Issue | Phase | Workaround | Status |
|-------|-------|------------|--------|
| — | — | — | — |

## Dependency Changes

| Phase | Dependency | Version | Reason |
|-------|-----------|---------|--------|
| 6-A | acorn | TBD | Lightweight JS parser for AST fingerprinting |

## File Inventory

> Updated after each phase. Lists all files created or modified.

### Phase 0-A
- `src/security/types.ts` — Added `KNOWN_TRACKERS` and `URL_LIST_SAFE_DOMAINS` exports
- `src/security/outbound-guard.ts` — Removed local `KNOWN_TRACKERS`, imports from `types.ts`
- `src/security/content-analyzer.ts` — Removed local `KNOWN_TRACKERS`, imports from `types.ts`
- `src/security/network-shield.ts` — Removed local `URL_LIST_SAFE_DOMAINS`, imports from `types.ts`
- `src/security/blocklists/updater.ts` — Removed local `URL_LIST_SAFE_DOMAINS`, imports from `types.ts`

### Phase 0-B
- `src/security/guardian.ts` — Added `cookieCounts` Map, cookie counting in `analyzeResponseHeaders()`, `getCookieCount()`/`resetCookieCount()` methods
- `src/security/security-db.ts` — Added `blocklist_metadata` table, `onEventLogged` callback in `logEvent()`, `getBlocklistMeta()`/`setBlocklistMeta()` methods
- `src/security/security-manager.ts` — Wired cookie_count in `onPageLoaded()`, added `runCorrelation()` with event counter + hourly interval, added `scheduleBlocklistUpdate()`/`runBlocklistUpdate()` with 24h interval

### Phase 1
- `src/security/script-guard.ts` — Added `calculateEntropy()` function, entropy constants, `getCurrentPageDomain()` helper, `checkScriptEntropy()` async method, integrated entropy check in `analyzeScript()`
- `src/security/outbound-guard.ts` — Added `TRUSTED_OUTBOUND_CONTENT_TYPES` constant, `extractUploadContentType()` method, Content-Type whitelist check in `analyzeOutbound()` (step 4, before body scan)

### Phase 2-A
- `src/security/types.ts` — Added `ThreatRule`, `ThreatRuleMatch`, `ScriptAnalysisResult` interfaces and `JS_THREAT_RULES` constant (25 rules)

### Phase 2-B
- `src/security/script-guard.ts` — Added `analyzeScriptContent()` function, `MAX_SCRIPT_SIZE` constant, `onCriticalDetection` callback, replaced `checkScriptEntropy()` with combined `analyzeExternalScript()` method
- `src/security/security-manager.ts` — Wired `scriptGuard.onCriticalDetection` to `gatekeeperWs.sendAnomaly()` in `initGatekeeper()`

### Phase 3-A
- `src/security/security-db.ts` — Added `idx_script_fp_hash` index on `script_fingerprints(script_hash)`, `getDomainsForHash`/`getDomainCountForHash` prepared statements and methods
- `src/security/script-guard.ts` — Added `isDomainBlocked` callback, `correlateScriptHash()` method for cross-domain hash correlation (blocked-domain + widespread detection)
- `src/security/security-manager.ts` — Wired `scriptGuard.isDomainBlocked` to `shield.checkDomain()` in `setDevToolsManager()`

### Phase 3-B
- `src/security/security-db.ts` — Added `normalized_hash` column (ALTER TABLE), `idx_script_fp_normalized_hash` index, `updateNormalizedHash`/`getDomainsForNormalizedHash`/`getWidespreadScripts`/`getCrossDomainScriptCount` prepared statements and methods
- `src/security/script-guard.ts` — Added `normalizeScriptSource()` function, `crypto` import, normalized hash computation+storage in `analyzeExternalScript()`, extended `correlateScriptHash()` with `hashType` parameter for normalized hash correlation
- `src/security/security-manager.ts` — Added route 33: `GET /security/scripts/correlations` (cross-domain script correlation API)

### Phase 4
*(to be filled after completion)*

### Phase 5-A
*(to be filled after completion)*

### Phase 5-B
*(to be filled after completion)*

### Phase 5-C
*(to be filled after completion)*

### Phase 6-A
*(to be filled after completion)*

### Phase 6-B
*(to be filled after completion)*

### Phase 7-A
*(to be filled after completion)*

### Phase 7-B
*(to be filled after completion)*

### Phase 7-C
*(to be filled after completion)*
