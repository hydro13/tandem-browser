# Tandem × Agent-Browser Gaps — START HERE

> **Last update:** February 20, 2026
> **Goal:** Give Tandem the 4 features that make agent-browser so popular,
> without breaking the stealth/symbiosis core.
> **Order:** Phase 1 → 2 → 3 → 4 (each phase is independent but builds on the previous one)

---

## Why These Features?

agent-browser (Vercel Labs) has 14.7k stars because it does one thing well:
give AI agents a simple, structured way to control the web.

Tandem does the same thing but better: a real browser, real sessions, and a real human as copilot.
But Tandem lacks the developer-friendly layer that makes agent-browser so popular.

**These 4 features close that gap:**

| Phase | Feature | Why |
|------|---------|--------|
| 1 | `/snapshot` — accessibility tree with `@refs` | LLMs can find elements without CSS selectors |
| 2 | `/network/mock` — intercept/mock requests | Testing, development, ad-blocking |
| 3 | `/sessions` — isolated browser sessions | Multiple AI agents at once |
| 4 | `tandem` CLI — thin wrapper | Developer UX, compatibility with the agent-browser workflow |

---

## Architecture in 30 Seconds

```
Claude Code / other AI
        │
        ▼
  Tandem API :8765
  (Express + Bearer auth)
        │
   ┌────┴────────────────────┐
   │                         │
   ▼                         ▼
src/snapshot/          src/network/
manager.ts             mocker.ts
(CDP: Accessibility)   (CDP: Fetch)
        │
   ┌────┴──────┐
   │           │
   ▼           ▼
src/sessions/  cli/
manager.ts     index.ts
(Electron      (npm package
 partitions)    @hydro13/tandem-cli)
```

### Anti-Detect CRITICAL
- Accessibility tree via `CDP: Accessibility.getFullAXTree()` — from the main process
- Network intercept via `CDP: Fetch.enable` — from the main process
- Never inject DOM crawlers or scripts into the webview
- Robin's session (`persist:tandem`) is **NEVER** touched by agent sessions

---

## Documents in This Folder

| File | What | Status |
|---------|-----|--------|
| `LEES-MIJ-EERST.md` | ← this file | — |
| `TODO.md` | Checklist per phase, check off what is done | 📋 Keep actively updated |
| `fase-1-snapshot.md` | `/snapshot` endpoint — accessibility tree | 📋 Ready to start |
| `fase-2-network-mock.md` | `/network/mock` — intercept/block/mock | 📋 Waiting for phase 1 |
| `fase-3-sessions.md` | `/sessions` — isolated sessions (3 sub-sessions) | 📋 Waiting for phase 2 |
| `fase-4-cli.md` | tandem CLI wrapper package | 📋 Waiting for phase 3 |

---

## Quick Status Check (always run this first)

```bash
# Is the Tandem API running?
curl http://localhost:8765/status

# TypeScript clean?
npx tsc

# Git status clean?
git status

# Is CDP available? (needed for phase 1 + 2)
TOKEN=$(cat ~/.tandem/api-token)
curl -H "Authorization: Bearer $TOKEN" http://localhost:8765/devtools/status

# Start the app (ALWAYS via npm start, never `npx electron .`)
npm start
```

---

## Codebase — Critical Files

```
src/
├── api/server.ts           # ← ALL new endpoints are added HERE
│                           #   ~170 endpoints (2385 lines), add them AFTER the DevTools section
│                           #   Section marker: look for "// WINGMAN STREAM" (around line 2354)
│                           #   Add new sections BEFORE that line
├── devtools/
│   ├── manager.ts          # CDP attach/detach + sendCommand() — reuse for snapshot + mock
│   │                       # Network capture is ALSO in this file (inline, 300-entry ring buffer)
│   │                       # THERE IS NO separate network-capture.ts file!
│   ├── console-capture.ts  # Console log capture (separate)
│   └── types.ts            # CDP types (DOMNodeInfo, StorageData, etc.)
├── tabs/manager.ts         # Tab lifecycle — tabs are created via the RENDERER
│                           # (window.__tandemTabs.createTab in shell/index.html)
├── main.ts                 # Electron main process — manager instantiation + wiring
│                           # `startAPI()` function (around line 250): ALL managers are created here
│                           # `will-quit` handler (around line 852): managers are cleaned up here
│
│   [NEW — you build this:]
├── snapshot/               # Phase 1
│   ├── manager.ts
│   └── types.ts
├── network/                # Phase 2
│   ├── mocker.ts
│   └── types.ts
├── sessions/               # Phase 3
│   ├── manager.ts
│   ├── types.ts
│   └── state.ts
│
cli/                        # Phase 4 (outside `src/`, own package.json + tsconfig.json)
├── index.ts
├── client.ts
└── commands/
```

