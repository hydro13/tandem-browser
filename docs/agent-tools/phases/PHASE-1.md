# Phase 1: Persistent Script & Style Injection

## Goal

`POST /execute-js` voert code eenmalig uit en vergeet het na navigatie. Dit lost dat op.
Na deze phase heeft Tandem een `ScriptInjector` die scripts en CSS registreert en
ze automatisch opnieuw injecteert na elke navigatie — zodat Kees persistente helpers
kan injecteren die de hele sessie doorleven.

## Prerequisites

- Lees `STATUS.md` — Phase 0 en vorige phases moeten COMPLETED zijn
- Lees `src/api/server.ts` — kijk hoe SnapshotManager en NetworkMocker worden geregistreerd (zoek op `snapshotManager`, `networkMocker` in de constructor)
- Lees `src/main.ts` — zoek op `activity-webview-event` en `did-finish-load`
- Lees `src/tabs/manager.ts` — begrijp hoe tabId en webContents worden beheerd

## Deliverables

### 1. `src/scripts/injector.ts` — ScriptInjector

```typescript
import { WebContents } from 'electron';

export interface RegisteredScript {
  name: string;
  code: string;
  enabled: boolean;
  addedAt: number;
}

export interface RegisteredStyle {
  name: string;
  css: string;
  enabled: boolean;
  addedAt: number;
  // cssKey is returned by insertCSS() and used to remove it — stored per-tab
  // We don't persist cssKeys across navigation (re-inject = new key)
}

export class ScriptInjector {
  private scripts = new Map<string, RegisteredScript>();
  private styles = new Map<string, RegisteredStyle>();

  // ─── Scripts ──────────────────────────────────

  addScript(name: string, code: string): RegisteredScript {
    const entry: RegisteredScript = {
      name,
      code,
      enabled: true,
      addedAt: Date.now(),
    };
    this.scripts.set(name, entry);
    return entry;
  }

  removeScript(name: string): boolean {
    return this.scripts.delete(name);
  }

  enableScript(name: string): boolean {
    const s = this.scripts.get(name);
    if (!s) return false;
    s.enabled = true;
    return true;
  }

  disableScript(name: string): boolean {
    const s = this.scripts.get(name);
    if (!s) return false;
    s.enabled = false;
    return true;
  }

  listScripts(): RegisteredScript[] {
    return Array.from(this.scripts.values());
  }

  // ─── Styles ───────────────────────────────────

  addStyle(name: string, css: string): RegisteredStyle {
    const entry: RegisteredStyle = {
      name,
      css,
      enabled: true,
      addedAt: Date.now(),
    };
    this.styles.set(name, entry);
    return entry;
  }

  removeStyle(name: string): boolean {
    return this.styles.delete(name);
  }

  enableStyle(name: string): boolean {
    const s = this.styles.get(name);
    if (!s) return false;
    s.enabled = true;
    return true;
  }

  disableStyle(name: string): boolean {
    const s = this.styles.get(name);
    if (!s) return false;
    s.enabled = false;
    return true;
  }

  listStyles(): RegisteredStyle[] {
    return Array.from(this.styles.values());
  }

  // ─── Injection ────────────────────────────────

  /**
   * Called after every did-finish-load.
   * Re-injects all enabled scripts and styles into the given WebContents.
   */
  async reloadIntoTab(wc: WebContents): Promise<void> {
    // Scripts
    for (const script of this.scripts.values()) {
      if (!script.enabled) continue;
      try {
        await wc.executeJavaScript(script.code);
      } catch (e: any) {
        console.warn(`[ScriptInjector] Script "${script.name}" failed:`, e.message);
      }
    }

    // Styles — insertCSS returns a key, but we don't need to track it
    // (on next navigation, the old CSS is gone anyway; we re-inject fresh)
    for (const style of this.styles.values()) {
      if (!style.enabled) continue;
      try {
        await wc.insertCSS(style.css);
      } catch (e: any) {
        console.warn(`[ScriptInjector] Style "${style.name}" failed:`, e.message);
      }
    }
  }

  /**
   * Inject a single script into a tab immediately (without registering it).
   * Used for one-shot injection that doesn't persist.
   */
  async injectOnce(wc: WebContents, code: string): Promise<unknown> {
    return wc.executeJavaScript(code);
  }
}
```

### 2. `src/main.ts` — Wire ScriptInjector to did-finish-load

Zoek de bestaande `activity-webview-event` IPC handler in `main.ts`.
Er is al een `did-finish-load` case (of voeg hem toe). Roep daar `scriptInjector.reloadIntoTab()` aan.

```typescript
// In main.ts, na de andere manager initialisaties:
import { ScriptInjector } from './scripts/injector';
const scriptInjector = new ScriptInjector();

// Geef mee aan startAPI():
startAPI({
  // ... bestaande opties
  scriptInjector,
});

// In de activity-webview-event IPC handler:
ipcMain.on('activity-webview-event', (event, data) => {
  // ... bestaand ...
  if (data.type === 'did-finish-load') {
    const tab = tabManager.getTab(data.tabId);
    if (tab?.webContents && !tab.webContents.isDestroyed()) {
      scriptInjector.reloadIntoTab(tab.webContents).catch(() => {});
    }
  }
});
```

