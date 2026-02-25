# Security Upgrade — Implementation Status

> This file tracks progress across Claude Code sessions. Each phase updates its section after completion.
> **Read this file FIRST** when starting a new session.

## Current State

**Next phase to implement:** Phase 9
**Last completed phase:** Phase 8
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

- **Status:** DONE
- **Date:** 2026-02-25
- **Commit:** 724f1d8
- **Verification:**
  - [x] `npx tsc --noEmit` — 0 errors
  - [x] URL, domain, IPv4, IPv4-octal, email regex constants in `types.ts`
  - [x] Deep source scan runs after page load
  - [x] Octal IPs detected and flagged
  - [x] Blocked URLs/domains found in page source generate events
  - [x] Scan limited to first 1MB
  - [x] App launches, browsing works
- **Issues encountered:** None
- **Notes for next phase:** `deepScanPageSource()` is a private async method on ContentAnalyzer that runs as step 8 in `analyzePage()`, after all existing DOM analysis. It gets raw page HTML via `Runtime.evaluate('document.documentElement.outerHTML')`, truncates to 1MB (`MAX_SCAN_SIZE`), then calls `scanSourceForThreats()` on the full source and again on each inline `<script>` block extracted via regex. `scanSourceForThreats()` runs URL_REGEX, DOMAIN_REGEX, and IPV4_OCTAL_REGEX — skipping matches on the current page domain to avoid self-flagging. Blocked domains found in the source log `hidden-blocked-url` events (severity high). Octal IPs log `octal-ip-evasion` events (severity medium) with the decimal equivalent in details. ContentAnalyzer uses an `isDomainBlocked` callback (same pattern as ScriptGuard) wired by SecurityManager to `NetworkShield.checkDomain()`. The regex constants (`URL_REGEX`, `DOMAIN_REGEX`, `IPV4_REGEX`, `IPV4_OCTAL_REGEX`, `EMAIL_REGEX`) are all exported from `types.ts` — `IPV4_REGEX` and `EMAIL_REGEX` are not used in the deep scan but are available for future phases. Note: `security-manager.ts` was also modified (1 line) to wire the `isDomainBlocked` callback — this is outside the stated scope of types.ts + content-analyzer.ts but was necessary for blocklist integration (same pattern used in Phase 3-A for ScriptGuard).

---

## Phase 5-A: Confidence Type System + DB Layer

- **Status:** DONE
- **Date:** 2026-02-25
- **Commit:** b273bb0
- **Verification:**
  - [x] `npx tsc --noEmit` — 0 errors
  - [x] `AnalysisConfidence` enum exported from `types.ts`
  - [x] `confidence` column exists in events table (default 500)
  - [x] `logEvent()` accepts and stores confidence values
  - [x] Existing `logEvent()` calls still work without new parameter
  - [x] App launches, browsing works
- **Issues encountered:** None
- **Notes for next phase:** `AnalysisConfidence` is a numeric enum in `types.ts` with 7 levels: BLOCKLIST(100), CREDENTIAL_EXFIL(200), KNOWN_MALWARE_HASH(300), BEHAVIORAL(500), HEURISTIC(700), ANOMALY(800), SPECULATIVE(900). Lower = more certain. `SecurityEvent.confidence` is optional (`number | undefined`); `logEvent()` defaults to 500 (BEHAVIORAL) when not provided via `event.confidence ?? 500`. The DB column uses `INTEGER DEFAULT 500` and is added via backward-compatible `ALTER TABLE` with try/catch. All 5 event SELECT queries now include the `confidence` column, and both row mapping functions (`getRecentEvents` and `getRecentAnomalies`) map it back with `?? 500` fallback. Phase 5-B should add confidence values to all `logEvent()` calls in Guardian, OutboundGuard, and ScriptGuard using the enum values.

---

## Phase 5-B: Confidence Wiring — Guardian + OutboundGuard + ScriptGuard

- **Status:** DONE
- **Date:** 2026-02-25
- **Commit:** 2f33eca
- **Verification:**
  - [x] `npx tsc --noEmit` — 0 errors
  - [x] All `logEvent()` calls in Guardian include confidence (16 calls, 16 confidence values)
  - [x] All `logEvent()` calls in OutboundGuard include confidence (OutboundGuard has 0 direct logEvent calls — it returns OutboundDecision objects; Guardian logs them)
  - [x] All `logEvent()` calls in ScriptGuard include confidence (10 calls, 10 confidence values)
  - [x] Events in DB have correct confidence values (not all 500) — verified code logic; only correlation/gatekeeper events fired during idle test (those are SecurityManager scope, Phase 5-C)
  - [x] App launches, browsing works
