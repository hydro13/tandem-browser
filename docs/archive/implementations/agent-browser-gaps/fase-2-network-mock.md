# Fase 2 — /network/mock: Request Interceptie & Mocking

> **Doel:** Tandem API laat toe om network requests te intercepten, blokkeren of mocken.
> **Sessies:** 1 (alles in een sessie)
> **Vereist:** Fase 1 compleet (CDP patroon al bekend)

---

## Bestaande code te lezen (verplicht)

Lees deze bestanden (gebruik Read tool, NIET cat):

1. **`src/devtools/manager.ts`** — CDP lifecycle + `sendCommand()` methode (regel ~733)
   - **LET OP:** Network capture (ring buffer 300 entries) zit INLINE in dit bestand
   - Er is GEEN apart `network-capture.ts` bestand!
   - Zoek naar `Network.requestWillBeSent` en `Network.responseReceived` voor het bestaande patroon
   - Zoek naar `handleCDPEvent()` — hier worden CDP events gerouteerd
   - Zoek naar `subscribe()` — subscriber pattern voor externe CDP event listeners
2. **`src/devtools/types.ts`** — Bestaande CDP types (CDPNetworkEntry etc.)
3. **`src/api/server.ts`** — Zoek naar `// NETWORK INSPECTOR` (regel ~1446) voor bestaande network endpoints
   - `/network/log`, `/network/apis`, `/network/domains`, `/network/clear` bestaan al
   - Nieuwe mock endpoints moeten in een APARTE sectie komen, direct NA network inspector
4. **`src/main.ts`** — `startAPI()` (regel ~250) + `will-quit` (regel ~852)

---

## Architectuur

```
POST /network/mock
      │
      ▼
NetworkMocker.addRule(rule)
      │
      ├─ Eerste mock? → devtools.sendCommand('Fetch.enable', {patterns:[{urlPattern:"*"}]})
      ├─ Sla regel op in rules[]
      └─ Return bevestiging

Bij elke network request (CDP Fetch.requestPaused event):
      │
      ├─ matchRule(request.url)
      │      ├─ abort? → devtools.sendCommand('Fetch.failRequest', {requestId, errorReason:"BlockedByClient"})
      │      ├─ mock?  → devtools.sendCommand('Fetch.fulfillRequest', {requestId, responseCode, body, headers})
      │      └─ geen match → devtools.sendCommand('Fetch.continueRequest', {requestId})
      └─ Log naar bestaand network capture systeem
```

**CDP Event Listening — gebruik het subscriber pattern:**

DevToolsManager heeft een `subscribe()` methode voor externe CDP event listeners:

```typescript
interface CDPSubscriber {
  name: string;
  events: string[];  // CDP event namen, of ['*'] voor alles
  handler: (method: string, params: any) => void;
}
```

Gebruik dit om `Fetch.requestPaused` events te ontvangen:

```typescript
// In NetworkMocker constructor:
this.devtools.subscribe({
  name: 'NetworkMocker',
  events: ['Fetch.requestPaused'],
  handler: (method, params) => this.handleRequestPaused(params),
});
```

### Glob matching

Gebruik `minimatch` of handmatige glob: `*` = alles behalve `/`, `**` = alles inclusief `/`
Voorbeeld: `**/api/users/**` matcht `https://example.com/api/users/123/profile`

**Let op:** Vraag Robin of je `minimatch` als dependency mag toevoegen. Alternatief: schrijf een simpele handmatige glob functie.

---

## Nieuwe bestanden

### `src/network/types.ts`

```typescript
export interface MockRule {
  id: string;             // uuid via crypto.randomUUID()
  pattern: string;        // glob of exact URL
  abort?: boolean;        // true = blokkeren
  status?: number;        // HTTP status code (default: 200)
  body?: unknown;         // response body (JSON auto-serialized)
  headers?: Record<string, string>;
  delay?: number;         // ms vertraging voor mock response
  createdAt: number;
}
```

### `src/network/mocker.ts`

```typescript
import { DevToolsManager } from '../devtools/manager';
import { MockRule } from './types';

export class NetworkMocker {
  private rules: MockRule[] = [];
  private fetchEnabled = false;

  constructor(private devtools: DevToolsManager) {
    // Registreer CDP event subscriber voor Fetch.requestPaused
    this.devtools.subscribe({
      name: 'NetworkMocker',
      events: ['Fetch.requestPaused'],
      handler: (method, params) => this.handleRequestPaused(params),
    });
  }

  async addRule(rule: Omit<MockRule, 'id' | 'createdAt'>): Promise<MockRule>
  async removeRule(pattern: string): Promise<number>  // returns removed count
  async clearRules(): Promise<number>
  getRules(): MockRule[]

  private async enableFetch(): Promise<void>   // Fetch.enable via devtools.sendCommand()
  private async disableFetch(): Promise<void>  // Fetch.disable via devtools.sendCommand()
  private matchRule(url: string): MockRule | null
  private globMatch(pattern: string, url: string): boolean
  private async handleRequestPaused(params: any): Promise<void>

  destroy(): void {
    // Cleanup — wordt aangeroepen vanuit will-quit handler
  }
}
```

**Kritieke CDP details voor Fetch.fulfillRequest:**

```typescript
// Body moet base64 encoded zijn!
const bodyStr = typeof rule.body === 'string' ? rule.body : JSON.stringify(rule.body);
const responseBody = Buffer.from(bodyStr).toString('base64');

await this.devtools.sendCommand('Fetch.fulfillRequest', {
  requestId: params.requestId,
  responseCode: rule.status || 200,
  responseHeaders: [
    { name: 'Content-Type', value: 'application/json' },
    ...Object.entries(rule.headers || {}).map(([name, value]) => ({ name, value })),
  ],
  body: responseBody,  // base64 encoded!
});
```

