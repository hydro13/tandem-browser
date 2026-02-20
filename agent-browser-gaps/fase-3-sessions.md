# Fase 3 — /sessions: Geïsoleerde Browser Sessies

> **Doel:** Meerdere geïsoleerde browser sessies naast Robin's hoofdsessie.
> Elke sessie heeft eigen cookies, storage, en navigatiehistorie.
> **Sessies:** 3.1 (partition plumbing) + 3.2 (SessionManager + CRUD) + 3.3 (state + X-Session)
> **KRITISCH:** Robin's sessie (`persist:tandem`) wordt NOOIT aangeraakt.

---

## Bestaande code te lezen (verplicht)

Lees deze bestanden (gebruik Read tool, NIET cat):

1. **`shell/index.html`** — De RENDERER waar webviews worden aangemaakt
   - Zoek naar `window.__tandemTabs` (regel ~1283) — dit is het object dat tabs beheert
   - Zoek naar `createTab` (regel ~1285) — hier wordt `<webview>` aangemaakt met partition
   - **KRITISCH:** Partition is HARDCODED als `'persist:tandem'` op twee plekken:
     - `createTab()` functie (regel ~1289)
     - Initial tab aanmaak (regel ~1461)
   - **MONKEY-PATCHES:** createTab wordt 2x gewrapped door later code:
     - Regel ~3008-3017: Activity tracking wrapper
     - Regel ~3628-3634: Find events wrapper
     - Beide moeten de partition parameter doorsturen!
2. **`src/tabs/manager.ts`** — Main process tab manager
   - `openTab()` methode (regel ~69) — roept renderer aan via `executeJavaScript()`
   - Tab interface (regel ~5) heeft GEEN `partition` veld — moet je toevoegen
   - `getActiveWebContents()` — hoe de actieve tab wordt opgehaald
3. **`src/main.ts`** — `startAPI()` (regel ~250) + IPC handlers + `will-quit` (regel ~852)
   - Zoek naar `tab-focus` IPC handler — hier wordt CDP re-attached bij tab switch
   - Zoek naar `web-contents-created` — stealth wordt hier op ALLE webviews toegepast (partition-onafhankelijk)
4. **`src/preload.ts`** — contextBridge API (`window.tandem.*`)
5. **`src/api/server.ts`** — Zoek naar `// TAB MANAGEMENT` (regel ~610) voor bestaande tab endpoints
6. **`src/stealth/manager.ts`** — StealthManager past fingerprint patches toe per session

---

## Hoe Electron partities werken

```
Elke webview heeft een `partition` attribute (MOET gezet worden VOOR appendChild!):
- "persist:tandem"          ← Robin's sessie — cookies overleven restarts
- "persist:session-agent1"  ← Nieuwe agent sessie
- "persist:session-test"    ← Test sessie

Cookies/storage zijn STRIKT geïsoleerd per partition.
Twee webviews met zelfde partition delen cookies.
Electron maakt automatisch een nieuwe session aan bij een nieuw partition string.
```

---

## Hoe tabs NU worden aangemaakt (BELANGRIJK)

De tab-creatie flow gaat door TWEE lagen:

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

**createTab wordt 2x monkey-patched later in shell/index.html:**

```
Origineel:   createTab(tabId, url)              ← regel 1285
Wrapper 1:   _origCreateTab(tabId, url)          ← regel 3008 (activity tracking)
Wrapper 2:   _origCreateTab2(tabId, url)         ← regel 3628 (find events)
```

Alle 3 moeten de partition parameter doorsturen.

---

## Architectuur

```
POST /sessions/create {"name":"agent1"}
      │
      ▼
SessionManager.create("agent1")
      ├─ partition = "persist:session-agent1"
      ├─ Sla sessie op in sessions Map
      ├─ session.fromPartition(partition) → Electron maakt session aan
      └─ Return sessie info

POST /navigate met X-Session: agent1
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

## Nieuwe bestanden

### `src/sessions/types.ts`

```typescript
export interface Session {
  name: string;
  partition: string;       // "persist:session-{name}" of "persist:tandem" voor default
  createdAt: number;
  isDefault: boolean;      // true alleen voor "default" (Robin's sessie)
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
  private sessions: Map<string, Session> = new Map();
  private activeSession = 'default';

