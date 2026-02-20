# Fase 1 — /snapshot: Accessibility Tree met @refs

> **Doel:** Een `/snapshot` endpoint bouwen dat de accessibility tree van de huidige pagina teruggeeft,
> met stabiele element-refs (@e1, @e2, ...) die andere endpoints kunnen gebruiken.
> **Sessies:** 1.1 (basis) + 1.2 (filters + @ref interactie)
> **Prioriteit:** HOOG — dit is de grootste missing feature vs agent-browser

---

## Context — Lees dit eerst

### Wat is een accessibility tree?

Een gestructureerde boom van alle UI-elementen op een pagina, zoals een browser die het ziet.
Browsers bouwen dit voor screenreaders. LLMs kunnen dit lezen zonder CSS selectors te kennen.

Voorbeeld output (zelfde stijl als agent-browser):

```
- document [document]
  - banner [banner]
    - heading "Tandem Browser" [@e1] level=1
  - navigation [navigation]
    - link "Home" [@e2] (focused)
    - link "About" [@e3]
  - main [main]
    - button "Sign In" [@e4]
    - textbox "Email" [@e5] value=""
    - textbox "Password" [@e6] value=""
```

### Waarom CDP en niet een injected script?

- `document.querySelectorAll()` in de webview zou detecteerbaar zijn
- CDP `Accessibility.getFullAXTree()` werkt vanuit het main process — onzichtbaar voor de pagina
- Zie AGENTS.md — "Alles wat Kees doet moet onzichtbaar zijn vanuit de webpagina's JavaScript context"

---

## Bestaande code te lezen (verplicht)

Lees deze bestanden (gebruik Read tool, NIET cat):

1. **`AGENTS.md`** — Anti-detect regels (KRITISCH)
2. **`src/devtools/manager.ts`** — CDP attach/detach patroon + `sendCommand()` methode (regel ~733)
   - Let op: network capture zit OOK inline in dit bestand (geen apart network-capture.ts!)
3. **`src/devtools/types.ts`** — Bestaande CDP types (DOMNodeInfo, StorageData, etc.)
4. **`src/api/server.ts`** — ~2385 regels, ~170 endpoints
   - Focus op de DevTools sectie (regel ~2162): zoek naar `// DEVTOOLS — CDP Bridge`
   - Kijk naar het response-patroon: `try/catch` + `res.json({ ok: true, ... })`
   - Kijk naar TandemAPIOptions interface (regel ~64) — hier moet SnapshotManager bij
5. **`src/tabs/manager.ts`** — `getActiveWebContents()` methode + Tab interface
6. **`src/main.ts`** — `startAPI()` functie (regel ~250) + `will-quit` handler (regel ~852)

---

## Architectuur

```
GET /snapshot
      │
      ▼
SnapshotManager.getSnapshot(options)
      │
      ├─ this.devtools.sendCommand('Accessibility.enable', {})
      ├─ this.devtools.sendCommand('Accessibility.getFullAXTree', {})
      ├─ filterNodes(tree, options)     ← interactive/compact/selector/depth
      ├─ assignRefs(nodes)              ← @e1, @e2, ... opslaan in RefMap
      └─ formatTree(nodes)              ← tekst output
```

**CDP Aanroep — ALTIJD via devToolsManager:**

```typescript
// ✅ GOED — via de bestaande DevToolsManager.sendCommand()
const result = await this.devtools.sendCommand('Accessibility.getFullAXTree', {});

// ❌ FOUT — nooit zelf debugger.attach() of sendCommand op wc aanroepen
const wc = tabManager.getActiveWebContents();
wc.debugger.sendCommand(...)  // NOOIT! DevToolsManager beheert de CDP verbinding
```

### Ref-map lifecycle

- Refs worden opgeslagen in memory (Map<string, nodeId>)
- Reset bij elke navigatie: luister op `did-navigate` event
- Stabiel binnen een pagina: zelfde element → altijd zelfde @ref
- **Navigatie-event registreren:** via `tabManager.getActiveWebContents()` + `wc.on('did-navigate', ...)`
  Of via de bestaande DevToolsManager event subscriber pattern (zie `subscribe()` methode)

---

## Nieuwe bestanden

### `src/snapshot/types.ts`