---

## Manager Wiring (verplicht)

### 1. `src/api/server.ts` — TandemAPIOptions interface (regel ~64)

```typescript
export interface TandemAPIOptions {
  // ... bestaande velden ...
  networkMocker: NetworkMocker;
}
```

Plus private field + constructor toewijzing.

### 2. `src/main.ts` — startAPI() (regel ~250)

```typescript
// NA devToolsManager aanmaken:
const networkMocker = new NetworkMocker(devToolsManager!);

// In new TandemAPI({...}):
networkMocker: networkMocker!,
```

### 3. `src/main.ts` — will-quit handler (regel ~852)

```typescript
if (networkMocker) networkMocker.destroy();
```

---

## API Endpoints

Voeg deze toe in `server.ts` setupRoutes(), in een NIEUWE sectie direct NA `// NETWORK INSPECTOR` (regel ~1446):

```typescript
// ═══════════════════════════════════════════════
// NETWORK MOCK — Request Interceptie & Mocking
// ═══════════════════════════════════════════════
```

### `POST /network/mock` — mock toevoegen

```json
// Request — JSON response
{
  "pattern": "**/api/users/**",
  "status": 200,
  "body": {"users": [], "total": 0},
  "headers": {"X-Mocked": "true"},
  "delay": 200
}

// Request — blokkeren
{"pattern": "*.tracking.js", "abort": true}

// Request — exact URL
{"pattern": "https://api.example.com/v1/data", "status": 404, "body": {"error": "not found"}}

// Response
{"ok": true, "id": "abc123", "pattern": "**/api/users/**"}
```

### `GET /network/mocks` — actieve mocks

```json
{
  "ok": true,
  "mocks": [
    {"id": "abc123", "pattern": "**/api/**", "status": 200, "abort": false},
    {"id": "def456", "pattern": "*.ads.js", "abort": true}
  ],
  "count": 2
}
```

### `POST /network/unmock` — verwijder specifieke mock

```json
// Request
{"pattern": "**/api/users/**"}
// of
{"id": "abc123"}

// Response
{"ok": true, "removed": 1}
```

### `POST /network/mock-clear` — alles wissen

```json
{"ok": true, "removed": 3}
```

### Aliassen (agent-browser compatibel)

```
POST /network/route   → zelfde als POST /network/mock
POST /network/unroute → zelfde als POST /network/unmock
```

---

## Implementatie stappen

1. Maak `src/network/types.ts`
2. Maak `src/network/mocker.ts` — class skelet
3. **Manager Wiring:** TandemAPIOptions, startAPI(), will-quit
4. Implementeer `enableFetch()` — `this.devtools.sendCommand('Fetch.enable', {patterns:[{urlPattern:"*",requestStage:"Request"}]})`
5. Implementeer CDP subscriber voor `Fetch.requestPaused` events (via `devtools.subscribe()`)
6. Implementeer `matchRule()` + `globMatch()`
7. Implementeer `handleRequestPaused()` — match → fulfillRequest/failRequest/continueRequest
8. Implementeer `addRule()`, `removeRule()`, `clearRules()`
9. Voeg endpoints + sectie toe aan `server.ts`
10. `npx tsc` — fix errors
11. Curl tests (zie hieronder)
12. Verifieer: bestaande `/network/log`, `/network/apis` etc. werken nog
13. Commit

---

## Verificatie commando's

```bash
TOKEN=$(cat ~/.tandem/api-token)

# Mock instellen
curl -X POST http://localhost:8765/network/mock \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"pattern":"**/api/**","status":200,"body":{"mocked":true}}'

# Actieve mocks bekijken
curl -H "Authorization: Bearer $TOKEN" http://localhost:8765/network/mocks

# In browser: navigeer naar een pagina die /api/ aanroept → check response

# Blokkeer advertentie scripts
curl -X POST http://localhost:8765/network/mock \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"pattern":"*.doubleclick.net/**","abort":true}'

# Verwijder mock
curl -X POST http://localhost:8765/network/unmock \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"pattern":"**/api/**"}'

# Alles wissen
curl -X POST http://localhost:8765/network/mock-clear \
  -H "Authorization: Bearer $TOKEN"

# Bestaande network endpoints nog intact?
curl -H "Authorization: Bearer $TOKEN" http://localhost:8765/network/log \
  | python3 -c "import sys,json; print(json.load(sys.stdin).get('count', 'OK'))"
```

---

## Veelgemaakte fouten

**Fetch lifecycle:**

- ❌ `Fetch.enable` aanroepen terwijl er al een listener actief is → dubbele events
- ✅ Bijhouden of `fetchEnabled = true`, alleen een keer initialiseren

**Performance:**

- ❌ Alle requests intercepten ook als er geen mocks zijn (performance hit)
- ✅ `Fetch.enable` alleen als eerste mock toegevoegd wordt, `Fetch.disable` bij mock-clear

**Body encoding:**

- ❌ `body` als string sturen naar CDP (verwacht base64)
- ✅ `JSON.stringify()` → `Buffer.from(...).toString('base64')` voor `Fetch.fulfillRequest`

**Headers:**

- ❌ `Content-Type: application/json` vergeten bij JSON mock responses
- ✅ Default headers includeren: `[{ name: 'Content-Type', value: 'application/json' }]`

**CDP calls:**

- ❌ Direct op `wc.debugger.sendCommand()` werken
- ✅ Altijd via `this.devtools.sendCommand()`

**Wiring:**

- ❌ Alleen endpoint toevoegen aan server.ts en vergeten de manager te registreren
- ✅ Altijd 3 plekken: TandemAPIOptions, startAPI(), will-quit
