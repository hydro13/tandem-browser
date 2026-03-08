# Phase 3 — /sessions: Geïsoleerde Browser Sessions

> **Goal:** Multiple geïsoleerde browser sessions next to Robin's main session.
> Elke session has own cookies, storage, and navigatiehistorie.
> **Sessions:** 3.1 (partition plumbing) + 3.2 (SessionManager + CRUD) + 3.3 (state + X-Session)
> **KRITISCH:** Robin's session (`persist:tandem`) is NOOIT aangeraakt.

---

## Existing code to read (required)

Read this files (usage Read tool, NIET cat):

1. **`shell/index.html`** — The RENDERER waar webviews be aangemaakt
   - Zoek to `window.__tandemTabs` (regel ~1283) — this is the object that tabs beheert
   - Zoek to `createTab` (regel ~1285) — hier is `<webview>` aangemaakt with partition
   - **KRITISCH:** Partition is HARDCODED if `'persist:tandem'` op twee plekken:
     - `createTab()` function (regel ~1289)
     - Initial tab aanmaak (regel ~1461)
   - **MONKEY-PATCHES:** createTab is 2x gewrapped door later code:
     - Regel ~3008-3017: Activity tracking wrapper
     - Regel ~3628-3634: Find events wrapper
     - Beide must the partition parameter doorsturen!
2. **`src/tabs/manager.ts`** — Main process tab manager
   - `openTab()` methode (regel ~69) — roept renderer about via `executeJavaScript()`
   - The `Tab` interface (around line 5) has NO `partition` field — you must add it
   - `getActiveWebContents()` — hoe the actieve tab is opgehaald
3. **`src/main.ts`** — `startAPI()` (regel ~250) + IPC handlers + `will-quit` (regel ~852)
   - Zoek to `tab-focus` IPC handler — hier is CDP re-attached bij tab switch
   - Zoek to `web-contents-created` — stealth is hier op ALLE webviews toegepast (partition-onafhankelijk)
4. **`src/preload.ts`** — contextBridge API (`window.tandem.*`)
5. **`src/api/server.ts`** — Zoek to `// TAB MANAGEMENT` (regel ~610) for existing tab endpoints
6. **`src/stealth/manager.ts`** — StealthManager past fingerprint patches toe per session

---

## Hoe Electron partities werken

```
Elke webview has a `partition` attribute (MOET gezet be VOOR appendChild!):
- "persist:tandem"          ← Robin's session — cookies overleven restarts
- "persist:session-agent1"  ← New agent session
- "persist:session-test"    ← Test session

Cookies/storage are STRIKT geïsoleerd per partition.
Twee webviews with same partition delen cookies.
Electron maakt automatisch a new session about bij a new partition string.
```

---

## Hoe tabs NU be aangemaakt (BELANGRIJK)

The tab-creatie flow gaat door TWEE lagen:

```
API request: POST /tabs/open
      │
      ▼
Main process: TabManager.openTab(url)
      │
      ▼
Main → Renderer via executeJavaScript:
  win.webContents.executeJavaScript(`
    window.__tandemTabs.createTab("tab-5", "https://example.com")
  `)
      │
      ▼
Renderer (shell/index.html): __tandemTabs.createTab()
  const wv = document.createElement('webview');
  wv.setAttribute('partition', 'persist:tandem');  ← HARDCODED!
  wv.setAttribute('src', url);
  container.appendChild(wv);
  return wv.getWebContentsId();
```

**createTab is 2x monkey-patched later in shell/index.html:**

```
Origineel:   createTab(tabId, url)              ← regel 1285
Wrapper 1:   _origCreateTab(tabId, url)          ← regel 3008 (activity tracking)
Wrapper 2:   _origCreateTab2(tabId, url)         ← regel 3628 (find events)
```

Alle 3 must the partition parameter doorsturen.

---

## Architectuur

```
POST /sessions/create {"name":"agent1"}
      │
      ▼
SessionManager.create("agent1")
      ├─ partition = "persist:session-agent1"
      ├─ Sla session op in sessions Folder
      ├─ session.fromPartition(partition) → Electron maakt session about
      └─ Return session info

POST /navigate with X-Session: agent1
      │
      ▼
server.ts: getSessionPartition(req) → "persist:session-agent1"
      │
      ▼
TabManager.openTab(url, null, 'kees', "persist:session-agent1")
      │
      ▼
renderer: createTab(tabId, url, "persist:session-agent1")
      │
      ▼
<webview partition="persist:session-agent1"> ← geïsoleerde cookies/storage
```

