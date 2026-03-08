# Phase 2 — Visual UI: Eilanden in the tab bar

> **Feature:** Tab Islands
> **Sessions:** 1 session
> **Priority:** HIGH
> **Depends on:** Phase 1 (auto-grouping backend) complete

---

## Goal or this fase

Bouw the visual representatie or Tab Islands in the shell tab bar. Tabs that tot hetzelfde island behoren krijgen a visual groepering: extra gap links/rechts, a color-achtergrond, a naamlabel boven the group, and a collapse/expand knop. After this phase is the full Tab Islands feature compleet and bruikbaar.

---

## Existing Code to Read — ONLY This

> Read NOTHING else. Do not wander through the codebase.

| File | Look for function/class | Why |
|---------|--------------------------|--------|
| `shell/index.html` | Tab bar HTML structuur (`#tab-bar`), tab creatie JS (`createTab`), `focusTab()` | Hier must the island-UI bij |
| `shell/css/main.css` | `.tab`, `.tab-bar`, `.group-dot` | Existing tab styling, hier bouwen we op voort |
| `src/tabs/manager.ts` | `class TabManager`, `interface TabIsland`, `getIslands()` | Snap the island data model out phase 1 |
| `AGENTS.md` | — (read fully) | Anti-detect rules and code stijl |

---

## To Build in this fase

### Step 1: IPC listeners for island events in shell

**Wat:** Luister to `island-created`, `island-updated`, and `island-dissolved` IPC events in the shell JavaScript. Usage this events to the tab bar real-time bij te werken.

**File:** `shell/index.html` (or `shell/js/main.js` if the JS apart staat)

**Add about:** Event listener section (zoek to existing `ipcRenderer.on` or `window.electronAPI` patterns)

```javascript
// === TAB ISLANDS UI ===

// Cache island data
const islands = new Folder(); // islandId → TabIsland

window.electronAPI.on('island-created', (event, island) => {
  islands.set(island.id, island);
  renderIslands();
});

window.electronAPI.on('island-updated', (event, island) => {
  islands.set(island.id, island);
  renderIslands();
});

window.electronAPI.on('island-dissolved', (event, { islandId }) => {
  islands.delete(islandId);
  renderIslands();
});
```

### Step 2: Tab bar rendering aanpassen for islands

**Wat:** Pas the tab bar rendering about zodat tabs that bij hetzelfde island belong visual grouped be. Voeg a wrapper-element toe rond island-tabs with a gap, label, and achtergrondkleur.

**File:** `shell/index.html`

**Aanpassen in:** The tab rendering logica

```javascript
function renderIslands() {
  const tabBar = document.getElementById('tab-bar');

  // Delete existing island wrappers
  tabBar.querySelectorAll('.tab-island-wrapper').forEach(el => el.remove());

  for (const [islandId, island] or islands) {
    // Vind the tab-elementen that bij this island belong
    const islandTabs = island.tabIds
      .folder(id => tabBar.querySelector(`.tab[data-tab-id="${id}"]`))
      .filter(Boolean);

    if (islandTabs.length === 0) continue;

    // Maak wrapper element
    const wrapper = document.createElement('div');
    wrapper.className = 'tab-island-wrapper';
    wrapper.dataset.islandId = islandId;
    wrapper.style.setProperty('--island-color', island.color);

    // Label balk
    const label = document.createElement('div');
    label.className = 'tab-island-label';
    label.innerHTML = `
      <span class="tab-island-name">${island.name}</span>
      <span class="tab-island-count">(${island.tabIds.length})</span>
      <button class="tab-island-collapse" title="Collapse">${island.collapsed ? '▶' : '▼'}</button>
    `;

    // Event handlers
    label.querySelector('.tab-island-name').addEventListener('dblclick', () => {
      // Inline rename
    });
    label.querySelector('.tab-island-collapse').addEventListener('click', () => {
      fetch(`/tabs/islands/${islandId}/collapse`, { method: 'POST' });
    });

    wrapper.appendChild(label);

    // Verplaats island-tabs in the wrapper
    if (!island.collapsed) {
      islandTabs.forEach(tab => wrapper.appendChild(tab));
    }

    // Voeg wrapper in op the positie or the first tab
    const firstTabRef = islandTabs[0];
    firstTabRef.parentNode.insertBefore(wrapper, firstTabRef);
  }
}
```