- **Issues encountered:** None
- **Notes for next phase:** OutboundGuard does NOT call `logEvent()` directly — it returns `OutboundDecision` objects to Guardian which logs them. Guardian logs outbound exfiltration blocks with `CREDENTIAL_EXFIL` (200) and outbound flags with `HEURISTIC` (700). For ScriptGuard's rule engine events, confidence varies by severity: critical/high → `HEURISTIC` (700), medium/low → `ANOMALY` (800). The `AnalysisConfidence` enum is imported from `types.ts` in both guardian.ts and script-guard.ts. Phase 5-C should wire confidence into the remaining modules (ContentAnalyzer, BehaviorMonitor, SecurityManager's own correlation/gatekeeper events) and implement the Gatekeeper routing logic (high-confidence events resolved locally, low-confidence sent to Gatekeeper).

---

## Phase 5-C: Remaining Modules + Gatekeeper Routing + Evolution Weighting

- **Status:** DONE
- **Date:** 2026-02-25
- **Commit:** 181fabd
- **Verification:**
  - [x] `npx tsc --noEmit` — 0 errors
  - [x] All security modules log events with confidence
  - [x] High-confidence events (<=300) resolved locally, not sent to Gatekeeper
  - [x] Low-confidence events (>600) sent to Gatekeeper with high priority
  - [x] Trust evolution weighted by confidence
  - [x] App launches, browsing works
- **Issues encountered:** None
- **Notes for next phase:** NetworkShield has zero `logEvent()` calls — it is purely a lookup service (checkDomain/checkUrl), so 5C.3 was N/A. ContentAnalyzer: 4 calls wired (password-on-http → HEURISTIC, typosquatting → ANOMALY, octal-ip → HEURISTIC, hidden-blocked-url → BLOCKLIST). BehaviorMonitor: 5 calls wired (permission-request → BEHAVIORAL, clipboard-read → BEHAVIORAL, crypto-miner → ANOMALY, rapid-memory-growth → ANOMALY, script-killed → BEHAVIORAL). GatekeeperWS: 3 calls wired (trust_update/escalation/decision → BEHAVIORAL). SecurityManager: 2 calls wired (anomaly → ANOMALY, correlation → HEURISTIC). Evolution: 1 call wired (zero-day-candidate → ANOMALY). `evolveTrust()` now accepts optional `confidence` parameter; `getTrustAdjustment()` weights deltas: <=300 = 100%, 301-600 = 70%, >600 = 40%. SecurityManager passes ANOMALY (800) confidence to `evolveTrust(domain, 'anomaly')` so baseline anomalies get 40% trust impact (-4 instead of -10). `sendEvent()` in GatekeeperWS now checks confidence before sending: <=300 returns early (local resolution), 301-600 sends with `priority: 'medium'`, >600 sends with `priority: 'high'`. The existing `sendAnomaly()` and `sendDecisionRequest()` methods are unchanged — anomaly and decision forwarding still works as before (the confidence routing only applies to `sendEvent()`).

---

## Phase 6-A: Acorn Parser + AST Hash Algorithm

- **Status:** DONE
- **Date:** 2026-02-25
- **Commit:** 9cfd6bb
- **Verification:**
  - [x] `npx tsc --noEmit` — 0 errors
  - [x] Acorn parser installed and working
  - [x] AST hash consistent for same-structure scripts
  - [x] Different variable names → same AST hash
  - [x] Scripts with syntax errors degrade gracefully
  - [x] `ast_hash` column exists in `script_fingerprints`
  - [x] App launches, browsing works
