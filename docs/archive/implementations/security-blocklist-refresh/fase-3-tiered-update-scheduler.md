# Phase 3 — Tiered Update Scheduler: Freshness by source class

> **Feature:** Security Blocklist Refresh
> **Sessions:** 1 session
> **Priority:** MEDIUM
> **Depends on:** Phase 2 complete

---

## Goal Or This Phase

This phase replaces the single 24-hour refresh rule with per-source update
tiers. High-signal feeds should refresh more often, while slower curated feeds
stay cheap and predictable.

The result should be a scheduler model that understands source freshness rather
than treating every feed the same.

---

## Existing Code To Read — ONLY This

| File | Look for | Why |
|------|----------|-----|
| `src/security/security-manager.ts` | `scheduleBlocklistUpdate()`, `runBlocklistUpdate()` | current global 24h timer |
| `src/security/blocklists/updater.ts` | source definitions and update loop | add per-source cadence |
| `src/security/security-db.ts` | blocklist metadata methods | persist per-source freshness |
| `src/api/routes/security.ts` | status endpoints | expose freshness/status if needed |

---

## Build In This Phase

### 1. Per-source freshness metadata

**What:** Store `lastUpdated`, `lastAttempted`, and failure state per source
instead or one global timestamp.

**Files:** `src/security/security-db.ts`, `src/security/blocklists/updater.ts`

### 2. Tiered scheduler

**What:** Introduce source classes such as hourly, daily, and weekly without
starting overlapping jobs.

**Files:** `src/security/security-manager.ts`

### 3. Status visibility

**What:** Expose enough status for debugging and support without adding noisy
UI. Shell/API visibility is enough.

**Files:** `src/api/routes/security.ts`

---

## Acceptance Criteria

```bash
TOKEN=$(cat ~/.tandem/api-token)
npm run compile
npx vitest run
curl -H "Authorization: Bearer $TOKEN" http://localhost:8765/security/status
# Expected: source freshness/status can be inspected
```

**Behavior checks:**
- hourly sources do not wait 24h for refresh
- daily/weekly sources are not hammered every hour
- failed sources do not block successful sources from updating
- scheduler does not spawn overlapping update runs

---

## Known Pitfalls

- keep timing deterministic enough for tests
- avoid inventing cron complexity if intervals are enough
- preserve startup behavior when freshness metadata is missing
