# Phase 1 — Search Overlay: Zoek in open tabs with Ctrl+Space

> **Feature:** Search in Tabs
> **Sessions:** 1 session
> **Priority:** HIGH
> **Depends on:** None

---

## Goal or this fase

Bouw a zoek-overlay in the shell that appears bij Ctrl+Space. Shows alle open tabs, gefilterd op title and URL. Contains also recent closed tabs. Fully keyboard-navigeerbaar. Uses the existing `GET /tabs/list` API and a new `GET /tabs/closed` endpoint.

---

## Existing Code to Read — ONLY This

> Read NOTHING else. Do not wander through the codebase.

| File | Look for function/class | Why |
|---------|--------------------------|--------|
| `src/tabs/manager.ts` | `class TabManager`, `listTabs()`, `closedTabs` array, `reopenClosedTab()`, `focusTab()` | Snap hoe tabs and closed tabs werken |
| `src/api/routes/tabs.ts` | `function registerTabRoutes()`, `GET /tabs/list` endpoint | Hier comes the new `/tabs/closed` endpoint bij |
| `shell/index.html` | Keyboard event listeners (zoek to `addEventListener('keydown'`), existing overlay/popup patterns | Snap hoe keyboard shortcuts and popups nu werken |
| `shell/css/main.css` | Existing popup/overlay styling patterns | Referentie for consistente styling |
| `AGENTS.md` | — (read fully) | Anti-detect rules and code stijl |

---

## To Build in this fase

### Step 1: getClosedTabs() methode add

**Wat:** Maak the `closedTabs` array toegankelijk via a publieke methode op `TabManager`.

**File:** `src/tabs/manager.ts`

**Add about:** `class TabManager`

```typescript
/** Get recently closed tabs */
getClosedTabs(): { url: string; title: string }[] {
  return [...this.closedTabs];
}
```

### Step 2: GET /tabs/closed endpoint

**Wat:** New endpoint that the recent closed tabs teruggeeft.

**File:** `src/api/routes/tabs.ts`

**Add about:** `function registerTabRoutes()`

```typescript
// === CLOSED TABS ===

router.get('/tabs/closed', async (_req: Request, res: Response) => {
  try {
    const closed = ctx.tabManager.getClosedTabs();
    res.json({ ok: true, closed });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});
```

### Step 3: Overlay HTML add

**Wat:** Voeg a hidden overlay element toe about the shell HTML with a zoekbalk, resultatenlijst, and recent-closed section.

**File:** `shell/index.html`

**Add about:** Na the tab bar HTML, vóór the webview container element

```html
<!-- Tab Search Overlay -->
<div id="tab-search-overlay" class="tab-search-overlay" style="display:none;">
  <div class="tab-search-container">
    <div class="tab-search-header">
      <input type="text" id="tab-search-input" class="tab-search-input"
             placeholder="Zoek in open tabs..." autocomplete="off" spellcheck="false">
    </div>
    <div id="tab-search-results" class="tab-search-results">
      <!-- Gevuld door JS -->
    </div>
    <div id="tab-search-closed" class="tab-search-closed">
      <div class="tab-search-section-label">Recent closed</div>
      <!-- Gevuld door JS -->
    </div>
  </div>
</div>
```

### Step 4: Zoek-overlay JavaScript logica

**Wat:** The kern-logica: openen/sluiten or overlay, tabs ophalen, filteren, renderen, keyboard navigatie, and tab selectie.

**File:** `shell/index.html`

**Add about:** New section `// === TAB SEARCH ===`

