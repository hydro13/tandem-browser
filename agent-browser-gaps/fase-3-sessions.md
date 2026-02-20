# Fase 3 — /sessions: Geïsoleerde Browser Sessies

> **Doel:** Meerdere geïsoleerde browser sessies naast Robin's hoofdsessie.  
> Elke sessie heeft eigen cookies, storage, en navigatiehistorie.  
> **Sessies:** 3.1 (CRUD) + 3.2 (state save/load + X-Session header)  
> **⚠️ KRITISCH:** Robin's sessie (`persist:tandem`) wordt NOOIT aangeraakt.

---

## Bestaande code te lezen (verplicht)

```bash
cat src/tabs/manager.ts        # Electron partition/webview lifecycle
cat src/main.ts                # webContents lifecycle, IPC handlers
cat src/api/server.ts | grep tabs  # Bestaande tab endpoints
```

---

## Hoe Electron partities werken

```
Elke webview heeft een `partition` attribute:
- "persist:tandem"          ← Robin's sessie — cookies overleven restarts
- "persist:session-agent1"  ← Nieuwe agent sessie
- "persist:session-test"    ← Test sessie

Cookies/storage zijn STRIKT geïsoleerd per partition.
Twee webviews met zelfde partition delen cookies.
```

---

## Architectuur

```
POST /sessions/create {"name":"agent1"}
      │
      ▼
SessionManager.create("agent1")
      ├─ partition = "persist:session-agent1"
      ├─ Sla sessie op in sessions Map
      └─ Return sessie info

Bestaande endpoints (navigate, click, etc.) met X-Session header:
      │
      ├─ SessionManager.resolvePartition(req.headers['x-session'])
      ├─ TabManager.getActiveTabForSession(partition)
      └─ Operatie uitvoeren op juiste webview
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
  cookies: CookieData[];
  localStorage: Record<string, Record<string, string>>;  // url → key → value
  savedAt: number;
  encrypted: boolean;
}
```

### `src/sessions/manager.ts`
```typescript
export class SessionManager {
  private sessions: Map<string, Session> = new Map();
  private DEFAULT = "default";

  constructor() {
    // Registreer default sessie (Robin's persist:tandem)
    this.sessions.set("default", {
      name: "default",
      partition: "persist:tandem",
      createdAt: Date.now(),
      isDefault: true
    });
  }

  create(name: string): Session
  list(): Session[]
  get(name: string): Session | null
  destroy(name: string): void      // gooit error als name === "default"
  resolvePartition(sessionName?: string): string
}
```

### `src/sessions/state.ts`
```typescript
export class StateManager {
  private stateDir = path.join(app.getPath("userData"), "sessions");

  async save(sessionName: string, partition: string): Promise<string>
  async load(sessionName: string, partition: string): Promise<void>
  list(): string[]
  private encrypt(data: string): string   // AES-256-GCM als TANDEM_SESSION_KEY gezet
  private decrypt(data: string): string
}
```

---

## API Endpoints

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

### `POST /sessions/state/save`
```json
{"name": "twitter"}
// → slaat op in ~/.tandem/sessions/twitter.json (of .enc als versleuteld)
{"ok": true, "path": "/Users/robin/.tandem/sessions/twitter.json"}
```

### `POST /sessions/state/load`
```json
{"name": "twitter"}
{"ok": true, "cookiesRestored": 12, "localStorageRestored": 3}
```

### `GET /sessions/state/list`
```json
{"ok": true, "states": ["twitter", "linkedin", "github"]}
```

### X-Session header op bestaande endpoints
```bash
# Gebruik agent1 sessie voor deze navigatie
curl -X POST http://localhost:8765/navigate \
  -H "X-Session: agent1" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://x.com"}'

# Hetzelfde werkt voor: /click, /type, /page-content, /scroll, /screenshot
```

Implementatie: in `server.ts` middleware:
```typescript
const getSessionPartition = (req: Request): string => {
  const sessionName = req.headers['x-session'] as string;
  return sessionManager.resolvePartition(sessionName);
  // → "persist:tandem" als geen header
  // → "persist:session-{name}" als header aanwezig
};
```

---

## Implementatie stappen — Sessie 3.1

1. Maak `src/sessions/types.ts`
2. Maak `src/sessions/manager.ts` — SessionManager class
3. Initialiseer in `src/main.ts` (of server.ts): `const sessionManager = new SessionManager()`
4. Voeg endpoints toe: `GET /sessions/list`, `POST /sessions/create`, `POST /sessions/switch`, `POST /sessions/destroy`
5. `npx tsc` — fix errors
6. Test: sessie aanmaken, tonen, verwijderen
7. Test: Robin's sessie kan niet verwijderd worden
8. Commit

## Implementatie stappen — Sessie 3.2

1. Maak `src/sessions/state.ts` — StateManager class
2. `save()`: CDP Network.getCookies() → JSON → disk (+ optioneel AES encryptie)
3. `load()`: disk → JSON → CDP Network.setCookie() per cookie
4. Voeg endpoints toe: `POST /sessions/state/save`, `POST /sessions/state/load`, `GET /sessions/state/list`
5. Voeg `X-Session` middleware toe in `server.ts`
6. Pas `/navigate`, `/click`, `/type`, `/scroll`, `/page-content`, `/screenshot` aan: gebruik `getSessionPartition(req)`
7. `npx tsc` — zero errors
8. Test: state opslaan → sessie destroyen → state laden → cookies terug
9. Test: X-Session header werkt op /navigate
10. Commit

---

## Verificatie commando's

```bash
# Lijst sessies
curl http://localhost:8765/sessions/list

# Nieuwe sessie
curl -X POST http://localhost:8765/sessions/create \
  -H "Content-Type: application/json" \
  -d '{"name":"agent1"}'

# Navigeer in agent1 sessie (Robin's sessie onaangetast)
curl -X POST http://localhost:8765/navigate \
  -H "X-Session: agent1" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com"}'

# State opslaan
curl -X POST http://localhost:8765/sessions/state/save \
  -H "Content-Type: application/json" \
  -d '{"name":"test-state"}'

# State laden in nieuwe sessie
curl -X POST http://localhost:8765/sessions/create -d '{"name":"restored"}'
curl -X POST http://localhost:8765/sessions/state/load \
  -H "X-Session: restored" \
  -d '{"name":"test-state"}'

# Sessie verwijderen
curl -X POST http://localhost:8765/sessions/destroy \
  -H "Content-Type: application/json" \
  -d '{"name":"agent1"}'

# Default kan niet verwijderd worden (verwacht: error)
curl -X POST http://localhost:8765/sessions/destroy \
  -H "Content-Type: application/json" \
  -d '{"name":"default"}'
```
