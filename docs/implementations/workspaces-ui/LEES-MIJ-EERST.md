# WORKSPACES UI — START HERE

> **Date:** 2026-02-28
> **Status:** In progress
> **Goal:** Visual workspace switcher on top or Tandem's existing `/sessions` — colored icons in the sidebar, tab bar filtering per workspace
> **Order:** Phase 1 → 2 (each phase is one session)

---

## Why This Feature?

Tandem already has the strongest session isolation or any browser (a full Electron partition per session). But there is no visual way to switch yet — everything goes through `curl`. Opera's Workspaces show colored squares at the top or the sidebar so you can switch context with one click. This is priority #5 in the gap analysis (`docs/research/gap-analysis.md`). We are building the UI on top or the existing `SessionManager`.

---

## Architecture in 30 Seconds

```
Click workspace icon in sidebar strip
       ↓
  Shell → IPC → WorkspaceManager.switch(name)
       ↓
  WorkspaceManager → SessionManager.setActive(name)
       ↓
  IPC back → Shell filters tab bar: show only tabs from the active workspace
       ↓
  URL bar, webview, navigation → everything now points to the new workspace/session
```

---

## Project Structure — Relevant Files

> ⚠️ Read ONLY the files in the "Files to read" table.
> Do NOT wander through the rest or the codebase.

### Read for ALL phases

| File | What it contains | Look for function |
|---------|---------------|-------------------|
| `AGENTS.md` | Anti-detect rules, code style, commit format | — (read fully) |
| `src/main.ts` | App startup, manager registration | `startAPI()`, `createWindow()` |
| `src/api/server.ts` | TandemAPI class, route registration | `class TandemAPI`, `setupRoutes()` |
| `src/registry.ts` | ManagerRegistry interface | `interface ManagerRegistry` |
| `src/sessions/manager.ts` | Existing `SessionManager` — `WorkspaceManager` builds on top or it | `class SessionManager`, `create()`, `setActive()` |
| `src/sessions/types.ts` | Session interface definition | `interface Session` |

### Additional reading per phase

_(see the relevant phase file)_

---

## Rules for This Feature

> These are the HARD rules in addition to the general AGENTS.md rules.

1. **Workspaces = Sessions** — each workspace maps 1:1 to a `SessionManager` session. `WorkspaceManager` is a layer on top or `SessionManager`, not a replacement.
2. **Default workspace is undeletable** — the "default" workspace (= `persist:tandem` session) can never be removed.
3. **Tab filtering, not tab closing** — workspace switching hides tabs from other workspaces in the tab bar, but does not close them. The webviews stay alive.
4. **Function names > line numbers** — always refer to `function registerWorkspaceRoutes()`, never to "line 42"

---

## Manager Wiring — How to Register a New Component

Each new manager must be wired into **3 places**:

### 1. `src/registry.ts` — `ManagerRegistry` interface

```typescript
export interface ManagerRegistry {
  // ... existing managers ...
  workspaceManager: WorkspaceManager;  // ← add
}
```

### 2. `src/main.ts` — `startAPI()` function

```typescript
// After creating sessionManager:
const workspaceManager = new WorkspaceManager(sessionManager!, tabManager!);

// In registry object:
workspaceManager: workspaceManager!,
```

### 3. `src/main.ts` — `app.on('will-quit')` handler

```typescript
if (workspaceManager) workspaceManager.destroy();
```

---

## API Endpoint Pattern — Copy Exactly

```typescript
// ═══════════════════════════════════════════════
// WORKSPACES — Visual workspace management
// ═══════════════════════════════════════════════

router.get('/workspaces', (req: Request, res: Response) => {
  try {
    const workspaces = ctx.workspaceManager.list();
    res.json({ ok: true, workspaces });
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
| `fase-1-backend.md` | `WorkspaceManager` + API routes + tab↔workspace mapping | 📋 Ready to start |
| `fase-2-shell-ui.md` | Workspace icon strip in sidebar + tab bar filtering | ⏳ Waiting for phase 1 |

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

---

## 📊 Phase Status — UPDATE AFTER EVERY PHASE

| Phase | Title | Status | Commit |
|------|-------|--------|--------|
| 1 | Backend (tab↔workspace mapping) | ⏳ not started | — |
| 2 | Shell UI (icon strip in sidebar) | ⏳ not started | — |

> Claude Code: mark the phase as ✅ and add the commit hash after completion.