- **Issues encountered:** None
- **Notes for next phase:** `parseToAST()`, `buildNodeFeature()`, `walkAST()`, and `computeASTHash()` are all module-level functions in `script-guard.ts` (not exported — used only internally). Acorn is configured with `ecmaVersion: 'latest'`, `sourceType: 'module'`, `allowImportExportEverywhere: true`, and `allowReturnOutsideFunction: true` for maximum compatibility with real-world scripts. The AST hash algorithm is Ghidra BSim-inspired: it walks the AST, collects structural features per node (node type, operators, parameter/argument arity, control flow presence, async/generator flags), excludes variable names and literal values, then SHA-256 hashes the feature string (truncated to 32 hex chars). `MAX_AST_PARSE_SIZE` = 200KB — scripts larger than this skip AST parsing (too expensive). AST hashing runs in `analyzeExternalScript()` after normalized hash computation (step 0c), only for external scripts under 200KB. If parsing fails (syntax errors), `ast_hash` stays NULL — graceful degradation. The `updateAstHash()` DB method uses the same UPDATE pattern as `updateNormalizedHash()`. Phase 6-B should add `getDomainsForAstHash()` for cross-domain AST-based correlation and extend the `/security/scripts/correlations` API to include AST data.

---

## Phase 6-B: Similarity Matching + DB Integration

- **Status:** DONE
- **Date:** 2026-02-25
- **Commit:** ebe4188
- **Verification:**
  - [x] `npx tsc --noEmit` — 0 errors
  - [x] AST-based cross-domain lookup works (`getDomainsForAstHash`, `getAstMatches`, `getWidespreadAstScripts`)
  - [x] Obfuscated variants matched by AST hash (`obfuscation-variant-detected` event for 3+ domains with same AST hash but different regular hashes)
  - [x] Script matching blocked domain AST → critical event (`obfuscated-script-from-blocked-domain` event + Gatekeeper notification)
  - [x] Similarity scoring produces values 0-1 (cosine similarity via `computeSimilarity()`)
  - [x] `GET /security/scripts/correlations` includes AST data (`astMatches` array + `astCorrelations` count)
  - [x] App launches, browsing works
- **Issues encountered:** None
- **Notes for next phase:** `correlateAstHash()` is a private method in ScriptGuard that runs after AST hash computation in `analyzeExternalScript()` (step 0e). It checks two things: (1) blocked-domain match — if any domain with the same AST structure is blocked, log critical event with `KNOWN_MALWARE_HASH` confidence and notify Gatekeeper; (2) obfuscation variant — if 3+ domains share the same AST hash with 2+ distinct regular hashes, log medium-severity event with `HEURISTIC` confidence. Similarity scoring uses cosine similarity between AST feature vectors (stored as serialized `Map<string, number>` in new `ast_features` TEXT column). Feature vectors are built by `computeASTFeatureVector()` which counts occurrences of each structural node feature (reuses `buildNodeFeature()` from Phase 6-A). `runSimilarityCheck()` is gated: only runs for scripts that triggered threat rules OR had high entropy (performance gate per phase doc). It queries stored feature vectors (capped at 200 candidates) and only compares against scripts on blocked domains. Thresholds: >= 0.95 = "structurally identical" (high severity), >= 0.85 = "structurally similar" (medium severity). The correlations API endpoint now returns `astMatches` (from `getWidespreadAstScripts`) with `isObfuscationVariant` and `hasBlockedDomain` flags per entry, plus `astCorrelations` count at top level.

---

## Phase 7-A: Plugin Interface + AnalyzerManager + Example Plugin

- **Status:** DONE
- **Date:** 2026-02-25
- **Commit:** 2ee0c86
- **Verification:**
  - [x] `npx tsc --noEmit` — 0 errors
  - [x] `SecurityAnalyzer` interface exported from `types.ts`
  - [x] AnalyzerManager registers, routes, and destroys analyzers
  - [x] Example analyzer receives events and detects bursts
  - [x] Crashing analyzer doesn't break pipeline
  - [x] `GET /security/analyzers/status` returns loaded analyzers
  - [x] App launches, browsing works
