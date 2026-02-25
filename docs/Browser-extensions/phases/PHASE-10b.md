# Phase 10b: DNR Reconciliation Layer

> **Priority:** MEDIUM | **Effort:** ~1 day | **Dependencies:** Phase 1 (DNR test results), Phase 10a

## Goal

Build an active reconciliation layer that measures and compensates for the telemetry gap caused by DNR-based extensions (ad blockers). Instead of only _warning_ about the conflict, this phase actively _measures_ what Guardian misses and fills the gaps in SecurityDB.

This phase is **only needed if Phase 1's empirical DNR test confirmed that Guardian's `onBeforeRequest` misses requests blocked by DNR rules.** If Guardian still sees all requests despite DNR rules, this phase can be skipped — update STATUS.md accordingly.

## Background

### The Problem (confirmed by Phase 1 testing)

When an extension like uBlock Origin installs `declarativeNetRequest` rules, Chromium's network stack processes these rules at a lower level than the `webRequest` API. This means:

1. Extension DNR blocks request to `tracking.example.com`
2. Guardian's `onBeforeRequest` (via RequestDispatcher) **never fires** for that request
3. SecurityDB has no record of the request → EvolutionEngine baseline is incomplete
4. The user has _less_ security visibility, not more

### The Solution: Reconciliation

Instead of fighting the DNR system (which would break extensions), we build a layer that:

1. **Knows what DNR rules are installed** — read the extension's DNR rule files
2. **Observes what Guardian actually sees** — count requests per domain
3. **Infers what was blocked by DNR** — cross-reference the two
4. **Logs synthetic events** — fill SecurityDB with "blocked by extension DNR" entries

This gives complete telemetry without interfering with extension functionality.

## Files to Read

- `src/network/dispatcher.ts` — RequestDispatcher, understand consumer registration and flow
- `src/security/guardian.ts` — Guardian, understand how it logs events
- `src/security/security-db.ts` — SecurityDB event logging
- `src/security/network-shield.ts` — NetworkShield blocklist (811K domains)
- `src/extensions/conflict-detector.ts` — conflict detection from Phase 10a
- `docs/Browser-extensions/STATUS.md` — Phase 1 DNR test results (critical input)

## Files to Create

- `src/extensions/dnr-reconciler.ts` — DNR rule reading + telemetry reconciliation

## Files to Modify

- `src/extensions/manager.ts` — integrate reconciler on extension load
- `src/main.ts` — wire reconciler into the startup flow
- `src/api/server.ts` — add reconciliation status endpoint

## Tasks

### 10b.1 DNR Rule Reader

Create the ability to read what an extension's DNR rules block:

**Read static DNR rules from extension manifest:**

```typescript
interface DnrRuleSummary {
  extensionId: string;
  extensionName: string;
  ruleCount: number;
  blockedDomains: Set<string>;    // Domains targeted by block rules
  redirectDomains: Set<string>;   // Domains targeted by redirect rules
  ruleFiles: string[];            // Paths to rule JSON files
}
```

**How to read DNR rules:**

1. Check `manifest.json` for `declarative_net_request.rule_resources`
2. Each entry has a `path` field pointing to a JSON file with rules
3. Parse each rule file — rules are `{ id, priority, action: { type }, condition: { urlFilter, domains, ... } }`
4. Extract domains from `condition.urlFilter` patterns and `condition.requestDomains`
5. Rules with `action.type: "block"` are the ones that hide traffic from Guardian

**Example rule format:**
```json
{
  "id": 1,
  "priority": 1,
  "action": { "type": "block" },
  "condition": {
    "urlFilter": "||tracking.example.com^",
    "resourceTypes": ["script", "image", "xmlhttprequest"]
  }
}
```

**Note:** uBlock Origin alone can have 300,000+ rules. The rule reader should be efficient — build a domain-level summary, don't store every individual rule in memory.

### 10b.2 Telemetry Gap Measurement

Build a monitoring layer that detects when DNR blocks traffic that Guardian would have seen:

**Approach: Sampling via `chrome.declarativeNetRequest.getMatchedRules()`**

Electron (Chromium 130) exposes `chrome.declarativeNetRequest.getMatchedRules()` which returns recently matched rules. However, this API is only available within extension contexts, not from the main process.

**Alternative approach: Network delta analysis**

1. **Register a `completedConsumer`** in RequestDispatcher (low priority, runs last)
2. Track which domains Guardian _actually_ processed in a time window (e.g., per page load)
3. After page load completes, compare against the loaded extension's DNR domain list
4. Domains in the DNR block list that _never_ appeared in Guardian's traffic → likely blocked by DNR
5. Log synthetic events: `{ type: 'dnr-blocked', domain, extensionId, confidence: 'inferred' }`

