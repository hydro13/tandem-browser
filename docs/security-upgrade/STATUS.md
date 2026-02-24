# Security Upgrade — Implementation Status

> This file tracks progress across Claude Code sessions. Each phase updates its section after completion.
> **Read this file FIRST** when starting a new session.

## Current State

**Next phase to implement:** Phase 0-B
**Last completed phase:** Phase 0-A
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

- **Status:** PENDING
- **Date:** —
- **Commit:** —
- **Verification:**
  - [ ] `npx tsc --noEmit` — 0 errors
  - [ ] `cookie_count` in EvolutionEngine receives real values (not hardcoded 0)
  - [ ] `correlateEvents()` triggered automatically (per 100 events or hourly)
  - [ ] Blocklist update runs on 24-hour schedule
  - [ ] `lastUpdated` timestamp persisted in DB
  - [ ] App launches, browsing works
- **Issues encountered:** —
- **Notes for next phase:** —

---

## Phase 1: Shannon Entropy Check + MIME Whitelist

- **Status:** PENDING
- **Date:** —
- **Commit:** —
- **Verification:**
  - [ ] `npx tsc --noEmit` — 0 errors
  - [ ] Entropy function returns correct values (~0 for "aaaa", ~7+ for random data)
  - [ ] High-entropy external scripts (>6.0, >1000 chars) generate security events
  - [ ] Trusted Content-Type whitelist skips body scan for media uploads
  - [ ] `application/json` and `x-www-form-urlencoded` are still scanned
  - [ ] Normal form submissions still trigger credential scanning
  - [ ] App launches, browsing works
- **Issues encountered:** —
- **Notes for next phase:** —

---

## Phase 2-A: ThreatRule Interface + Rule Set Definition

- **Status:** PENDING
- **Date:** —
- **Commit:** —
- **Verification:**
  - [ ] `npx tsc --noEmit` — 0 errors
  - [ ] `ThreatRule`, `ThreatRuleMatch`, `ScriptAnalysisResult` interfaces exported
  - [ ] `JS_THREAT_RULES` array exported with 25 rules
  - [ ] All regex patterns compile without errors
  - [ ] App still starts (no runtime errors)
- **Issues encountered:** —
- **Notes for next phase:** —

---

## Phase 2-B: Rule Engine + CDP Integration + Event Logging

- **Status:** PENDING
- **Date:** —
- **Commit:** —
- **Verification:**
  - [ ] `npx tsc --noEmit` — 0 errors
  - [ ] `analyzeScriptContent()` function exists and works
  - [ ] Script source retrieved via `Debugger.getScriptSource()`
  - [ ] Rule matches logged as security events with type `script-analysis`
  - [ ] Critical severity events notify Gatekeeper
  - [ ] Scripts > 500KB skipped
  - [ ] CDP errors caught gracefully
  - [ ] App launches, browsing works
- **Issues encountered:** —
- **Notes for next phase:** —

---

## Phase 3-A: Cross-Domain Script Correlation (DB + Logic)

- **Status:** PENDING
- **Date:** —
- **Commit:** —
- **Verification:**
  - [ ] `npx tsc --noEmit` — 0 errors
  - [ ] Index on `script_fingerprints.hash` exists
  - [ ] `getDomainsForHash()` prepared statement works
  - [ ] Script on blocked domain generates `script-on-blocked-domain` event
  - [ ] Script on 5+ domains generates `widespread-script` event
  - [ ] App launches, browsing works
- **Issues encountered:** —
- **Notes for next phase:** —

---

## Phase 3-B: Normalized Hashing + API Endpoint

- **Status:** PENDING
- **Date:** —
- **Commit:** —
- **Verification:**
  - [ ] `npx tsc --noEmit` — 0 errors
  - [ ] `normalized_hash` column exists in `script_fingerprints`
  - [ ] Scripts differing only in comments/whitespace produce same normalized hash
  - [ ] `GET /security/scripts/correlations` returns valid JSON
  - [ ] App launches, browsing works
- **Issues encountered:** —
- **Notes for next phase:** —

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
*(to be filled after completion)*

### Phase 1
*(to be filled after completion)*

### Phase 2-A
*(to be filled after completion)*

### Phase 2-B
*(to be filled after completion)*

### Phase 3-A
*(to be filled after completion)*

### Phase 3-B
*(to be filled after completion)*

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
