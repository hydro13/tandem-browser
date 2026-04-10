# Phase 1 — Parser Foundation: Source-driven feed parsing

> **Feature:** Security Blocklist Refresh
> **Sessions:** 1 session
> **Priority:** HIGH
> **Depends on:** None

---

## Goal Or This Phase

This phase prepares the blocklist pipeline for broader feed support without
changing startup performance yet. The result should be a source manifest and
parser layer that can ingest plain domain lists, URL lists, JSON feeds, and CSV
feeds from a single consistent path.

After this phase, Tandem should be able to describe each source declaratively
instead or hardcoding parser logic in multiple places.

---

## Existing Code To Read — ONLY This

| File | Look for | Why |
|------|----------|-----|
| `src/security/blocklists/updater.ts` | `BLOCKLIST_SOURCES`, `update()`, `parseHostsFile()`, `parseDomainList()`, `parseURLList()` | current source manifest and parser flow |
| `src/security/network-shield.ts` | `loadBlocklists()` and parse helpers | current file-based loading assumptions |
| `src/security/types.ts` | blocklist-related types/constants | centralize parser/source typing |
| `src/security/security-manager.ts` | `scheduleBlocklistUpdate()` | keep later scheduler compatibility in mind |

---

## Build In This Phase

### 1. Shared parser model

**What:** Create shared parser types and source config so both updater and
shield can speak the same source definition language.

**Files:** `src/security/types.ts`, `src/security/blocklists/updater.ts`

### 2. Add structured feed parsers

**What:** Add `json` and `csv` parser support, driven by source config instead
or custom one-off parser branches.

**Files:** `src/security/blocklists/updater.ts`

### 3. Unify parser entry points

**What:** Reduce duplicated parse logic between updater and shield so later
snapshot/hydration work does not need to update the same rules in two places.

**Files:** `src/security/network-shield.ts`, `src/security/blocklists/updater.ts`

---

## Acceptance Criteria

```bash
TOKEN=$(cat ~/.tandem/api-token)
npm run compile
npx vitest run
curl -H "Authorization: Bearer $TOKEN" http://localhost:8765/security/status
# Expected: existing security status still works, no startup regression
```

**Behavior checks:**
- existing text-based feeds still parse exactly as before
- a JSON-configured source can extract domains/hosts via configured fields
- a CSV-configured source can extract domains from a selected column
- no adblock/EasyList parser is introduced in this phase

---

## Known Pitfalls

- do not rename or expand feeds in a way that changes product behavior yet
- do not add giant new sources in the same phase as parser refactoring
- keep parser output domain-focused; CIDR/IP work belongs to a later follow-up