**Let op:** Kijk hoe andere managers worden meegegeven aan `startAPI()` / `TandemAPI` constructor.
Volg exact hetzelfde patroon. Voeg `scriptInjector` toe aan `TandemAPIOptions` in `server.ts`.

### 3. `src/api/server.ts` — Routes registreren

Voeg `ScriptInjector` toe aan `TandemAPIOptions` en registreer de routes.

**Scripts:**

```
POST   /scripts/add        body: {name, code}           → {ok, name, active}
DELETE /scripts/remove     body: {name}                 → {ok, removed}
GET    /scripts             —                            → {scripts: [...]}
POST   /scripts/enable     body: {name}                 → {ok}
POST   /scripts/disable    body: {name}                 → {ok}
```

**Styles:**

```
POST   /styles/add         body: {name, css}            → {ok, name}
DELETE /styles/remove      body: {name}                 → {ok, removed}
GET    /styles              —                            → {styles: [...]}
POST   /styles/enable      body: {name}                 → {ok}
POST   /styles/disable     body: {name}                 → {ok}
```

Implementatiepatroon — volg exact hoe NetworkMocker routes zijn geregistreerd:

```typescript
// POST /scripts/add
this.app.post('/scripts/add', (req: Request, res: Response) => {
  const { name, code } = req.body;
  if (!name || !code) { res.status(400).json({ error: 'name and code required' }); return; }
  try {
    const entry = this.scriptInjector.addScript(name, code);
    res.json({ ok: true, name: entry.name, active: entry.enabled });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});
```

**Stijl-specifieke noot voor `/styles/add`:**
Injecteer de CSS ook meteen in de huidige actieve tab (niet alleen registreren):

```typescript
this.app.post('/styles/add', async (req: Request, res: Response) => {
  const { name, css } = req.body;
  if (!name || !css) { res.status(400).json({ error: 'name and css required' }); return; }
  try {
    this.scriptInjector.addStyle(name, css);
    // Inject meteen in actieve tab
    const wc = await this.getSessionWC(req);
    if (wc && !wc.isDestroyed()) await wc.insertCSS(css);
    res.json({ ok: true, name });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});
```

## Verificatie Checklist

Test met curl na `npm start`:

```bash
TOKEN=$(cat ~/.tandem/api-token)
H="Authorization: Bearer $TOKEN"

# Scripts
curl -s -H "$H" http://127.0.0.1:8765/scripts | jq .
# → {"scripts":[]}

curl -s -X POST -H "$H" -H "Content-Type: application/json" \
  -d '{"name":"hello","code":"window.__tandemHello = 42"}' \
  http://127.0.0.1:8765/scripts/add | jq .
# → {"ok":true,"name":"hello","active":true}

curl -s -H "$H" http://127.0.0.1:8765/scripts | jq .
# → {"scripts":[{"name":"hello","code":"window.__tandemHello = 42","enabled":true,...}]}

# Navigeer naar een pagina, check dat script er nog is:
curl -s -X POST -H "$H" -H "Content-Type: application/json" \
  -d '{"url":"https://example.com"}' http://127.0.0.1:8765/navigate

sleep 2

curl -s -X POST -H "$H" -H "Content-Type: application/json" \
  -d '{"code":"window.__tandemHello"}' http://127.0.0.1:8765/execute-js | jq .
# → {"ok":true,"result":42}  ← script overleefde de navigatie!

# Disable test
curl -s -X POST -H "$H" -H "Content-Type: application/json" \
  -d '{"name":"hello"}' http://127.0.0.1:8765/scripts/disable | jq .

curl -s -X POST -H "$H" -H "Content-Type: application/json" \
  -d '{"url":"https://example.com"}' http://127.0.0.1:8765/navigate
sleep 2
curl -s -X POST -H "$H" -H "Content-Type: application/json" \
  -d '{"code":"window.__tandemHello"}' http://127.0.0.1:8765/execute-js | jq .
# → {"ok":true,"result":null}  ← disabled script niet herinjected

# Styles
curl -s -X POST -H "$H" -H "Content-Type: application/json" \
  -d '{"name":"redbg","css":"body { background: red !important; }"}' \
  http://127.0.0.1:8765/styles/add | jq .
# → {"ok":true,"name":"redbg"}
# Browser moet nu rode achtergrond tonen

curl -s -X DELETE -H "$H" -H "Content-Type: application/json" \
  -d '{"name":"hello"}' http://127.0.0.1:8765/scripts/remove | jq .
# → {"ok":true,"removed":true}

# TypeScript check
npx tsc --noEmit
# → 0 errors (pre-existing errors in test file zijn OK om te negeren)
```

## Commit Convention

```bash
git add src/scripts/ src/main.ts src/api/server.ts
git commit -m "feat(agent-tools): Phase 1 — persistent script & style injection

- Add ScriptInjector (src/scripts/injector.ts)
- Scripts and styles re-injected after every did-finish-load
- POST /scripts/add|remove|enable|disable + GET /scripts
- POST /styles/add|remove|enable|disable + GET /styles
- Immediate CSS injection on /styles/add for current tab

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
git push origin main
```

## Scope (1 Claude Code sessie)

- `src/scripts/injector.ts` — nieuw bestand
- `src/main.ts` — minimale aanpassing: ScriptInjector init + did-finish-load hook
- `src/api/server.ts` — TandemAPIOptions uitbreiden + 10 routes
- TypeScript check + verificatie + commit
