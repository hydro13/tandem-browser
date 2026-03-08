# Phase 2 — Shell UI: Workspace Strip + Tab Filtering

> **Feature:** Workspaces UI
> **Sessions:** 1 session
> **Priority:** HIGH
> **Depends on:** Phase 1 complete

---

## Goal or this fase

Bouw the visual workspace ervaring in the shell: a verticale icon strip links or the main content area with colored squares per workspace, tab bar filtering bij workspace switch, and a "Verplaats to workspace" optie in the tab context menu. After this phase can Robin visual between workspaces wisselen with één click.

---

## Existing Code to Read — ONLY This

> Read NOTHING else. Do not wander through the codebase.

| File | Look for function/class | Why |
|---------|--------------------------|--------|
| `src/workspaces/manager.ts` | `class WorkspaceManager` | Begrijp IPC events and data model |
| `shell/index.html` | `<div class="main-layout">`, `<div class="tab-bar">` | Layout waar workspace strip bij comes |
| `shell/js/main.js` | Tab rendering logica, tab context menu | Uitbreiden with workspace filtering |
| `shell/css/main.css` | `.main-layout`, `.tab-bar` | CSS for workspace strip |
| `src/context-menu/manager.ts` | `class ContextMenuManager` | "Verplaats to workspace" item |

---

## To Build in this fase

### Step 1: Workspace strip HTML

**Wat:** Verticale strip with workspace icons links or the main content, or at the top the tab bar.

**File:** `shell/index.html`

**Zoek to:** `<div class="main-layout">`

**Voeg toe if first child or main-layout:**

```html
<!-- Workspace strip -->
<div class="workspace-strip" id="workspace-strip">
  <!-- Workspace icons be dynamisch gegenereerd via JS -->
  <button class="workspace-add-btn" id="workspace-add-btn" title="New workspace">+</button>
</div>
```

### Step 2: CSS for workspace strip

**Wat:** Verticale strip styling: smalle kolom, colored squares, active indicator.

**File:** `shell/css/main.css`

**Voeg toe:**

```css
/* Workspace Strip */
.workspace-strip {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 8px 4px;
  width: 44px;
  flex-shrink: 0;
  background: rgba(0, 0, 0, 0.15);
  border-right: 1px solid rgba(255, 255, 255, 0.06);
  overflow-y: auto;
}

.workspace-icon {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  cursor: pointer;
  transition: all 0.15s;
  border: 2px solid transparent;
  position: relative;
}

.workspace-icon:hover {
  transform: scale(1.1);
}

.workspace-icon.active {
  border-color: white;
  box-shadow: 0 0 8px rgba(255, 255, 255, 0.2);
}

/* Active indicator bar */
.workspace-icon.active::before {
  content: '';
  position: absolute;
  left: -6px;
  top: 25%;
  height: 50%;
  width: 3px;
  background: white;
  border-radius: 2px;
}

.workspace-add-btn {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px dashed rgba(255, 255, 255, 0.15);
  color: var(--text-dim);
  font-size: 18px;
  cursor: pointer;
  transition: all 0.15s;
}

.workspace-add-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: var(--text);
}
```

### Step 3: Shell JavaScript — workspace logica

**Wat:** Workspace strip renderen, click handlers, tab bar filtering bij workspace switch.

**File:** `shell/js/main.js`

**Add about:** Event handlers section

```javascript
// === WORKSPACES ===

let activeWorkspace = 'default';
let workspaces = [];

// Laad workspaces bij startup
async function loadWorkspaces() {
  const res = await fetch('http://localhost:8765/workspaces');
  const data = await res.json();
  workspaces = data.workspaces;
  renderWorkspaceStrip();
}

function renderWorkspaceStrip() {
  const strip = document.getElementById('workspace-strip');
  // Clear existing icons (behalve the + knop)
  // Render a .workspace-icon per workspace with color and emoji
  // Actieve workspace gets .active class
}

async function switchWorkspace(name) {
  await fetch(`http://localhost:8765/workspaces/${name}/switch`, { method: 'POST' });
  activeWorkspace = name;
  renderWorkspaceStrip();
  filterTabBar();
}

function filterTabBar() {
  // Haal tabIds op for actieve workspace
  // Verberg tab elements that not in the list zitten
  // Toon tab elements that indeed in the list zitten
}

// Luister to IPC events
window.electronAPI.on('workspace-switched', (event, data) => {
  activeWorkspace = data.name;
  renderWorkspaceStrip();
  filterTabBar();
});

