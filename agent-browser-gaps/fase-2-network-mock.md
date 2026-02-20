# Fase 2 — /network/mock: Request Interceptie & Mocking

> **Doel:** Tandem API laat toe om network requests te intercepten, blokkeren of mocken.  
> **Sessies:** 1 (alles in één sessie)  
> **Vereist:** Fase 1 compleet (CDP patroon al bekend)

---

## Bestaande code te lezen (verplicht)

```bash
cat src/devtools/network-capture.ts   # Bestaand network monitoring — uitbreiden, niet vervangen
cat src/devtools/manager.ts           # CDP lifecycle patroon
cat src/api/server.ts | grep network  # Bestaande /devtools/network endpoints
```

---

## Architectuur

```
POST /network/mock
      │
      ▼
NetworkMocker.addRule(rule)
      │
      ├─ Eerste mock? → CDP: Fetch.enable({patterns:[{urlPattern:"*"}]})
      ├─ Sla regel op in rules[]
      └─ Return bevestiging

Bij elke network request (CDP Fetch.requestPaused event):
      │
      ├─ match(request.url, rules)
      │      ├─ abort? → Fetch.failRequest({errorReason:"BlockedByClient"})
      │      ├─ mock? → Fetch.fulfillRequest({body, statusCode, headers})
      │      └─ geen match → Fetch.continueRequest({})
      └─ Log naar bestaand network capture systeem
```

### Glob matching
Gebruik `minimatch` of handmatige glob: `*` = alles behalve `/`, `**` = alles inclusief `/`
Voorbeeld: `**/api/users/**` matcht `https://example.com/api/users/123/profile`

---

## Nieuwe bestanden

### `src/network/types.ts`
```typescript
export interface MockRule {
  id: string;             // uuid
  pattern: string;        // glob of exact URL
  abort?: boolean;        // true = blokkeren
  status?: number;        // HTTP status code (default: 200)
  body?: unknown;         // response body (JSON auto-serialized)
  headers?: Record<string, string>;
  delay?: number;         // ms vertraging voor mock response
  createdAt: number;
}

export interface MockMatch {
  rule: MockRule;
  requestId: string;
}
```

### `src/network/mocker.ts`
```typescript
export class NetworkMocker {
  private rules: MockRule[] = [];
  private enabled = false;

  constructor(private devtools: DevToolsManager) {}

  async addRule(rule: Omit<MockRule, 'id' | 'createdAt'>): Promise<MockRule>
  async removeRule(pattern: string): Promise<void>
  async clearRules(): Promise<void>
  getRules(): MockRule[]

  private async enable(): Promise<void>   // Fetch.enable
  private async disable(): Promise<void>  // Fetch.disable
  private matchRule(url: string): MockRule | null
  private globMatch(pattern: string, url: string): boolean
}
```

---

## API Endpoints

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
3. Implementeer `enable()` — `CDP: Fetch.enable({patterns:[{urlPattern:"*",requestStage:"Request"}]})`
4. Implementeer CDP event handler: `Fetch.requestPaused`
   - Kijk hoe `devtools/manager.ts` CDP events afhandelt — gebruik hetzelfde patroon
5. Implementeer `matchRule()` + `globMatch()`
6. Implementeer `addRule()`, `removeRule()`, `clearRules()`
7. Voeg endpoints toe aan `server.ts`
8. `npx tsc` — fix errors
9. Curl tests (zie hieronder)
10. Verifieer: `/devtools/network` werkt nog (bestaande network capture)
11. Commit

---

## Verificatie commando's

```bash
# Mock instellen
curl -X POST http://localhost:8765/network/mock \
  -H "Content-Type: application/json" \
  -d '{"pattern":"**/api/**","status":200,"body":{"mocked":true}}'

# Actieve mocks bekijken
curl http://localhost:8765/network/mocks

# In browser: navigeer naar een pagina die /api/ aanroept → check response

# Blokkeer advertentie scripts
curl -X POST http://localhost:8765/network/mock \
  -H "Content-Type: application/json" \
  -d '{"pattern":"*.doubleclick.net/**","abort":true}'

# Verwijder mock
curl -X POST http://localhost:8765/network/unmock \
  -H "Content-Type: application/json" \
  -d '{"pattern":"**/api/**"}'

# Alles wissen
curl -X POST http://localhost:8765/network/mock-clear

# Bestaande network endpoints nog intact?
curl http://localhost:8765/devtools/network | python3 -c "import sys,json; print(json.load(sys.stdin)['count'])"
```

---

## Veelgemaakte fouten

❌ `Fetch.enable` aanroepen terwijl er al een listener actief is → dubbele events  
✅ Bijhouden of `enabled = true`, alleen één keer initialiseren

❌ Alle requests intercepten ook als er geen mocks zijn (performance hit)  
✅ `Fetch.enable` alleen als eerste mock toegevoegd wordt, `Fetch.disable` bij mock-clear

❌ `body` als string sturen terwijl CDP base64 verwacht  
✅ JSON → `JSON.stringify()` → `Buffer.from(...).toString('base64')` voor `responseBody`

❌ `Content-Type: application/json` vergeten bij JSON mock responses  
✅ Default headers includeren: `{"Content-Type":"application/json"}`
