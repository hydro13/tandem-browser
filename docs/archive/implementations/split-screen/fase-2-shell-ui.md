# Phase 2 — Shell UI: Divider, Context Menu, Keyboard Shortcuts

> **Feature:** Split Screen
> **Sessions:** 1 session
> **Priority:** HIGH
> **Depends on:** Phase 1 complete

---

## Goal or this fase

Bouw the visual split screen ervaring in the shell: a second `<webview>` that appears next to the existing, a draggable divider ertussen, tab context menu item "Split Screen", active pane indicator, and keyboard shortcuts. After this phase can Robin visual twee page's next to elkaar use with a sleepbare scheidslijn.

---

## Existing Code to Read — ONLY This

> Read NOTHING else. Do not wander through the codebase.

| File | Look for function/class | Why |
|---------|--------------------------|--------|
| `src/split-screen/manager.ts` | `class SplitScreenManager` | Begrijp the IPC events that verstuurd be |
| `shell/index.html` | `id="webview-container"`, `<div class="browser-content">` | Hier comes the split layout |
| `shell/js/main.js` | Tab context menu logica, webview event handlers | Uitbreiden with split screen opties |
| `shell/css/main.css` | `.browser-content`, `.main-layout` | CSS for split layout |
| `src/ipc/handlers.ts` | `registerIpcHandlers()` | IPC handlers that the shell aanroept |
| `src/context-menu/manager.ts` | `class ContextMenuManager` | Tab context menu — "Split Screen" item add |

---

## To Build in this fase

### Step 1: Split screen HTML structuur

**Wat:** Second webview element and divider add about the shell HTML.

**File:** `shell/index.html`

**Zoek to:** `<div class="browser-content" id="webview-container">`

**Voeg toe within webview-container:**

```html
<!-- Split screen divider (hidden by default) -->
<div class="split-divider" id="split-divider" style="display:none;"></div>
<!-- Second webview for split screen (hidden by default) -->
<div class="split-pane split-pane-secondary" id="split-pane-secondary" style="display:none;">
  <!-- Secondary webview is dynamisch aangemaakt via JS -->
</div>
```

### Step 2: CSS for split layout

**Wat:** Styling for split screen: flexbox layout, divider styling, active pane indicator.

**File:** `shell/css/main.css`

**Voeg toe:**

```css
/* Split Screen */
.browser-content.split-active {
  display: flex;
  flex-direction: row; /* vertical split = side by side */
}

.browser-content.split-active.split-horizontal {
  flex-direction: column; /* horizontal split = stacked */
}

.split-divider {
  width: 6px;
  background: rgba(255, 255, 255, 0.08);
  cursor: col-resize;
  flex-shrink: 0;
  transition: background 0.15s;
  z-index: 10;
}

.split-divider:hover,
.split-divider.dragging {
  background: var(--accent);
}

.split-horizontal .split-divider {
  width: auto;
  height: 6px;
  cursor: row-resize;
}

.split-pane-secondary webview {
  width: 100%;
  height: 100%;
}

/* Active pane indicator */
.split-pane-active {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}
```

### Step 3: Shell JavaScript — split screen logica

**Wat:** IPC listeners for split-screen events, divider drag handler, active pane switching, context menu integratie.

**File:** `shell/js/main.js`

**Add about:** Event handlers section

```javascript
// === SPLIT SCREEN ===

let splitActive = false;
let activePaneIndex = 0;

// Luister to IPC events or SplitScreenManager
window.electronAPI.on('split-screen-open', (event, data) => {
  // data: { layout, panes: [{tabId, index}] }
  activateSplitScreen(data);
});

window.electronAPI.on('split-screen-close', () => {
  deactivateSplitScreen();
});

window.electronAPI.on('split-screen-focus', (event, data) => {
  setActiveSplitPane(data.paneIndex);
});

function activateSplitScreen(data) {
  // Toon divider and secondary pane
  // Maak secondary webview about
  // Navigeer secondary webview to tab URL
  // Pas flexbox layout toe op browser-content
}

function deactivateSplitScreen() {
  // Verberg divider and secondary pane
  // Delete secondary webview
  // Reset layout
}

function setActiveSplitPane(paneIndex) {
  // Update activePaneIndex
  // Toggle .split-pane-active class
  // URL bar shows URL or actieve pane
}

// Divider drag handler
function initDividerDrag() {
  const divider = document.getElementById('split-divider');
  // mousedown → track → mousemove → update flex-basis → mouseup
}
```

