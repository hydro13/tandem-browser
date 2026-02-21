# Phase 2: Semantic Locators (Playwright-style)

## Goal

CSS selectors zijn fragiel en moeilijk te genereren vanuit een AI. Playwright-style locators
laten Kees elementen vinden op basis van wat ze *zijn* (rol, tekst, label, placeholder) in
plaats van hoe ze er in de DOM uitzien. Na deze phase kan Kees zeggen:
`POST /find {"by":"role","value":"button","name":"Submit"}` en krijgt hij een `@ref` terug
die bruikbaar is met de bestaande `/snapshot/click` en `/snapshot/fill` endpoints.

## Prerequisites

- **Phase 1 MUST be COMPLETED** — check STATUS.md
- Lees `src/snapshot/manager.ts` volledig — de `LocatorFinder` bouwt hierop
- Lees `src/devtools/manager.ts` — begrijp `sendCommand()` en hoe CDP wordt aangeroepen
- Lees `src/api/server.ts` — kijk hoe `/snapshot/*` routes zijn geregistreerd (zoek op `snapshotManager`)
- Begrip van `AccessibilityNode` type in `src/snapshot/types.ts`

## Deliverables

### 1. `src/locators/finder.ts` — LocatorFinder

```typescript
import { DevToolsManager } from '../devtools/manager';
import { SnapshotManager } from '../snapshot/manager';

export type LocatorStrategy = 'role' | 'text' | 'placeholder' | 'label' | 'testid';

export interface LocatorQuery {
  by: LocatorStrategy;
  value: string;
  name?: string;      // Voor role: optionele accessible name filter
  exact?: boolean;    // Default true; false = substring match
}

export interface LocatorResult {
  found: boolean;
  ref?: string;        // '@e5' — bruikbaar met /snapshot/click
  text?: string;       // Zichtbare tekst van het element
  role?: string;       // ARIA role
  tagName?: string;    // DOM tag (button, input, a, ...)
  count?: number;      // Aantal matches (altijd 1 — we geven eerste terug)
}

export class LocatorFinder {
  constructor(
    private devTools: DevToolsManager,
    private snapshot: SnapshotManager,
  ) {}

  async find(query: LocatorQuery): Promise<LocatorResult> {
    switch (query.by) {
      case 'role':        return this.findByRole(query);
      case 'text':        return this.findByText(query);
      case 'placeholder': return this.findByPlaceholder(query);
      case 'label':       return this.findByLabel(query);
      case 'testid':      return this.findByTestId(query);
      default:
        throw new Error(`Unknown locator strategy: ${(query as any).by}`);
    }
  }

  // ─── Role ─────────────────────────────────────

  private async findByRole(query: LocatorQuery): Promise<LocatorResult> {
    // Gebruik de bestaande snapshot tree — rollen zijn al gemapt
    // Vraag een volledige snapshot op en filter op role + optionele name
    const tree = await this.snapshot.getAccessibilityTree({ interactive: false });

    const match = this.walkTree(tree, (node) => {
      if (node.role.toLowerCase() !== query.value.toLowerCase()) return false;
      if (query.name) {
        const exact = query.exact !== false;
        const nodeName = node.name?.toLowerCase() ?? '';
        const wantName = query.name.toLowerCase();
        return exact ? nodeName === wantName : nodeName.includes(wantName);
      }
      return true;
    });

    if (!match) return { found: false };
    return { found: true, ref: match.ref, text: match.name, role: match.role };
  }

  // ─── Text ─────────────────────────────────────

  private async findByText(query: LocatorQuery): Promise<LocatorResult> {
    // CDP DOM.performSearch of accessibility name match
    // Probeer eerst de snapshot (name = accessible name = zichtbare tekst voor veel elementen)
    const tree = await this.snapshot.getAccessibilityTree({ interactive: false });
    const exact = query.exact !== false;

    const match = this.walkTree(tree, (node) => {
      const nodeName = node.name?.toLowerCase() ?? '';
      const want = query.value.toLowerCase();
      return exact ? nodeName === want : nodeName.includes(want);
    });

    if (match) return { found: true, ref: match.ref, text: match.name, role: match.role };

    // Fallback: DOM text search via CDP
    return this.findByDomText(query.value, exact);
  }

  private async findByDomText(text: string, exact: boolean): Promise<LocatorResult> {
    try {
      // XPath voor text content
      const xpath = exact
        ? `//*[normalize-space(text())="${text}"]`
        : `//*[contains(normalize-space(text()),"${text}")]`;

      const result = await this.devTools.sendCommand('DOM.performSearch', {
        query: xpath,
        includeUserAgentShadowDOM: false,
      });

      if (!result?.resultCount) return { found: false };

      // Haal eerste resultaat op
      const nodes = await this.devTools.sendCommand('DOM.getSearchResults', {
        searchId: result.searchId,
        fromIndex: 0,
        toIndex: 1,
      });

      await this.devTools.sendCommand('DOM.discardSearchResults', {
        searchId: result.searchId,
      });

      if (!nodes?.nodeIds?.[0]) return { found: false };

      // Converteer nodeId naar accessibility ref
      return this.nodeIdToLocatorResult(nodes.nodeIds[0]);
    } catch {
      return { found: false };
    }
  }

  // ─── Placeholder ──────────────────────────────

  private async findByPlaceholder(query: LocatorQuery): Promise<LocatorResult> {
    try {
      const exact = query.exact !== false;
      const selector = exact
        ? `input[placeholder="${query.value}"], textarea[placeholder="${query.value}"]`
        : `input[placeholder*="${query.value}"], textarea[placeholder*="${query.value}"]`;

      return this.findByCssSelector(selector);
    } catch {
      return { found: false };
    }
  }

  // ─── Label ────────────────────────────────────

  private async findByLabel(query: LocatorQuery): Promise<LocatorResult> {
    // Zoek label element, pak for-attribuut of omsloten input
    try {
      const exact = query.exact !== false;
      const labelXpath = exact
        ? `//label[normalize-space(text())="${query.value}"]`
        : `//label[contains(normalize-space(text()),"${query.value}")]`;

      const result = await this.devTools.sendCommand('DOM.performSearch', {
        query: labelXpath,
        includeUserAgentShadowDOM: false,
      });

      if (!result?.resultCount) return { found: false };

      const nodes = await this.devTools.sendCommand('DOM.getSearchResults', {
        searchId: result.searchId,
        fromIndex: 0,
        toIndex: 1,
      });
      await this.devTools.sendCommand('DOM.discardSearchResults', {
        searchId: result.searchId,
      });

      if (!nodes?.nodeIds?.[0]) return { found: false };

      // Haal het for-attribuut op van het label
      const attrs = await this.devTools.sendCommand('DOM.getAttributes', {
        nodeId: nodes.nodeIds[0],
      });
      const attrList: string[] = attrs?.attributes ?? [];
      const forIdx = attrList.indexOf('for');
      const forValue = forIdx >= 0 ? attrList[forIdx + 1] : null;

      if (forValue) {
        // Zoek input met dat id
        return this.findByCssSelector(`#${CSS.escape(forValue)}`);
      }

      // Geen for-attribuut — zoek omsloten input
      return this.findByCssSelector(
        `label:has(input), label:has(select), label:has(textarea)`,
      );
    } catch {
      return { found: false };
    }
  }

  // ─── TestID ───────────────────────────────────

  private async findByTestId(query: LocatorQuery): Promise<LocatorResult> {
    const exact = query.exact !== false;
    const selector = exact
      ? `[data-testid="${query.value}"]`
      : `[data-testid*="${query.value}"]`;
    return this.findByCssSelector(selector);
  }

  // ─── Helpers ──────────────────────────────────

  private async findByCssSelector(selector: string): Promise<LocatorResult> {
    try {
      const doc = await this.devTools.sendCommand('DOM.getDocument', { depth: 0 });
      const result = await this.devTools.sendCommand('DOM.querySelector', {
        nodeId: doc.root.nodeId,
        selector,
      });
      if (!result?.nodeId) return { found: false };
      return this.nodeIdToLocatorResult(result.nodeId);
    } catch {
      return { found: false };
    }
  }

  private async nodeIdToLocatorResult(nodeId: number): Promise<LocatorResult> {
    try {
      // Resolve via accessibility tree — geeft ons de ref
      const axNode = await this.devTools.sendCommand('Accessibility.getAXNodeAndAncestors', {
        backendNodeId: undefined,
        nodeId,
      });
      // axNode.nodes[0] is het gevraagde element
      const node = axNode?.nodes?.[0];
      if (!node) return { found: false };

      // De ref mapping staat in SnapshotManager — we genereren hier een dummy ref
      // en vertrouwen op SnapshotManager.resolveRef() via de snapshot endpoint
      // Alternatief: gebruik objectId + remoteObject
      const role = node.role?.value ?? 'unknown';
      const name = node.name?.value ?? '';

      // Haal de @ref op via een snapshot met genoeg diepte
      // Eenvoudigere aanpak: geef nodeId terug als fallback-ref
      return { found: true, ref: `#node-${nodeId}`, text: name, role };
    } catch {
      return { found: false };
    }
  }

  // ─── Tree walker ──────────────────────────────

  private walkTree(
    nodes: ReturnType<SnapshotManager['getAccessibilityTree']> extends Promise<infer T> ? T : never,
    predicate: (node: any) => boolean,
  ): any | null {
    if (!Array.isArray(nodes)) return null;
    for (const node of nodes) {
      if (predicate(node)) return node;
      if (node.children?.length) {
        const found = this.walkTree(node.children, predicate);
        if (found) return found;
      }
    }
    return null;
  }
}
```

**Noot over refs:** De `ref` die terugkomt (`@e5`) is gegenereerd door SnapshotManager en is
sessie-gebonden (verandert na navigatie). De `nodeIdToLocatorResult` fallback geeft een `#node-N`
ref terug voor DOM-gebaseerde zoekopdrachten. Zorg dat `/find/click` en `/find/fill` beide
`@eN` refs (via snapshot) EN `#node-N` refs (via CDP nodeId) ondersteunen.

