# AD BLOCKER — START HERE

> **Date:** 2026-02-28
> **Status:** In progress
> **Goal:** Consumer-grade ad blocking via EasyList filterlijsten — blokkeer advertenties op netwerk-request niveau
> **Order:** Phase 1 → 2 (elke phase is één session)

---

## Why this feature?

Tandem's NetworkShield blokkeert malware and phishing (811K+ URLs), but no advertenties. Ad blocking is table stakes for moderne browsers — page's laden faster, minder tracking, betere privacy. Opera has a inbuilte ad blocker with EasyList. Dit is the #8 prioriteit in the gap analyse (docs/research/gap-analysis.md).

---

## Architecture in 30 seconds

```
Browser request → Electron session.webRequest.onBeforeRequest()
       ↓
  RequestDispatcher (bestaand, central hub for alle request hooks)
       ↓
  AdBlockManager.onBeforeRequest() handler (priority 20)
       ↓
  FilterEngine.match(url, resourceType, pageDomain)
       ↓
  Match? → { cancel: true } → request blocked
  No match? → request door to internet
       ↓
  Blocked count per tab → IPC → shell badge update
```

---

## Project Structure — Relevant Files

> ⚠️ Read ONLY the files in the "Files to read" table.
> Do NOT wander through the rest or the codebase.

### Read for ALL phases

| File | What it contains | Look for function |
|---------|---------------|-------------------|
| `AGENTS.md` | Anti-detect rules, code stijl, commit format | — (read fully) |
| `src/main.ts` | App startup, manager registratie, RequestDispatcher setup | `startAPI()`, `createWindow()` |
| `src/api/server.ts` | TandemAPI class, route registratie | `class TandemAPI`, `setupRoutes()` |
| `src/registry.ts` | ManagerRegistry interface | `interface ManagerRegistry` |
| `src/network/dispatcher.ts` | RequestDispatcher — central hub for webRequest hooks | `class RequestDispatcher`, `registerBeforeRequest()` |

### Additional reading per phase

_(see the relevant phase file)_

---

## Rules for this feature

> These are the HARD rules in addition to the general AGENTS.md rules.

1. **Netwerk-niveau blocking** — blokkeer requests via `session.webRequest.onBeforeRequest()`, not via DOM/content scripts. Dit is onzichtbaar for the webview (anti-detect compliant).
2. **RequestDispatcher integratie** — registreer via `dispatcher.registerBeforeRequest()` with priority 20 (na stealth patches priority 10, vóór andere hooks).
3. **No externe services** — filter lists be gedownload and local gecacht. No external API calls bij elke request.
4. **Functienamen > regelnummers** — verwijs always to `function registerAdBlockRoutes()`, nooit to "regel 123"

---

## Manager Wiring — How to Register a New Component

Each new manager must be wired into **3 places**:

### 1. `src/registry.ts` — `ManagerRegistry` interface

```typescript
export interface ManagerRegistry {
  // ... existing managers ...
  adBlockManager: AdBlockManager;  // ← add
}
```

### 2. `src/main.ts` — `startAPI()` function

```typescript
// Na RequestDispatcher aanmaak:
const adBlockManager = new AdBlockManager();
if (dispatcher) adBlockManager.registerWith(dispatcher);

// In registry object:
adBlockManager: adBlockManager!,
```

### 3. `src/main.ts` — `app.on('will-quit')` handler

```typescript
if (adBlockManager) adBlockManager.destroy();
```

---

## API Endpoint Pattern — Copy Exactly

```typescript
// ═══════════════════════════════════════════════
// AD BLOCKER — Consumer ad blocking
// ═══════════════════════════════════════════════

router.get('/adblock/status', (req: Request, res: Response) => {
  try {
    const status = ctx.adBlockManager.getStatus();
    res.json({ ok: true, ...status });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});
```

**Rules:**
- `try/catch` rond ALLES, catch if `(e: any)`
- 400 for ontbrekende verplichte velden
- 404 for not-gevonden resources
- Success: always `{ ok: true, ...data }`

---

## Documents in This Folder

| File | What | Status |
|---------|-----|--------|
| `LEES-MIJ-EERST.md` | ← this file | — |
| `fase-1-filter-engine.md` | Filter list download + parsing + request blocking | 📋 Ready to start |
| `fase-2-ui-badge-whitelist.md` | Shield badge + blocked count + per-site whitelist toggle | ⏳ Waiting for phase 1 |

---

## Quick Status Check (always run first)

```bash
# App draait?
curl http://localhost:8765/status

# TypeScript clean?
npx tsc

# Git status clean?
git status

# Tests slagen?
npx vitest run
```

---

## 📊 Phase Status — UPDATE AFTER EVERY PHASE

| Phase | Title | Status | Commit |
|------|-------|--------|--------|
| 1 | EasyList filter engine + request blocking | ⏳ not started | — |
| 2 | UI badge + per-site whitelist | ⏳ not started | — |

> Claude Code: markeer phase if ✅ + voeg commit hash toe na afronden.
