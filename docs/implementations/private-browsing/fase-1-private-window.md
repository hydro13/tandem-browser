# Phase 1 — Private Window: Ephemeer window with in-memory session

> **Feature:** Private Browsing Window
> **Sessions:** 1 session
> **Priority:** HIGH
> **Depends on:** None

---

## Goal or this fase

Bouw the full Private Browsing feature: Cmd+Shift+N opens a new Electron `BrowserWindow` with a in-memory partition (no `persist:` prefix). Alle sessiedata is automatisch gewist bij sluiten. Visual indicator: donkerpaarse header in the shell. API endpoint `POST /window/private` if alternatief.

---

## Existing Code to Read — ONLY This

> Read NOTHING else. Do not wander through the codebase.

| File | Look for function/class | Why |
|---------|--------------------------|--------|
| `src/main.ts` | `createWindow()`, `app.on('ready')`, keyboard shortcut registratie (zoek to `globalShortcut` or `Menu`/`accelerator`) | Snap hoe the main window is aangemaakt — the private-window is a variant hiervan |
| `src/api/routes/browser.ts` | `function registerBrowserRoutes()` | Hier comes the `POST /window/private` endpoint |
| `shell/index.html` | Shell initialisatie, hoe the the partition/URL parameters leest | Snap hoe the shell weet or the a private-window is |
| `shell/css/main.css` | CSS variabelen (`:root`, `--tab-bg`, `--accent`, etc.) | Snap the huidige kleuren for the paarse variant |
| `AGENTS.md` | — (read fully) | Anti-detect rules and code stijl |

---

## To Build in this fase

### Step 1: createPrivateWindow() function

**Wat:** Maak a new function in `main.ts` that a `BrowserWindow` aanmaakt with a ephemere (in-memory) partition. Dit is vergelijkbaar with `createWindow()` but with a paar cruciale verschillen: no `persist:` prefix op the partition, cleanup bij sluiten, and a query parameter zodat the shell weet that the private is.

**File:** `src/main.ts`

**Add about:** Na the existing `createWindow()` function

```typescript
import { v4 as uuidv4 } from 'crypto'; // Or usage crypto.randomUUID()

function createPrivateWindow(): BrowserWindow {
  const partitionName = `private-${crypto.randomUUID()}`;

  const privateWin = new BrowserWindow({
    width: 1280,
    height: 800,
    // Kopieer relevante opties or createWindow()
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webviewTag: true,
      partition: partitionName,  // NO 'persist:' prefix = in-memory
      preload: path.join(__dirname, 'preload.js'),
    },
    titleBarStyle: 'hiddenInset',
    // Eventueel andere opties or createWindow() kopiëren
  });

  // Laad the shell with private indicator
  const shellPath = path.join(__dirname, '..', 'shell', 'index.html');
  privateWin.loadFile(shellPath, {
    query: { private: 'true', partition: partitionName },
  });

  // Cleanup bij sluiten — extra zekerheid next to in-memory verdwijning
  privateWin.on('closed', () => {
    try {
      const { session } = require('electron');
      const ses = session.fromPartition(partitionName);
      ses.clearStorageData();
      ses.clearCache();
    } catch (e) {
      // Session may already be gone — that's fine
    }
  });

  return privateWin;
}
```

**Let op:** Bekijk the existing `createWindow()` function goed and kopieer the relevante `BrowserWindow` opties (bv. `titleBarStyle`, `vibrancy`, `backgroundColor`, etc.). The private-window must er hetzelfde uitzien, behalve the paarse color.

### Step 2: Keyboard shortcut registreren

**Wat:** Registreer Cmd+Shift+N (macOS) / Ctrl+Shift+N (Linux/Windows) to `createPrivateWindow()` about te roepen.

**File:** `src/main.ts`

**Aanpassen in:** The plek waar keyboard shortcuts/menu items geregistreerd be (zoek to existing `accelerator` or `globalShortcut` patterns)

```typescript
// Optie A: Via Electron Menu (if er already a menu is)
// Voeg toe about the existing menu template:
{
  label: 'New Private Window',
  accelerator: 'CmdOrCtrl+Shift+N',
  click: () => createPrivateWindow(),
}

// Optie B: Via globalShortcut (if er no menu uses is)
import { globalShortcut } from 'electron';
globalShortcut.register('CmdOrCtrl+Shift+N', () => {
  createPrivateWindow();
});
```

