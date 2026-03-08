# Phase 7 — Pin Editing: Hover Actions + Edit Modal

> **Depends on:** Phase 1-6 ✅
> **Parallel with:** Hydra Editor IIFE build (phase A)

---

## Goal

Pins can editen zoals Opera doet: hover over a card → "✏️ Edit" / "🗑️ Remove" popup.
Klik Edit → inline edit form with Headline + text.

---

## Deel 1: Backend — PUT endpoint for item updates

### In `src/api/routes/pinboards.ts`

The PUT endpoint for items exists already:
```
PUT /pinboards/:id/items/:itemId  →  updateItem(boardId, itemId, { title, note, content })
```

Breid `updateItem()` in `src/pinboards/manager.ts` out to also `title` and `description` te updaten:

```typescript
updateItem(boardId: string, itemId: string, updates: {
  title?: string;
  note?: string;
  content?: string;
  description?: string;
  thumbnail?: string;
}): PinboardItem | null
```

Voeg `title`, `description`, `thumbnail` toe about the updates next to `note` and `content`.
The huidige implementatie updatet only `title`, `note`, `content` — check or `description` also already works.

---

## Deel 2: Frontend — Hover Edit/Remove UI

### CSS: hover overlay op `.pb-card`

Bij hover over a card: rechtsboven a kleine popup with Edit + Remove knoppen.
Opera-stijl: appears bij hover, disappears if muis weggaat.

```css
.pb-card-actions {
  position: absolute;
  top: 6px;
  right: 6px;
  display: none;
  gap: 4px;
  background: rgba(20, 20, 35, 0.92);
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 6px;
  padding: 3px;
  z-index: 10;
}
.pb-card:hover .pb-card-actions { display: flex; }
.pb-card-action-btn {
  background: none;
  border: none;
  color: var(--text);
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  display: flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
}
.pb-card-action-btn:hover { background: rgba(255,255,255,0.1); }
.pb-card-action-btn.danger:hover { background: rgba(239,68,68,0.2); color: #ef4444; }
```

### HTML: voeg actions div toe about elke card in `pbRenderItems()`

```html
<div class="pb-card-actions">
  <button class="pb-card-action-btn pb-edit-btn" data-item-id="${item.id}">✏️ Edit</button>
  <button class="pb-card-action-btn danger pb-remove-btn" data-item-id="${item.id}">🗑️ Remove</button>
</div>
```

Delete the existing "×" delete button — vervang door the new Remove knop in the actions popup.

### Event handlers in `pbRenderItems()`

Na container.innerHTML:
```javascript
// Edit buttons
container.querySelectorAll('.pb-edit-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const item = items.find(i => i.id === btn.dataset.itemId);
    if (item) pbOpenEditModal(item, pbState.currentBoardId);
  });
});

// Remove buttons (vervang existing delete handler)
container.querySelectorAll('.pb-remove-btn').forEach(btn => {
  btn.addEventListener('click', async (e) => {
    e.stopPropagation();
    const itemId = btn.dataset.itemId;
    // ... existing delete logica
  });
});
```

---

## Deel 3: Edit Modal

### Function `pbOpenEditModal(item, boardId)`

Shows a modal overlay with:
- **Headline** input (= item.title)
- **Text** textarea (= item.content or item.note)
- Existing preview (thumbnail if that er is)
- Save / Annuleren knoppen