  constructor() {
    // Registreer default sessie (Robin's persist:tandem)
    this.sessions.set('default', {
      name: 'default',
      partition: 'persist:tandem',
      createdAt: Date.now(),
      isDefault: true,
    });
  }

  create(name: string): Session           // gooit error als naam al bestaat
  list(): Session[]
  get(name: string): Session | null
  getActive(): string                      // return this.activeSession
  setActive(name: string): void            // gooit error als sessie niet bestaat
  destroy(name: string): void              // gooit error als name === "default"
  resolvePartition(sessionName?: string): string  // naam → partition string

  cleanup(): void {
    // Cleanup — wordt aangeroepen vanuit will-quit handler
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
    // Maak stateDir aan als die niet bestaat
  }

  async save(sessionName: string, partition: string): Promise<string>
  // Cookies ophalen: session.fromPartition(partition).cookies.get({})
  // localStorage: via devtools.sendCommand('Runtime.evaluate', ...) op actieve tab van die sessie

  async load(sessionName: string, partition: string): Promise<{ cookiesRestored: number }>
  // Cookies zetten: session.fromPartition(partition).cookies.set(cookie)

  list(): string[]
  // Lees bestanden uit stateDir

  private encrypt(data: string): string   // AES-256-GCM als TANDEM_SESSION_KEY gezet
  private decrypt(data: string): string
}
```

**LET OP cookies ophalen:** Gebruik Electron's native `session.fromPartition(partition).cookies.get({})` in plaats van CDP `Network.getCookies`. Dit werkt voor ELKE partition, niet alleen de actieve tab.

---

## Manager Wiring (sessie 3.2)

### 1. `src/api/server.ts` — TandemAPIOptions interface (regel ~64)

```typescript
export interface TandemAPIOptions {
  // ... bestaande velden ...
  sessionManager: SessionManager;
  stateManager: StateManager;  // sessie 3.3
}
```

Plus private fields + constructor toewijzing.

### 2. `src/main.ts` — startAPI() (regel ~250)

```typescript
// SessionManager heeft geen dependencies:
const sessionManager = new SessionManager();

// StateManager heeft devToolsManager nodig:
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

Voeg deze toe in `server.ts` setupRoutes() in een NIEUWE sectie:

```typescript
// ═══════════════════════════════════════════════
// SESSIONS — Geïsoleerde Browser Sessies
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

Om het aantal tabs per sessie te tellen: `tabManager.listTabs().filter(t => t.partition === session.partition).length`

### `POST /sessions/create`

```json
// Request
{"name": "agent1"}

// Response
{"ok": true, "name": "agent1", "partition": "persist:session-agent1"}

// Error: naam bestaat al
{"ok": false, "error": "Session 'agent1' already exists"}
```

### `POST /sessions/switch`

```json
// Request — wisselt de "actieve API sessie" voor requests zonder X-Session header
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

Bij destroy: sluit alle tabs met die partition via `tabManager.closeTab()`.

### `POST /sessions/state/save`

```json
{"name": "twitter"}
// → slaat op in ~/.tandem/sessions/twitter.json (of .enc als versleuteld)
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

### X-Session header op bestaande endpoints

```bash
TOKEN=$(cat ~/.tandem/api-token)

# Gebruik agent1 sessie voor deze navigatie
curl -X POST http://localhost:8765/navigate \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Session: agent1" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://x.com"}'

# Hetzelfde werkt voor: /click, /type, /page-content, /scroll, /screenshot
```

Implementatie: helper functie in `server.ts`:

```typescript
private getSessionPartition(req: Request): string {
  const sessionName = req.headers['x-session'] as string;
  return this.sessionManager.resolvePartition(sessionName);
  // → "persist:tandem" als geen header of "default"
  // → "persist:session-{name}" als header aanwezig
}
```

---

## Sessie 3.1 — Partition Plumbing (renderer + TabManager)

> **Doel:** Maak partition configureerbaar door de hele tab-creatie stack.
> Geen nieuwe bestanden, geen nieuwe endpoints — alleen bestaande code aanpassen.
> Na deze sessie werkt alles nog exact hetzelfde (default = 'persist:tandem').

### Wat te wijzigen

**4 plekken in `shell/index.html`:**

#### 1. Originele `createTab` functie (regel ~1285)

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

De initial tab op regel ~1461 gebruikt `'persist:tandem'` hardcoded. Dit is correct — de startup tab is altijd Robin's sessie. Laat dit ongewijzigd.

**2 plekken in `src/tabs/manager.ts`:**

#### 5. Tab interface (regel ~5)

```typescript
// Voeg toe aan interface:
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