```typescript
export interface AccessibilityNode {
  nodeId: string;
  role: string;
  name?: string;
  ref?: string;           // "@e1", "@e2", etc.
  value?: string;
  description?: string;
  focused?: boolean;
  level?: number;         // voor headings
  children: AccessibilityNode[];
}

export interface RefMap {
  // "@e1" → CDP nodeId
  [ref: string]: string;
}

export interface SnapshotOptions {
  interactive?: boolean;  // alleen buttons/inputs/links/etc.
  compact?: boolean;      // lege structurele nodes weggooien
  selector?: string;      // scope tot CSS selector
  depth?: number;         // max diepte
}

export interface SnapshotResult {
  text: string;           // geformatteerde tree tekst
  count: number;          // aantal nodes
  url: string;            // huidige pagina URL
}
```

### `src/snapshot/manager.ts`

```typescript
import { DevToolsManager } from '../devtools/manager';
import { AccessibilityNode, RefMap, SnapshotOptions, SnapshotResult } from './types';

export class SnapshotManager {
  private refMap: RefMap = {};
  private refCounter = 0;

  constructor(private devtools: DevToolsManager) {}

  async getSnapshot(options: SnapshotOptions): Promise<SnapshotResult>
  async clickRef(ref: string): Promise<void>
  async fillRef(ref: string, value: string): Promise<void>
  async getTextRef(ref: string): Promise<string>

  private assignRefs(nodes: AccessibilityNode[]): void
  private filterNodes(nodes: AccessibilityNode[], options: SnapshotOptions): AccessibilityNode[]
  private formatTree(nodes: AccessibilityNode[], indent?: number): string

  destroy(): void {
    // Cleanup — wordt aangeroepen vanuit will-quit handler
  }
}
```

---

## Manager Wiring (verplicht bij sessie 1.1)

Na het bouwen van SnapshotManager, moet je hem op 3 plekken aansluiten:

### 1. `src/api/server.ts` — TandemAPIOptions interface (regel ~64)

Voeg toe aan de interface:

```typescript
export interface TandemAPIOptions {
  // ... bestaande velden ...
  snapshotManager: SnapshotManager;
}
```

En in de TandemAPI class een private field + toewijzing in constructor:

```typescript
private snapshotManager: SnapshotManager;
// in constructor:
this.snapshotManager = opts.snapshotManager;
```

### 2. `src/main.ts` — startAPI() (regel ~250)

```typescript
// NA devToolsManager aanmaken, VOOR new TandemAPI():
const snapshotManager = new SnapshotManager(devToolsManager!);

// In new TandemAPI({...}):
snapshotManager: snapshotManager!,
```

### 3. `src/main.ts` — will-quit handler (regel ~852)

```typescript
if (snapshotManager) snapshotManager.destroy();
```

---

## API Endpoints

Voeg deze toe in `server.ts` setupRoutes(), NA de DevTools sectie (zoek `// DEVTOOLS — CDP Bridge`), VOOR de Copilot Stream sectie (zoek `// COPILOT STREAM`):

```typescript
// ═══════════════════════════════════════════════
// SNAPSHOT — Accessibility Tree met @refs
// ═══════════════════════════════════════════════
```

### `GET /snapshot`

```json
// Response
{
  "ok": true,
  "snapshot": "- document [document]\n  - button \"Sign In\" [@e4]\n  ...",
  "count": 42,
  "url": "https://example.com"
}
```

### `GET /snapshot?interactive=true`

Retourneert alleen: `button`, `link`, `textbox`, `checkbox`, `radio`, `combobox`, `menuitem`, `tab`, `searchbox`

### `GET /snapshot?compact=true`

Verwijdert nodes met: geen naam, geen ref, geen relevante kinderen

### `GET /snapshot?selector=%23main`

Scope tot element gevonden via `DOM.querySelector` → only subtree van dat element

### `GET /snapshot?depth=3`

Retourneert max 3 niveaus diep

### `POST /snapshot/click`

```json
// Request
{"ref": "@e4"}

// Response
{"ok": true, "ref": "@e4", "nodeId": "123"}
```

Implementatie: ref → nodeId uit refMap → `DOM.resolveNode` → boundingBox → `webContents.sendInputEvent`

Kijk hoe de bestaande `/click` endpoint in server.ts het doet (zoek `// CLICK — via sendInputEvent`).
Hetzelfde patroon: `DOM.getBoxModel` → x,y berekenen → `wc.sendInputEvent({type:'mouseDown',...})`.

### `POST /snapshot/fill`