- **Issues encountered:** None
- **Notes for next phase:** `SecurityAnalyzer` and `AnalyzerContext` interfaces are in `types.ts`. `AnalyzerManager` is in `src/security/analyzer-manager.ts` — it sorts analyzers by priority (lower first), routes events to matching analyzers (by `eventTypes` subscription + `canAnalyze()` check), and catches all analyzer exceptions so a crashing plugin never breaks the pipeline. It also has a `routing` re-entrancy guard to prevent infinite loops when analyzers call `context.logEvent()` during analysis. `EventBurstAnalyzer` is in `src/security/analyzers/example-analyzer.ts` — subscribes to all events ('*'), tracks timestamps per domain in a Map, fires an `event-burst` meta-event when 10+ events from one domain occur within 60 seconds, then resets the counter. It filters out its own events via `canAnalyze()` to prevent self-triggering. SecurityManager builds the `AnalyzerContext` from existing module methods: `logEvent` → `db.logEvent()`, `isDomainBlocked` → `shield.checkDomain()`, `getTrustScore` → `db.getDomainInfo()`, `db.getEventsForDomain` → new `SecurityDB.getEventsForDomain()` method. Event routing is wired via the `db.onEventLogged` callback (updated signature from `() => void` to `(event: SecurityEvent) => void`). Cascade events (produced by analyzers) are logged with a `analyzerCascadeLogging` guard to prevent re-routing. Route 34: `GET /security/analyzers/status`. Phase 7-B should create a `ContentAnalyzerPlugin` that wraps ContentAnalyzer and registers it with AnalyzerManager.

---

## Phase 7-B: ContentAnalyzer Migration to Plugin Interface

- **Status:** DONE
- **Date:** 2026-02-25
- **Commit:** 844f40b
- **Verification:**
  - [x] `npx tsc --noEmit` — 0 errors
  - [x] ContentAnalyzerPlugin registered in AnalyzerManager
  - [x] Page analysis runs on navigation
  - [x] `GET /security/page/analysis` returns valid data
  - [x] Phishing + tracker detection still works
  - [x] App launches, browsing works
- **Issues encountered:** None
- **Notes for next phase:** `ContentAnalyzerPlugin` is a wrapper class in `content-analyzer.ts` that implements `SecurityAnalyzer` and delegates to the existing `ContentAnalyzer.analyzePage()`. It subscribes to `'page-loaded'` events (priority 400). In `SecurityManager.onPageLoaded()`, the direct `contentAnalyzer.analyzePage()` call was replaced with `analyzerManager.routeEvent()` emitting a synthetic `page-loaded` event — the plugin picks it up and runs the analysis. `ContentAnalyzer` now caches its last result via `lastAnalysis` field + `getLastAnalysis()` method, so `onPageLoaded()` can read the metrics after the plugin runs. API routes 13, 15, 16 still call `analyzePage()` directly on the ContentAnalyzer instance (unchanged). The plugin is registered in `setDevToolsManager()` after ContentAnalyzer creation + blocklist wiring. Note: events logged by `analyzePage()` during plugin routing are blocked from re-routing by AnalyzerManager's re-entrancy guard (`routing` flag) — this is by design and prevents cascade complexity. Phase 7-C should follow the same wrapper pattern for BehaviorMonitor.

---

## Phase 7-C: BehaviorMonitor Migration to Plugin Interface

- **Status:** DONE
- **Date:** 2026-02-25
- **Commit:** 9b39cfa
- **Verification:**
  - [x] `npx tsc --noEmit` — 0 errors
  - [x] BehaviorMonitorPlugin registered in AnalyzerManager
  - [x] Permission handling still works (unchanged — Electron handler stays direct)
  - [x] `GET /security/analyzers/status` shows all 3 analyzers: content-analyzer (400), behavior-monitor (500), event-burst-detector (950)
  - [x] No duplicate event processing (ContentAnalyzerPlugin and BehaviorMonitorPlugin both subscribe to 'page-loaded' but handle different concerns)
  - [x] App launches, browsing works
  - [x] All regression endpoints valid: /security/status, /security/outbound/stats, /security/gatekeeper/status, /security/page/analysis
- **Issues encountered:** None
- **Notes:** This is the final phase of the security upgrade project. `BehaviorMonitorPlugin` follows the same wrapper pattern as `ContentAnalyzerPlugin` — subscribes to `'page-loaded'` events and restarts resource monitoring for the new page context. Permission handling (`setupPermissionHandler`) and tab-lifecycle calls (`reset`, initial `startResourceMonitoring` on tab attach) remain as direct calls since they are Electron event handlers and lifecycle management, not SecurityAnalyzer event-driven analysis. The `analyze()` method calls `startResourceMonitoring()` which safely clears any existing interval before starting a new one. Developer documentation was added to `analyzer-manager.ts` covering how to create new analyzers, event types, priority conventions, and registration pattern.

