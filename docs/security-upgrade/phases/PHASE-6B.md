# Phase 6-B: Similarity Matching + DB Integration

> **Priority:** LOW-MEDIUM | **Effort:** ~1.5 hours | **Dependencies:** Phase 6-A (AST hash algorithm)

## Goal
Use AST hashes for cross-domain similarity matching. When a new script is parsed, check if structurally similar scripts exist on other domains — catching obfuscated variants of the same malware.

## Files to Read
- `src/security/script-guard.ts` — AST hashing from Phase 6-A, correlation from Phase 3-A
- `src/security/security-db.ts` — `script_fingerprints` table with `ast_hash` column
- `src/security/network-shield.ts` — blocklist check for domain cross-referencing

## Files to Modify
- `src/security/security-db.ts` — add AST-based lookup statements
- `src/security/script-guard.ts` — add similarity matching logic
- `src/security/security-manager.ts` — extend correlations endpoint

## Tasks

### 6B.1 Add AST-based prepared statements

In `security-db.ts`:
```typescript
// Get domains where a script with the same AST hash appears
getDomainsForASTHash: db.prepare(
  'SELECT DISTINCT domain FROM script_fingerprints WHERE ast_hash = ? AND ast_hash IS NOT NULL'
)

// Get scripts with matching AST hash across domains
getASTMatches: db.prepare(`
  SELECT hash, normalized_hash, ast_hash, domain, url, first_seen
  FROM script_fingerprints
  WHERE ast_hash = ? AND ast_hash IS NOT NULL
  ORDER BY first_seen ASC
`)
```

### 6B.2 Cross-domain AST correlation in ScriptGuard

Extend the correlation logic from Phase 3-A:

After storing a fingerprint with an `ast_hash`:
1. Query `getDomainsForASTHash(astHash)` — all domains with structurally identical scripts
2. If domains include blocked domains: log critical event `obfuscated-script-from-blocked-domain`
   - This is the key value: a script on `example.com` has the same AST structure as malware on `malware.evil` — even though variable names, strings, and whitespace are completely different
3. If 3+ domains share the same AST hash with different regular hashes: log event `obfuscation-variant-detected`
   - Same structure, different surface form = likely obfuscation variants

### 6B.3 Similarity scoring

For cases where exact AST hash match is too strict, implement approximate matching:

```typescript
function computeASTFeatureVector(node: acorn.Node): Map<string, number> {
  // Count occurrences of each node type
  const features = new Map<string, number>()
  walkForFeatures(node, features)
  return features
}

function computeSimilarity(vec1: Map<string, number>, vec2: Map<string, number>): number {
  // Cosine similarity between feature vectors
  const allKeys = new Set([...vec1.keys(), ...vec2.keys()])
  let dotProduct = 0
  let norm1 = 0
  let norm2 = 0
  for (const key of allKeys) {
    const a = vec1.get(key) || 0
    const b = vec2.get(key) || 0
    dotProduct += a * b
    norm1 += a * a
    norm2 += b * b
  }
  if (norm1 === 0 || norm2 === 0) return 0
  return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2))
}
```

Threshold: similarity > 0.85 = "structurally similar" (flag for review). Similarity > 0.95 = "structurally identical" (same as AST hash match).

**Performance note:** Similarity comparison is expensive (O(n) per pair). Only run it for:
- Scripts that triggered at least one threat rule (from Phase 2-B)
- Scripts with high entropy (from Phase 1)
- Never for scripts from trusted first-party domains

### 6B.4 Extend correlations API endpoint

Extend the `GET /security/scripts/correlations` endpoint (from Phase 3-B) to include AST-based correlations:

```json
{
  "widespread": [...],
  "astMatches": [
    {
      "astHash": "abc123",
      "variants": [
        { "domain": "good-site.com", "hash": "aaa", "url": "..." },
        { "domain": "blocked-site.com", "hash": "bbb", "url": "..." }
      ],
      "isObfuscationVariant": true,
      "hasBlockedDomain": true
    }
  ],
  "totalTrackedScripts": 150,
  "crossDomainScripts": 12,
  "astCorrelations": 3
}
```

## Verification
- [ ] `npx tsc --noEmit` — 0 errors
- [ ] AST-based cross-domain lookup finds structurally identical scripts
- [ ] Two obfuscated variants of the same script (different variable names, same structure) → matched
- [ ] Script matching blocked domain AST → critical event logged
- [ ] Similarity scoring produces values between 0 and 1
- [ ] Similarity > 0.85 flagged as "structurally similar"
- [ ] `GET /security/scripts/correlations` includes AST match data
- [ ] Performance: similarity only runs for flagged scripts, not all scripts
- [ ] App still starts, browsing works
- [ ] Phase 0-6A changes still work (regression)

## Scope
- ONLY modify `security-db.ts`, `script-guard.ts`, `security-manager.ts`
- Do NOT modify the AST hash algorithm (that's Phase 6-A)
- Do NOT compare AST hashes of scripts from the same domain (pointless)
- Keep similarity matching gated behind threat/entropy flags for performance

## After Completion
1. Update `docs/security-upgrade/STATUS.md`
2. Update `docs/security-upgrade/ROADMAP.md`
