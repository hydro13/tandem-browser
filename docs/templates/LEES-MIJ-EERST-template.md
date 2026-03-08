# [FEATURE NAME] — START HERE

> **Date:** YYYY-MM-DD
> **Status:** In progress / Done
> **Goal:** [One sentence: what will this feature add to Tandem]
> **Order:** Phase 1 → 2 → 3 (each phase is one session)

---

## Why this feature?

[2-3 sentences: why does Robin want this? What problem does it solve?
Reference the gap analysis if relevant: docs/research/gap-analysis.md]

---

## Architecture in 30 seconds

```
[ASCII diagram or how it works]
[For example: HTTP request → Manager → Electron API → UI]
```

---

## Project Structure — Relevant Files

> ⚠️ Read ONLY the files in the "Files to Read" table.
> Do NOT wander through the rest or the codebase.

### Read for ALL phases

| File | What it contains | Look for function |
|---------|---------------|-------------------|
| `AGENTS.md` | Anti-detect rules, code style, commit format | — (read fully) |
| `src/main.ts` | App startup, manager registration | `startAPI()`, `createWindow()` |
| `src/api/server.ts` | TandemAPI class, route registration | `class TandemAPI`, `TandemAPIOptions` |

### Additional reading per phase

_(see the relevant phase file)_

---

## Rules for this feature

> These are the HARD rules in addition to the general AGENTS.md rules.

1. **[Specific rule 1]** — for example: all new UI elements go in the shell, never in the webview
2. **[Specific rule 2]** — for example: no new npm packages without Robin approval
3. **Function names > line numbers** — always refer to `function setupRoutes()`, never to "line 287"

---

## Manager Wiring — How to Register a New Component

Each new manager must be wired into **3 places**:

### 1. `src/api/server.ts` — `TandemAPIOptions` interface

```typescript
export interface TandemAPIOptions {
  // ... existing managers ...
  [newManager]: [NewManager];  // ← add
}
```

### 2. `src/main.ts` — `startAPI()` function

```typescript
// After creating the related manager:
const [newManager] = new [NewManager]([dependencies]);

// In new TandemAPI({...}):
[newManager]: [newManager]!,
```

### 3. `src/main.ts` — `app.on('will-quit')` handler

```typescript
if ([newManager]) [newManager].destroy();
```

---

## API Endpoint Pattern — Copy Exactly

```typescript
// Section header (required for a new feature group)
// ═══════════════════════════════════════════════
// [FEATURE] — [Description]
// ═══════════════════════════════════════════════

this.app.get('/[endpoint]', async (req: Request, res: Response) => {
  try {
    const result = await this.[manager].[method](req.body);
    res.json({ ok: true, ...result });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});
```

**Rules:**
- `try/catch` around EVERYTHING, catch as `(e: any)`
- 400 for missing required fields
- 404 for not-found resources
- Success: always `{ ok: true, ...data }`

---

## Documents in This Folder

| File | What | Status |
|---------|-----|--------|
| `LEES-MIJ-EERST.md` | ← this file | — |
| `fase-1-[name].md` | [What phase 1 does] | 📋 Ready to start |
| `fase-2-[name].md` | [What phase 2 does] | ⏳ Waiting for phase 1 |
| `fase-3-[name].md` | [What phase 3 does] | ⏳ Waiting for phase 2 |

---

## Quick Status Check (always run first)

```bash
# Is the app running?
curl http://localhost:8765/status

# TypeScript clean?
npx tsc

# Git status clean?
git status

# Tests passing?
npx vitest run
```