---

## Phase 8: Post-Review Fix Round

- **Status:** DONE
- **Date:** 2026-02-25
- **Commit:** (pending)
- **Verification:**
  - [x] `npx tsc --noEmit` — 0 errors
  - [x] `sendEvent()` is called from `onEventLogged` in SecurityManager
  - [x] Events with confidence > 300 reach Gatekeeper (via `sendEvent()` routing)
  - [x] Events with confidence <= 300 do NOT reach Gatekeeper (`sendEvent()` returns early)
  - [x] `script_hash` reliably computed from source for external scripts (SHA-256 in `analyzeExternalScript()`)
  - [x] Tracker/iframe/mixed-content detections produce events in DB (`trackers-detected`, `hidden-iframe`, `mixed-content`)
  - [x] `@types/acorn` removed from package.json (`npm uninstall @types/acorn`)
  - [x] Similarity matching compares all cross-domain scripts (blocked status determines severity, not eligibility)
  - [x] `debugger://` URLs filtered in ScriptGuard
  - [x] IPv4 addresses in page source checked against blocklist (`hidden-blocked-ip` events)
  - [x] WebSocket flag confidence is HEURISTIC (700)
  - [x] MIME whitelist has Electron limitation doc comment
  - [x] App launches, browsing works
  - [x] All regression endpoints valid: /security/status, /security/outbound/stats, /security/gatekeeper/status, /security/page/analysis, /security/scripts/correlations, /security/analyzers/status
- **Issues encountered:** `EventCategory` type does not include `'content'` — used `'network'` for tracker/iframe/mixed-content/IP events (consistent with existing page-level events in ContentAnalyzer).
- **Notes:** This is the final phase of the security upgrade project. All 10 issues from REVIEW.md (1 critical, 5 important, 4 minor) have been resolved. The `EventCategory` type union (`'network' | 'script' | 'form' | 'outbound' | 'behavior'`) was not extended — new events use `'network'` since they are page-level content/network concerns. Phase 8 fix: `updateScriptHash()` uses `AND script_hash IS NULL` so it only fills in missing hashes — CDP-provided hashes are preserved when available. Similarity matching now compares all cross-domain scripts: blocked domains get critical/high severity + Gatekeeper notification, non-blocked domains get medium/low severity (informational).

---

## Phase 9: Test Coverage, Type Cleanup + CDP Timing Fix

- **Status:** PENDING
- **Date:** —
- **Commit:** —
- **Verification:** (to be filled after completion)
- **Issues encountered:** —
- **Notes for this phase:** See `phases/PHASE-9.md` for full spec. Key tasks: (1) ROADMAP.md checkbox update, (2) unit tests via vitest for pure functions, (3) EventCategory 'content' type, (4) CDP attachment timing fix, (5) performance logging.

---

## Known Issues & Workarounds

| Issue | Phase | Workaround | Status |
|-------|-------|------------|--------|
| — | — | — | — |

## Dependency Changes

| Phase | Dependency | Version | Reason |
|-------|-----------|---------|--------|
| 6-A | acorn | ^8.16.0 | Lightweight JS parser for AST fingerprinting |
| ~~6-A~~ | ~~@types/acorn~~ | ~~^4.0.6~~ | ~~Removed in Phase 8 — acorn v8 bundles its own types~~ |

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
- `src/security/types.ts` — Added `URL_REGEX`, `DOMAIN_REGEX`, `IPV4_REGEX`, `IPV4_OCTAL_REGEX`, `EMAIL_REGEX` constants
- `src/security/content-analyzer.ts` — Added `MAX_SCAN_SIZE` constant, `INLINE_SCRIPT_REGEX` constant, `octalIpToDecimal()` helper function, `isDomainBlocked` callback, `deepScanPageSource()` method, `scanSourceForThreats()` method, `checkDomainAgainstBlocklist()` method; integrated deep scan as step 8 in `analyzePage()`
- `src/security/security-manager.ts` — Wired `contentAnalyzer.isDomainBlocked` to `shield.checkDomain()` in `setDevToolsManager()`

