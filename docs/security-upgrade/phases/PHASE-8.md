# Phase 8: Post-Review Fix Round

> **Priority:** HIGH | **Effort:** ~1 hour | **Dependencies:** All phases complete (0-A through 7-C)

## Goal
Fix all issues found during the implementation review (documented in `docs/security-upgrade/REVIEW.md`). This phase addresses 1 critical gap, 5 important issues, and 4 minor deviations. No new features — only corrections to existing code.

## Files to Read
- `docs/security-upgrade/REVIEW.md` — full review report with all findings
- `src/security/gatekeeper-ws.ts` — `sendEvent()` method (dead code issue)
- `src/security/security-manager.ts` — `onEventLogged` callback, `onPageLoaded()`
- `src/security/script-guard.ts` — `analyzeScript()`, `analyzeExternalScript()`, `runSimilarityCheck()`
- `src/security/content-analyzer.ts` — `analyzePage()`, tracker/iframe/mixed-content detection
- `src/security/outbound-guard.ts` — MIME whitelist (for documentation only)
- `src/security/guardian.ts` — WebSocket flag confidence value
- `package.json` — `@types/acorn` entry

## Files to Modify
- `src/security/security-manager.ts`
- `src/security/script-guard.ts`
- `src/security/content-analyzer.ts`
- `src/security/guardian.ts`
- `package.json`

## Tasks

### 8.1 [CRITICAL] Wire `sendEvent()` in SecurityManager

**Problem:** `GatekeeperWS.sendEvent()` implements confidence-based event routing (Phase 5-C) but is never called from anywhere. The entire confidence routing feature has zero effect.

**Fix:** In `security-manager.ts`, inside the `db.onEventLogged` callback, add a call to `sendEvent()` BEFORE the analyzer routing:

```typescript
this.db.onEventLogged = (event) => {
  // Phase 0-B: correlation trigger
  this.eventCounter++;
  if (this.eventCounter >= 100) {
    this.eventCounter = 0;
    this.runCorrelation();
  }

  // Phase 5-C: Confidence-based Gatekeeper routing
  // sendEvent() handles the confidence check internally:
  // <=300 returns early, 301-600 medium priority, >600 high priority
  this.gatekeeperWs?.sendEvent(event);

  // Phase 7-A: Analyzer plugin routing
  if (this.analyzerCascadeLogging) return;
  // ... rest of analyzer routing unchanged ...
};
```

**Important:** Place the `sendEvent()` call BEFORE the `analyzerCascadeLogging` check so that ALL events (including cascade events from analyzers) are considered for Gatekeeper routing. The `sendEvent()` method already does its own confidence filtering internally.

**Verification:** After this fix, browse to a site that triggers security events. Check that events with confidence > 300 appear in the Gatekeeper WebSocket stream (if an AI agent is connected). Events with confidence <= 300 should NOT appear.

---

### 8.2 [IMPORTANT] Compute `script_hash` from source in `analyzeExternalScript()`

**Problem:** Cross-domain hash correlation (Phase 3-A) depends on the `hash` field from CDP's `Debugger.scriptParsed` event. This field is unreliable — V8 only provides it under certain conditions. When absent, `script_hash` stays NULL in the DB and the script is invisible to cross-domain correlation queries.

**Fix:** In `script-guard.ts`, inside `analyzeExternalScript()`, after fetching the source via CDP, compute the script hash from source and update the DB:

```typescript
// After fetching source via Debugger.getScriptSource:
import { createHash } from 'crypto';  // already imported for normalized hash

// Compute original hash from actual source (reliable, unlike CDP event param)
const sourceHash = createHash('sha256').update(source).digest('hex');

// Update script_hash in DB if it was NULL (CDP didn't provide it)
this.db.updateScriptHash?.(domain, url, sourceHash);

// Run cross-domain correlation with the reliable hash
this.correlateScriptHash(sourceHash, domain, url, 'original');
```

Add a new prepared statement and method in `security-db.ts`:
```typescript
// Update script_hash when CDP didn't provide one
stmtUpdateScriptHash: db.prepare(
  'UPDATE script_fingerprints SET script_hash = ? WHERE domain = ? AND url = ? AND script_hash IS NULL'
)

updateScriptHash(domain: string, url: string, hash: string): void {
  this.stmtUpdateScriptHash.run(hash, domain, url);
}
```

Also remove or guard the existing `correlateScriptHash(hash, domain, url)` call in `analyzeScript()` (line ~286) — it's unreliable since `hash` comes from the CDP event. The reliable correlation now happens in `analyzeExternalScript()`. Keep the call but only if `hash` is truthy and non-empty, as a fast-path for scripts where CDP does provide a hash (avoids waiting for the async source fetch).

---

### 8.3 [IMPORTANT] Add `logEvent()` calls for tracker, iframe, and mixed-content detections