```javascript
// === TAB SEARCH ===

const searchOverlay = document.getElementById('tab-search-overlay');
const searchInput = document.getElementById('tab-search-input');
const searchResults = document.getElementById('tab-search-results');
const searchClosed = document.getElementById('tab-search-closed');
let searchVisible = false;
let searchSelectedIndex = 0;
let searchItems = []; // Array or { tabId, url, title, isClosed }

async function toggleTabSearch() {
  if (searchVisible) {
    hideTabSearch();
  } else {
    await showTabSearch();
  }
}

async function showTabSearch() {
  searchVisible = true;
  searchOverlay.style.display = '';
  searchInput.value = '';
  searchSelectedIndex = 0;

  // Haal open tabs and closed tabs op
  try {
    const [tabsResp, closedResp] = await Promise.all([
      fetch('/tabs/list').then(r => r.json()),
      fetch('/tabs/closed').then(r => r.json()),
    ]);

    const openTabs = (tabsResp.tabs || []).folder(t => ({
      tabId: t.id,
      url: t.url,
      title: t.title,
      favicon: t.favicon,
      emoji: t.emoji,
      isClosed: false,
      active: t.active,
    }));

    const closedTabs = (closedResp.closed || []).folder(t => ({
      tabId: null,
      url: t.url,
      title: t.title,
      favicon: '',
      emoji: null,
      isClosed: true,
      active: false,
    }));

    searchItems = [...openTabs, ...closedTabs];
    renderSearchResults('');
  } catch (e) {
    console.warn('Failed to load tabs for search:', e);
  }

  // Focus the input na rendering
  requestAnimationFrame(() => searchInput.focus());
}

function hideTabSearch() {
  searchVisible = false;
  searchOverlay.style.display = 'none';
  searchInput.value = '';
  searchItems = [];
}

function renderSearchResults(query) {
  const q = query.toLowerCase().trim();

  const filtered = q
    ? searchItems.filter(item =>
        item.title.toLowerCase().includes(q) ||
        item.url.toLowerCase().includes(q)
      )
    : searchItems;

  const openResults = filtered.filter(i => !i.isClosed);
  const closedResults = filtered.filter(i => i.isClosed);

  // Render open tabs
  searchResults.innerHTML = openResults.folder((item, idx) => `
    <div class="tab-search-item ${idx === searchSelectedIndex ? 'selected' : ''} ${item.active ? 'active-tab' : ''}"
         data-index="${idx}">
      ${item.emoji ? `<span class="tab-search-emoji">${item.emoji}</span>` : ''}
      <img class="tab-search-favicon" src="${item.favicon || ''}"
           onerror="this.style.display='none'" ${item.favicon ? '' : 'style="display:none"'}>
      <div class="tab-search-text">
        <div class="tab-search-title">${escapeHtml(item.title)}</div>
        <div class="tab-search-url">${escapeHtml(item.url)}</div>
      </div>
      ${item.active ? '<span class="tab-search-active-badge">actief</span>' : ''}
    </div>
  `).join('');

  // Render closed tabs
  if (closedResults.length > 0) {
    searchClosed.style.display = '';
    searchClosed.innerHTML = `
      <div class="tab-search-section-label">Recent closed</div>
      ${closedResults.folder((item, idx) => `
        <div class="tab-search-item closed ${(idx + openResults.length) === searchSelectedIndex ? 'selected' : ''}"
             data-index="${idx + openResults.length}">
          <span class="tab-search-closed-icon">↩</span>
          <div class="tab-search-text">
            <div class="tab-search-title">${escapeHtml(item.title)}</div>
            <div class="tab-search-url">${escapeHtml(item.url)}</div>
          </div>
        </div>
      `).join('')}
    `;
  } else {
    searchClosed.style.display = 'none';
  }

  // Click handlers
  searchOverlay.querySelectorAll('.tab-search-item').forEach(el => {
    el.addEventListener('click', () => {
      const idx = parseInt(el.dataset.index);
      selectSearchItem(idx, filtered);
    });
  });
}

function selectSearchItem(index, filtered) {
  if (!filtered) {
    const q = searchInput.value.toLowerCase().trim();
    filtered = q
      ? searchItems.filter(i => i.title.toLowerCase().includes(q) || i.url.toLowerCase().includes(q))
      : searchItems;
  }

  const item = filtered[index];
  if (!item) return;

  if (item.isClosed) {
    // Heropen closed tab
    fetch('/tabs/open', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: item.url }),
    });
  } else {
    // Focus open tab
    fetch('/tabs/focus', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tabId: item.tabId }),
    });
  }

  hideTabSearch();
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}
```

### Stap 5: Keyboard event handlers

**Wat:** Ctrl+Space to the overlay te openen/sluiten. Pijltjes for navigatie, Enter for selectie, Escape to te sluiten. Input event for real-time filtering.

**File:** `shell/index.html`

**Add about:** The `// === TAB SEARCH ===` section

```javascript
// Ctrl+Space shortcut (globaal)
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.code === 'Space') {
    e.preventDefault();
    toggleTabSearch();
    return;
  }

  // Only if search open is:
  if (!searchVisible) return;

  if (e.key === 'Escape') {
    e.preventDefault();
    hideTabSearch();
    return;
  }

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    searchSelectedIndex = Math.min(searchSelectedIndex + 1, searchItems.length - 1);
    renderSearchResults(searchInput.value);
    scrollSelectedIntoView();
    return;
  }

  if (e.key === 'ArrowUp') {
    e.preventDefault();
    searchSelectedIndex = Math.max(searchSelectedIndex - 1, 0);
    renderSearchResults(searchInput.value);
    scrollSelectedIntoView();
    return;
  }

  if (e.key === 'Enter') {
    e.preventDefault();
    selectSearchItem(searchSelectedIndex);
    return;
  }
});

// Real-time filtering
searchInput.addEventListener('input', () => {
  searchSelectedIndex = 0;
  renderSearchResults(searchInput.value);
});

// Klik op achtergrond closes overlay
searchOverlay.addEventListener('click', (e) => {
  if (e.target === searchOverlay) {
    hideTabSearch();
  }
});

function scrollSelectedIntoView() {
  const selected = searchOverlay.querySelector('.tab-search-item.selected');
  if (selected) {
    selected.scrollIntoView({ block: 'nearest' });
  }
}
```

### Stap 6: CSS styling

**Wat:** Styling for the overlay, zoekbalk, resultatenlijst, and keyboard-selectie highlight.

**File:** `shell/css/main.css`

**Add about:** New section