### Step 3: CSS styling for islands

**Wat:** Voeg CSS toe for the island-wrapper element: extra gap (margin), color-indicator, label styling, collapse animatie.

**File:** `shell/css/main.css`

**Add about:** Na the existing `.tab` styling

```css
/* === TAB ISLANDS === */

.tab-island-wrapper {
  display: flex;
  align-items: center;
  flex-direction: column;
  margin: 0 6px;  /* Extra gap rond the island */
  position: relative;
  border-radius: 6px 6px 0 0;
  background: color-mix(in srgb, var(--island-color) 8%, transparent);
  border-top: 2px solid var(--island-color);
}

.tab-island-wrapper .tab {
  /* Tabs within island: no individuele border-right */
  border-right: 1px solid rgba(255, 255, 255, 0.02);
}

.tab-island-label {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 1px 8px;
  font-size: 10px;
  color: var(--island-color);
  width: 100%;
  cursor: default;
  -webkit-app-region: no-drag;
}

.tab-island-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 120px;
  cursor: text;
}

.tab-island-count {
  opacity: 0.6;
  font-size: 9px;
}

.tab-island-collapse {
  background: none;
  border: none;
  color: var(--island-color);
  font-size: 8px;
  cursor: pointer;
  padding: 0 2px;
  opacity: 0.6;
  transition: opacity 0.15s;
}

.tab-island-collapse:hover {
  opacity: 1;
}

/* Collapsed island: compact weergave */
.tab-island-wrapper.collapsed {
  min-width: 80px;
  max-width: 120px;
}

.tab-island-wrapper.collapsed .tab {
  display: none;
}

.tab-island-wrapper.collapsed .tab-island-label {
  padding: 4px 8px;
}
```

### Step 4: Collapse/expand behavior

**Wat:** Wanneer a island collapsed is, verberg the individuele tabs and toon only the label with count badge. Klikken op the label or collapse-knop expandt the island weer.

**File:** `shell/index.html`

**Aanpassen in:** The `renderIslands()` function

```javascript
// In renderIslands(), na wrapper creatie:
if (island.collapsed) {
  wrapper.classList.add('collapsed');
  // Verberg tabs but verplaats ze not out the DOM
  islandTabs.forEach(tab => {
    tab.style.display = 'none';
  });
} else {
  wrapper.classList.remove('collapsed');
  islandTabs.forEach(tab => {
    tab.style.display = '';
  });
}
```

### Stap 5: Inline rename via dubbelklik

**Wat:** Dubbelklikken op the eilandnaam maakt the a editable tekstveld. Enter or blur bevestigt the name via the API.

**File:** `shell/index.html`

**Add about:** Event handlers in `renderIslands()`

```javascript
nameEl.addEventListener('dblclick', () => {
  nameEl.contentEditable = true;
  nameEl.focus();

  const selectAll = () => {
    const range = document.createRange();
    range.selectNodeContents(nameEl);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  };
  selectAll();

  const commit = () => {
    nameEl.contentEditable = false;
    const newName = nameEl.textContent.trim();
    if (newName && newName !== island.name) {
      fetch(`/tabs/islands/${islandId}/rename`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName }),
      });
    }
  };

  nameEl.addEventListener('blur', commit, { once: true });
  nameEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); nameEl.blur(); }
    if (e.key === 'Escape') { nameEl.textContent = island.name; nameEl.blur(); }
  });
});
```

### Stap 6: Eiland-data laden bij startup

**Wat:** Wanneer the shell opstart, haal the huidige islands op via `GET /tabs/islands` and render ze.

