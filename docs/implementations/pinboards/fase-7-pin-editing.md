# Fase 7 — Pin Editing: Hover Actions + Edit Modal

> **Afhankelijk van:** Fase 1-6 ✅
> **Parallel met:** Hydra Editor IIFE build (fase A)

---

## Doel

Pins kunnen editen zoals Opera doet: hover over een kaart → "✏️ Edit" / "🗑️ Remove" popup.
Klik Edit → inline edit form met Headline + tekst.

---

## Deel 1: Backend — PUT endpoint voor item updates

### In `src/api/routes/pinboards.ts`

Het PUT endpoint voor items bestaat al:
```
PUT /pinboards/:id/items/:itemId  →  updateItem(boardId, itemId, { title, note, content })
```

Breid `updateItem()` in `src/pinboards/manager.ts` uit om ook `title` en `description` te updaten:

```typescript
updateItem(boardId: string, itemId: string, updates: {
  title?: string;
  note?: string;
  content?: string;
  description?: string;
  thumbnail?: string;
}): PinboardItem | null
```

Voeg `title`, `description`, `thumbnail` toe aan de updates naast `note` en `content`.
De huidige implementatie updatet alleen `title`, `note`, `content` — check of `description` ook al werkt.

---

## Deel 2: Frontend — Hover Edit/Remove UI

### CSS: hover overlay op `.pb-card`

Bij hover over een kaart: rechtsboven een kleine popup met Edit + Remove knoppen.
Opera-stijl: verschijnt bij hover, verdwijnt als muis weggaat.

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

### HTML: voeg actions div toe aan elke kaart in `pbRenderItems()`

```html
<div class="pb-card-actions">
  <button class="pb-card-action-btn pb-edit-btn" data-item-id="${item.id}">✏️ Edit</button>
  <button class="pb-card-action-btn danger pb-remove-btn" data-item-id="${item.id}">🗑️ Remove</button>
</div>
```

Verwijder de bestaande "×" delete button — vervang door de nieuwe Remove knop in de actions popup.

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

// Remove buttons (vervang bestaande delete handler)
container.querySelectorAll('.pb-remove-btn').forEach(btn => {
  btn.addEventListener('click', async (e) => {
    e.stopPropagation();
    const itemId = btn.dataset.itemId;
    // ... bestaande delete logica
  });
});
```

---

## Deel 3: Edit Modal

### Functie `pbOpenEditModal(item, boardId)`

Toont een modal overlay met:
- **Headline** input (= item.title)
- **Tekst** textarea (= item.content of item.note)
- Bestaande preview (thumbnail als die er is)
- Opslaan / Annuleren knoppen

```javascript
async function pbOpenEditModal(item, boardId) {
  // Gebruik showPrompt/showConfirm patroon NIET — bouw custom modal
  // Voeg een overlay div toe aan body
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

## CSS voor edit modal/overlay

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
1. Hover over pin kaart → "✏️ Edit" + "🗑️ Remove" zichtbaar rechtsboven
2. Klik Edit → modal opent met huidige titel en tekst
3. Wijzigen + Save → pin geüpdated, board ververst
4. Klik Remove → pin verwijderd (bestaande delete logica)
5. Klik buiten modal of Cancel → sluit zonder opslaan
6. npx tsc — zero errors
```

---

## Sessie Protocol

### Bij start:
```
1. Lees docs/implementations/pinboards/LEES-MIJ-EERST.md
2. Lees dit bestand volledig
3. npx tsc && git status
4. Lees shell/index.html → zoek pbRenderItems() en de bestaande delete handler
5. Lees shell/css/main.css → zoek pb-card CSS sectie
```

### Bij einde:
```
1. npx tsc — ZERO errors
2. CHANGELOG.md bijwerken
3. git commit -m "feat: pin hover actions (Edit/Remove) + edit modal"
4. git push
5. openclaw system event --text "Done: Pin edit/remove hover actions klaar" --mode now
```
