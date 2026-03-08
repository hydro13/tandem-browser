# Security Upgrade Roadmap

> Track progress or all phases and sub-tasks.
> Update this file when a task is completed.

---

## Phase 0-A: Deduplicate Shared Constants
**Priority:** HIGH | **Effort:** ~1 hour | **Dependencies:** None

- [x] **0A.1** Move `KNOWN_TRACKERS` to `types.ts` as single source or truth
  - Remove duplicate from `outbound-guard.ts` and `content-analyzer.ts`
  - Both modules import from `types.ts`
- [x] **0A.2** Move `URL_LIST_SAFE_DOMAINS` to `types.ts` as single source or truth
  - Remove duplicate from `network-shield.ts` and `blocklists/updater.ts`
  - Both modules import from `types.ts`

---

## Phase 0-B: Wire Cookie Count + Correlation Trigger + Blocklist Scheduling
**Priority:** HIGH | **Effort:** Half day | **Dependencies:** Phase 0-A

- [x] **0B.1** Wire `cookie_count` in EvolutionEngine
  - Count Set-Cookie headers in Guardian's `analyzeResponseHeaders()`
  - Pass count via SecurityManager to `onPageLoaded()`
  - EvolutionEngine receives real cookie count instead or hardcoded 0
- [x] **0B.2** Auto-trigger `ThreatIntel.correlateEvents()`
  - Add event counter in SecurityManager
  - After every 100 events OR every hour: trigger `correlateEvents()`
  - Log results and notify Gatekeeper if anomalies found
- [x] **0B.3** Blocklist update scheduling
  - Add `setInterval` in SecurityManager for 24-hour `BlocklistUpdater.updateAll()` cycle
  - Store `lastUpdated` timestamp in security-db (new `blocklist_metadata` table)
  - On app start: check if last update >24 hours ago, trigger immediately if so

---

## Phase 1: Shannon Entropy Check + MIME Whitelist
**Priority:** HIGH | **Effort:** ~2 hours | **Dependencies:** None (parallel with Phase 0)

- [x] **1.1** Implement Shannon entropy function
  - Utility function in `script-guard.ts`
  - Calculates Shannon entropy over string input (0-8 bits)
- [x] **1.2** Integrate entropy check in ScriptGuard
  - On `Debugger.scriptParsed` events, retrieve source via CDP
  - Calculate entropy, flag scripts with entropy > 6.0 AND length > 1000
  - Log as security event with category 'obfuscation'
- [x] **1.3** Trusted Content-Type whitelist in OutboundGuard
  - New `TRUSTED_OUTBOUND_CONTENT_TYPES` Set
  - Early return in `analyzeOutbound()` for trusted types
  - NOT for application/json or x-www-form-urlencoded

---

## Phase 2-A: ThreatRule Interface + Rule Set Definition
**Priority:** HIGH | **Effort:** ~1 hour | **Dependencies:** Phase 0-A (types.ts cleanup)

- [x] **2A.1** Define `ThreatRule`, `ThreatRuleMatch`, `ScriptAnalysisResult` interfaces in `types.ts`
- [x] **2A.2** Define `JS_THREAT_RULES` array with 25 rules
  - Obfuscation rules (eval, fromCharCode, atob, hex/unicode escape, etc.)
  - Exfiltration rules (cookie + fetch proximity, localStorage send, credential harvest)
  - Injection rules (innerHTML, document.write, dynamic script/iframe, ActiveX)
  - Redirect rules (location.href, meta refresh injection, window.open data:)

---

## Phase 2-B: Rule Engine + CDP Integration + Event Logging
**Priority:** HIGH | **Effort:** ~2 hours | **Dependencies:** Phase 2-A

- [x] **2B.1** Implement `analyzeScriptContent()` function in ScriptGuard
  - Run all rules, accumulate scores
  - Threshold-based severity determination
- [x] **2B.2** Wire into `Debugger.scriptParsed` handler
  - Retrieve source via `Debugger.getScriptSource()`
  - Respect `MAX_SCRIPT_SIZE` limit (500KB)
- [x] **2B.3** Event logging for rule matches
  - Log matches as security events in DB
  - Notify Gatekeeper for critical severity
- [x] **2B.4** Integration with entropy check (if Phase 1 completed)
  - Run both on same source (avoid duplicate CDP call)
  - Boost score by 25% when both entropy + rules match

---

## Phase 3-A: Cross-Domain Script Correlation (DB + Logic)
**Priority:** HIGH | **Effort:** ~1.5 hours | **Dependencies:** Phase 0-A, Phase 2-B

- [x] **3A.1** Add DB index on `script_fingerprints.hash`
- [x] **3A.2** Add prepared statements (`getDomainsForHash`, `getDomainCountForHash`)
- [x] **3A.3** Cross-domain correlation logic in ScriptGuard
  - Check if hash appears on blocked domains → critical event
  - Check if hash on 5+ domains → widespread script event
