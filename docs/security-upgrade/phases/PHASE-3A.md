# Phase 3-A: Cross-Domain Script Correlation (DB + Logic)

> **Priority:** HIGH | **Effort:** ~1.5 hours | **Dependencies:** Phase 0-A (types.ts), Phase 2-B (script analysis)

## Goal
Enable cross-domain script hash lookups: when a script hash appears on a new domain, check if that same hash has been seen on blocked/suspicious domains. Add DB index, prepared statements, and correlation logic in ScriptGuard.

## Files to Read
- `src/security/security-db.ts` — `script_fingerprints` table schema, existing prepared statements
- `src/security/script-guard.ts` — where fingerprints are stored (`storeFingerprint` or similar)
- `src/security/network-shield.ts` — blocklist checking (to understand how to check if a domain is blocked)

## Files to Modify
- `src/security/security-db.ts` — add index + prepared statements
- `src/security/script-guard.ts` — add correlation logic

## Tasks

### 3A.1 Add DB index for cross-domain lookups

In `security-db.ts`, add to the initialization (after table creation):
```sql
CREATE INDEX IF NOT EXISTS idx_script_fingerprints_hash ON script_fingerprints(hash)
```

### 3A.2 Add prepared statements

Add these prepared statements in `security-db.ts`:
```typescript
// Get all domains where a script hash has been seen
getDomainsForHash: db.prepare('SELECT DISTINCT domain FROM script_fingerprints WHERE hash = ?')

// Get count of distinct domains for a script hash
getDomainCountForHash: db.prepare('SELECT COUNT(DISTINCT domain) as count FROM script_fingerprints WHERE hash = ?')
```

Expose these via methods on the DB class (follow existing patterns).

### 3A.3 Cross-domain correlation in ScriptGuard

When a new script fingerprint is stored (after the existing `storeFingerprint` call):

1. Query `getDomainsForHash(hash)` to find all domains this hash appears on
2. If hash appears on 5+ domains: log event with type `widespread-script` (informational — could be CDN, could be malware kit)
3. For each domain in the result: check if that domain is blocked (via NetworkShield's blocklist). If ANY blocked domain has the same hash: log critical event `script-on-blocked-domain`
4. Pass blocked domain info to the event details so it's traceable

**Design note:** This runs AFTER fingerprint storage, so the new domain is already in the DB. That means the query will include the current domain in the count — account for this (5+ means 5+ distinct domains including the current one).

### 3A.4 Access to blocklist data

ScriptGuard needs to check if a domain is blocked. Options:
- If NetworkShield exposes a `isDomainBlocked(domain)` method: use it
- If not: add one (simple lookup against the in-memory blocklist Set)
- Route this through SecurityManager if direct module access isn't available

Check the existing architecture and follow the established pattern for inter-module communication.

## Verification
- [ ] `npx tsc --noEmit` — 0 errors
- [ ] Index on `script_fingerprints.hash` exists (check via `.schema` or code)
- [ ] `getDomainsForHash()` prepared statement works
- [ ] Script appearing on a blocked domain generates `script-on-blocked-domain` event
- [ ] Script on 5+ domains generates `widespread-script` event
- [ ] App still starts, browsing works
- [ ] Phase 0-A, 0-B, 1, 2-A, 2-B changes still work (regression)

## Scope
- ONLY modify `security-db.ts` and `script-guard.ts` (+ minor accessor in NetworkShield if needed)
- Do NOT add API endpoints (that's Phase 3-B)
- Do NOT implement normalized hashing (that's Phase 3-B)
- Do NOT change the existing fingerprint storage logic — only ADD correlation after it

## After Completion
1. Update `docs/security-upgrade/STATUS.md`
2. Update `docs/security-upgrade/ROADMAP.md`