// + knop handler
document.getElementById('workspace-add-btn').addEventListener('click', () => {
  // Toon prompt/dialog for workspace name
  // POST /workspaces with name, default color, default emoji
  // Herlaad strip
});
```

### Step 4: Tab bar filtering

**Wat:** Wanneer the workspace wisselt, must only the tabs or that workspace visible are in the tab bar. Andere tabs be hidden via CSS `display:none`.

**File:** `shell/js/main.js`

**Aanpassen:** The tab rendering function (zoek to waar tabs in the tab bar be gerenderd)

```javascript
// Bij the renderen or tabs: check or tab.id in activeWorkspace.tabIds zit
// Zo not: tab element gets style.display = 'none'
// Zo ja: tab element is visible
```

### Stap 5: Tab context menu — "Verplaats to workspace"

**Wat:** Rechtermuisklik op tab → submenu "Verplaats to workspace" with list or beschikbare workspaces.

**File:** `src/context-menu/manager.ts`

**Add about:** Tab context menu (zoek to existing tab menu items)

```typescript
{
  label: 'Verplaats to workspace',
  submenu: workspaces.folder(ws => ({
    label: `${ws.emoji} ${ws.name}`,
    click: () => {
      // POST /workspaces/:name/move-tab with tabId
    }
  }))
}
```

### Stap 6: New tab toewijzen about actieve workspace

**Wat:** Wanneer a new tab geopend is, must this automatisch bij the actieve workspace belong.

**File:** `shell/js/main.js` or `src/tabs/manager.ts`

**Aanpassen:** The new-tab handler — na tab aanmaak, roep `workspaceManager.assignTabToActive(tabId)` about.

---

## Acceptatiecriteria — this must werken na the session

```bash
# Test 1: Workspaces laden
TOKEN=$(cat ~/.tandem/api-token)
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:8765/workspaces
# Verwacht: {"ok":true, "workspaces":[...]}
```

**UI verificatie:**
- [x] Workspace strip visible links or the browser content area
- [x] Default workspace icon (blauw, 🏠) is actief (indigo bg) — now SVG icons
- [x] "+" knop maakt new workspace about (inline icon picker + name input)
- [x] Klik op workspace icon → tab bar filtert, only that workspace's tabs visible
- [x] New tabs be automatisch about actieve workspace toegewezen
- [x] Rechtermuisklik tab → "Verplaats to workspace" → submenu with workspaces (v0.27.1, custom DOM menu)
- [x] Tab verplaatsen to andere workspace → tab disappears out huidige tab bar (v0.27.1, drag-and-drop + context menu)
- [x] Workspace wisselen → tab bar update → juiste tabs visible
- [x] Na browser restart: workspaces and hun SVG icons are behouden
- [x] Opera-style icon picker: 24 SVG icons in 6-col grid (v0.26.0)
- [x] Edit workspace: inline sheet with icon picker, rename, delete (v0.26.0)
- [x] Data model migrated: emoji → icon slug (v0.26.0)
- [x] Full Opera-style tab context menu: New Tab, Reload, Duplicate, Copy Address, Move to Workspace (with SVG icons), Mute/Unmute, Close Tab/Others/Right (v0.28.1)

**Compilatie verificatie:**
- [x] `npx tsc` — zero errors
- [ ] `npx vitest run` — alle existing tests slagen
- [x] `npm start` — app start without crashes

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
6. git commit -m "🏢 feat: workspace strip UI + tab bar filtering"
7. git push
8. Rapport:
   ## Gebouwd
   ## Getest (plak curl output)
   ## Problemen
   ## Next: Workspaces UI feature compleet ✅
```

---

## Bekende valkuilen

- [ ] Tab bar rendering race condition: na workspace switch must filterTabBar() wachten tot the workspace data geladen is
- [ ] Workspace strip must responsive are: bij veel workspaces must the scrollbaar are (overflow-y: auto)
- [ ] The "+" button dialog: use a simple `prompt()` for V1; a fancier dialog can come later
- [ ] TypeScript strict mode — no `any` buiten catch blocks
- [ ] Main layout CSS: voeg `display: flex` toe about `.main-layout` if that er still not is, zodat the workspace strip links next to the content appears
- [ ] Tab context menu: WorkspaceManager has workspace data nodig in the context menu proces — stuur workspace list via IPC