- [x] **3A.4** Blocklist access for cross-referencing
  - Ensure ScriptGuard can check if a domain is blocked

---

## Phase 3-B: Normalized Hashing + API Endpoint
**Priority:** MEDIUM | **Effort:** ~1.5 hours | **Dependencies:** Phase 3-A

- [x] **3B.1** Implement `normalizeScriptSource()` (strip comments, collapse whitespace)
- [x] **3B.2** Add `normalized_hash` column to `script_fingerprints`
- [x] **3B.3** Store both original and normalized hash
- [x] **3B.4** Add `GET /security/scripts/correlations` API endpoint
  - Return widespread scripts with domain lists and blocked domain flags

---

## Phase 4: CyberChef Regex Patterns Integration
**Priority:** MEDIUM | **Effort:** ~2 hours | **Dependencies:** Phase 2-B, Phase 0-A

- [x] **4.1** Add extraction regex constants to `types.ts`
  - URL_REGEX, DOMAIN_REGEX, IPV4_REGEX, IPV4_OCTAL_REGEX, EMAIL_REGEX
- [x] **4.2** Add deep page source scanning in ContentAnalyzer
  - Extract URLs, IPs, domains from page source (post-load)
  - Cross-reference against blocklist
  - Detect octal IP evasion technique
- [x] **4.3** Inline script content scanning
  - Extract and scan `<script>` tag contents separately
  - Find hidden URLs/IPs in obfuscated code

---

## Phase 5-A: Confidence Type System + DB Layer
**Priority:** MEDIUM | **Effort:** ~1 hour | **Dependencies:** Phase 0-A, Phase 0-B

- [x] **5A.1** Define `AnalysisConfidence` enum in `types.ts`
  - BLOCKLIST=100, CREDENTIAL_EXFIL=200, KNOWN_MALWARE_HASH=300
  - BEHAVIORAL=500, HEURISTIC=700, ANOMALY=800, SPECULATIVE=900
- [x] **5A.2** Add `confidence?: number` to SecurityEvent interface
- [x] **5A.3** Add `confidence` column to events table (default 500)
- [x] **5A.4** Update `logEvent()` to accept and store confidence

---

## Phase 5-B: Confidence Wiring — Guardian + OutboundGuard + ScriptGuard
**Priority:** MEDIUM | **Effort:** ~1.5 hours | **Dependencies:** Phase 5-A

- [x] **5B.1** Add confidence to all `logEvent()` calls in Guardian
  - Blocklist match → 100, untrusted domain → 900, suspicious redirect → 700
- [x] **5B.2** Add confidence to all `logEvent()` calls in OutboundGuard
  - Credential exfil → 200, suspicious data → 700, tracker data → 500
- [x] **5B.3** Add confidence to all `logEvent()` calls in ScriptGuard
  - Blocked domain hash → 300, rule critical → 700, high entropy → 800, new script → 900

---

## Phase 5-C: Remaining Modules + Gatekeeper Routing + Evolution Weighting
**Priority:** MEDIUM | **Effort:** ~2 hours | **Dependencies:** Phase 5-B

- [x] **5C.1** Add confidence to ContentAnalyzer events
- [x] **5C.2** Add confidence to BehaviorMonitor events
- [x] **5C.3** Add confidence to NetworkShield events (N/A — no logEvent calls)
- [x] **5C.4** Confidence-based Gatekeeper routing
  - <=300: resolve locally (block/allow), don't send to AI agent
  - 301-600: send with medium priority
  - >600: send with high priority (needs AI judgment)
- [x] **5C.5** Confidence-weighted trust evolution
  - Confidence <=300: full trust impact
  - Confidence 301-600: 70% trust impact
  - Confidence >600: 40% trust impact

---

## Phase 6-A: Acorn Parser + AST Hash Algorithm
**Priority:** LOW-MEDIUM | **Effort:** ~2 hours | **Dependencies:** Phase 3-A

- [x] **6A.1** Install Acorn parser (`npm install acorn`)
- [x] **6A.2** Add `ast_hash` column to `script_fingerprints`
- [x] **6A.3** Implement AST parsing utility (`parseToAST()`)
- [x] **6A.4** Implement iterative AST hash algorithm
  - Hash node type + operator + arity, ignore variable names and constants
  - Produces obfuscation-resistant fingerprint
- [x] **6A.5** Wire into fingerprinting flow
  - Parse scripts < 200KB, store `ast_hash` alongside other hashes
  - Degrade gracefully on syntax errors

---

## Phase 6-B: Similarity Matching + DB Integration
**Priority:** LOW-MEDIUM | **Effort:** ~1.5 hours | **Dependencies:** Phase 6-A