### 2. `src/api/server.ts` — Routes registreren

Voeg `LocatorFinder` toe aan `TandemAPIOptions` en registreer de routes.

```
POST   /find              body: LocatorQuery                → LocatorResult
POST   /find/click        body: LocatorQuery                → {ok, ref, clicked}
POST   /find/fill         body: LocatorQuery + {fillValue}  → {ok, ref, filled}
POST   /find/all          body: LocatorQuery                → {found, count, results: LocatorResult[]}
```

Implementatie:

```typescript
// POST /find
this.app.post('/find', async (req: Request, res: Response) => {
  const query: LocatorQuery = req.body;
  if (!query.by || !query.value) {
    res.status(400).json({ error: '"by" and "value" required' }); return;
  }
  try {
    const result = await this.locatorFinder.find(query);
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// POST /find/click
this.app.post('/find/click', async (req: Request, res: Response) => {
  const { fillValue, ...query } = req.body;
  try {
    const result = await this.locatorFinder.find(query);
    if (!result.found || !result.ref) {
      res.status(404).json({ found: false, error: 'Element not found' }); return;
    }
    // Hergebruik de snapshot click logica
    await this.snapshotManager.clickRef(result.ref);
    res.json({ ok: true, ref: result.ref, clicked: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// POST /find/fill
this.app.post('/find/fill', async (req: Request, res: Response) => {
  const { fillValue, ...query } = req.body;
  if (!fillValue) { res.status(400).json({ error: 'fillValue required' }); return; }
  try {
    const result = await this.locatorFinder.find(query);
    if (!result.found || !result.ref) {
      res.status(404).json({ found: false, error: 'Element not found' }); return;
    }
    await this.snapshotManager.fillRef(result.ref, fillValue);
    res.json({ ok: true, ref: result.ref, filled: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});
```

