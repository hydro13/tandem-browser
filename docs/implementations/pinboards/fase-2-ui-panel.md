# Phase 2 — UI: Sidebar Panel + Context Menu

> **Feature:** Pinboards
> **Sessions:** 1 session
> **Priority:** HIGH
> **Depends on:** Phase 1 complete (PinboardManager + API endpoints werken)

---

## Goal or this fase

Bouw the gebruikersinterface for Pinboards: a sidebar-icon that a panel opens with a list or boards and hun items, plus right-click-integratie to content direct to a Pinboard te saven. After this phase can Robin via the UI boards bekijken and via the context menu content add.

---

## Existing Code to Read — ONLY This

> Read NOTHING else. Do not wander through the codebase.

| File | Look for function/class | Why |
|---------|--------------------------|--------|
| `src/pinboards/manager.ts` | `class PinboardManager` | Phase 1 output — the manager that we aanroepen |
| `src/context-menu/types.ts` | `interface ContextMenuDeps` | Hier `pinboardManager` about add |
| `src/context-menu/menu-builder.ts` | `class ContextMenuBuilder`, `build()`, `addTandemItems()` | Hier "Save to Pinboard" items add |
| `src/context-menu/manager.ts` | `class ContextMenuManager` | Begrijpen hoe deps be doorgegeven |
| `shell/index.html` | Sidebar section, `ocChat` IIFE | UI pattern for panels |
| `src/main.ts` | `new ContextMenuManager(...)` | Hier `pinboardManager` meegeven in deps |

---

## To Build in this fase

### Step 1: Context Menu — ContextMenuDeps uitbreiden

**Wat:** `PinboardManager` add about the context menu dependencies zodat the builder er bij can.

**File:** `src/context-menu/types.ts`

**Add about:** `interface ContextMenuDeps`

```typescript
import type { PinboardManager } from '../pinboards/manager';

export interface ContextMenuDeps {
  // ... existing deps ...
  pinboardManager: PinboardManager;
}
```

**File:** `src/main.ts`

**Zoek to:** the blok waar `ContextMenuManager` is geïnstantieerd. Voeg `pinboardManager` toe about the deps object.

### Step 2: Context Menu — "Save to Pinboard" items

**What:** Three context-menu items depending on the click context: save link, save image, save selection. Each option shows a submenu with available boards.

**File:** `src/context-menu/menu-builder.ts`

**New methode:** `addPinboardItems()`

```typescript
/**
 * Add "Save to Pinboard" items based on context.
 * Shows submenu with available boards.
 */
private addPinboardItems(menu: Menu, params: ContextMenuParams, wc: WebContents): void {
  const boards = this.deps.pinboardManager.listBoards();
  if (boards.length === 0) return; // No boards = no menu items

  this.addSeparator(menu);

  // Save page to Pinboard (always beschikbaar)
  menu.append(new MenuItem({
    label: 'Save Page to Pinboard',
    submenu: boards.folder(board => ({
      label: `${board.emoji} ${board.name}`,
      click: () => {
        this.deps.pinboardManager.addItem(board.id, {
          type: 'link',
          url: params.pageURL,
          title: wc.getTitle(),
          sourceUrl: params.pageURL,
        });
      }
    }))
  }));

  // Save link to Pinboard (if er a link is)
  if (params.linkURL && isSafeURL(params.linkURL)) {
    menu.append(new MenuItem({
      label: 'Save Link to Pinboard',
      submenu: boards.folder(board => ({
        label: `${board.emoji} ${board.name}`,
        click: () => {
          this.deps.pinboardManager.addItem(board.id, {
            type: 'link',
            url: params.linkURL,
            title: params.linkText || params.linkURL,
            sourceUrl: params.pageURL,
          });
        }
      }))
    }));
  }

  // Save image to Pinboard (if er a image is)
  if (params.mediaType === 'image' && params.srcURL) {
    menu.append(new MenuItem({
      label: 'Save Image to Pinboard',
      submenu: boards.folder(board => ({
        label: `${board.emoji} ${board.name}`,
        click: () => {
          this.deps.pinboardManager.addItem(board.id, {
            type: 'image',
            url: params.srcURL,
            sourceUrl: params.pageURL,
          });
        }
      }))
    }));
  }

  // Save selection to Pinboard (if er text geselecteerd is)
  if (params.selectionText) {
    menu.append(new MenuItem({
      label: 'Save Selection to Pinboard',
      submenu: boards.folder(board => ({
        label: `${board.emoji} ${board.name}`,
        click: () => {
          this.deps.pinboardManager.addItem(board.id, {
            type: 'quote',
            content: params.selectionText,
            sourceUrl: params.pageURL,
          });
        }
      }))
    }));
  }
}
```

