# Phase 3 — Visual: Card Grid View

> **Feature:** Pinboards
> **Sessions:** 1 session
> **Priority:** MIDDEL
> **Depends on:** Phase 2 complete (sidebar panel + context menu werken)

---

## Goal or this fase

Upgrade the Pinboard item-weergave or a simpele list to a visual card-grid. Items be if cards weergegeven with thumbnails, titels and notes. Drag-to-reorder, visual feedback, board-switcher, and polish. After this phase sees the Pinboard panel eruit if a echt moodboard.

---

## Existing Code to Read — ONLY This

> Read NOTHING else. Do not wander through the codebase.

| File | Look for function/class | Why |
|---------|--------------------------|--------|
| `shell/index.html` | `pinboardPanel` IIFE, `renderItems()`, CSS section | Phase 2 output — hier is the visual geüpgraded |
| `src/pinboards/manager.ts` | `reorderItems()` | API for drag-to-reorder |
| `src/api/routes/pinboards.ts` | `POST /pinboards/:id/items/reorder` | Endpoint for reorder |

---

## To Build in this fase

### Step 1: Card Grid Layout

**Wat:** Vervang the list-weergave door a CSS grid or cards. Elke card shows the type-specific beeld (thumbnail for links, image for images, text for quotes) with title and meta-info eronder.

**File:** `shell/index.html` — CSS + JavaScript aanpassen

**Grid CSS:**

```css
/* Card Grid */
.pinboard-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 12px;
  padding: 12px;
}

.pinboard-card {
  background: var(--bg-card, #252525);
  border-radius: 8px;
  overflow: hidden;
  cursor: grab;
  transition: transform 0.15s, box-shadow 0.15s;
  position: relative;
}
.pinboard-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0,0,0,0.3);
}
.pinboard-card.dragging {
  opacity: 0.5;
  cursor: grabbing;
}
.pinboard-card.drag-over {
  border: 2px solid var(--accent-color, #4a9eff);
}

/* Card thumbnail/preview area */
.card-preview {
  width: 100%;
  height: 100px;
  overflow: hidden;
  background: var(--bg-preview, #1a1a1a);
  display: flex;
  align-items: center;
  justify-content: center;
}
.card-preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.card-preview .card-text-preview {
  padding: 8px;
  font-size: 11px;
  color: var(--text-muted, #aaa);
  font-style: italic;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 4;
  -webkit-box-orient: vertical;
}
.card-preview .card-type-icon {
  font-size: 32px;
  opacity: 0.3;
}

/* Card info area */
.card-info {
  padding: 8px;
}
.card-title {
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.card-note {
  font-size: 10px;
  color: var(--text-muted, #888);
  margin-top: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.card-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 6px;
}
.card-type {
  font-size: 10px;
  color: var(--text-muted, #666);
  text-transform: uppercase;
}
.card-date {
  font-size: 10px;
  color: var(--text-muted, #666);
}

/* Delete button overlay */
.card-delete {
  position: absolute;
  top: 4px;
  right: 4px;
  background: rgba(0,0,0,0.7);
  border: none;
  color: #fff;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  cursor: pointer;
  font-size: 12px;
  display: none;
  align-items: center;
  justify-content: center;
}
.pinboard-card:hover .card-delete {
  display: flex;
}
.card-delete:hover {
  background: #f44;
}
```

### Step 2: Card Render Function

**Wat:** Vervang `renderItems()` in the `pinboardPanel` IIFE with a card-gebaseerde render function.

**File:** `shell/index.html` — in the `pinboardPanel` IIFE

```javascript
function renderItems(items) {
  const container = document.getElementById('pinboard-item-list');
  container.innerHTML = '';
  container.className = 'pinboard-grid'; // Switch to grid layout

  if (items.length === 0) {
    container.className = 'pinboard-items-empty';
    container.innerHTML = `
      <div class="empty-state">
        <div style="font-size: 48px; margin-bottom: 12px;">📌</div>
        <p>Still no items op this board.</p>
        <p>Klik rechts op a page, link, image or tekstselectie → "Save to Pinboard".</p>
      </div>
    `;
    return;
  }

  items.forEach(item => {
    const card = document.createElement('div');
    card.className = 'pinboard-card';
    card.draggable = true;
    card.dataset.itemId = item.id;
    card.innerHTML = buildCardHTML(item);

    // Klik op link/image card opens the URL
    if (item.url) {
      card.addEventListener('click', (e) => {
        if (e.target.classList.contains('card-delete')) return;
        // Open in new tab via API or window.open
        window.tandem?.openTab?.(item.url) ||
          fetch(`http://localhost:8765/tabs/new`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: item.url })
          });
      });
      card.style.cursor = 'pointer';
    }

    container.appendChild(card);
  });

  setupDragAndDrop(container);
}