```json
// Request
{"ref": "@e5", "value": "test@example.com"}

// Response
{"ok": true, "ref": "@e5"}
```

Kijk hoe de bestaande `/type` endpoint het doet (zoek `// TYPE — via sendInputEvent`).
Hetzelfde patroon: per karakter `wc.sendInputEvent({type:'char', keyCode: char})`.

### `GET /snapshot/text?ref=@e1`

```json
{"ok": true, "ref": "@e1", "text": "Tandem Browser"}
```

---

## Sessie 1.1 — Implementatie stappen

1. Maak `src/snapshot/types.ts` — alleen de interfaces, geen logica
2. Maak `src/snapshot/manager.ts` — SnapshotManager class skelet
3. Implementeer `getSnapshot()` — CDP calls via `this.devtools.sendCommand()`
4. Implementeer `assignRefs()` — simpele teller, @e1 @e2 etc.
5. Implementeer `formatTree()` — recursief, inspringing per niveau
6. **Manager Wiring:** voeg SnapshotManager toe aan TandemAPIOptions, main.ts startAPI(), will-quit
7. Voeg sectie + `GET /snapshot` endpoint toe aan `src/api/server.ts`
8. `npx tsc` — fix errors
9. Test: `curl -H "Authorization: Bearer $(cat ~/.tandem/api-token)" http://localhost:8765/snapshot`
10. Implementeer `?interactive=true` filter
11. Test: `curl -H "Authorization: Bearer $(cat ~/.tandem/api-token)" "http://localhost:8765/snapshot?interactive=true"`
12. Commit

## Sessie 1.2 — Implementatie stappen

1. `?compact=true` filter — verwijder lege nodes
2. `?selector=` filter — CDP `DOM.querySelector` via `this.devtools.sendCommand()` + subtree scope
3. `?depth=` filter — recursie begrenzen
4. `POST /snapshot/click` — ref → nodeId → DOM.getBoxModel → sendInputEvent (kopieer patroon van `/click`)
5. `POST /snapshot/fill` — ref → nodeId → sendInputEvent type events (kopieer patroon van `/type`)
6. `GET /snapshot/text` — ref → nodeId → CDP `DOM.getOuterHTML` of node.name
7. Navigatie reset: luister op `did-navigate` → `refMap = {}`, `refCounter = 0`
8. `npx tsc` — zero errors
9. Curl test alle endpoints
10. Commit

---

## Verificatie commando's

```bash
TOKEN=$(cat ~/.tandem/api-token)

# Basis snapshot
curl -H "Authorization: Bearer $TOKEN" http://localhost:8765/snapshot \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['snapshot'][:2000])"

# Alleen interactieve elementen
curl -H "Authorization: Bearer $TOKEN" "http://localhost:8765/snapshot?interactive=true" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['snapshot'])"

# Klik via ref (gebruik een @ref uit de snapshot output)
curl -X POST http://localhost:8765/snapshot/click \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"ref":"@e1"}'

# Fill via ref
curl -X POST http://localhost:8765/snapshot/fill \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"ref":"@e5","value":"test@example.com"}'

# Tekst ophalen via ref
curl -H "Authorization: Bearer $TOKEN" "http://localhost:8765/snapshot/text?ref=@e1"
```

---

## Veelgemaakte fouten (voorkom ze)

**Anti-detect:**

- ❌ `document.querySelectorAll()` in webview — detecteerbaar
- ✅ CDP `Accessibility.getFullAXTree()` via `devtools.sendCommand()`

**CDP:**

- ❌ Zelf `debugger.attach()` aanroepen of direct op `wc.debugger` werken
- ✅ Altijd via `this.devtools.sendCommand('Method', params)`

**Refs:**

- ❌ Refs op basis van DOM positie (breekt bij dynamische pagina's)
- ✅ Refs op basis van CDP nodeId (stabiel voor lifetime van de node)

**Performance:**

- ❌ Alle nodes altijd teruggeven (te groot voor LLM context)
- ✅ `interactive` en `compact` filters implementeren

**TypeScript:**

- ❌ `any` types gebruiken (behalve in catch blocks)
- ✅ Volledige TypeScript types in `src/snapshot/types.ts`

**Wiring:**

- ❌ Alleen endpoint toevoegen aan server.ts en vergeten de manager te registreren
- ✅ Altijd 3 plekken: TandemAPIOptions, startAPI(), will-quit