**Important:** This is _inference_, not certainty. A domain might not appear because the page simply didn't request it. To improve confidence:
- Only flag domains that are commonly seen on similar pages (use EvolutionEngine baselines)
- Track domain patterns across multiple page loads before flagging
- Mark all synthetic events with `confidence: 'inferred'` so they're distinguishable from direct observations

### 10b.3 Synthetic Event Logging

When the reconciler infers that DNR blocked a request:

```typescript
interface DnrBlockEvent {
  timestamp: number;
  domain: string;
  extensionId: string;
  extensionName: string;
  confidence: 'inferred' | 'confirmed';
  sourceUrl: string;  // The page that would have made the request
}
```

Log to SecurityDB with a distinct event type (`'dnr-extension-block'`) so:
- EvolutionEngine can include these in baseline calculations
- ThreatIntel can correlate across sessions
- The security dashboard shows complete telemetry
- Events are clearly labeled as extension-originated, not Guardian-originated

### 10b.4 NetworkShield Overlap Analysis

Many domains in extensions' DNR lists overlap with NetworkShield's 811K blocklist. Quantify this overlap:

```typescript
interface OverlapAnalysis {
  extensionId: string;
  extensionRuleCount: number;
  networkShieldOverlap: number;  // Rules that block domains also in NetworkShield
  extensionOnlyRules: number;    // Rules blocking domains NOT in NetworkShield
  overlapPercentage: number;
}
```

This analysis helps users understand:
- "uBlock Origin blocks 50,000 domains that NetworkShield also blocks — these are redundant"
- "uBlock Origin blocks 250,000 domains that NetworkShield doesn't — these are ad-related, not security threats"

Expose via API endpoint for transparency.

### 10b.5 Wire into Startup

In `main.ts`:

1. After extensions are loaded (`extensionManager.init()`), initialize the DNR reconciler
2. The reconciler reads DNR rules from all loaded extensions with `declarativeNetRequest`
3. Register the reconciler as a `completedConsumer` in RequestDispatcher (priority 100 — runs last, after all security consumers)
4. The reconciler runs passively — it does NOT modify or block any requests, only observes

### 10b.6 API Endpoints

**`GET /extensions/dnr/status`**

```typescript
// Returns: {
//   active: boolean,                    // Is reconciler running?
//   extensions: DnrRuleSummary[],       // DNR extensions detected
//   inferredBlocks: number,             // Total inferred DNR blocks since startup
//   overlapAnalysis: OverlapAnalysis[], // Per-extension NetworkShield overlap
// }
```

**`GET /extensions/dnr/events`**

```typescript
// Query: ?limit=100&domain=tracking.example.com
// Returns: DnrBlockEvent[]
```

## Verification

- [ ] `npx tsc --noEmit` — 0 errors
- [ ] DNR rule reader parses uBlock Origin's rule files correctly
- [ ] DNR rule reader handles large rulesets (300K+ rules) without excessive memory
- [ ] Domain extraction from `urlFilter` patterns works (e.g., `||example.com^` → `example.com`)
- [ ] Reconciler registers as a `completedConsumer` in RequestDispatcher
- [ ] Synthetic events logged to SecurityDB with `type: 'dnr-extension-block'`
- [ ] All synthetic events marked with `confidence: 'inferred'`
- [ ] NetworkShield overlap analysis produces meaningful numbers
- [ ] `GET /extensions/dnr/status` returns reconciler status and overlap analysis
- [ ] `GET /extensions/dnr/events` returns inferred block events
- [ ] Reconciler does NOT modify, block, or slow down any network requests
- [ ] Reconciler gracefully handles extensions without DNR rules (skip them)
- [ ] App launches, browsing works, extension ad-blocking still functions

## Scope

- ONLY implement DNR reading, telemetry gap measurement, and synthetic event logging
- Do NOT modify Guardian, NetworkShield, or any security stack component behavior
- Do NOT disable or interfere with extension DNR rules
- Do NOT block extensions based on DNR analysis — inform only
- Do NOT build UI — API endpoints are sufficient
- The reconciler is a _passive observer_, never an active participant in the request pipeline

## After Completion

1. Update `docs/Browser-extensions/STATUS.md`
2. Update `docs/Browser-extensions/ROADMAP.md` — check off completed tasks
3. **Commit and push** — follow the commit format in CLAUDE.md "After You Finish" section
