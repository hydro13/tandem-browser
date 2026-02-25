# Phase 5-A: Confidence Type System + DB Layer

> **Priority:** MEDIUM | **Effort:** ~1 hour | **Dependencies:** Phase 0-A (types.ts), Phase 0-B (DB patterns)

## Goal
Define the `AnalysisConfidence` enum and add a `confidence` column to the events table. This is pure type/schema work — no module wiring yet.

## Files to Read
- `src/security/types.ts` — SecurityEvent interface, where enum goes
- `src/security/security-db.ts` — events table schema, `logEvent()` method

## Files to Modify
- `src/security/types.ts` — add AnalysisConfidence enum, update SecurityEvent
- `src/security/security-db.ts` — add confidence column, update logEvent

## Tasks

### 5A.1 Define AnalysisConfidence enum in `types.ts`

```typescript
export enum AnalysisConfidence {
  BLOCKLIST = 100,          // Domain/URL on verified blocklist
  CREDENTIAL_EXFIL = 200,   // Credential data leaving to third party
  KNOWN_MALWARE_HASH = 300, // Script hash matches known malware
  BEHAVIORAL = 500,         // Runtime behavior anomaly (CPU, permissions)
  HEURISTIC = 700,          // Pattern-based detection (rules, entropy)
  ANOMALY = 800,            // Statistical anomaly (evolution baseline)
  SPECULATIVE = 900,        // Low-confidence signal (new domain, unusual pattern)
}
```

**Design note:** Lower number = higher confidence. This follows Ghidra's `AnalysisPriority` model where lower values mean "more certain."

### 5A.2 Add `confidence` to SecurityEvent interface

Add `confidence?: number` to the `SecurityEvent` interface (or whatever the event type is called). Make it optional so existing code doesn't break — modules that haven't been updated yet will default to `undefined`.

### 5A.3 Add `confidence` column to events table

In `security-db.ts`:
```sql
ALTER TABLE events ADD COLUMN confidence INTEGER DEFAULT 500
```

Use a safe migration pattern:
```typescript
try {
  db.exec('ALTER TABLE events ADD COLUMN confidence INTEGER DEFAULT 500')
} catch (e) {
  // Column already exists — safe to ignore
}
```

### 5A.4 Update `logEvent()` to accept confidence

Modify the `logEvent()` method to accept an optional `confidence` parameter:
- If provided: use it
- If not provided: default to `500` (BEHAVIORAL — middle of the range)
- Update the INSERT prepared statement to include confidence

## Verification
- [ ] `npx tsc --noEmit` — 0 errors
- [ ] `AnalysisConfidence` enum exported from `types.ts`
- [ ] `SecurityEvent` interface includes `confidence?: number`
- [ ] `confidence` column exists in events table (with default 500)
- [ ] `logEvent()` accepts and stores confidence values
- [ ] Existing `logEvent()` calls still work without the new parameter
- [ ] App still starts, browsing works
- [ ] Phase 0-4 changes still work (regression)

## Scope
- ONLY modify `types.ts` and `security-db.ts`
- Do NOT update any modules' `logEvent()` calls yet (that's Phase 5-B and 5-C)
- Do NOT add Gatekeeper routing logic (that's Phase 5-C)
- Do NOT change trust evolution (that's Phase 5-C)
- Backward compatible — all existing code must keep working unchanged

## After Completion
1. Update `docs/security-upgrade/STATUS.md`
2. Update `docs/security-upgrade/ROADMAP.md`