### Step 4: Tab context menu — "Split Screen" optie

**Wat:** Rechtermuisklik op tab → "Split Screen" optie that the huidige tab and geselecteerde tab splitst.

**File:** `src/context-menu/manager.ts`

**Add about:** Tab context menu items (zoek to existing tab menu items)

```typescript
{
  label: 'Split Screen',
  click: () => {
    // Stuur IPC or API call to split screen te openen
    // with the geklikte tab and the actief-zichtbare tab
  }
}
```

### Stap 5: Toolbar aanpassing for active pane

**Wat:** The URL bar, back/forward knoppen must the actieve split pane aansturen, not always pane 0.

**File:** `shell/js/main.js`

**Aanpassen:** Alle plekken waar `getActiveWebview()` or vergelijkbaar is aangeroepen — this function must the actieve pane's webview retourneren if split screen actief is.

---

## Acceptatiecriteria — this must werken na the session

```bash
# Test 1: Open split screen via API
TOKEN=$(cat ~/.tandem/api-token)
curl -H "Authorization: Bearer $TOKEN" \
  -X POST http://localhost:8765/split/open \
  -H "Content-Type: application/json" \
  -d '{"tabId1": 1, "tabId2": 2, "layout": "vertical"}'
# Verwacht: {"ok":true, "layout":{...}}
```

**UI verificatie:**
- [ ] Twee webviews visible next to elkaar (vertical)
- [ ] Divider is visible between the twee panels
- [ ] Divider is sleepbaar — panels resizen mee
- [ ] Klikken op a panel maakt the "actief" (blauwe rand)
- [ ] URL bar shows the URL or the actieve panel
- [ ] Back/forward knoppen werken op the actieve panel
- [ ] Navigeren in één panel beïnvloedt the andere not
- [ ] "Split Screen" optie in tab context menu works
- [ ] `POST /split/close` → terug to single webview
- [ ] Divider disappears, secondary webview is removed

**Compilatie verificatie:**
- [ ] `npx tsc` — zero errors
- [ ] `npx vitest run` — alle existing tests slagen
- [ ] `npm start` — app start without crashes

---

## Sessie Protocol

### Bij start:
```
1. Read LEES-MIJ-EERST.md
2. Read DIT file (fase-2-shell-ui.md) fully
3. Run: curl http://localhost:8765/status && npx tsc && git status
4. Read the files in the "Files to read" table above
```

### Bij einde:
```
1. npx tsc — ZERO errors verplicht
2. npm start — app start without crashes
3. Alle curl tests out "Acceptatiecriteria" uitvoeren
4. npx vitest run — alle existing tests blijven slagen
5. Update CHANGELOG.md with korte entry
6. git commit -m "🖥️ feat: split screen shell UI with divider + context menu"
7. git push
8. Rapport:
   ## Gebouwd
   ## Getest (plak curl output)
   ## Problemen
   ## Next: Split Screen feature compleet ✅
```

---

## Bekende valkuilen

- [ ] The existing webview in `shell/index.html` has allerlei event handlers (navigatie, title update, favicon). The secondary webview must the same handlers krijgen — maak a herbruikbare function.
- [ ] Focus management: if you op the secondary webview clicks, must `activePaneIndex` updaten. Usage `focus` event op the webview.
- [ ] Divider drag op macOS: `mousemove` events stoppen soms if the cursor over the webview gaat. Oplossing: usage a transparante overlay div tijdens the slepen.
- [ ] TypeScript strict mode — no `any` buiten catch blocks
- [ ] Tab sluiten terwijl split actief: if a or the twee split tabs closed is, must split screen automatisch sluiten.