**Aanroepen vanuit `build()`:** Voeg `this.addPinboardItems(menu, params, wc)` toe na `this.addTandemItems()` (about the einde or the `build()` methode).

### Step 3: Sidebar Pinboard Icon

**Wat:** A pinboard-icon in the sidebar that the pinboard-panel opens/closes. Dit is a toggle — click opens the panel, nogmaals clicking closes the.

**File:** `shell/index.html`

**Zoek to:** the sidebar icon-strip section. Voeg a new icon toe:

```html
<!-- Pinboard sidebar icon -->
<button class="sidebar-icon" id="pinboard-toggle" title="Pinboards">
  📌
</button>
```

**Stijl:** Volg exact the pattern or existing sidebar-icons (the same class, the same hover/active states).

### Step 4: Pinboard Paneel UI

**Wat:** A panel that opens if the sidebar-icon is geklikt. Shows a list or boards and the items or the geselecteerde board. Haalt data op via `fetch()` to the `/pinboards` API.

**File:** `shell/index.html`

**Structuur:**

```html
<!-- Pinboard Panel -->
<div id="pinboard-panel" class="panel" style="display:none;">
  <div class="pinboard-header">
    <h3>Pinboards</h3>
    <button id="pinboard-new-btn" title="New board">+</button>
  </div>

  <!-- Board list -->
  <div id="pinboard-board-list" class="pinboard-boards">
    <!-- Dynamisch gevuld via JS -->
  </div>

  <!-- Items or geselecteerd board -->
  <div id="pinboard-items" class="pinboard-items" style="display:none;">
    <div class="pinboard-items-header">
      <button id="pinboard-back-btn">← Boards</button>
      <span id="pinboard-board-name"></span>
    </div>
    <div id="pinboard-item-list">
      <!-- Dynamisch gevuld via JS -->
    </div>
  </div>
</div>
```

### Stap 5: Pinboard JavaScript (IIFE)

**Wat:** Alle client-side logica for the Pinboard panel. Loads boards via API, shows ze if list, handelt clicking af, shows items per board.

**File:** `shell/index.html`

**Patroon:** Maak a IIFE section, vergelijkbaar with `ocChat`:

```javascript
// === Pinboard Panel ===
const pinboardPanel = (() => {
  const API = 'http://localhost:8765';
  let currentBoardId = null;

  async function loadBoards() {
    const res = await fetch(`${API}/pinboards`);
    const data = await res.json();
    renderBoardList(data.boards);
  }

  function renderBoardList(boards) {
    const container = document.getElementById('pinboard-board-list');
    container.innerHTML = '';
    if (boards.length === 0) {
      container.innerHTML = '<p class="empty-state">Still no boards. Klik + to er a te maken.</p>';
      return;
    }
    boards.forEach(board => {
      const el = document.createElement('div');
      el.className = 'pinboard-board-item';
      el.innerHTML = `
        <span class="board-emoji">${board.emoji}</span>
        <span class="board-name">${board.name}</span>
        <span class="board-count">${board.itemCount}</span>
      `;
      el.addEventListener('click', () => openBoard(board.id, board.name, board.emoji));
      container.appendChild(el);
    });
  }

  async function openBoard(boardId, name, emoji) {
    currentBoardId = boardId;
    document.getElementById('pinboard-board-list').style.display = 'none';
    document.getElementById('pinboard-items').style.display = 'block';
    document.getElementById('pinboard-board-name').textContent = `${emoji} ${name}`;

    const res = await fetch(`${API}/pinboards/${boardId}/items`);
    const data = await res.json();
    renderItems(data.items);
  }

  function renderItems(items) {
    const container = document.getElementById('pinboard-item-list');
    container.innerHTML = '';
    if (items.length === 0) {
      container.innerHTML = '<p class="empty-state">No items. Klik rechts op a page → "Save to Pinboard".</p>';
      return;
    }
    items.forEach(item => {
      const el = document.createElement('div');
      el.className = `pinboard-item pinboard-item-${item.type}`;
      el.innerHTML = buildItemHTML(item);
      container.appendChild(el);
    });
  }

  function buildItemHTML(item) {
    const typeIcons = { link: '🔗', image: '🖼️', text: '📝', quote: '💬' };
    const icon = typeIcons[item.type] || '📄';
    const title = item.title || item.url || item.content?.substring(0, 50) || 'Untitled';
    const date = new Date(item.createdAt).toLocaleDateString('nl-NL');

    let html = `
      <span class="item-icon">${icon}</span>
      <div class="item-content">
        <div class="item-title">${escapeHtml(title)}</div>
    `;

    if (item.note) {
      html += `<div class="item-note">${escapeHtml(item.note)}</div>`;
    }
    if (item.type === 'quote' && item.content) {
      html += `<div class="item-quote">"${escapeHtml(item.content.substring(0, 100))}"</div>`;
    }

    html += `<div class="item-date">${date}</div></div>`;

    // Delete knop
    html += `<button class="item-delete" data-item-id="${item.id}" title="Delete">×</button>`;

    return html;
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Klik op link items opens URL in new tab
  // Klik op delete knop verwijdert item
  // New board knop opens prompt for name
  // Back knop gaat terug to board list

  async function createBoard() {
    const name = prompt('Board name:');
    if (!name) return;
    const emoji = prompt('Emoji (optional):', '📌') || '📌';
    await fetch(`${API}/pinboards`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, emoji })
    });
    loadBoards();
  }

  async function deleteItem(itemId) {
    if (!currentBoardId) return;
    await fetch(`${API}/pinboards/${currentBoardId}/items/${itemId}`, {
      method: 'DELETE'
    });
    // Herlaad items
    openBoard(currentBoardId,
      document.getElementById('pinboard-board-name').textContent.slice(2), // name without emoji
      document.getElementById('pinboard-board-name').textContent.charAt(0) // emoji
    );
  }

  // Event listeners
  document.getElementById('pinboard-toggle')?.addEventListener('click', () => {
    const panel = document.getElementById('pinboard-panel');
    const isVisible = panel.style.display !== 'none';
    panel.style.display = isVisible ? 'none' : 'block';
    if (!isVisible) loadBoards();
  });

  document.getElementById('pinboard-new-btn')?.addEventListener('click', createBoard);

  document.getElementById('pinboard-back-btn')?.addEventListener('click', () => {
    currentBoardId = null;
    document.getElementById('pinboard-items').style.display = 'none';
    document.getElementById('pinboard-board-list').style.display = 'block';
    loadBoards();
  });

  // Event delegation for delete knoppen
  document.getElementById('pinboard-item-list')?.addEventListener('click', (e) => {
    if (e.target.classList.contains('item-delete')) {
      const itemId = e.target.dataset.itemId;
      if (itemId) deleteItem(itemId);
    }
  });

  return { loadBoards, createBoard };
})();
```

### Stap 6: CSS for Pinboard Paneel

**Wat:** Styling for the panel, boardlijst, items. Volg the existing kleurpatronen and font-sizes or the shell.

**File:** `shell/index.html` (in the `<style>` section)