De methode die de startup-tab registreert moet ook `partition: 'persist:tandem'` meegeven:

```typescript
// In registerInitialTab — voeg partition toe aan het tab object:
partition: 'persist:tandem',
```

### Implementatie stappen — Sessie 3.1

1. Lees `shell/index.html` regels 1283-1351 (createTab)
2. Lees `shell/index.html` regels 3007-3017 (monkey-patch 1)
3. Lees `shell/index.html` regels 3628-3634 (monkey-patch 2)
4. Lees `src/tabs/manager.ts` regels 5-16 (Tab interface) en regels 69-105 (openTab)
5. Edit `shell/index.html` — createTab: voeg `partition` parameter toe (met default)
6. Edit `shell/index.html` — monkey-patch 1: forward `partition` parameter
7. Edit `shell/index.html` — monkey-patch 2: forward `partition` parameter
8. Edit `src/tabs/manager.ts` — Tab interface: voeg `partition: string` toe
9. Edit `src/tabs/manager.ts` — openTab: voeg `partition` parameter toe + pas executeJavaScript aan
10. Edit `src/tabs/manager.ts` — registerInitialTab: voeg `partition: 'persist:tandem'` toe
11. `npx tsc` — zero errors
12. `npm start` — app start normaal, tabs werken nog
13. Commit: `refactor: make partition configurable in tab creation stack`

### Verificatie — Sessie 3.1

```bash
# App start zonder errors
npm start

# Bestaande tab endpoints werken nog
TOKEN=$(cat ~/.tandem/api-token)
curl -H "Authorization: Bearer $TOKEN" http://localhost:8765/tabs/list
curl -X POST http://localhost:8765/tabs/open \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com"}'

# npx tsc clean
npx tsc
```

**Belangrijk:** Na deze sessie moet ALLES nog exact hetzelfde werken als voorheen. De default partition is `'persist:tandem'`, dus geen bestaande functionaliteit verandert.

---

## Sessie 3.2 — SessionManager + CRUD endpoints

> **Doel:** SessionManager class + API endpoints voor create/list/switch/destroy.
> **Vereist:** Sessie 3.1 compleet (partition is configureerbaar)

### Implementatie stappen — Sessie 3.2

1. Maak `src/sessions/types.ts`
2. Maak `src/sessions/manager.ts` — SessionManager class
3. **Manager Wiring:** TandemAPIOptions + main.ts startAPI() + will-quit handler
4. Voeg SESSIONS sectie + endpoints toe aan `server.ts`:
   - `GET /sessions/list`
   - `POST /sessions/create` → `sessionManager.create(name)` + optioneel direct een tab openen via `tabManager.openTab(url, null, 'kees', partition)`
   - `POST /sessions/switch` → `sessionManager.setActive(name)`
   - `POST /sessions/destroy` → sluit tabs met die partition + `sessionManager.destroy(name)`
5. `npx tsc` — fix errors
6. Test: sessie aanmaken, tonen, verwijderen
7. Test: Robin's sessie kan niet verwijderd worden
8. Commit: `feat: /sessions create/list/switch/destroy`

### Verificatie — Sessie 3.2

```bash
TOKEN=$(cat ~/.tandem/api-token)

# Lijst sessies (alleen default)
curl -H "Authorization: Bearer $TOKEN" http://localhost:8765/sessions/list

# Nieuwe sessie aanmaken
curl -X POST http://localhost:8765/sessions/create \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"agent1"}'

# Lijst nu met agent1
curl -H "Authorization: Bearer $TOKEN" http://localhost:8765/sessions/list

# Switch actieve sessie
curl -X POST http://localhost:8765/sessions/switch \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"agent1"}'

# Sessie verwijderen
curl -X POST http://localhost:8765/sessions/destroy \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"agent1"}'

# Default kan NIET verwijderd worden (verwacht: error)
curl -X POST http://localhost:8765/sessions/destroy \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"default"}'
```