## Verificatie Checklist

```bash
TOKEN=$(cat ~/.tandem/api-token)
H="Authorization: Bearer $TOKEN"

# Navigeer naar een pagina met knoppen
curl -s -X POST -H "$H" -H "Content-Type: application/json" \
  -d '{"url":"https://example.com"}' http://127.0.0.1:8765/navigate
sleep 2

# Zoek op role
curl -s -X POST -H "$H" -H "Content-Type: application/json" \
  -d '{"by":"role","value":"link"}' http://127.0.0.1:8765/find | jq .
# → {"found":true,"ref":"@e...", "text":"More information...", "role":"link"}

# Zoek op tekst
curl -s -X POST -H "$H" -H "Content-Type: application/json" \
  -d '{"by":"text","value":"More information"}' http://127.0.0.1:8765/find | jq .
# → {"found":true,...}

# Niet gevonden
curl -s -X POST -H "$H" -H "Content-Type: application/json" \
  -d '{"by":"role","value":"button","name":"Nonexistent Button"}' \
  http://127.0.0.1:8765/find | jq .
# → {"found":false}

# Navigeer naar een pagina met formulieren
curl -s -X POST -H "$H" -H "Content-Type: application/json" \
  -d '{"url":"https://www.google.com"}' http://127.0.0.1:8765/navigate
sleep 2

# Zoek op placeholder
curl -s -X POST -H "$H" -H "Content-Type: application/json" \
  -d '{"by":"placeholder","value":"Search"}' http://127.0.0.1:8765/find | jq .

# TypeScript check
npx tsc --noEmit
# 0 errors

# Regression: Phase 1 nog intact
curl -s -H "$H" http://127.0.0.1:8765/scripts | jq .keys
curl -s -H "$H" http://127.0.0.1:8765/styles | jq .keys
```

## Commit Convention

```bash
git add src/locators/ src/api/server.ts
git commit -m "feat(agent-tools): Phase 2 — semantic locators (Playwright-style)

- Add LocatorFinder (src/locators/finder.ts)
- Strategies: role, text, placeholder, label, testid
- POST /find, /find/click, /find/fill, /find/all
- Builds on existing SnapshotManager + DevToolsManager
- Role locator uses accessibility tree; others use CDP DOM queries

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
git push origin main
```

## Scope (1 Claude Code sessie)

- `src/locators/finder.ts` — nieuw bestand
- `src/api/server.ts` — TandemAPIOptions + 4 routes
- TypeScript check + verificatie + commit