```css
/* Pinboard Panel */
#pinboard-panel {
  position: absolute;
  /* Positioneer next to sidebar, vergelijkbaar with wingman panel */
  width: 320px;
  height: 100%;
  background: var(--bg-panel, #1e1e1e);
  border-right: 1px solid var(--border-color, #333);
  overflow-y: auto;
  z-index: 100;
}

.pinboard-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-color, #333);
}

.pinboard-board-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  cursor: pointer;
}
.pinboard-board-item:hover {
  background: var(--hover-bg, #2a2a2a);
}

.board-emoji { font-size: 18px; }
.board-name { flex: 1; }
.board-count {
  color: var(--text-muted, #888);
  font-size: 12px;
}

.pinboard-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--border-color, #333);
}

.item-icon { font-size: 16px; margin-top: 2px; }
.item-content { flex: 1; min-width: 0; }
.item-title {
  font-size: 13px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.item-note {
  font-size: 11px;
  color: var(--text-muted, #888);
  margin-top: 2px;
}
.item-quote {
  font-size: 12px;
  font-style: italic;
  color: var(--text-muted, #aaa);
  margin-top: 4px;
}
.item-date {
  font-size: 10px;
  color: var(--text-muted, #666);
  margin-top: 4px;
}
.item-delete {
  background: none;
  border: none;
  color: var(--text-muted, #666);
  cursor: pointer;
  font-size: 16px;
  padding: 2px 6px;
}
.item-delete:hover { color: #f44; }

.empty-state {
  text-align: center;
  color: var(--text-muted, #888);
  padding: 24px 16px;
  font-size: 13px;
}
```

---

## Acceptatiecriteria — this must werken na the session

```bash
TOKEN=$(cat ~/.tandem/api-token)

# Prerequisite: zorg that er minstens 1 board exists
curl -s -X POST http://localhost:8765/pinboards \
  -H "Content-Type: application/json" \
  -d '{"name": "Test Board", "emoji": "🧪"}' | jq .
```

**UI verificatie:**
- [ ] Pinboard icon (📌) is visible in the sidebar
- [ ] Klikken op the icon opens the Pinboard panel
- [ ] Paneel shows list or boards with emoji, name, and item count
- [ ] Klikken op a board shows the items or that board
- [ ] "← Boards" knop gaat terug to the boardlijst
- [ ] "+" knop opens prompt to new board about te maken
- [ ] New aangemaakt board appears in the list

**Context menu verificatie:**
- [ ] Right-click op a page shows "Save Page to Pinboard" with submenu or boards
- [ ] Right-click op a link shows "Save Link to Pinboard"
- [ ] Right-click op a image shows "Save Image to Pinboard"
- [ ] Text selecteren + rechtsklikken shows "Save Selection to Pinboard"
- [ ] Klikken op a board in the submenu voegt the item toe (verifieer via API: `curl http://localhost:8765/pinboards/:id/items`)
- [ ] Delete knop (×) verwijdert a item

---

## Sessie Protocol

### Bij start:
```
1. Read LEES-MIJ-EERST.md
2. Read DIT file (fase-2-ui-panel.md) fully
3. Run: curl http://localhost:8765/status && npx tsc && git status
4. Verifieer that phase 1 works: curl http://localhost:8765/pinboards
5. Read the files in the "Files to read" table above
```

### Bij einde:
```
1. npx tsc — ZERO errors verplicht
2. npm start — app start without crashes
3. UI visual testen (sidebar + context menu)
4. npx vitest run — alle existing tests blijven slagen
5. Update CHANGELOG.md with korte entry
6. git commit -m "📌 feat: Pinboard sidebar panel + context menu integration"
7. git push
8. Rapport:
   ## Gebouwd
   ## Getest (screenshots + curl output)
   ## Problemen
   ## Next session start bij fase-3-visual-board.md
```

---

## Bekende valkuilen

- [ ] **ContextMenuDeps vergeten** — if `pinboardManager` not in deps zit, crasht the builder bij `this.deps.pinboardManager`
- [ ] **isSafeURL check** — usage the existing `isSafeURL()` helper in menu-builder.ts for linkURL
- [ ] **Submenu leeg** — if er no boards are, toon no "Save to Pinboard" items (check `boards.length === 0`)
- [ ] **Shell CSS variabelen** — usage existing CSS custom properties (`--bg-panel`, `--border-color`, etc.) in plaats or hardcoded kleuren
- [ ] **Panel positionering** — the pinboard panel mag not overlappen with the wingman panel. Usage the same positioneringslogica
- [ ] **XSS in item content** — `escapeHtml()` use for alle user-generated content (titels, quotes, notes)
- [ ] **API port hardcoded** — usage the same port constante if the rest or the shell (kijk hoe `ocChat` the doet)