function buildCardHTML(item) {
  const typeIcons = { link: '🔗', image: '🖼️', text: '📝', quote: '💬' };
  const title = escapeHtml(item.title || item.url || item.content?.substring(0, 50) || 'Untitled');
  const date = new Date(item.createdAt).toLocaleDateString('nl-NL');

  // Preview area — verschilt per type
  let preview = '';
  switch (item.type) {
    case 'image':
      preview = `<img src="${escapeHtml(item.url || item.thumbnail || '')}" alt="${title}" loading="lazy" onerror="this.parentElement.innerHTML='<span class=card-type-icon>🖼️</span>'">`;
      break;
    case 'link':
      if (item.thumbnail) {
        preview = `<img src="${escapeHtml(item.thumbnail)}" alt="${title}" loading="lazy" onerror="this.parentElement.innerHTML='<span class=card-type-icon>🔗</span>'">`;
      } else {
        // Favicon if fallback
        const domain = item.url ? new URL(item.url).hostname : '';
        preview = domain
          ? `<img src="https://www.google.com/s2/favicons?domain=${domain}&sz=64" alt="" style="width:32px;height:32px;object-fit:contain;">`
          : `<span class="card-type-icon">🔗</span>`;
      }
      break;
    case 'quote':
      preview = `<div class="card-text-preview">"${escapeHtml(item.content?.substring(0, 150) || '')}"</div>`;
      break;
    case 'text':
      preview = `<div class="card-text-preview">${escapeHtml(item.content?.substring(0, 150) || '')}</div>`;
      break;
    default:
      preview = `<span class="card-type-icon">${typeIcons[item.type] || '📄'}</span>`;
  }

  let html = `
    <button class="card-delete" data-item-id="${item.id}" title="Delete">×</button>
    <div class="card-preview">${preview}</div>
    <div class="card-info">
      <div class="card-title">${title}</div>
  `;

  if (item.note) {
    html += `<div class="card-note">${escapeHtml(item.note)}</div>`;
  }

  html += `
      <div class="card-meta">
        <span class="card-type">${typeIcons[item.type] || ''} ${item.type}</span>
        <span class="card-date">${date}</span>
      </div>
    </div>
  `;

  return html;
}
```

### Step 3: Drag-to-Reorder

**Wat:** Drag-and-drop to cards te herordenen. Bij loslaten is the new order to the API gestuurd via `POST /pinboards/:id/items/reorder`.

**File:** `shell/index.html` — in the `pinboardPanel` IIFE

```javascript
function setupDragAndDrop(container) {
  let draggedCard = null;

  container.addEventListener('dragstart', (e) => {
    draggedCard = e.target.closest('.pinboard-card');
    if (!draggedCard) return;
    draggedCard.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', draggedCard.dataset.itemId);
  });

  container.addEventListener('dragend', (e) => {
    if (draggedCard) {
      draggedCard.classList.remove('dragging');
      draggedCard = null;
    }
    // Remove all drag-over indicators
    container.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
  });

  container.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const target = e.target.closest('.pinboard-card');
    if (target && target !== draggedCard) {
      // Remove previous indicators
      container.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
      target.classList.add('drag-over');
    }
  });

  container.addEventListener('drop', async (e) => {
    e.preventDefault();
    const target = e.target.closest('.pinboard-card');
    if (!target || !draggedCard || target === draggedCard) return;

    // Reorder in DOM
    const cards = [...container.querySelectorAll('.pinboard-card')];
    const draggedIdx = cards.indexOf(draggedCard);
    const targetIdx = cards.indexOf(target);

    if (draggedIdx < targetIdx) {
      target.after(draggedCard);
    } else {
      target.before(draggedCard);
    }

    // Stuur new order to API
    const newOrder = [...container.querySelectorAll('.pinboard-card')].folder(c => c.dataset.itemId);
    await fetch(`${API}/pinboards/${currentBoardId}/items/reorder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemIds: newOrder })
    });

    // Remove indicators
    container.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
  });
}
```

### Step 4: Board Switcher Dropdown

**Wat:** A dropdown boven the item grid waarmee Robin snel between boards can wisselen without terug te gaan to the boardlijst.

**File:** `shell/index.html`

**HTML toevoeging about the items-header:**

```html
<div class="pinboard-items-header">
  <button id="pinboard-back-btn">←</button>
  <select id="pinboard-board-switcher" class="board-switcher">
    <!-- Dynamisch gevuld with board opties -->
  </select>
</div>
```

**JavaScript:**

```javascript
async function updateBoardSwitcher(currentId) {
  const res = await fetch(`${API}/pinboards`);
  const data = await res.json();
  const select = document.getElementById('pinboard-board-switcher');
  select.innerHTML = '';
  data.boards.forEach(board => {
    const option = document.createElement('option');
    option.value = board.id;
    option.textContent = `${board.emoji} ${board.name} (${board.itemCount})`;
    if (board.id === currentId) option.selected = true;
    select.appendChild(option);
  });
}

// Event listener for board switch
document.getElementById('pinboard-board-switcher')?.addEventListener('change', (e) => {
  const selectedId = e.target.value;
  const selectedOption = e.target.selectedOptions[0];
  const text = selectedOption.textContent;
  // Parse emoji and name out the optie text
  openBoard(selectedId, text.slice(2), text.charAt(0));
});
```

### Stap 5: Delete Item via Card

**Wat:** The delete knop op elke card verwijdert the item with a bevestiging and visual fade-out.

**File:** `shell/index.html` — in the `pinboardPanel` IIFE

```javascript
// Update the event delegation for deletes
document.getElementById('pinboard-item-list')?.addEventListener('click', async (e) => {
  const deleteBtn = e.target.closest('.card-delete');
  if (!deleteBtn) return;

  e.stopPropagation(); // Voorkom that the card-click also is getriggerd

  const itemId = deleteBtn.dataset.itemId;
  if (!itemId || !currentBoardId) return;

  // Optioneel: bevestiging
  // if (!confirm('Item verwijderen?')) return;

  // Visual fade-out
  const card = deleteBtn.closest('.pinboard-card');
  if (card) {
    card.style.transition = 'opacity 0.2s, transform 0.2s';
    card.style.opacity = '0';
    card.style.transform = 'scale(0.9)';
  }

  await fetch(`${API}/pinboards/${currentBoardId}/items/${itemId}`, {
    method: 'DELETE'
  });

  // Na fade-out, element verwijderen
  setTimeout(() => {
    if (card) card.remove();
    // Check or grid nu leeg is
    const container = document.getElementById('pinboard-item-list');
    if (container && container.querySelectorAll('.pinboard-card').length === 0) {
      container.className = 'pinboard-items-empty';
      container.innerHTML = `
        <div class="empty-state">
          <div style="font-size: 48px; margin-bottom: 12px;">📌</div>
          <p>Alle items removed.</p>
        </div>
      `;
    }
  }, 250);
});
```

### Stap 6: Visual Polish

**Wat:** Lege states, hover-effecten, type-icons, loading states, and consistente styling.

**File:** `shell/index.html`

**Te implementeren:**
- **Loading state:** Toon a spinner or "Laden..." text terwijl API calls lopen
- **Lege board state:** Aantrekkelijke lege state with hint hoe items toe te voegen
- **Link hover:** Subtiele highlight if a card with URL hoverable is (cursor: pointer)
- **Quote styling:** Quotes tonen with aanhalingstekens and cursief lettertype
- **Board delete:** Optioneel: lang indrukken or rechtermuisknuk op a board in the list → "Board verwijderen"
- **Responsive grid:** Grid past zich about about panel-width (already via `auto-fill`)

**CSS for extra polish:**

```css
/* Loading state */
.pinboard-loading {
  text-align: center;
  padding: 24px;
  color: var(--text-muted, #888);
}

/* Card with link — visual hint that the klikbaar is */
.pinboard-card[data-has-url="true"] .card-info {
  cursor: pointer;
}
.pinboard-card[data-has-url="true"]:hover .card-title {
  color: var(--accent-color, #4a9eff);
  text-decoration: underline;
}

/* Board delete knop in the boardlijst */
.board-delete {
  opacity: 0;
  transition: opacity 0.15s;
  background: none;
  border: none;
  color: var(--text-muted, #666);
  cursor: pointer;
}
.pinboard-board-item:hover .board-delete {
  opacity: 1;
}
.board-delete:hover {
  color: #f44;
}

/* Board switcher dropdown */
.board-switcher {
  flex: 1;
  background: var(--bg-card, #252525);
  color: var(--text-primary, #eee);
  border: 1px solid var(--border-color, #333);
  border-radius: 4px;
  padding: 4px 8px;
  font-size: 13px;
  margin: 0 8px;
}
```

---

## Acceptatiecriteria — this must werken na the session

```bash
TOKEN=$(cat ~/.tandem/api-token)

# Setup: maak board with diverse items
BOARD_ID=$(curl -s -X POST http://localhost:8765/pinboards \
  -H "Content-Type: application/json" \
  -d '{"name": "Visual Test", "emoji": "🎨"}' | jq -r '.board.id')

# Voeg items toe
curl -s -X POST http://localhost:8765/pinboards/$BOARD_ID/items \
  -H "Content-Type: application/json" \
  -d '{"type": "link", "url": "https://github.com", "title": "GitHub"}'
curl -s -X POST http://localhost:8765/pinboards/$BOARD_ID/items \
  -H "Content-Type: application/json" \
  -d '{"type": "image", "url": "https://picsum.photos/200/300", "title": "Random Photo"}'
curl -s -X POST http://localhost:8765/pinboards/$BOARD_ID/items \
  -H "Content-Type: application/json" \
  -d '{"type": "quote", "content": "The beste manier to the toekomst te voorspellen is hem te creëren.", "sourceUrl": "https://example.com"}'
curl -s -X POST http://localhost:8765/pinboards/$BOARD_ID/items \
  -H "Content-Type: application/json" \
  -d '{"type": "text", "title": "Notitie", "content": "Dit is a losse note with wat ideeën."}'
```

**UI verificatie:**
- [ ] Items be if cards weergegeven in a grid (not if list)
- [ ] Link-cards tonen a favicon or thumbnail
- [ ] Image-cards tonen the image if preview
- [ ] Quote-cards tonen the text in the preview area
- [ ] Text-cards tonen the inhoud in the preview area
- [ ] Hover op a card geeft a subtiel lift-effect (translateY + shadow)
- [ ] Hover shows the delete knop (×) rechtsboven the card
- [ ] Klikken op a link-card opens the URL in a new tab
- [ ] Delete knop verwijdert the card with fade-out animatie
- [ ] Drag-and-drop works: sleep a card to a andere positie
- [ ] Na drag-drop is the order opgeslagen (herlaad the board → same order)
- [ ] Board-switcher dropdown wisselt between boards without terug te gaan
- [ ] Lege board shows a aantrekkelijke empty state with hint
- [ ] Grid past zich about bij smaller/breder panel

---

## Sessie Protocol

### Bij start:
```
1. Read LEES-MIJ-EERST.md
2. Read DIT file (fase-3-visual-board.md) fully
3. Run: curl http://localhost:8765/status && npx tsc && git status
4. Verifieer that phase 2 works: open sidebar, click op Pinboard icon
5. Read the files in the "Files to read" table above
```

### Bij einde:
```
1. npx tsc — ZERO errors verplicht
2. npm start — app start without crashes
3. UI visual testen (card grid, drag, delete, board switch)
4. npx vitest run — alle existing tests blijven slagen
5. Update CHANGELOG.md with korte entry
6. git commit -m "📌 feat: visual card grid view for Pinboards"
7. git push
8. Rapport:
   ## Gebouwd
   ## Getest (screenshots)
   ## Problemen
   ## Feature compleet! 🎉
```

---

## Bekende valkuilen

- [ ] **Drag-and-drop event propagation** — `e.stopPropagation()` bij delete click, anders triggert also the card-click
- [ ] **Image loading errors** — `onerror` handler op `<img>` tags for kapotte URLs, fallback to type-icon
- [ ] **XSS via URL** — `escapeHtml()` op alle user-gegenereerde content, inclusief URLs in `src` attributen
- [ ] **Google Favicons API** — `https://www.google.com/s2/favicons?domain=X&sz=64` works without an API key but can be blocked. Use the type icon as a fallback
- [ ] **Reorder API call timing** — not bij elke dragover, only bij drop (already correct in the code hierboven)
- [ ] **CSS grid responsiveness** — `auto-fill` + `minmax(140px, 1fr)` schaalt automatisch, but test bij smalle paneelbreedtes
- [ ] **Data URL thumbnails** — if toekomstige versies data URIs for thumbnails save, be cards traag. V3 houdt the simpel with externe URLs