---

## Sessie 3.3 — State save/load + X-Session header

> **Doel:** Session state persistence + X-Session header op bestaande endpoints.
> **Vereist:** Sessie 3.2 compleet (SessionManager werkt)

### Implementatie stappen — Sessie 3.3

1. Maak `src/sessions/state.ts` — StateManager class
2. `save()`: `session.fromPartition(partition).cookies.get({})` → JSON → disk (~/.tandem/sessions/)
3. `load()`: disk → JSON → `session.fromPartition(partition).cookies.set(cookie)` per cookie
4. **Manager Wiring:** Voeg `stateManager` toe aan TandemAPIOptions + startAPI()
5. Voeg state endpoints toe aan server.ts:
   - `POST /sessions/state/save`
   - `POST /sessions/state/load`
   - `GET /sessions/state/list`
6. Voeg `getSessionPartition()` helper methode toe in TandemAPI class
7. Pas bestaande endpoints aan die session-aware moeten zijn:
   `/navigate`, `/click`, `/type`, `/scroll`, `/page-content`, `/screenshot`
   - Haal partition op via `this.getSessionPartition(req)`
   - Bij `/navigate`: als er geen tab bestaat voor die sessie, open een nieuwe met die partition
   - Bij andere endpoints: zoek de actieve tab voor die partition
8. `npx tsc` — zero errors
9. Test: state opslaan → sessie destroyen → state laden → cookies terug
10. Test: `X-Session: agent1` header op `/navigate` opent pagina in agent1 partition
11. Commit: `feat: session state save/load + X-Session header`

### Verificatie — Sessie 3.3

```bash
TOKEN=$(cat ~/.tandem/api-token)

# Maak sessie + navigeer erin
curl -X POST http://localhost:8765/sessions/create \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"agent1"}'

curl -X POST http://localhost:8765/navigate \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Session: agent1" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com"}'

# State opslaan
curl -X POST http://localhost:8765/sessions/state/save \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"test-state"}'

# Sessie vernietigen
curl -X POST http://localhost:8765/sessions/destroy \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"agent1"}'

# Nieuwe sessie + state laden
curl -X POST http://localhost:8765/sessions/create \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"restored"}'

curl -X POST http://localhost:8765/sessions/state/load \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Session: restored" \
  -H "Content-Type: application/json" \
  -d '{"name":"test-state"}'

# State lijst
curl -H "Authorization: Bearer $TOKEN" http://localhost:8765/sessions/state/list

# Default kan niet verwijderd worden
curl -X POST http://localhost:8765/sessions/destroy \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"default"}'
```

---

## Veelgemaakte fouten

**Partition timing:**

- ❌ Partition attribuut wijzigen NADAT webview in DOM is geplaatst (werkt niet)
- ✅ Partition ALTIJD zetten VOOR `container.appendChild(wv)` — dit doet createTab al correct

**Monkey-patches vergeten:**

- ❌ Alleen de originele `createTab` aanpassen maar de 2 monkey-patches vergeten
- ✅ ALLE 3 plekken aanpassen: origineel (1285), activity patch (3009), find patch (3629)

**Robin's sessie:**

- ❌ `persist:tandem` partition gebruiken voor agent sessies
- ✅ Altijd `persist:session-{name}` voor agent sessies, `persist:tandem` alleen voor "default"

**Initial tab:**

- ❌ De initial tab (regel ~1461) aanpassen — die is altijd Robin's sessie
- ✅ Alleen `createTab()` en de monkey-patches aanpassen, initial tab ongewijzigd laten

**CDP vs Electron API voor cookies:**

- ❌ CDP `Network.getCookies` gebruiken voor session state (werkt alleen op actieve tab)
- ✅ Electron `session.fromPartition(partition).cookies.get({})` (werkt voor elke partition)

**Tab lookup:**

- ❌ `tabManager.getActiveWebContents()` gebruiken voor agent sessie (geeft Robin's actieve tab)
- ✅ Filter tabs op partition: `tabManager.listTabs().filter(t => t.partition === partition)`

**Wiring:**

- ❌ Alleen endpoint toevoegen aan server.ts en vergeten de manager te registreren
- ✅ Altijd 3 plekken: TandemAPIOptions, startAPI(), will-quit