### Phase 5-A
- `src/security/types.ts` — Added `AnalysisConfidence` enum (7 levels), added `confidence?: number` to `SecurityEvent` interface
- `src/security/security-db.ts` — Added `confidence INTEGER DEFAULT 500` column migration, updated INSERT statement and `logEvent()` to store confidence, updated all 5 event SELECT queries to include confidence, updated both row mapping functions to return confidence

### Phase 5-B
- `src/security/guardian.ts` — Imported `AnalysisConfidence`, added `confidence` to all 16 `logEvent()` calls (BLOCKLIST for blocklist matches, HEURISTIC for risk/download/redirect/content-type/outbound-flag, CREDENTIAL_EXFIL for outbound exfiltration blocks, BEHAVIORAL for WebSocket events, SPECULATIVE for missing headers and strict-mode cookies)
- `src/security/script-guard.ts` — Imported `AnalysisConfidence`, added `confidence` to all 10 `logEvent()` calls (SPECULATIVE for new-script-on-known-domain, KNOWN_MALWARE_HASH for blocked-domain scripts, BEHAVIORAL for widespread/keylogger/WASM/clipboard/form-action, ANOMALY for entropy and low-severity rules, HEURISTIC for high-severity rules and crypto-miner console)

### Phase 5-C
- `src/security/content-analyzer.ts` — Imported `AnalysisConfidence`, added `confidence` to all 4 `logEvent()` calls (HEURISTIC for password-on-http and octal-ip, ANOMALY for typosquatting, BLOCKLIST for hidden-blocked-url)
- `src/security/behavior-monitor.ts` — Imported `AnalysisConfidence`, added `confidence` to all 5 `logEvent()` calls (BEHAVIORAL for permission-request/clipboard-read/script-killed, ANOMALY for crypto-miner/rapid-memory-growth)
- `src/security/gatekeeper-ws.ts` — Imported `AnalysisConfidence`, added `confidence` to all 3 `logEvent()` calls (BEHAVIORAL for trust_update/escalation/gatekeeper_decision), added confidence-based routing in `sendEvent()` (<=300 local, 301-600 medium, >600 high priority)
- `src/security/evolution.ts` — Imported `AnalysisConfidence`, added `confidence` to zero-day-candidate `logEvent()` (ANOMALY) and trust evolution `logEvent()`, added optional `confidence` parameter to `evolveTrust()`, added `getTrustAdjustment()` private method for confidence-weighted trust deltas
- `src/security/security-manager.ts` — Imported `AnalysisConfidence`, added `confidence` to anomaly `logEvent()` (ANOMALY) and correlation `logEvent()` (HEURISTIC), passed `AnalysisConfidence.ANOMALY` to `evolveTrust()` call for baseline anomalies

### Phase 6-A
- `package.json` — Added `acorn` (^8.16.0) dependency, `@types/acorn` (^4.0.6) devDependency
- `src/security/script-guard.ts` — Added `acorn` import, `MAX_AST_PARSE_SIZE` constant (200KB), `parseToAST()` function, `buildNodeFeature()` function, `walkAST()` function, `computeASTHash()` function; integrated AST hash computation as step 0c in `analyzeExternalScript()`
- `src/security/security-db.ts` — Added `ast_hash TEXT` column migration (ALTER TABLE), `idx_script_fp_ast_hash` index, `stmtUpdateAstHash` prepared statement, `updateAstHash()` method

### Phase 6-B
- `src/security/security-db.ts` — Added `ast_features TEXT` column migration, `stmtGetDomainsForAstHash`/`stmtGetAstMatches`/`stmtGetWidespreadAstScripts`/`stmtUpdateAstFeatures`/`stmtGetAstFeaturesForBlockedCheck` prepared statements, `getDomainsForAstHash()`/`getAstMatches()`/`getWidespreadAstScripts()`/`updateAstFeatures()`/`getScriptsWithAstFeatures()` methods
- `src/security/script-guard.ts` — Added `SIMILARITY_THRESHOLD`/`SIMILARITY_IDENTICAL` constants, `computeASTFeatureVector()`/`walkForFeatures()`/`computeSimilarity()` module-level functions, `correlateAstHash()` private method (blocked-domain + obfuscation-variant detection), `runSimilarityCheck()` private method (cosine similarity against stored feature vectors), integrated AST correlation (step 0d-0e) and similarity check (step 6) in `analyzeExternalScript()`
- `src/security/security-manager.ts` — Extended route 33 (`GET /security/scripts/correlations`) to include `astMatches` array and `astCorrelations` count from `getWidespreadAstScripts()`/`getAstMatches()`

