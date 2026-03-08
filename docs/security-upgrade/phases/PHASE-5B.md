# Phase 5-B: Confidence Wiring — Guardian + OutboundGuard + ScriptGuard

> **Priority:** MEDIUM | **Effort:** ~1.5 hours | **Dependencies:** Phase 5-A (confidence type + DB)

## Goal
Wire confidence levels into the three highest-traffic security modules: Guardian (network), OutboundGuard (exfiltration), and ScriptGuard (script analysis). Each `logEvent()` call gets an appropriate confidence value.

## Files to Read
- `src/security/types.ts` — AnalysisConfidence enum values
- `src/security/guardian.ts` — all `logEvent()` calls, understand detection types
- `src/security/outbound-guard.ts` — all `logEvent()` calls
- `src/security/script-guard.ts` — all `logEvent()` calls

## Files to Modify
- `src/security/guardian.ts` — add confidence to all event logs
- `src/security/outbound-guard.ts` — add confidence to all event logs
- `src/security/script-guard.ts` — add confidence to all event logs

## Tasks

### 5B.1 Guardian confidence levels

Folder each detection type in Guardian to a confidence level:
- **Blocklist match** (domain on blocklist): `AnalysisConfidence.BLOCKLIST` (100)
- **Untrusted domain block** (trust score too low in strict mode): `AnalysisConfidence.SPECULATIVE` (900)
- **Suspicious redirect chain**: `AnalysisConfidence.HEURISTIC` (700)
- **Banking domain elevation**: `AnalysisConfidence.BLOCKLIST` (100) — it's a known-domain match

Find every `logEvent()` call in `guardian.ts` and add the appropriate confidence parameter. Use the existing event type/severity to determine which confidence level applies.

### 5B.2 OutboundGuard confidence levels

Folder each detection type:
- **Credential data to third party**: `AnalysisConfidence.CREDENTIAL_EXFIL` (200)
- **Cookie exfiltration**: `AnalysisConfidence.CREDENTIAL_EXFIL` (200)
- **Suspicious outbound data**: `AnalysisConfidence.HEURISTIC` (700)
- **Known tracker data send**: `AnalysisConfidence.BEHAVIORAL` (500)

Find every `logEvent()` call in `outbound-guard.ts` and add confidence.

### 5B.3 ScriptGuard confidence levels

Folder each detection type:
- **Script on blocked domain** (from Phase 3-A): `AnalysisConfidence.KNOWN_MALWARE_HASH` (300)
- **Rule engine critical match**: `AnalysisConfidence.HEURISTIC` (700) — rules are pattern-based
- **Rule engine high match**: `AnalysisConfidence.HEURISTIC` (700)
- **Rule engine medium/low match**: `AnalysisConfidence.ANOMALY` (800)
- **High entropy script** (from Phase 1): `AnalysisConfidence.ANOMALY` (800)
- **New script on known domain**: `AnalysisConfidence.SPECULATIVE` (900)
- **Widespread script detection**: `AnalysisConfidence.BEHAVIORAL` (500)

Find every `logEvent()` call in `script-guard.ts` and add confidence.

## Verification
- [ ] `npx tsc --noEmit` — 0 errors
- [ ] Every `logEvent()` call in `guardian.ts` includes a confidence value
- [ ] Every `logEvent()` call in `outbound-guard.ts` includes a confidence value
- [ ] Every `logEvent()` call in `script-guard.ts` includes a confidence value
- [ ] Blocklist events have confidence 100
- [ ] Credential exfil events have confidence 200
- [ ] Heuristic events have confidence 700
- [ ] Events in DB have correct confidence values (not all 500)
- [ ] App still starts, browsing works
- [ ] Phase 0-5A changes still work (regression)

## Scope
- ONLY modify `guardian.ts`, `outbound-guard.ts`, `script-guard.ts`
- ONLY change `logEvent()` calls — do not change detection logic
- Do NOT add Gatekeeper routing (that's Phase 5-C)
- Do NOT change trust evolution (that's Phase 5-C)

## After Completion
1. Update `docs/security-upgrade/STATUS.md`
2. Update `docs/security-upgrade/ROADMAP.md`