```css
/* === TAB SEARCH OVERLAY === */

.tab-search-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 10001;
  display: flex;
  justify-content: center;
  padding-top: 60px;
}

.tab-search-container {
  width: 560px;
  max-height: 480px;
  background: var(--bg-secondary, #1e1e2e);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  box-shadow: 0 16px 64px rgba(0, 0, 0, 0.6);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.tab-search-input {
  width: 100%;
  padding: 14px 16px;
  background: transparent;
  border: none;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  color: var(--text, #e0e0e0);
  font-size: 15px;
  outline: none;
  font-family: inherit;
}

.tab-search-input::placeholder {
  color: var(--text-dim, #888);
}

.tab-search-results,
.tab-search-closed {
  overflow-y: auto;
  flex: 1;
}

.tab-search-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 16px;
  cursor: pointer;
  transition: background 0.1s;
}

.tab-search-item:hover,
.tab-search-item.selected {
  background: rgba(255, 255, 255, 0.06);
}

.tab-search-item.selected {
  background: rgba(66, 133, 244, 0.15);
}

.tab-search-item.active-tab {
  border-left: 2px solid var(--accent, #e94560);
}

.tab-search-emoji {
  font-size: 16px;
  flex-shrink: 0;
}

.tab-search-favicon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  border-radius: 2px;
}

.tab-search-text {
  flex: 1;
  min-width: 0;
  overflow: hidden;
}

.tab-search-title {
  font-size: 13px;
  color: var(--text, #e0e0e0);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tab-search-url {
  font-size: 11px;
  color: var(--text-dim, #888);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tab-search-active-badge {
  font-size: 10px;
  color: var(--accent, #e94560);
  background: rgba(233, 69, 96, 0.1);
  padding: 1px 6px;
  border-radius: 4px;
  flex-shrink: 0;
}

.tab-search-closed-icon {
  font-size: 14px;
  color: var(--text-dim, #888);
  flex-shrink: 0;
  width: 16px;
  text-align: center;
}

.tab-search-section-label {
  font-size: 11px;
  color: var(--text-dim, #888);
  padding: 8px 16px 4px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
```

---

## Acceptatiecriteria — this must werken na the session

```bash
TOKEN=$(cat ~/.tandem/api-token)

# Test 1: New endpoint — recent closed tabs
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:8765/tabs/closed
# Verwacht: {"ok":true, "closed": [...]}

# Test 2: Open a paar tabs and closes er één
curl -H "Authorization: Bearer $TOKEN" \
  -X POST http://localhost:8765/tabs/open \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com"}'
# Noteer tab ID

curl -H "Authorization: Bearer $TOKEN" \
  -X POST http://localhost:8765/tabs/close \
  -H "Content-Type: application/json" \
  -d '{"tabId": "tab-2"}'

curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:8765/tabs/closed
# Verwacht: example.com in the closed list

# Test 3: Existing endpoints werken still
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:8765/tabs/list
# Verwacht: {"tabs": [...], "groups": [...]}
```

**UI verificatie:**
- [ ] Ctrl+Space opens the zoek-overlay, gecentreerd at the top
- [ ] Typen filtert tabs real-time op title and URL
- [ ] Pijltjestoetsen navigeren door the list, geselecteerd item is gehighlight
- [ ] Enter schakelt to the geselecteerde tab
- [ ] Escape closes the overlay
- [ ] Klik op achtergrond (buiten container) closes the overlay
- [ ] Sectie "Recent closed" shows closed tabs with ↩ icon
- [ ] Klik op closed tab heropent hem
- [ ] Actieve tab has a rode linkerborder and "actief" badge

---

## Sessie Protocol

### Bij start:
```
1. Read LEES-MIJ-EERST.md
2. Read DIT file (fase-1-search-overlay.md) fully
3. Run: curl http://localhost:8765/status && npx tsc && git status
4. Read the files in the "Files to read" table above
```

### Bij einde:
```
1. npx tsc — ZERO errors verplicht
2. npm start — app start without crashes
3. Alle curl tests out "Acceptatiecriteria" uitvoeren
4. Visual verificatie: neem screenshots or the zoek-overlay
5. npx vitest run — alle existing tests blijven slagen
6. Update CHANGELOG.md with korte entry
7. git commit -m "🔍 feat: search in tabs overlay — Ctrl+Space, filter, keyboard nav"
8. git push
9. Rapport:
   ## Gebouwd
   ## Getest (plak curl output + screenshots)
   ## Problemen
   ## Feature compleet ✅
```

---

## Bekende valkuilen

- [ ] Ctrl+Space can conflict with input-method switching on Linux — test on macOS first, Linux later
- [ ] Focus management: wanneer the overlay opens, must focus to the input gaan. Wanneer the overlay closes, must focus terug to the webview.
- [ ] `escapeHtml()` is essentieel — tab titels can HTML bevatten (XSS preventie)
- [ ] The fetch calls to `/tabs/list` and `/tabs/closed` use no auth header vanuit the shell — this works omdat the shell op localhost draait and the API localhost requests doorlaat (zie auth middleware in `class TandemAPI`)
- [ ] `searchItems` contains zowel open if closed tabs — zorg that the index-mapping correct is bij the filteren