---

## New files

### `src/sessions/types.ts`

```typescript
export interface Session {
  name: string;
  partition: string;       // "persist:session-{name}" or "persist:tandem" for default
  createdAt: number;
  isDefault: boolean;      // true only for "default" (Robin's session)
}

export interface SessionState {
  name: string;
  cookies: Electron.Cookie[];
  localStorage: Record<string, Record<string, string>>;  // origin → key → value
  savedAt: number;
  encrypted: boolean;
}
```

### `src/sessions/manager.ts`

```typescript
import { session } from 'electron';
import { Session } from './types';

export class SessionManager {
  private sessions: Folder<string, Session> = new Folder();
  private activeSession = 'default';

  constructor() {
    // Registreer default session (Robin's persist:tandem)
    this.sessions.set('default', {
      name: 'default',
      partition: 'persist:tandem',
      createdAt: Date.now(),
      isDefault: true,
    });
  }

  create(name: string): Session           // gooit error if name already exists
  list(): Session[]
  get(name: string): Session | null
  getActive(): string                      // return this.activeSession
  setActive(name: string): void            // gooit error if session not exists
  destroy(name: string): void              // gooit error if name === "default"
  resolvePartition(sessionName?: string): string  // name → partition string

  cleanup(): void {
    // Cleanup — is aangeroepen vanuit will-quit handler
  }
}
```

### `src/sessions/state.ts`

```typescript
import { session } from 'electron';
import { DevToolsManager } from '../devtools/manager';
import { SessionState } from './types';

export class StateManager {
  private stateDir: string;  // path.join(app.getPath('userData'), 'sessions')

  constructor(private devtools: DevToolsManager) {
    // Maak stateDir about if that not exists
  }

  async save(sessionName: string, partition: string): Promise<string>
  // Cookies ophalen: session.fromPartition(partition).cookies.get({})
  // localStorage: via devtools.sendCommand('Runtime.evaluate', ...) op actieve tab or that session

  async load(sessionName: string, partition: string): Promise<{ cookiesRestored: number }>
  // Cookies zetten: session.fromPartition(partition).cookies.set(cookie)

  list(): string[]
  // Read files out stateDir

  private encrypt(data: string): string   // AES-256-GCM if TANDEM_SESSION_KEY gezet
  private decrypt(data: string): string
}
```

**LET OP cookies ophalen:** Usage Electron's native `session.fromPartition(partition).cookies.get({})` in plaats or CDP `Network.getCookies`. Dit works for ELKE partition, not only the actieve tab.

---

## Manager Wiring (session 3.2)

### 1. `src/api/server.ts` — TandemAPIOptions interface (regel ~64)

```typescript
export interface TandemAPIOptions {
  // ... existing velden ...
  sessionManager: SessionManager;
  stateManager: StateManager;  // session 3.3
}
```

Plus private fields + constructor toewijzing.

### 2. `src/main.ts` — startAPI() (regel ~250)

```typescript
// SessionManager has no dependencies:
const sessionManager = new SessionManager();

// StateManager has devToolsManager nodig:
const stateManager = new StateManager(devToolsManager!);

// In new TandemAPI({...}):
sessionManager: sessionManager!,
stateManager: stateManager!,
```

### 3. `src/main.ts` — will-quit handler (regel ~852)

```typescript
if (sessionManager) sessionManager.cleanup();
```

---

## API Endpoints

Voeg this toe in `server.ts` setupRoutes() in a NIEUWE section:

```typescript
// ═══════════════════════════════════════════════
// SESSIONS — Geïsoleerde Browser Sessions
// ═══════════════════════════════════════════════
```

### `GET /sessions/list`

```json
{
  "ok": true,
  "sessions": [
    {"name": "default", "partition": "persist:tandem", "isDefault": true, "tabs": 3},
    {"name": "agent1", "partition": "persist:session-agent1", "isDefault": false, "tabs": 1}
  ],
  "active": "default"
}
```

To the aantal tabs per session te tellen: `tabManager.listTabs().filter(t => t.partition === session.partition).length`

### `POST /sessions/create`

```json
// Request
{"name": "agent1"}

// Response
{"ok": true, "name": "agent1", "partition": "persist:session-agent1"}

// Error: name exists already
{"ok": false, "error": "Session 'agent1' already exists"}
```

### `POST /sessions/switch`