```javascript
async function pbOpenEditModal(item, boardId) {
  // Usage showPrompt/showConfirm pattern NIET — bouw custom modal
  // Voeg a overlay div toe about body
  const overlay = document.createElement('div');
  overlay.className = 'pb-edit-overlay';
  overlay.innerHTML = `
    <div class="pb-edit-modal">
      <div class="pb-edit-header">
        <span>Edit pin</span>
        <button class="pb-edit-close">×</button>
      </div>
      <div class="pb-edit-body">
        <input class="pb-edit-title" type="text" placeholder="Headline" value="${pbEscape(item.title || '')}">
        <textarea class="pb-edit-content" placeholder="Type something...">${pbEscape(item.content || item.note || '')}</textarea>
        ${item.thumbnail ? `<img src="${pbEscape(item.thumbnail)}" class="pb-edit-preview-img">` : ''}
      </div>
      <div class="pb-edit-footer">
        <button class="pb-edit-save">Save</button>
        <button class="pb-edit-cancel">Cancel</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  
  overlay.querySelector('.pb-edit-title').focus();
  
  const close = () => overlay.remove();
  
  overlay.querySelector('.pb-edit-close').addEventListener('click', close);
  overlay.querySelector('.pb-edit-cancel').addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  
  overlay.querySelector('.pb-edit-save').addEventListener('click', async () => {
    const title = overlay.querySelector('.pb-edit-title').value.trim();
    const content = overlay.querySelector('.pb-edit-content').value.trim();
    await fetch(`http://localhost:8765/pinboards/${boardId}/items/${item.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
      body: JSON.stringify({ title, content, note: content })
    });
    close();
    await pbRefreshItems(boardId);
  });
}
```

---

## CSS for edit modal/overlay

```css
.pb-edit-overlay {
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.6);
  z-index: 9999;
  display: flex; align-items: center; justify-content: center;
}
.pb-edit-modal {
  background: var(--bg-secondary, #1a1f2e);
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 12px;
  width: 480px; max-width: 90vw;
  max-height: 80vh;
  overflow: hidden;
  display: flex; flex-direction: column;
}
.pb-edit-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid rgba(255,255,255,0.08);
  font-weight: 500;
}
.pb-edit-close { background: none; border: none; color: var(--text-dim); cursor: pointer; font-size: 18px; }
.pb-edit-body { padding: 16px; display: flex; flex-direction: column; gap: 10px; overflow-y: auto; flex: 1; }
.pb-edit-title {
  background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12);
  border-radius: 6px; color: var(--text); font-size: 15px; font-weight: 500;
  padding: 8px 12px;
}
.pb-edit-content {
  background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12);
  border-radius: 6px; color: var(--text); font-size: 13px; line-height: 1.6;
  padding: 10px 12px; resize: vertical; min-height: 100px; font-family: inherit;
}
.pb-edit-title:focus, .pb-edit-content:focus { outline: none; border-color: var(--accent); }
.pb-edit-preview-img { width: 100%; max-height: 140px; object-fit: cover; border-radius: 6px; }
.pb-edit-footer {
  padding: 10px 16px; border-top: 1px solid rgba(255,255,255,0.08);
  display: flex; justify-content: flex-end; gap: 8px;
}
.pb-edit-save {
  background: var(--accent); color: #fff; border: none;
  border-radius: 6px; padding: 6px 18px; cursor: pointer; font-size: 13px;
}
.pb-edit-cancel {
  background: rgba(255,255,255,0.08); color: var(--text-dim);
  border: none; border-radius: 6px; padding: 6px 14px; cursor: pointer; font-size: 13px;
}
```

---

## Acceptatiecriteria

```
1. Hover over pin card → "✏️ Edit" + "🗑️ Remove" visible rechtsboven
2. Klik Edit → modal opens with huidige title and text
3. Change + Save → pin geüpdated, board ververst
4. Klik Remove → pin removed (existing delete logica)
5. Klik buiten modal or Cancel → closes without save
6. npx tsc — zero errors
```

---

## Sessie Protocol

### Bij start:
```
1. Read docs/implementations/pinboards/LEES-MIJ-EERST.md
2. Read this file fully
3. npx tsc && git status
4. Read shell/index.html → zoek pbRenderItems() and the existing delete handler
5. Read shell/css/main.css → zoek pb-card CSS section
```

### Bij einde:
```
1. npx tsc — ZERO errors
2. Update CHANGELOG.md
3. git commit -m "feat: pin hover actions (Edit/Remove) + edit modal"
4. git push
5. openclaw system event --text "Done: Pin edit/remove hover actions complete" --mode now
```