**Problem:** ContentAnalyzer detects trackers, hidden iframes, and mixed content in `analyzePage()`, but only stores results in the `PageAnalysis` return object. These detections never reach `db.logEvent()`, making them invisible to the event pipeline, Gatekeeper, trust evolution, and the analyzer plugin system.

**Fix:** In `content-analyzer.ts`, add `logEvent()` calls at the appropriate detection points:

**Hidden iframes** (after the hidden iframe check loop):
```typescript
if (analysis.hiddenElements.length > 0) {
  this.db.logEvent({
    domain,
    tabId: null,
    eventType: 'hidden-iframe',
    severity: 'medium',
    category: 'content',
    details: JSON.stringify({
      count: analysis.hiddenElements.length,
      sources: analysis.hiddenElements.slice(0, 5).map(el => el.src || el.id)
    }),
    actionTaken: 'logged',
    confidence: AnalysisConfidence.HEURISTIC,  // 700
  });
}
```

**Mixed content** (after the mixed content check):
```typescript
if (analysis.mixedContent) {
  this.db.logEvent({
    domain,
    tabId: null,
    eventType: 'mixed-content',
    severity: 'medium',
    category: 'content',
    details: JSON.stringify({ mixedContent: true }),
    actionTaken: 'logged',
    confidence: AnalysisConfidence.HEURISTIC,  // 700
  });
}
```

**Trackers found** (after the tracker detection loop, only if trackers were found):
```typescript
if (analysis.trackers.length > 0) {
  this.db.logEvent({
    domain,
    tabId: null,
    eventType: 'trackers-detected',
    severity: 'low',
    category: 'content',
    details: JSON.stringify({
      count: analysis.trackers.length,
      trackers: analysis.trackers.slice(0, 10)
    }),
    actionTaken: 'logged',
    confidence: AnalysisConfidence.BEHAVIORAL,  // 500
  });
}
```

**Important:** Read the actual code structure first. The detection loops produce data in the `analysis` object. Add `logEvent()` AFTER each detection block, not inside the loop (to avoid logging one event per tracker — log a single summary event instead).

---

### 8.4 [IMPORTANT] Remove `@types/acorn` from devDependencies

**Problem:** `@types/acorn@4.0.6` provides TypeScript types for acorn v4. The project uses `acorn@^8.16.0` which ships its own TypeScript declarations. Having both can cause type conflicts.

**Fix:**
```bash
npm uninstall @types/acorn
```

Verify that TypeScript still compiles cleanly after removal (`npx tsc --noEmit`). Acorn v8's bundled types at `acorn/dist/acorn.d.ts` should be picked up automatically.

---

### 8.5 [IMPORTANT] Relax similarity candidate pool in `runSimilarityCheck()`

**Problem:** `runSimilarityCheck()` in `script-guard.ts` only compares against scripts from blocked domains. The spec intended comparing against ALL cross-domain scripts (with blocked domains getting critical severity, non-blocked getting medium). This restriction means malware campaigns spreading across unblocked domains are missed entirely.

**Fix:** In `runSimilarityCheck()`, remove the blocked-domain filter from the candidate loop. Instead, use blocked-domain status to determine severity:

```typescript
// BEFORE (too restrictive):
if (!this.isDomainBlocked || !this.isDomainBlocked(candidate.domain)) continue;

// AFTER (compare all, severity varies):
const isBlocked = this.isDomainBlocked?.(candidate.domain) ?? false;
```

Then in the similarity match handling:
- If `similarity >= 0.95` AND `isBlocked`: critical severity, notify Gatekeeper
- If `similarity >= 0.95` AND NOT blocked: medium severity (structural clone on non-blocked domain)
- If `similarity >= 0.85` AND `isBlocked`: high severity
- If `similarity >= 0.85` AND NOT blocked: low severity (informational)

Keep the performance gate (only run for flagged scripts with threat rules or high entropy) — that's correct.

Also keep the candidate limit (cap at 200) — that's a good performance safeguard.

---

### 8.6 [MINOR] Filter `debugger://` URLs in ScriptGuard

**Problem:** `analyzeScript()` in `script-guard.ts` filters `chrome-extension://` and `devtools://` URLs but not `debugger://` URLs. CDP-internal scripts with this prefix may pass through to fingerprinting.

**Fix:** Add `debugger://` to the URL filter at the start of `analyzeScript()`:

```typescript
// BEFORE:
if (!url || url.startsWith('chrome-extension://') || url.startsWith('devtools://')) return;

// AFTER:
if (!url || url.startsWith('chrome-extension://') || url.startsWith('devtools://') || url.startsWith('debugger://')) return;
```

---

### 8.7 [MINOR] Add `IPV4_REGEX` scan to `deepScanPageSource()`