```json
// Request — wisselt the "actieve API session" for requests without X-Session header
{"name": "agent1"}

// Response
{"ok": true, "active": "agent1"}
```

### `POST /sessions/destroy`

```json
// Request
{"name": "agent1"}

// Response
{"ok": true, "name": "agent1"}

// Error: default verwijderen
{"ok": false, "error": "Cannot destroy the default session"}
```

Bij destroy: closes alle tabs with that partition via `tabManager.closeTab()`.

### `POST /sessions/state/save`

```json
{"name": "twitter"}
// → slaat op in ~/.tandem/sessions/twitter.json (or .enc if versleuteld)
{"ok": true, "path": "/Users/robin/.tandem/sessions/twitter.json"}
```

### `POST /sessions/state/load`

```json
{"name": "twitter"}
{"ok": true, "cookiesRestored": 12}
```

### `GET /sessions/state/list`

```json
{"ok": true, "states": ["twitter", "linkedin", "github"]}
```

### X-Session header op existing endpoints

```bash
TOKEN=$(cat ~/.tandem/api-token)

# Usage agent1 session for this navigatie
curl -X POST http://localhost:8765/navigate \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Session: agent1" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://x.com"}'

# Hetzelfde works for: /click, /type, /page-content, /scroll, /screenshot
```

Implementatie: helper function in `server.ts`:

```typescript
private getSessionPartition(req: Request): string {
  const sessionName = req.headers['x-session'] as string;
  return this.sessionManager.resolvePartition(sessionName);
  // → "persist:tandem" if no header or "default"
  // → "persist:session-{name}" if header aanwezig
}
```

---

## Sessie 3.1 — Partition Plumbing (renderer + TabManager)

> **Goal:** Maak partition configureerbaar door the hele tab-creatie stack.
> No new files, no new endpoints — only existing code aanpassen.
> Na this session works alles still exact hetzelfde (default = 'persist:tandem').

### Wat te change

**4 plekken in `shell/index.html`:**

#### 1. Originele `createTab` function (regel ~1285)

```javascript
// HUIDIGE code:
createTab(tabId, url) {
  const wv = document.createElement('webview');
  wv.setAttribute('src', url);
  wv.setAttribute('allowpopups', '');
  wv.setAttribute('partition', 'persist:tandem');

// NIEUWE code:
createTab(tabId, url, partition) {
  partition = partition || 'persist:tandem';
  const wv = document.createElement('webview');
  wv.setAttribute('src', url);
  wv.setAttribute('allowpopups', '');
  wv.setAttribute('partition', partition);
```

#### 2. Activity tracking monkey-patch (regel ~3008-3010)

```javascript
// HUIDIGE code:
const _origCreateTab = window.__tandemTabs.createTab;
window.__tandemTabs.createTab = function(tabId, url) {
  const result = _origCreateTab.call(window.__tandemTabs, tabId, url);

// NIEUWE code:
const _origCreateTab = window.__tandemTabs.createTab;
window.__tandemTabs.createTab = function(tabId, url, partition) {
  const result = _origCreateTab.call(window.__tandemTabs, tabId, url, partition);
```

#### 3. Find events monkey-patch (regel ~3628-3630)

```javascript
// HUIDIGE code:
const _origCreateTab2 = window.__tandemTabs.createTab;
window.__tandemTabs.createTab = function(tabId, url) {
  const result = _origCreateTab2.call(window.__tandemTabs, tabId, url);

// NIEUWE code:
const _origCreateTab2 = window.__tandemTabs.createTab;
window.__tandemTabs.createTab = function(tabId, url, partition) {
  const result = _origCreateTab2.call(window.__tandemTabs, tabId, url, partition);
```

#### 4. Initial tab (regel ~1461) — NIET WIJZIGEN

The initial tab op regel ~1461 uses `'persist:tandem'` hardcoded. Dit is correct — the startup tab is always Robin's session. Laat this ongewijzigd.

**2 plekken in `src/tabs/manager.ts`:**

#### 5. Tab interface (regel ~5)

```typescript
// Voeg toe about interface:
export interface Tab {
  id: string;
  webContentsId: number;
  title: string;
  url: string;
  favicon: string;
  groupId: string | null;
  active: boolean;
  createdAt: number;
  source: TabSource;
  pinned: boolean;
  partition: string;  // ← NIEUW
}
```

#### 6. openTab methode (regel ~69)