---

## Hard Rules (NEVER Break These)

1. **TypeScript strict mode** — no `any` except in catch blocks (`e: any`)
2. **Do not add npm packages** without Robin's explicit approval
3. **All CDP calls via `devToolsManager.sendCommand(method, params)`** — never call `debugger.attach()` yourself. `DevToolsManager` owns the CDP connection
4. **Always register new managers** in 3 places (see "Manager Wiring" below)
5. **`persist:tandem` partition** — NEVER write to it, NEVER erase it from agent code
6. **module: commonjs** — no ES modules, no `import type` with assertions
7. **Named exports** — no `export default`, always `export class/function/interface`
8. **Anti-detect** — see AGENTS.md: never inject scripts into the webview, always use CDP from the main process
9. **Tabs are created via the renderer** — `window.__tandemTabs.createTab()` in shell/index.html, not from the main process

---

## Manager Wiring — How to Register New Managers

Each new manager (`SnapshotManager`, `NetworkMocker`, `SessionManager`) must be wired into **3 places**:

### 1. `src/api/server.ts` — `TandemAPIOptions` interface (around line 64)

```typescript
export interface TandemAPIOptions {
  // ... existing managers ...
  snapshotManager: SnapshotManager;  // ← add
}
```

And store it in the constructor:

```typescript
this.snapshotManager = opts.snapshotManager;
```

### 2. `src/main.ts` — `startAPI()` function (around line 250)

Instantiate the manager and pass it into `TandemAPI`:

```typescript
// In `startAPI()`, AFTER creating `devToolsManager`:
const snapshotManager = new SnapshotManager(devToolsManager!);

// In new TandemAPI({...}):
api = new TandemAPI({
  // ... existing managers ...
  snapshotManager: snapshotManager!,
});
```

### 3. `src/main.ts` — `will-quit` handler (around line 852)

Add cleanup:

```typescript
app.on('will-quit', () => {
  // ... existing cleanup ...
  if (snapshotManager) snapshotManager.destroy();
});
```

---

## API Endpoint Pattern — Copy This Exactly

Every endpoint in the codebase follows this pattern:

```typescript
// Section header (required for a new feature group)
// ═══════════════════════════════════════════════
// SNAPSHOT — Accessibility Tree with @refs
// ═══════════════════════════════════════════════

this.app.get('/snapshot', async (req: Request, res: Response) => {
  try {
    const interactive = req.query.interactive === 'true';
    const result = await this.snapshotManager.getSnapshot({ interactive });
    res.json({ ok: true, snapshot: result.text, count: result.count, url: result.url });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});
```

**Rules:**

- `try/catch` around EVERYTHING
- Always catch as `(e: any)` → `res.status(500).json({ error: e.message })`
- 400 for missing required fields
- 404 for not-found resources
- Success: always `{ ok: true, ...data }`

---

## CDP Call Pattern — How It Works

`DevToolsManager` has a public `sendCommand(method, params)` method:

```typescript
// Inside sendCommand:
async sendCommand(method: string, params?: Record<string, any>): Promise<any> {
  const wc = await this.ensureAttached();  // reuses the existing connection
  if (!wc) throw new Error('No active tab or CDP attach failed');
  return wc.debugger.sendCommand(method, params || {});
}
```

**Use from new managers:**

```typescript
// ✅ GOOD — via devToolsManager
const tree = await this.devtools.sendCommand('Accessibility.getFullAXTree', {});

// ❌ WRONG — never attach yourself
const wc = tabManager.getActiveWebContents();
wc.debugger.attach('1.3');  // NEVER! DevToolsManager owns this
```

**CDP Accessibility API** (Electron 40 = Chromium ~134, both available):

```typescript
await this.devtools.sendCommand('Accessibility.enable', {});
const result = await this.devtools.sendCommand('Accessibility.getFullAXTree', {});
// result.nodes = AXNode[] with role, name, value, children, etc.
```
