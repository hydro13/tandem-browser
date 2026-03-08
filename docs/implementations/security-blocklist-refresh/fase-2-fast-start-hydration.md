# Phase 2 — Fast-Start Hydration: Cached startup and atomic swap

> **Feature:** Security Blocklist Refresh
> **Sessions:** 1 session
> **Priority:** HIGH
> **Depends on:** Phase 1 complete

---

## Goal Or This Phase

This phase removes the assumption that `NetworkShield` must parse every local
blocklist synchronously during startup. Tandem should become usable quickly with
a cached last-known-good snapshot, then hydrate additional in-memory coverage in
the background and atomically replace the active sets when ready.

---

## Existing Code To Read — ONLY This

| File | Look for | Why |
|------|----------|-----|
| `src/security/network-shield.ts` | `constructor`, `loadBlocklists()`, `reload()`, `checkDomain()` | current sync startup and reload model |
| `src/security/security-manager.ts` | `constructor`, `scheduleBlocklistUpdate()` | startup orchestration and delayed updates |
| `src/main.ts` | `startAPI()` | verify startup order assumptions |
| `src/security/security-db.ts` | blocklist metadata accessors | keep durable metadata aligned with snapshots |

---

## Build In This Phase

### 1. Startup snapshot path

**What:** Load a cached compact snapshot first so `NetworkShield` is usable
immediately without full parse cost.

**Files:** `src/security/network-shield.ts`

### 2. Background hydrate flow

**What:** Move heavy local file parsing off the critical startup path and load
it after the browser is already interactive.

**Files:** `src/security/network-shield.ts`, `src/security/security-manager.ts`

### 3. Atomic in-memory replace

**What:** Build replacement `Set` instances off-path and swap them in only when
fully ready, avoiding partial security state.

**Files:** `src/security/network-shield.ts`

---

## Acceptance Criteria

```bash
npm run compile
npx vitest run
npm start
# Expected: app reaches usable shell state before large blocklists finish hydrating
```

**Behavior checks:**
- startup no longer depends on full synchronous file parse
- blocklist checks remain available during and after hydration
- background hydrate does not freeze the shell or navigation
- reload/update path uses atomic replacement, not clear-then-rebuild on the live set

---

## Known Pitfalls

- do not leave a gap where the active set is empty during reload
- do not trigger concurrent hydrate runs that race each other
- do not break DB-backed dynamic blocklist lookups during startup