```typescript
// HUIDIGE code:
async openTab(url: string = 'about:blank', groupId?: string, source: TabSource = 'robin'): Promise<Tab> {
  const id = this.nextId();
  const webContentsId: number = await this.win.webContents.executeJavaScript(`
    window.__tandemTabs.createTab(${JSON.stringify(id)}, ${JSON.stringify(url)})
  `);
  const tab: Tab = {
    id, webContentsId, title: 'New Tab', url, favicon: '',
    groupId: groupId || null, active: false, createdAt: Date.now(),
    source, pinned: false,
  };

// NIEUWE code:
async openTab(url: string = 'about:blank', groupId?: string, source: TabSource = 'robin', partition: string = 'persist:tandem'): Promise<Tab> {
  const id = this.nextId();
  const webContentsId: number = await this.win.webContents.executeJavaScript(`
    window.__tandemTabs.createTab(${JSON.stringify(id)}, ${JSON.stringify(url)}, ${JSON.stringify(partition)})
  `);
  const tab: Tab = {
    id, webContentsId, title: 'New Tab', url, favicon: '',
    groupId: groupId || null, active: false, createdAt: Date.now(),
    source, pinned: false, partition,
  };
```

#### 7. registerInitialTab (zoek in tabs/manager.ts)

The methode that the startup-tab registreert must also `partition: 'persist:tandem'` meegeven:

```typescript
// In registerInitialTab — voeg partition toe about the tab object:
partition: 'persist:tandem',
```

### Implementatie stappen — Sessie 3.1

1. Read `shell/index.html` rules 1283-1351 (createTab)
2. Read `shell/index.html` rules 3007-3017 (monkey-patch 1)
3. Read `shell/index.html` rules 3628-3634 (monkey-patch 2)
4. Read `src/tabs/manager.ts` rules 5-16 (Tab interface) and rules 69-105 (openTab)
5. Edit `shell/index.html` — createTab: voeg `partition` parameter toe (with default)
6. Edit `shell/index.html` — monkey-patch 1: forward `partition` parameter
7. Edit `shell/index.html` — monkey-patch 2: forward `partition` parameter
8. Edit `src/tabs/manager.ts` — Tab interface: voeg `partition: string` toe
9. Edit `src/tabs/manager.ts` — openTab: voeg `partition` parameter toe + pas executeJavaScript about
10. Edit `src/tabs/manager.ts` — registerInitialTab: voeg `partition: 'persist:tandem'` toe
11. `npx tsc` — zero errors
12. `npm start` — app start normaal, tabs werken still
13. Commit: `refactor: make partition configurable in tab creation stack`

### Verificatie — Sessie 3.1

```bash
# App start without errors
npm start

# Existing tab endpoints werken still
TOKEN=$(cat ~/.tandem/api-token)
curl -H "Authorization: Bearer $TOKEN" http://localhost:8765/tabs/list
curl -X POST http://localhost:8765/tabs/open \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com"}'

# npx tsc clean
npx tsc
```

**Belangrijk:** Na this session must ALLES still exact hetzelfde werken if voorheen. The default partition is `'persist:tandem'`, dus no existing functionaliteit verandert.

---

## Sessie 3.2 — SessionManager + CRUD endpoints

> **Goal:** SessionManager class + API endpoints for create/list/switch/destroy.
> **Requires:** Sessie 3.1 compleet (partition is configureerbaar)

### Implementatie stappen — Sessie 3.2

1. Maak `src/sessions/types.ts`
2. Maak `src/sessions/manager.ts` — SessionManager class
3. **Manager Wiring:** TandemAPIOptions + main.ts startAPI() + will-quit handler
4. Voeg SESSIONS section + endpoints toe about `server.ts`:
   - `GET /sessions/list`
   - `POST /sessions/create` → `sessionManager.create(name)` + optional direct a tab openen via `tabManager.openTab(url, null, 'kees', partition)`
   - `POST /sessions/switch` → `sessionManager.setActive(name)`
   - `POST /sessions/destroy` → closes tabs with that partition + `sessionManager.destroy(name)`
5. `npx tsc` — fix errors
6. Test: session aanmaken, tonen, verwijderen
7. Test: Robin's session can not removed be
8. Commit: `feat: /sessions create/list/switch/destroy`

### Verificatie — Sessie 3.2

