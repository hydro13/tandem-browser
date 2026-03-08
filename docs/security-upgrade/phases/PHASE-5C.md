# Phase 5-C: Remaining Modules + Gatekeeper Routing + Evolution Weighting

> **Priority:** MEDIUM | **Effort:** ~2 hours | **Dependencies:** Phase 5-B (core modules wired)

## Goal
Complete the confidence pipeline: wire remaining modules (ContentAnalyzer, BehaviorMonitor, NetworkShield), add confidence-based Gatekeeper routing, and weight trust evolution by confidence.

## Files to Read
- `src/security/types.ts` — AnalysisConfidence enum
- `src/security/content-analyzer.ts` — all `logEvent()` calls
- `src/security/behavior-monitor.ts` — all `logEvent()` calls
- `src/security/network-shield.ts` — all `logEvent()` calls
- `src/security/gatekeeper-ws.ts` — message routing, how events are sent to AI agents
- `src/security/evolution.ts` — trust score adjustment logic

## Files to Modify
- `src/security/content-analyzer.ts` — add confidence to event logs
- `src/security/behavior-monitor.ts` — add confidence to event logs
- `src/security/network-shield.ts` — add confidence to event logs
- `src/security/gatekeeper-ws.ts` — add confidence-based routing
- `src/security/evolution.ts` — weight trust changes by confidence

## Tasks

### 5C.1 ContentAnalyzer confidence levels

Folder each detection type:
- **Phishing indicators** (hidden forms, credential fields): `AnalysisConfidence.HEURISTIC` (700)
- **Known tracker detected**: `AnalysisConfidence.BEHAVIORAL` (500)
- **Hidden iframe/mixed content**: `AnalysisConfidence.HEURISTIC` (700)
- **Blocklist URL in page source** (from Phase 4): `AnalysisConfidence.BLOCKLIST` (100)
- **Octal IP detected** (from Phase 4): `AnalysisConfidence.HEURISTIC` (700)
- **Typosquatting detection**: `AnalysisConfidence.ANOMALY` (800)

### 5C.2 BehaviorMonitor confidence levels

Folder each detection type:
- **Excessive permission requests**: `AnalysisConfidence.BEHAVIORAL` (500)
- **High CPU usage**: `AnalysisConfidence.ANOMALY` (800)
- **Unusual API access patterns**: `AnalysisConfidence.BEHAVIORAL` (500)

### 5C.3 NetworkShield confidence levels

Folder each detection type:
- **Domain on blocklist**: `AnalysisConfidence.BLOCKLIST` (100)

### 5C.4 Confidence-based Gatekeeper routing

In `gatekeeper-ws.ts`, modify the event forwarding logic:

```typescript
// Events with confidence <= 300: resolve locally, do NOT send to AI agent
// Events with confidence 301-600: send with medium priority
// Events with confidence > 600: send with high priority (uncertain, needs AI judgment)
```

This means:
- Blocklist hits (100), credential exfil (200), known malware (300) → handled locally, never waste AI agent time
- Behavioral signals (500) → AI agent sees them, medium priority
- Heuristics (700), anomalies (800), speculative (900) → AI agent gets them with high priority because they need judgment

### 5C.5 Confidence-weighted trust evolution

In `evolution.ts`, modify trust score adjustments:

```typescript
function getTrustAdjustment(baseDelta: number, confidence: number): number {
  // High confidence (low number) = full impact
  // Low confidence (high number) = reduced impact
  if (confidence <= 300) return baseDelta          // Full impact
  if (confidence <= 600) return baseDelta * 0.7    // 70% impact
  return baseDelta * 0.4                           // 40% impact
}
```

Apply this to both positive and negative trust changes:
- Blocklist hit (confidence 100): -15 trust → -15 (full)
- Heuristic flag (confidence 700): -10 trust → -4 (reduced)
- Speculative (confidence 900): -10 trust → -4 (reduced)

This prevents uncertain heuristics from tanking trust scores unfairly.

## Verification
- [ ] `npx tsc --noEmit` — 0 errors
- [ ] All `logEvent()` calls across ALL security modules include confidence
- [ ] High-confidence events (<=300) are resolved locally, not sent to Gatekeeper
- [ ] Low-confidence events (>600) are sent to Gatekeeper with high priority
- [ ] Trust evolution is weighted: blocklist hit = full -15, heuristic = reduced ~-4
- [ ] No existing detection is broken by the confidence additions
- [ ] App still starts, browsing works
- [ ] Phase 0-5B changes still work (regression)

## Scope
- Modify the 5 files listed above
- Do NOT change detection logic — only add confidence values and routing
- Do NOT change the Gatekeeper WebSocket protocol messages
- Do NOT modify SecurityManager API routes

## After Completion
1. Update `docs/security-upgrade/STATUS.md`
2. Update `docs/security-upgrade/ROADMAP.md`
