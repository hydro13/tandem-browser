# Phase 0-A: Deduplicate Shared Constants

> **Priority:** HIGH | **Effort:** ~1 hour | **Dependencies:** None

## Goal
Move duplicated hardcoded lists (`KNOWN_TRACKERS`, `URL_LIST_SAFE_DOMAINS`) into `types.ts` as single exports. Pure refactor — no logic changes.

## Files to Read
- `src/security/types.ts` — destination for shared constants
- `src/security/outbound-guard.ts` — has `KNOWN_TRACKERS` (~30 entries)
- `src/security/content-analyzer.ts` — has `KNOWN_TRACKERS` (~20 entries)
- `src/security/network-shield.ts` — has `URL_LIST_SAFE_DOMAINS`
- `src/security/blocklists/updater.ts` — has `URL_LIST_SAFE_DOMAINS`

## Files to Modify
Same 5 files listed above.

## Tasks

### 0A.1 Merge and move KNOWN_TRACKERS
1. Read the `KNOWN_TRACKERS` Set in both `outbound-guard.ts` and `content-analyzer.ts`
2. Create a single merged Set (union of all entries from both) in `types.ts` as an exported constant
3. Replace the local Set in `outbound-guard.ts` with an import from `types.ts`
4. Replace the local Set in `content-analyzer.ts` with an import from `types.ts`
5. Delete the old local definitions

**Watch out:** Check if both modules match against the Set the same way (hostname only? with subdomain?). If they differ, document the difference.

### 0A.2 Merge and move URL_LIST_SAFE_DOMAINS
1. Read the Set in both `network-shield.ts` and `blocklists/updater.ts`
2. Create a single merged Set in `types.ts` as an exported constant
3. Replace local Sets with imports in both modules
4. Delete old local definitions

## Verification
- [ ] `npx tsc --noEmit` — 0 errors
- [ ] `KNOWN_TRACKERS` is exported from `types.ts` only, imported by both modules
- [ ] `URL_LIST_SAFE_DOMAINS` is exported from `types.ts` only, imported by both modules
- [ ] No duplicate definitions remain (grep for the constant names)
- [ ] App launches with `npm start`, browsing works
- [ ] `GET /security/status` returns valid response

## Scope
- ONLY move constants — do NOT change any logic
- ONLY touch the 5 files listed above
- Do NOT rename the constants
- Do NOT add or remove entries from the lists

## After Completion
1. Update `docs/security-upgrade/STATUS.md`
2. Update `docs/security-upgrade/ROADMAP.md` — check off completed tasks