**Aanbeveling:** Usage the Menu-approach if Tandem already a applicatie-menu has. Dit is betrouwbaarder then `globalShortcut` (that can conflicteren with systeemshortcuts).

### Step 3: API endpoint POST /window/private

**Wat:** Endpoint to programmatisch a private-window te openen (for Wingman/agents).

**File:** `src/api/routes/browser.ts`

**Add about:** `function registerBrowserRoutes()`

```typescript
// === PRIVATE BROWSING ===

router.post('/window/private', async (_req: Request, res: Response) => {
  try {
    // createPrivateWindow() must beschikbaar are via ctx or a geëxporteerde function
    // Optie: voeg createPrivateWindow toe about RouteContext, or usage IPC
    const { ipcMain } = require('electron');

    // Stuur IPC event to main process to private-window te openen
    // (The API server draait in the main process, dus directe aanroep is also mogelijk)
    const win = createPrivateWindow();
    res.json({ ok: true, windowId: win.id });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});
```

**Let op:** The `createPrivateWindow()` function must toegankelijk are vanuit the routes. Mogelijke approach: exporteer the function vanuit `main.ts` and maak hem beschikbaar via the `RouteContext`, or via a callback in the `ManagerRegistry`.

### Step 4: Shell detection — private-modus styling

**Wat:** The shell detecteert via query parameters or the in a private-window draait. Zo ja: activeer paarse styling and toon a indicator.

**File:** `shell/index.html`

**Add about:** Shell initialisatie (begin or the JS)

```javascript
// === PRIVATE MODE DETECTION ===
const urlParams = new URLSearchParams(window.location.search);
const isPrivateMode = urlParams.get('private') === 'true';

if (isPrivateMode) {
  document.documentElement.classList.add('private-mode');
}
```

### Stap 5: Private-indicator in tab bar

**Wat:** Wanneer the shell in private-modus draait, toon a "🔒 Private" badge links in the tab bar.

**File:** `shell/index.html`

**Aanpassen in:** Tab bar HTML section

```html
<!-- Voeg toe if first kind or #tab-bar, na menu-btn: -->
<span class="private-badge" id="private-badge" style="display:none;">🔒 Private</span>
```

```javascript
// In the private mode detection:
if (isPrivateMode) {
  document.getElementById('private-badge').style.display = '';
}
```

### Stap 6: CSS variabelen for private-modus

**Wat:** Wanneer `.private-mode` class actief is, overschrijf the tab bar kleuren with a donkerpaarse variant.

**File:** `shell/css/main.css`

**Add about:** Na the `:root` variabelen

```css
/* === PRIVATE MODE STYLING === */

.private-mode {
  --tab-bg: #1a0a2e;
  --tab-hover: rgba(128, 0, 255, 0.15);
  --tab-active: rgba(128, 0, 255, 0.25);
  --accent: #9b59b6;
}

/* macOS specifiek: paarse achtergrond for titelbalk */
.private-mode .tab-bar {
  background: rgba(26, 10, 46, 0.85);
}

.private-badge {
  -webkit-app-region: no-drag;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 10px;
  font-size: 11px;
  color: #9b59b6;
  white-space: nowrap;
  flex-shrink: 0;
  opacity: 0.8;
}
```

### Stap 7: Webview partition in private-modus

**Wat:** Wanneer the shell in private-modus draait, must alle webviews that aangemaakt be the same ephemere partition use (not `persist:tandem`).

**File:** `shell/index.html`

**Aanpassen in:** Tab/webview creatie function (zoek to waar `partition` is gezet op webview elementen)

```javascript
// In the tab creatie function, waar partition is gezet:
const partition = isPrivateMode
  ? urlParams.get('partition')  // The ephemere partition or this window
  : 'persist:tandem';           // Normale persistente partition

// Bij the aanmaken or the webview:
webview.setAttribute('partition', partition);
```

### Stap 8: Beperkingen in private-modus

**Wat:** In private-modus: no history save, no form memory, no site memory. Dit is afgehandeld doordat the in-memory partition no data to disk schrijft. Maar we must also expliciet voorkomen that Tandem's own systemen data loggen.