- [x] **6B.1** Add AST-based prepared statements (`getDomainsForASTHash`, `getASTMatches`)
- [x] **6B.2** Cross-domain AST correlation
  - Same AST hash on blocked domain → critical event
  - 3+ domains with same AST hash but different regular hash → obfuscation variant detected
- [x] **6B.3** Similarity scoring (cosine similarity on AST feature vectors)
  - >0.85 = structurally similar, >0.95 = structurally identical
  - Only run for flagged scripts (performance)
- [x] **6B.4** Extend `GET /security/scripts/correlations` with AST match data

---

## Phase 7-A: Plugin Interface + AnalyzerManager + Example Plugin
**Priority:** LOW | **Effort:** ~2 hours | **Dependencies:** Phase 5 complete

- [x] **7A.1** Define `SecurityAnalyzer` and `AnalyzerContext` interfaces in `types.ts`
- [x] **7A.2** Implement `AnalyzerManager` class
  - Register, priority-sort, route events, catch crashes, destroy
- [x] **7A.3** Create EventBurstAnalyzer example plugin
  - Detects rapid event bursts from single domain (10+ in 60s)
- [x] **7A.4** Wire AnalyzerManager into SecurityManager
  - Build AnalyzerContext, register example, route events, add status endpoint

---

## Phase 7-B: ContentAnalyzer Migration to Plugin Interface
**Priority:** LOW | **Effort:** ~1.5 hours | **Dependencies:** Phase 7-A

- [x] **7B.1** Create `ContentAnalyzerPlugin` wrapper
  - Implements SecurityAnalyzer, delegates to existing ContentAnalyzer
- [x] **7B.2** Register in AnalyzerManager, replace direct calls
- [x] **7B.3** Verify backward compatibility (all existing features still work)

---

## Phase 7-C: BehaviorMonitor Migration to Plugin Interface
**Priority:** LOW | **Effort:** ~1.5 hours | **Dependencies:** Phase 7-B

- [x] **7C.1** Create `BehaviorMonitorPlugin` wrapper
  - Implements SecurityAnalyzer, delegates to existing BehaviorMonitor
  - Keep Electron permission handlers as direct registrations
- [x] **7C.2** Register in AnalyzerManager, replace direct calls
- [x] **7C.3** Verify all 3 plugins work together (example + content + behavior)
- [x] **7C.4** Document plugin architecture (inline docs in analyzer-manager.ts)

---

## Phase 8: Post-Review Fix Round
**Priority:** HIGH | **Effort:** ~1 hour | **Dependencies:** All phases complete

- [x] **8.1** [CRITICAL] Wire `sendEvent()` in SecurityManager `onEventLogged` callback
- [x] **8.2** [IMPORTANT] Compute `script_hash` from source in `analyzeExternalScript()`
- [x] **8.3** [IMPORTANT] Add `logEvent()` calls for tracker/iframe/mixed-content detections
- [x] **8.4** [IMPORTANT] Remove `@types/acorn` from devDependencies
- [x] **8.5** [IMPORTANT] Relax similarity candidate pool (not just blocked domains)
- [x] **8.6** [MINOR] Filter `debugger://` URLs in ScriptGuard
- [x] **8.7** [MINOR] Add `IPV4_REGEX` scan to `deepScanPageSource()`
- [x] **8.8** [MINOR] Fix WebSocket flag confidence (BEHAVIORAL → HEURISTIC)
- [x] **8.9** [MINOR] Document MIME whitelist Electron API limitation

---

## Progress Summary

| Phase | Name | Status | Progress |
|-------|------|--------|----------|
| 0-A | Deduplicate Constants | DONE | 2/2 |
| 0-B | Cookie Count + Correlation + Scheduling | DONE | 3/3 |
| 1 | Entropy + MIME Whitelist | DONE | 3/3 |
| 2-A | ThreatRule Interface + Rules | DONE | 2/2 |
| 2-B | Rule Engine + CDP | DONE | 4/4 |
| 3-A | Cross-Domain Correlation DB | DONE | 4/4 |
| 3-B | Normalized Hash + API | DONE | 4/4 |
| 4 | CyberChef Regex Patterns | DONE | 3/3 |
| 5-A | Confidence Types + DB | DONE | 4/4 |
| 5-B | Confidence in Core Modules | DONE | 3/3 |
| 5-C | Confidence Routing + Evolution | DONE | 5/5 |
| 6-A | Acorn + AST Hash | DONE | 5/5 |
| 6-B | Similarity Matching | DONE | 4/4 |
| 7-A | Plugin Interface + Manager | DONE | 4/4 |
| 7-B | ContentAnalyzer Migration | DONE | 3/3 |
| 7-C | BehaviorMonitor Migration | DONE | 4/4 |
| 8 | Post-Review Fixes | DONE | 9/9 |
| 9 | Test Coverage, Type Cleanup + CDP | DONE | 5/5 |

**Total:** 71/71 tasks completed (66 original + 9 Phase 8 fixes - 4 counted in original)