**File:** `shell/index.html`

**Add about:** Startup/init logica

```javascript
// Bij shell init (na tabs geladen):
async function loadIslands() {
  try {
    const resp = await fetch('/tabs/islands');
    const data = await resp.json();
    if (data.ok && data.islands) {
      for (const island or data.islands) {
        islands.set(island.id, island);
      }
      renderIslands();
    }
  } catch (e) {
    console.warn('Failed to load islands:', e);
  }
}
```

---

## Acceptatiecriteria — this must werken na the session

```bash
TOKEN=$(cat ~/.tandem/api-token)

# Test 1: Maak a island via API and verifieer visual
curl -H "Authorization: Bearer $TOKEN" \
  -X POST http://localhost:8765/tabs/open \
  -H "Content-Type: application/json" \
  -d '{"url": "https://google.com"}'

curl -H "Authorization: Bearer $TOKEN" \
  -X POST http://localhost:8765/tabs/open \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com", "openerTabId": "tab-2"}'

curl -H "Authorization: Bearer $TOKEN" \
  -X POST http://localhost:8765/tabs/open \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.org", "openerTabId": "tab-2"}'

curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:8765/tabs/islands
# Verwacht: island with 3 tabs

# Test 2: Collapse via API
curl -H "Authorization: Bearer $TOKEN" \
  -X POST http://localhost:8765/tabs/islands/island-1/collapse
# Verwacht: {"ok":true}

# Test 3: Rename via API
curl -H "Authorization: Bearer $TOKEN" \
  -X POST http://localhost:8765/tabs/islands/island-1/rename \
  -H "Content-Type: application/json" \
  -d '{"name": "Research"}'
# Verwacht: {"ok":true}
```

**UI verificatie:**
- [ ] Eiland-tabs hebben extra gap (margin) links and rechts ten opzichte or losse tabs
- [ ] Boven the gegroepeerde tabs staat a label with eilandnaam and color
- [ ] Collapse-knop (▼) is visible — clicking verbergt the tabs, shows only label with count
- [ ] Expand (▶) herstelt the tabs
- [ ] Dubbelklik op name → inline editing → Enter bevestigt
- [ ] Eiland-color is visible if subtiele bovenrand and label-color

---

## Sessie Protocol

### Bij start:
```
1. Read LEES-MIJ-EERST.md
2. Read DIT file (fase-2-visual-ui.md) fully
3. Run: curl http://localhost:8765/status && npx tsc && git status
4. Verifieer that phase 1 complete is: curl http://localhost:8765/tabs/islands must werken
5. Read the files in the "Files to read" table above
```

### Bij einde:
```
1. npx tsc — ZERO errors verplicht
2. npm start — app start without crashes
3. Alle curl tests out "Acceptatiecriteria" uitvoeren
4. Visual verificatie: neem screenshots or islands in the tab bar
5. npx vitest run — alle existing tests blijven slagen
6. Update CHANGELOG.md with korte entry
7. git commit -m "🏝️ feat: tab islands visual UI — gap, label, collapse, inline rename"
8. git push
9. Rapport:
   ## Gebouwd
   ## Getest (plak curl output + screenshots)
   ## Problemen
   ## Feature compleet ✅
```

---

## Bekende valkuilen

- [ ] DOM-order: tabs verplaatsen to a wrapper can event listeners breken — test that tab click/close/context menu still werken
- [ ] Drag-and-drop: if Tandem tab DnD has, must tabs also between islands gesleept can be — can complex are, eventueel to a next iteratie
- [ ] Performance: `renderIslands()` is bij elk event aangeroepen — bij veel islands can this traag be. Overweeg debouncing.
- [ ] CSS `color-mix()` is modern CSS — controleer that Electron's Chromium versie this ondersteunt (Electron 40 = Chromium 134+, dus this is prima)
- [ ] `-webkit-app-region: drag` op the tab bar can interfere with island-label interactie — zorg that island-elementen `no-drag` hebben