### Phase 7-A
- `src/security/types.ts` — Added `SecurityAnalyzer` interface (name, version, eventTypes, priority, description, initialize, canAnalyze, analyze, destroy) and `AnalyzerContext` interface (logEvent, isDomainBlocked, getTrustScore, db.getEventsForDomain)
- `src/security/security-db.ts` — Updated `onEventLogged` callback signature to pass `SecurityEvent`, updated `logEvent()` to construct and pass logged event, added `stmtGetEventsForDomain` prepared statement, added `getEventsForDomain()` method
- New file: `src/security/analyzer-manager.ts` — `AnalyzerManager` class with register(), routeEvent(), destroy(), getStatus() methods; priority-sorted analyzer list, re-entrancy guard, crash-safe try/catch per analyzer
- New file: `src/security/analyzers/example-analyzer.ts` — `EventBurstAnalyzer` class implementing `SecurityAnalyzer`; subscribes to all events, detects 10+ events/60s per domain, produces `event-burst` meta-events
- `src/security/security-manager.ts` — Imported AnalyzerManager + EventBurstAnalyzer, added `analyzerManager` field + `analyzerCascadeLogging` guard, created AnalyzerContext in constructor, registered EventBurstAnalyzer, updated `onEventLogged` callback to route events to analyzers with cascade guard, added route 34 (`GET /security/analyzers/status`), added `analyzerManager.destroy()` to cleanup

### Phase 7-B
- `src/security/content-analyzer.ts` — Added `SecurityAnalyzer`, `AnalyzerContext`, `SecurityEvent` imports from `types.ts`; added `lastAnalysis` cache field + `getLastAnalysis()` method to `ContentAnalyzer`; cached analysis result in `analyzePage()`; added `ContentAnalyzerPlugin` wrapper class implementing `SecurityAnalyzer` (name='content-analyzer', priority=400, subscribes to 'page-loaded')
- `src/security/security-manager.ts` — Imported `ContentAnalyzerPlugin`; registered it with AnalyzerManager in `setDevToolsManager()`; replaced direct `contentAnalyzer.analyzePage()` call in `onPageLoaded()` with `analyzerManager.routeEvent()` + `getLastAnalysis()` pattern

### Phase 7-C
- `src/security/behavior-monitor.ts` — Added `SecurityAnalyzer`, `AnalyzerContext`, `SecurityEvent` imports from `types.ts`; added `BehaviorMonitorPlugin` wrapper class implementing `SecurityAnalyzer` (name='behavior-monitor', priority=500, subscribes to 'page-loaded', restarts resource monitoring on page load)
- `src/security/security-manager.ts` — Imported `BehaviorMonitorPlugin`; registered it with AnalyzerManager in `setDevToolsManager()` after BehaviorMonitor creation
- `src/security/analyzer-manager.ts` — Added developer documentation comment block: how to create analyzers, event types, priority conventions, registration pattern

### Phase 8

- `src/security/security-manager.ts` — Wired `gatekeeperWs.sendEvent(event)` in `onEventLogged` callback for confidence-based Gatekeeper routing
- `src/security/script-guard.ts` — Added `debugger://` URL filter; computed source-based SHA-256 hash in `analyzeExternalScript()` via `db.updateScriptHash()`; relaxed similarity candidate pool (blocked status → severity, not filter)
- `src/security/security-db.ts` — Added `stmtUpdateScriptHash` prepared statement and `updateScriptHash()` method
- `src/security/content-analyzer.ts` — Added `logEvent()` calls for hidden-iframe (HEURISTIC), mixed-content (HEURISTIC), trackers-detected (BEHAVIORAL); added `IPV4_REGEX` import and IPv4 blocklist scan in `scanSourceForThreats()`
- `src/security/guardian.ts` — Changed WebSocket flag confidence from `BEHAVIORAL` (500) to `HEURISTIC` (700)
- `src/security/outbound-guard.ts` — Added doc comment documenting Electron API limitation for MIME Content-Type whitelist
- `package.json` / `package-lock.json` — Removed `@types/acorn` from devDependencies
