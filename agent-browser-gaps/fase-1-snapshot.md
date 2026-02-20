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

```bash
# 1. Anti-detect regels — KRITISCH
cat AGENTS.md

# 2. Hoe CDP al gebruikt wordt — patroon hergebruiken
cat src/devtools/manager.ts

# 3. Bestaande CDP types
cat src/devtools/types.ts

# 4. Waar de nieuwe endpoints bij komen
cat src/api/server.ts | grep -n "app.get\|app.post" | tail -30

# 5. Hoe tabs/webContents werken
cat src/tabs/manager.ts | head -100
```

---

## Architectuur

```
GET /snapshot
      │
      ▼
SnapshotManager.getSnapshot(options)
      │
      ├─ CDP: Accessibility.enable()
      ├─ CDP: Accessibility.getFullAXTree()
      ├─ filterNodes(tree, options)     ← interactive/compact/selector/depth
      ├─ assignRefs(nodes)              ← @e1, @e2, ... opslaan in RefMap
      └─ formatTree(nodes)              ← tekst output
```

### Ref-map lifecycle
- Refs worden opgeslagen in memory (Map<string, nodeId>)
- Reset bij elke navigatie: `webContents.on('did-navigate', () => refMap.clear())`
- Stabiel binnen één pagina: zelfde element → altijd zelfde @ref

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
```

### `src/snapshot/manager.ts`
```typescript
export class SnapshotManager {
  private refMap: RefMap = {};
  private refCounter = 0;

  constructor(private devtools: DevToolsManager) {
    // Reset refs bij navigatie
    // webContents.on('did-navigate', ...) — zie main.ts voor patroon
  }

  async getSnapshot(options: SnapshotOptions): Promise<string>
  async clickRef(ref: string): Promise<void>
  async fillRef(ref: string, value: string): Promise<void>
  async getTextRef(ref: string): Promise<string>

  private assignRefs(nodes: AccessibilityNode[]): void
  private filterNodes(nodes: AccessibilityNode[], options: SnapshotOptions): AccessibilityNode[]
  private formatTree(nodes: AccessibilityNode[], indent?: number): string
}
```

---

## API Endpoints

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

### `POST /snapshot/fill`
```json
// Request  
{"ref": "@e5", "value": "test@example.com"}

// Response
{"ok": true, "ref": "@e5"}
```

### `GET /snapshot/text?ref=@e1`
```json
{"ok": true, "ref": "@e1", "text": "Tandem Browser"}
```

---

## Sessie 1.1 — Implementatie stappen

1. Maak `src/snapshot/types.ts` — alleen de interfaces, geen logica
2. Maak `src/snapshot/manager.ts` — SnapshotManager class skelet
3. Implementeer `getFullAXTree()` via CDP (kijk hoe `devtools/manager.ts` CDP aanroept)
4. Implementeer `assignRefs()` — simpele teller, @e1 @e2 etc.
5. Implementeer `formatTree()` — recursief, inspringing per niveau
6. Voeg toe aan `src/api/server.ts`: `GET /snapshot`
7. `npx tsc` — fix errors
8. Test: `curl http://localhost:8765/snapshot`
9. Implementeer `?interactive=true` filter
10. Test: `curl "http://localhost:8765/snapshot?interactive=true"`
11. Commit

## Sessie 1.2 — Implementatie stappen

1. `?compact=true` filter — verwijder lege nodes
2. `?selector=` filter — CDP DOM.querySelector + subtree scope
3. `?depth=` filter — recursie begrenzen
4. `POST /snapshot/click` — ref → nodeId → sendInputEvent
5. `POST /snapshot/fill` — ref → nodeId → sendInputEvent type events
6. `GET /snapshot/text` — ref → nodeId → CDP DOM.getOuterHTML of node.name
7. Navigatie reset: `webContents.on('did-navigate')` → `refMap = {}`, `refCounter = 0`
8. `npx tsc` — zero errors
9. Curl test alle endpoints
10. Commit

---

## Verificatie commando's

```bash
# Basis snapshot
curl http://localhost:8765/snapshot | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['snapshot'][:2000])"

# Alleen interactieve elementen
curl "http://localhost:8765/snapshot?interactive=true" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['snapshot'])"

# Klik via ref (gebruik een @ref uit de snapshot output)
curl -X POST http://localhost:8765/snapshot/click \
  -H "Content-Type: application/json" \
  -d '{"ref":"@e1"}'

# Fill via ref
curl -X POST http://localhost:8765/snapshot/fill \
  -H "Content-Type: application/json" \
  -d '{"ref":"@e5","value":"test@example.com"}'
```

---

## Veelgemaakte fouten (voorkom ze)

❌ `document.querySelectorAll()` in webview — detecteerbaar  
✅ CDP `Accessibility.getFullAXTree()` vanuit main process

❌ Refs op basis van DOM positie (breekt bij dynamische pagina's)  
✅ Refs op basis van CDP nodeId (stabiel voor lifetime van de node)

❌ Alle nodes altijd teruggeven (te groot voor LLM context)  
✅ Default: compact=true voor productie gebruik

❌ `any` types gebruiken  
✅ Volledige TypeScript types in `src/snapshot/types.ts`