**Problem:** The deep page scan in `content-analyzer.ts` uses `URL_REGEX`, `DOMAIN_REGEX`, and `IPV4_OCTAL_REGEX` but skips `IPV4_REGEX`. Bare decimal IP addresses embedded in page source (not as part of URLs) are not extracted.

**Fix:** Import `IPV4_REGEX` from `types.ts` and add a scan step in `scanSourceForThreats()`:

```typescript
// Extract and check bare IPv4 addresses
const ipv4Matches = source.matchAll(IPV4_REGEX);
for (const match of ipv4Matches) {
  const ip = match[0];
  // Skip common non-suspicious IPs (localhost, private ranges)
  if (ip.startsWith('127.') || ip.startsWith('10.') || ip.startsWith('192.168.') || ip.startsWith('0.')) continue;
  // Check if this IP appears in any blocked URL
  if (this.isDomainBlocked?.(ip)) {
    this.db.logEvent({
      domain,
      tabId: null,
      eventType: 'hidden-blocked-ip',
      severity: 'high',
      category: 'content',
      details: JSON.stringify({ ip, context: source.substring(Math.max(0, match.index! - 50), match.index! + ip.length + 50) }),
      actionTaken: 'logged',
      confidence: AnalysisConfidence.BLOCKLIST,  // 100
    });
  }
}
```

**Note:** Skip private/localhost ranges to avoid noise. Only flag IPs that match the blocklist.

---

### 8.8 [MINOR] Fix WebSocket flag confidence value

**Problem:** In `guardian.ts`, when `outboundGuard.analyzeWebSocket()` returns `flag` (for `unknown-ws-endpoint`), the event is logged with `BEHAVIORAL` (500). Per the spec, "suspicious outbound data" should use `HEURISTIC` (700).

**Fix:** Find the WebSocket flag `logEvent()` call in `guardian.ts` and change the confidence:

```typescript
// BEFORE:
confidence: AnalysisConfidence.BEHAVIORAL,

// AFTER:
confidence: AnalysisConfidence.HEURISTIC,
```

---

### 8.9 [MINOR] Document MIME whitelist limitation

**Problem:** The MIME whitelist in `outbound-guard.ts` extracts Content-Type from multipart form-data body bytes instead of the HTTP request header. This is an Electron API constraint (`onBeforeRequest` doesn't expose request headers). Non-multipart binary POSTs are missed.

**Fix:** Add a documentation comment above the MIME whitelist check in `outbound-guard.ts`:

```typescript
// Content-Type whitelist for known-safe media types.
// NOTE: Electron's onBeforeRequest does not expose request headers, so we extract
// Content-Type from multipart form-data body bytes. This means non-multipart binary
// POSTs (e.g., raw image PUT) will not match and their body will still be scanned.
// This is a known limitation of the Electron webRequest API.
```

No logic change needed — the existing behavior is the best available given the API constraint.

---

## Verification

After all fixes:
- [ ] `npx tsc --noEmit` — 0 errors
- [ ] `sendEvent()` is called from `onEventLogged` in SecurityManager
- [ ] Events with confidence > 300 reach Gatekeeper (if connected)
- [ ] Events with confidence <= 300 do NOT reach Gatekeeper
- [ ] `script_hash` is reliably computed from source for external scripts
- [ ] Cross-domain correlation works for scripts where CDP didn't provide a hash
- [ ] Tracker detection produces `trackers-detected` events in the DB
- [ ] Hidden iframe detection produces `hidden-iframe` events in the DB
- [ ] Mixed content detection produces `mixed-content` events in the DB
- [ ] `@types/acorn` is removed from package.json
- [ ] TypeScript still compiles after `@types/acorn` removal
- [ ] Similarity matching compares against all cross-domain scripts (not just blocked)
- [ ] `debugger://` URLs are filtered in ScriptGuard
- [ ] IPv4 addresses in page source are checked against blocklist
- [ ] WebSocket flag events use HEURISTIC (700) confidence
- [ ] MIME whitelist has documentation comment about Electron limitation
- [ ] App launches with `npm start`, browsing works
- [ ] All regression endpoints: /security/status, /security/outbound/stats, /security/gatekeeper/status, /security/page/analysis, /security/scripts/correlations, /security/analyzers/status

## Scope
- ONLY fix the issues listed above — no new features
- Do NOT change the AnalyzerManager re-entrancy guard (the `this.routing` flag) — it is correct as-is (prevents infinite loops when plugins log events during analysis)
- Do NOT change how `correlateEvents()` is called (default 1-hour window is correct)
- Do NOT change OutboundGuard's MIME whitelist logic (Electron API constraint — just add the doc comment)
- Keep all existing tests/verification passing

## After Completion
1. Update `docs/security-upgrade/STATUS.md` — add Phase 8 section
2. Update `docs/security-upgrade/ROADMAP.md` — add Phase 8 section
3. Update `docs/security-upgrade/REVIEW.md` — mark issues as resolved
