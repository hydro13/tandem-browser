# Phase 3-B: Normalized Hashing + API Endpoint

> **Priority:** MEDIUM | **Effort:** ~1.5 hours | **Dependencies:** Phase 3-A (cross-domain correlation DB)

## Goal
Improve script fingerprinting accuracy with normalized hashing (strip comments/whitespace before hashing), and expose cross-domain correlations via an API endpoint.

## Files to Read
- `src/security/script-guard.ts` — current hashing logic, Phase 3-A correlation
- `src/security/security-manager.ts` — API route registration pattern (look at existing `GET /security/*` routes)
- `src/security/security-db.ts` — prepared statements from Phase 3-A

## Files to Modify
- `src/security/script-guard.ts` — add normalized hashing
- `src/security/security-manager.ts` — add API endpoint
- `src/security/security-db.ts` — add query for correlation data

## Tasks

### 3B.1 Implement normalized hashing

Add a `normalizeScriptSource()` function in `script-guard.ts`:
```typescript
function normalizeScriptSource(source: string): string {
  return source
    .replace(/\/\/[^\n]*/g, '')           // strip single-line comments
    .replace(/\/\*[\s\S]*?\*\//g, '')     // strip multi-line comments
    .replace(/\s+/g, ' ')                 // collapse whitespace
    .trim()
}
```

Modify the fingerprinting flow:
1. Compute `normalizedHash = hash(normalizeScriptSource(source))`
2. Store BOTH the original hash AND the normalized hash in `script_fingerprints`
3. Cross-domain correlation (from Phase 3-A) should check BOTH hashes

**DB change:** Add a `normalized_hash` column to `script_fingerprints`:
```sql
ALTER TABLE script_fingerprints ADD COLUMN normalized_hash TEXT
```
Use `IF NOT EXISTS`-safe pattern (try/catch the ALTER, or check column existence first).

Add index:
```sql
CREATE INDEX IF NOT EXISTS idx_script_fingerprints_normalized_hash ON script_fingerprints(normalized_hash)
```

### 3B.2 API endpoint for correlations

Add `GET /security/scripts/correlations` in `security-manager.ts`:

Response format:
```json
{
  "widespread": [
    {
      "hash": "abc123",
      "normalizedHash": "def456",
      "domains": ["example.com", "test.org", "other.net"],
      "domainCount": 3,
      "firstSeen": "2026-02-24T...",
      "blockedDomains": ["malware.example.com"]
    }
  ],
  "totalTrackedScripts": 150,
  "crossDomainScripts": 12
}
```

Add prepared statements in `security-db.ts`:
```typescript
// Get scripts appearing on multiple domains
getWidespreadScripts: db.prepare(`
  SELECT hash, normalized_hash, COUNT(DISTINCT domain) as domain_count
  FROM script_fingerprints
  GROUP BY hash
  HAVING domain_count >= 2
  ORDER BY domain_count DESC
  LIMIT 50
`)
```

### 3B.3 Wire endpoint in SecurityManager

Follow the existing pattern for API routes in SecurityManager:
1. Register the route in the `setupRoutes()` method (or equivalent)
2. Query the DB for widespread scripts
3. For each, fetch the domain list
4. Check each domain against the blocklist
5. Return the formatted response

## Verification
- [ ] `npx tsc --noEmit` — 0 errors
- [ ] Normalized hashing strips comments and whitespace before hashing
- [ ] `normalized_hash` column exists in `script_fingerprints`
- [ ] Two scripts that differ only in comments/whitespace produce the same normalized hash
- [ ] `GET /security/scripts/correlations` returns valid JSON with widespread scripts
- [ ] App still starts, browsing works
- [ ] Phase 0-3A changes still work (regression)

## Scope
- ONLY modify `script-guard.ts`, `security-db.ts`, `security-manager.ts`
- Do NOT change the original hash — keep it alongside the normalized hash
- Do NOT modify existing API endpoints
- Do NOT implement AST hashing (that's Phase 6)

## After Completion
1. Update `docs/security-upgrade/STATUS.md`
2. Update `docs/security-upgrade/ROADMAP.md`