**File:** `src/main.ts`

**Add about:** `createPrivateWindow()` function

```typescript
// Markeer the window if private zodat managers the can checken
(privateWin as any).__isPrivate = true;

// Optioneel: voeg a methode toe about the window
// zodat managers can checken: if (win.__isPrivate) skip logging;
```

**Let op:** Managers zoals SiteMemory, FormMemory, and History must checken or the actieve window private is. Dit is a nice-to-have for v1 — the in-memory partition vangt the meeste already op.

---

## Acceptatiecriteria — this must werken na the session

```bash
TOKEN=$(cat ~/.tandem/api-token)

# Test 1: Open private-window via API
curl -H "Authorization: Bearer $TOKEN" \
  -X POST http://localhost:8765/window/private
# Verwacht: {"ok":true, "windowId": [nummer]}
# Verwacht: a new window opens with paarse titelbalk

# Test 2: Verifieer that Cmd+Shift+N works
# (handmatige test — druk Cmd+Shift+N in Tandem)
# Verwacht: new window with paarse header and "🔒 Private" badge

# Test 3: Browse in private-window
# (handmatig: open a website, log in ergens)
# Closes the private-window
# Open a new private-window
# Verwacht: no cookies/logins bewaard — you bent uitgelogd

# Test 4: Hoofdvenster onveranderd
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:8765/tabs/list
# Verwacht: tabs or the main window are intact

# Test 5: Existing endpoints werken still
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:8765/status
# Verwacht: {"ok":true, ...}
```

**UI verificatie:**
- [ ] Private-window has donkerpaarse titelbalk/header
- [ ] "🔒 Private" badge visible links in tab bar
- [ ] Tabs in private-window werken normaal (navigatie, new tabs, sluiten)
- [ ] Na sluiten private-window: no sessiedata bewaard
- [ ] Hoofdvenster is fully onafhankelijk and onveranderd
- [ ] Multiple private-vensters simultaneously mogelijk (elk with own partition)

---

## Sessie Protocol

### Bij start:
```
1. Read LEES-MIJ-EERST.md
2. Read DIT file (fase-1-private-window.md) fully
3. Run: curl http://localhost:8765/status && npx tsc && git status
4. Read the files in the "Files to read" table above
5. BELANGRIJK: bestudeer createWindow() goed — kopieer relevante opties
```

### Bij einde:
```
1. npx tsc — ZERO errors verplicht
2. npm start — app start without crashes
3. Alle curl tests out "Acceptatiecriteria" uitvoeren
4. Handmatige test: Cmd+Shift+N → browse → closes → verifieer no data bewaard
5. npx vitest run — alle existing tests blijven slagen
6. Update CHANGELOG.md with korte entry
7. git commit -m "🔒 feat: private browsing window — Cmd+Shift+N, ephemeral partition, auto-cleanup"
8. git push
9. Rapport:
   ## Gebouwd
   ## Getest (plak curl output + screenshots)
   ## Problemen
   ## Feature compleet ✅
```

---

## Bekende valkuilen

- [ ] `createWindow()` contains waarschijnlijk veel initialisatie-logica (stealth patches, event listeners, manager registratie) — the private-window has not alles hiervan nodig. Kopieer selectief, not blindelings.
- [ ] The API server (`localhost:8765`) draait in the main process and is shared. The private-window can the same API use, but pas op: API calls vanuit the private-window mogen no tabs in the main window beïnvloeden. Overweeg a `windowId` parameter toe te voegen about tab-gerelateerde endpoints.
- [ ] `crypto.randomUUID()` is beschikbaar in Node.js 19+ and Electron 40 — verifieer beschikbaarheid.
- [ ] Stealth patches: if Tandem stealth patches toepast via `session.defaultSession`, must the same patches also op the private-session be toegepast. Check `webRequest` handlers, User-Agent overrides, etc.
- [ ] macOS `titleBarStyle: 'hiddenInset'` must in beide vensters hetzelfde are for consistent behavior or the traffic lights.
- [ ] Bij the sluiten or the private-window must `session.clearStorageData()` be aangeroepen — but the `'closed'` event can te shows komen. Overweeg `'close'` (vóór sluiten) in plaats or `'closed'` (na sluiten).