```bash
TOKEN=$(cat ~/.tandem/api-token)

# List sessions (only default)
curl -H "Authorization: Bearer $TOKEN" http://localhost:8765/sessions/list

# New session aanmaken
curl -X POST http://localhost:8765/sessions/create \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"agent1"}'

# List nu with agent1
curl -H "Authorization: Bearer $TOKEN" http://localhost:8765/sessions/list

# Switch actieve session
curl -X POST http://localhost:8765/sessions/switch \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"agent1"}'

# Sessie verwijderen
curl -X POST http://localhost:8765/sessions/destroy \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"agent1"}'

# Default can NIET removed be (verwacht: error)
curl -X POST http://localhost:8765/sessions/destroy \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"default"}'
```

---

## Sessie 3.3 — State save/load + X-Session header

> **Goal:** Session state persistence + X-Session header op existing endpoints.
> **Requires:** Sessie 3.2 compleet (SessionManager works)

### Implementatie stappen — Sessie 3.3

1. Maak `src/sessions/state.ts` — StateManager class
2. `save()`: `session.fromPartition(partition).cookies.get({})` → JSON → disk (~/.tandem/sessions/)
3. `load()`: disk → JSON → `session.fromPartition(partition).cookies.set(cookie)` per cookie
4. **Manager Wiring:** Voeg `stateManager` toe about TandemAPIOptions + startAPI()
5. Voeg state endpoints toe about server.ts:
   - `POST /sessions/state/save`
   - `POST /sessions/state/load`
   - `GET /sessions/state/list`
6. Voeg `getSessionPartition()` helper methode toe in TandemAPI class
7. Pas existing endpoints about that session-aware must are:
   `/navigate`, `/click`, `/type`, `/scroll`, `/page-content`, `/screenshot`
   - Haal partition op via `this.getSessionPartition(req)`
   - Bij `/navigate`: if er no tab exists for that session, open a new with that partition
   - Bij andere endpoints: zoek the actieve tab for that partition
8. `npx tsc` — zero errors
9. Test: state save → session destroyen → state laden → cookies terug
10. Test: `X-Session: agent1` header op `/navigate` opens page in agent1 partition
11. Commit: `feat: session state save/load + X-Session header`

### Verificatie — Sessie 3.3

```bash
TOKEN=$(cat ~/.tandem/api-token)

# Maak session + navigeer erin
curl -X POST http://localhost:8765/sessions/create \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"agent1"}'

curl -X POST http://localhost:8765/navigate \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Session: agent1" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com"}'

# State save
curl -X POST http://localhost:8765/sessions/state/save \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"test-state"}'

# Sessie vernietigen
curl -X POST http://localhost:8765/sessions/destroy \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"agent1"}'

# New session + state laden
curl -X POST http://localhost:8765/sessions/create \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"restored"}'

curl -X POST http://localhost:8765/sessions/state/load \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Session: restored" \
  -H "Content-Type: application/json" \
  -d '{"name":"test-state"}'

# State list
curl -H "Authorization: Bearer $TOKEN" http://localhost:8765/sessions/state/list

# Default can not removed be
curl -X POST http://localhost:8765/sessions/destroy \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"default"}'
```

---

## Veelgemaakte fouten

**Partition timing:**

- ❌ Partition attribuut change NADAT webview in DOM is geplaatst (works not)
- ✅ Partition ALTIJD zetten VOOR `container.appendChild(wv)` — this doet createTab already correct

**Monkey-patches vergeten:**

- ❌ Only the originele `createTab` aanpassen but the 2 monkey-patches vergeten
- ✅ ALLE 3 plekken aanpassen: origineel (1285), activity patch (3009), find patch (3629)

**Robin's session:**

- ❌ `persist:tandem` partition use for agent sessions
- ✅ Altijd `persist:session-{name}` for agent sessions, `persist:tandem` only for "default"

**Initial tab:**

- ❌ The initial tab (regel ~1461) aanpassen — that is always Robin's session
- ✅ Only `createTab()` and the monkey-patches aanpassen, initial tab ongewijzigd laten

**CDP vs Electron API for cookies:**

- ❌ CDP `Network.getCookies` use for session state (works only op actieve tab)
- ✅ Electron `session.fromPartition(partition).cookies.get({})` (works for elke partition)

**Tab lookup:**

- ❌ `tabManager.getActiveWebContents()` use for agent session (geeft Robin's actieve tab)
- ✅ Filter tabs op partition: `tabManager.listTabs().filter(t => t.partition === partition)`

**Wiring:**

- ❌ Only endpoint add about server.ts and vergeten the manager te registreren
- ✅ Altijd 3 plekken: TandemAPIOptions, startAPI(), will-quit
