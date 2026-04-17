/**
 * Sidebar pinboard panel — boards list, per-board item grid, add/edit/remove,
 * drag-drop reorder, layout + background settings.
 *
 * All pinboard I/O talks directly to the localhost:8765 HTTP API; there's no
 * shared store (unlike bookmarks). The module keeps a small pbState for the
 * currently-open board so external events (context-menu "Save to Pinboard")
 * can refresh the view when it matches.
 *
 * Loaded from: shell/js/sidebar/index.js (via activateItem when 'pinboards' is selected)
 * window exports: none
 */

import { getToken } from '../config.js';
import { hideWebviews, safeSetPanelHTML } from '../webview.js';

// === PINBOARD PANEL MODULE ===
export const PINBOARD_PANEL_IDS = ['pinboards'];

// Local state for the currently-open board. currentBoardId is null on the
// board-list view and set to the board's id once the user opens one.
// currentItems is the most-recently rendered items array; delegated handlers
// attached once in pbOpenBoard read from it via closure each time they fire,
// so they always see the fresh list without being re-registered on refresh.
const pbState = {
  currentBoardId: null,
  currentBoardName: '',
  currentBoardEmoji: '',
  currentLayout: 'default',
  currentBackground: 'dark',
  currentItems: [],
};

// One-time hookup: refresh the open board when a pin is added via the
// page/tab context menu. Guard with a flag so repeated panel opens don't
// register multiple handlers.
let _pinboardAddedHookInstalled = false;
function ensurePinboardAddedHook() {
  if (_pinboardAddedHookInstalled) return;
  if (window.tandem && window.tandem.onPinboardItemAdded) {
    window.tandem.onPinboardItemAdded((boardId) => {
      if (pbState.currentBoardId === boardId) {
        setTimeout(() => pbRefreshItems(boardId), 800); // delay for OG fetch
      }
    });
    _pinboardAddedHookInstalled = true;
  }
}

// SECURITY: must be safe for both text-node and attribute contexts.
// textContent/innerHTML escapes <, >, &, but not " or ' — board names flow
// into data-name="..." attributes, so we must also encode quotes to prevent
// attribute-context XSS (board names come from user input, including the
// remote pairing API). Harmless in text-node contexts where &quot; renders
// as ". Covered by manual review — no unit-test harness exists for shell JS.
function pbEscape(text) {
  const d = document.createElement('div');
  d.textContent = text;
  return d.innerHTML.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Surface mutation failures to the user. Previously these fetches swallowed
// errors and left the UI showing stale state with no feedback. No toast
// helper exists in shell/js yet, so fall back to alert() for visibility.
// TODO: replace alert with toast helper when one lands
function pbReportError(action, err) {
  console.error(`[pinboard] ${action} failed`, err);
  const msg = (err && err.message) ? err.message : 'unknown error';
  alert(`Pinboard: ${action} failed — ${msg}`);
}

export async function loadPinboardPanel() {
  ensurePinboardAddedHook();
  const content = document.getElementById('sidebar-panel-content');
  hideWebviews();
  content.classList.remove('webview-mode');
  pbState.currentBoardId = null;

  safeSetPanelHTML(`
    <div class="pb-panel">
      <div class="pb-header">
        <span class="pb-title">Pinboards</span>
        <button class="pb-new-btn" id="pb-new-btn" title="New board">+</button>
      </div>
      <div class="pb-board-list" id="pb-board-list">
        <div class="bm-empty">Loading...</div>
      </div>
    </div>`);

  try {
    const res = await fetch('http://localhost:8765/pinboards', { headers: { Authorization: `Bearer ${getToken()}` } });
    const data = await res.json();
    pbRenderBoardList(data.boards || []);
  } catch {
    document.getElementById('pb-board-list').innerHTML = '<div class="bm-empty">Failed to load boards</div>';
  }

  document.getElementById('pb-new-btn')?.addEventListener('click', pbCreateBoard);
}

function pbRenderBoardList(boards) {
  const container = document.getElementById('pb-board-list');
  if (!container) return;
  if (boards.length === 0) {
    container.innerHTML = '<div class="bm-empty">No boards yet. Click + to create one.</div>';
    return;
  }
  container.innerHTML = boards.map(b => `
    <div class="pb-board-item" data-board-id="${b.id}" data-name="${pbEscape(b.name)}" data-emoji="${pbEscape(b.emoji)}">
      <span class="pb-board-emoji">${pbEscape(b.emoji)}</span>
      <span class="pb-board-name">${pbEscape(b.name)}</span>
      <span class="pb-board-count">${b.itemCount}</span>
      <button class="pb-board-rename" data-board-id="${b.id}" title="Rename board">✏️</button>
      <button class="pb-board-delete" data-board-id="${b.id}" title="Delete board">&times;</button>
    </div>
  `).join('');

  container.querySelectorAll('.pb-board-item').forEach(el => {
    el.addEventListener('click', (e) => {
      if (e.target.closest('.pb-board-delete')) return;
      if (e.target.closest('.pb-board-rename')) return;
      pbOpenBoard(el.dataset.boardId, el.dataset.name, el.dataset.emoji);
    });
  });
  container.querySelectorAll('.pb-board-rename').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const boardId = btn.dataset.boardId;
      const item = btn.closest('.pb-board-item');
      const currentName = item?.dataset.name || '';
      // showPrompt is a classic global from shell/js/modal.js; see pbCreateBoard
      // for the same pattern. The third arg pre-fills the input with the
      // existing name so rename feels like an edit rather than a fresh entry.
      const newName = await window.showPrompt('Rename board', 'Board name…', currentName);
      if (newName === null || newName === undefined) return;
      const trimmed = newName.trim();
      if (!trimmed || trimmed === currentName) return;
      try {
        const res = await fetch(`http://localhost:8765/pinboards/${boardId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
          body: JSON.stringify({ name: trimmed })
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      } catch (err) {
        pbReportError('rename board', err);
      }
      loadPinboardPanel();
    });
  });
  container.querySelectorAll('.pb-board-delete').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const boardId = btn.dataset.boardId;
      try {
        const res = await fetch(`http://localhost:8765/pinboards/${boardId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${getToken()}` } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      } catch (err) {
        pbReportError('delete board', err);
      }
      loadPinboardPanel();
    });
  });
}

async function pbOpenBoard(boardId, name, emoji) {
  pbState.currentBoardId = boardId;
  pbState.currentBoardName = name;
  pbState.currentBoardEmoji = emoji;

  safeSetPanelHTML(`
    <div class="pb-panel">
      <div class="pb-items-header" style="position:relative;">
        <button class="pb-back-btn" id="pb-back-btn">&larr;</button>
        <select class="pb-board-switcher" id="pb-board-switcher"></select>
        <button class="pb-note-btn" id="pb-note-btn" title="Add text note">✏️</button>
        <button class="pb-appearance-btn" id="pb-appearance-btn" title="Appearance">✨</button>
      </div>
      <div class="pb-note-editor" id="pb-note-editor" style="display:none;">
        <textarea class="pb-note-textarea" id="pb-note-textarea" placeholder="Type your note here…" rows="4"></textarea>
        <div class="pb-note-actions">
          <button class="pb-note-save" id="pb-note-save">Save</button>
          <button class="pb-note-cancel" id="pb-note-cancel">Cancel</button>
        </div>
      </div>
      <div class="pb-item-list" id="pb-item-list">
        <div class="bm-empty">Loading...</div>
      </div>
    </div>`);

  await pbUpdateBoardSwitcher(boardId);

  // Fetch board data to apply saved layout/background
  try {
    const boardRes = await fetch(`http://localhost:8765/pinboards/${boardId}`, { headers: { Authorization: `Bearer ${getToken()}` } });
    const boardData = await boardRes.json();
    if (boardData.ok && boardData.board) {
      pbState.currentLayout = boardData.board.layout || 'default';
      pbState.currentBackground = boardData.board.background || 'dark';
    }
  } catch { /* ignore */ }

  document.getElementById('pb-back-btn')?.addEventListener('click', () => {
    loadPinboardPanel();
  });

  document.getElementById('pb-note-btn')?.addEventListener('click', () => {
    const editor = document.getElementById('pb-note-editor');
    const textarea = document.getElementById('pb-note-textarea');
    if (editor.style.display === 'none') {
      editor.style.display = 'block';
      textarea.focus();
    } else {
      editor.style.display = 'none';
      textarea.value = '';
    }
  });

  // Appearance panel
  document.getElementById('pb-appearance-btn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    let panel = document.getElementById('pb-appearance-panel');
    if (panel) { panel.remove(); return; }
    const header = document.querySelector('.pb-items-header');
    panel = document.createElement('div');
    panel.id = 'pb-appearance-panel';
    panel.className = 'pb-appearance-panel';
    const curLayout = pbState.currentLayout || 'default';
    const curBg = pbState.currentBackground || 'dark';
    panel.innerHTML = `
      <div class="pb-appearance-section">
        <div class="pb-appearance-label">Layout</div>
        <div class="pb-appearance-options">
          <div class="pb-appearance-opt${curLayout === 'dense' ? ' active' : ''}" data-layout="dense">Dense</div>
          <div class="pb-appearance-opt${curLayout === 'default' ? ' active' : ''}" data-layout="default">Default</div>
          <div class="pb-appearance-opt${curLayout === 'spacious' ? ' active' : ''}" data-layout="spacious">Spacious</div>
        </div>
      </div>
      <div class="pb-appearance-section">
        <div class="pb-appearance-label">Background</div>
        <div class="pb-appearance-options">
          <div class="pb-appearance-opt${curBg === 'dark' ? ' active' : ''}" data-bg="dark">Dark</div>
          <div class="pb-appearance-opt${curBg === 'light' ? ' active' : ''}" data-bg="light">Light</div>
        </div>
      </div>`;
    header.appendChild(panel);

    panel.querySelectorAll('[data-layout]').forEach(opt => {
      opt.addEventListener('click', async () => {
        const layout = opt.dataset.layout;
        pbState.currentLayout = layout;
        pbApplyGridClasses();
        panel.querySelectorAll('[data-layout]').forEach(o => o.classList.remove('active'));
        opt.classList.add('active');
        try {
          const res = await fetch(`http://localhost:8765/pinboards/${boardId}/settings`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
            body: JSON.stringify({ layout })
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
        } catch (err) {
          pbReportError('save layout', err);
        }
      });
    });
    panel.querySelectorAll('[data-bg]').forEach(opt => {
      opt.addEventListener('click', async () => {
        const bg = opt.dataset.bg;
        pbState.currentBackground = bg;
        pbApplyGridClasses();
        panel.querySelectorAll('[data-bg]').forEach(o => o.classList.remove('active'));
        opt.classList.add('active');
        try {
          const res = await fetch(`http://localhost:8765/pinboards/${boardId}/settings`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
            body: JSON.stringify({ background: bg })
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
        } catch (err) {
          pbReportError('save background', err);
        }
      });
    });

    // Close panel when clicking outside
    const closePanel = (ev) => {
      if (!panel.contains(ev.target) && ev.target !== document.getElementById('pb-appearance-btn')) {
        panel.remove();
        document.removeEventListener('click', closePanel);
      }
    };
    setTimeout(() => document.addEventListener('click', closePanel), 0);
  });

  document.getElementById('pb-note-save')?.addEventListener('click', async () => {
    const textarea = document.getElementById('pb-note-textarea');
    const text = textarea.value.trim();
    if (!text) return;
    try {
      const res = await fetch(`http://localhost:8765/pinboards/${boardId}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ type: 'text', content: text })
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (err) {
      pbReportError('add note', err);
      return;
    }
    textarea.value = '';
    document.getElementById('pb-note-editor').style.display = 'none';
    await pbRefreshItems(boardId);
  });

  document.getElementById('pb-note-cancel')?.addEventListener('click', () => {
    document.getElementById('pb-note-textarea').value = '';
    document.getElementById('pb-note-editor').style.display = 'none';
  });
  document.getElementById('pb-board-switcher')?.addEventListener('change', (e) => {
    const sel = e.target;
    const opt = sel.selectedOptions[0];
    if (opt) {
      const text = opt.textContent;
      pbOpenBoard(sel.value, text.slice(2).replace(/\s*\(\d+\)$/, ''), text.charAt(0));
    }
  });

  // Attach container-level delegated listeners ONCE per board open. The
  // #pb-item-list container persists across refreshes (pbRenderItems only
  // replaces its innerHTML), so registering listeners here instead of in
  // pbRenderItems prevents listener stacking — a single trash click used
  // to fan out into N DELETEs after N refreshes, causing N−1 HTTP 404s.
  pbAttachItemListHandlers(boardId);

  try {
    const res = await fetch(`http://localhost:8765/pinboards/${boardId}/items`, { headers: { Authorization: `Bearer ${getToken()}` } });
    const data = await res.json();
    pbRenderItems(data.items || []);
  } catch {
    document.getElementById('pb-item-list').innerHTML = '<div class="bm-empty">Failed to load items</div>';
  }
}

// Register all delegated listeners on the #pb-item-list container. Called once
// from pbOpenBoard; handlers read live state from pbState.currentItems and
// pbState.currentBoardId, so they stay correct across item refreshes without
// needing re-registration.
function pbAttachItemListHandlers(boardId) {
  const container = document.getElementById('pb-item-list');
  if (!container) return;

  // Remove (trash) click handler with fade-out animation
  container.addEventListener('click', async (e) => {
    const removeBtn = e.target.closest('.pb-remove-btn');
    if (!removeBtn) return;
    e.stopPropagation();
    const itemId = removeBtn.dataset.itemId;
    if (!itemId || !pbState.currentBoardId) return;
    const card = removeBtn.closest('.pb-card');
    if (card) {
      card.style.transition = 'opacity 0.2s, transform 0.2s';
      card.style.opacity = '0';
      card.style.transform = 'scale(0.9)';
    }
    try {
      const res = await fetch(`http://localhost:8765/pinboards/${pbState.currentBoardId}/items/${itemId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${getToken()}` } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (err) {
      if (card) {
        card.style.opacity = '';
        card.style.transform = '';
      }
      pbReportError('remove item', err);
      return;
    }
    setTimeout(() => {
      if (card) card.remove();
      if (container.querySelectorAll('.pb-card').length === 0) {
        container.className = 'pb-items-empty';
        container.innerHTML = '<div class="bm-empty"><div style="font-size:48px;margin-bottom:12px;">📌</div><p>All items removed.</p></div>';
      }
    }, 250);
  });

  // Edit button click handler
  container.addEventListener('click', (e) => {
    const editBtn = e.target.closest('.pb-edit-btn');
    if (!editBtn) return;
    e.stopPropagation();
    const itemId = editBtn.dataset.itemId;
    const item = pbState.currentItems.find(i => i.id === itemId);
    if (item && pbState.currentBoardId) pbOpenEditModal(item, pbState.currentBoardId);
  });

  // Click on link/image cards opens URL in a new tab. Ignored when the click
  // originated inside the card action buttons row.
  container.addEventListener('click', (e) => {
    if (e.target.closest('.pb-card-actions')) return;
    const card = e.target.closest('.pb-card[data-has-url="true"]');
    if (!card) return;
    const url = card.dataset.url;
    if (url && window.tandem) window.tandem.newTab(url);
  });

  // Inline editing: double-click on text/quote card body to edit content, or
  // double-click on link card title to rename it.
  container.addEventListener('dblclick', (e) => {
    const body = e.target.closest('.pb-card-text-preview');
    if (body) {
      const card = body.closest('.pb-card');
      if (!card) return;
      const itemId = card.dataset.itemId;
      const item = pbState.currentItems.find(i => i.id === itemId);
      if (!item || (item.type !== 'text' && item.type !== 'quote')) return;
      e.stopPropagation();
      if (body.contentEditable === 'true') return;
      const originalText = body.textContent;
      body.contentEditable = 'true';
      body.focus();
      body.addEventListener('blur', async function onBlur() {
        body.removeEventListener('blur', onBlur);
        body.contentEditable = 'false';
        const newText = body.textContent.trim();
        if (newText && newText !== originalText) {
          try {
            const res = await fetch(`http://localhost:8765/pinboards/${pbState.currentBoardId}/items/${itemId}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
              body: JSON.stringify({ content: newText })
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
          } catch (err) {
            body.textContent = originalText;
            pbReportError('save edit', err);
          }
        }
      });
      body.addEventListener('keydown', (ke) => {
        if (ke.key === 'Escape') {
          body.textContent = originalText;
          body.contentEditable = 'false';
        }
      });
      return;
    }

    const titleEl = e.target.closest('.pb-card-title');
    if (titleEl) {
      const card = titleEl.closest('.pb-card');
      if (!card) return;
      const itemId = card.dataset.itemId;
      const item = pbState.currentItems.find(i => i.id === itemId);
      if (!item || item.type !== 'link') return;
      e.stopPropagation();
      if (titleEl.contentEditable === 'true') return;
      const originalText = titleEl.textContent;
      titleEl.contentEditable = 'true';
      titleEl.style.whiteSpace = 'normal';
      titleEl.focus();
      titleEl.addEventListener('blur', async function onBlur() {
        titleEl.removeEventListener('blur', onBlur);
        titleEl.contentEditable = 'false';
        titleEl.style.whiteSpace = '';
        const newText = titleEl.textContent.trim();
        if (newText && newText !== originalText) {
          try {
            const res = await fetch(`http://localhost:8765/pinboards/${pbState.currentBoardId}/items/${itemId}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
              body: JSON.stringify({ title: newText })
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
          } catch (err) {
            titleEl.textContent = originalText;
            pbReportError('save title', err);
          }
        }
      });
      titleEl.addEventListener('keydown', (ke) => {
        if (ke.key === 'Escape') {
          titleEl.textContent = originalText;
          titleEl.contentEditable = 'false';
          titleEl.style.whiteSpace = '';
        }
      });
    }
  });

  // Drag-and-drop reorder (container-level delegation)
  let draggedCard = null;
  container.addEventListener('dragstart', (e) => {
    draggedCard = e.target.closest('.pb-card');
    if (!draggedCard) return;
    draggedCard.classList.add('pb-dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', draggedCard.dataset.itemId);
  });
  container.addEventListener('dragend', () => {
    if (draggedCard) { draggedCard.classList.remove('pb-dragging'); draggedCard = null; }
    container.querySelectorAll('.pb-drag-over').forEach(el => el.classList.remove('pb-drag-over'));
  });
  container.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const target = e.target.closest('.pb-card');
    if (target && target !== draggedCard) {
      container.querySelectorAll('.pb-drag-over').forEach(el => el.classList.remove('pb-drag-over'));
      target.classList.add('pb-drag-over');
    }
  });
  container.addEventListener('drop', async (e) => {
    e.preventDefault();
    const target = e.target.closest('.pb-card');
    if (!target || !draggedCard || target === draggedCard) return;
    const cards = [...container.querySelectorAll('.pb-card')];
    const draggedIdx = cards.indexOf(draggedCard);
    const targetIdx = cards.indexOf(target);
    if (draggedIdx < targetIdx) { target.after(draggedCard); } else { target.before(draggedCard); }
    const newOrder = [...container.querySelectorAll('.pb-card')].map(c => c.dataset.itemId);
    try {
      const res = await fetch(`http://localhost:8765/pinboards/${pbState.currentBoardId}/items/reorder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ itemIds: newOrder })
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (err) {
      pbReportError('reorder items', err);
    }
    container.querySelectorAll('.pb-drag-over').forEach(el => el.classList.remove('pb-drag-over'));
  });

  // Reference boardId so the signature is self-documenting even though we
  // actually read the live value from pbState.currentBoardId inside handlers.
  void boardId;
}

function pbApplyGridClasses() {
  const container = document.getElementById('pb-item-list');
  if (!container) return;
  container.classList.remove('pb-grid--dense', 'pb-grid--spacious', 'pb-board--light');
  const layout = pbState.currentLayout || 'default';
  if (layout === 'dense') container.classList.add('pb-grid--dense');
  else if (layout === 'spacious') container.classList.add('pb-grid--spacious');
  if (pbState.currentBackground === 'light') container.classList.add('pb-board--light');
}

async function pbOpenEditModal(item, boardId) {
  const existing = document.getElementById('pb-edit-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'pb-edit-overlay';
  overlay.className = 'pb-edit-overlay';
  overlay.innerHTML = `
    <div class="pb-edit-modal">
      <div class="pb-edit-header">
        <span>Edit pin</span>
        <button class="pb-edit-close">×</button>
      </div>
      <div class="pb-edit-body">
        <input class="pb-edit-title-input" type="text" placeholder="Headline" value="${pbEscape(item.title || '')}">
        <textarea class="pb-edit-content-input" placeholder="Type something...">${pbEscape(item.content || item.note || '')}</textarea>
        ${item.thumbnail ? `<img src="${pbEscape(item.thumbnail)}" class="pb-edit-preview-img" alt="">` : ''}
      </div>
      <div class="pb-edit-footer">
        <button class="pb-edit-save-btn">Save</button>
        <button class="pb-edit-cancel-btn">Cancel</button>
      </div>
    </div>`;

  document.body.appendChild(overlay);
  overlay.querySelector('.pb-edit-title-input').focus();

  const close = () => overlay.remove();
  overlay.querySelector('.pb-edit-close').addEventListener('click', close);
  overlay.querySelector('.pb-edit-cancel-btn').addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

  overlay.querySelector('.pb-edit-save-btn').addEventListener('click', async () => {
    const title = overlay.querySelector('.pb-edit-title-input').value.trim();
    const content = overlay.querySelector('.pb-edit-content-input').value.trim();
    try {
      const res = await fetch(`http://localhost:8765/pinboards/${boardId}/items/${item.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ title, content, note: content })
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (err) {
      pbReportError('save item', err);
      return;
    }
    close();
    await pbRefreshItems(boardId);
  });
}

async function pbRefreshItems(boardId) {
  if (!boardId || !document.getElementById('pb-item-list')) return;
  try {
    const res = await fetch(`http://localhost:8765/pinboards/${boardId}/items`, { headers: { Authorization: `Bearer ${getToken()}` } });
    const data = await res.json();
    pbRenderItems(data.items || []);
    await pbUpdateBoardSwitcher(boardId);
  } catch { /* ignore */ }
}

async function pbUpdateBoardSwitcher(currentId) {
  try {
    const res = await fetch('http://localhost:8765/pinboards', { headers: { Authorization: `Bearer ${getToken()}` } });
    const data = await res.json();
    const select = document.getElementById('pb-board-switcher');
    if (!select) return;
    select.innerHTML = '';
    (data.boards || []).forEach(b => {
      const opt = document.createElement('option');
      opt.value = b.id;
      opt.textContent = `${b.emoji} ${b.name} (${b.itemCount})`;
      if (b.id === currentId) opt.selected = true;
      select.appendChild(opt);
    });
  } catch { /* ignore */ }
}

// DOM-only render: replaces #pb-item-list innerHTML and stashes the current
// items in pbState.currentItems for delegated handlers (wired once in
// pbOpenBoard via pbAttachItemListHandlers) to read. No listener registration
// happens here — doing so would stack listeners on the persistent container
// across refreshes and multiply every mutation click by the refresh count.
function pbRenderItems(items) {
  pbState.currentItems = items;
  const container = document.getElementById('pb-item-list');
  if (!container) return;
  container.className = 'pb-grid';
  pbApplyGridClasses();

  if (items.length === 0) {
    container.className = 'pb-items-empty';
    container.innerHTML = `
      <div class="bm-empty">
        <div style="font-size:48px;margin-bottom:12px;">📌</div>
        <p>No items on this board yet.</p>
        <p>Right-click on a page, link, image, or text selection &rarr; "Save to Pinboard".</p>
      </div>`;
    return;
  }

  container.innerHTML = items.map(item => {
    const title = pbEscape(item.title || item.url || (item.content ? item.content.substring(0, 50) : '') || 'Untitled');
    const date = new Date(item.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const typeIcons = { link: '🔗', image: '🖼️', text: '📝', quote: '💬' };

    let preview = '';
    switch (item.type) {
      case 'image':
        preview = `<img src="${pbEscape(item.url || item.thumbnail || '')}" alt="${title}" loading="lazy" onerror="this.parentElement.innerHTML='<span class=pb-card-type-icon>🖼️</span>'">`;
        break;
      case 'link': {
        if (item.thumbnail) {
          preview = `<img src="${pbEscape(item.thumbnail)}" alt="${title}" loading="lazy" onerror="this.parentElement.innerHTML='<span class=pb-card-type-icon>🔗</span>'">`;
        } else {
          let domain = '';
          try { domain = new URL(item.url).hostname; } catch { /* ignore */ }
          preview = domain
            ? `<img src="https://www.google.com/s2/favicons?domain=${domain}&sz=64" alt="" style="width:32px;height:32px;object-fit:contain;" onerror="this.parentElement.innerHTML='<span class=pb-card-type-icon>🔗</span>'">`
            : '<span class="pb-card-type-icon">🔗</span>';
        }
        break;
      }
      case 'quote':
        preview = `<div class="pb-card-text-preview">"${pbEscape(item.content || '')}"</div>`;
        break;
      case 'text':
        preview = `<div class="pb-card-text-preview">${pbEscape(item.content || '')}</div>`;
        break;
      default:
        preview = `<span class="pb-card-type-icon">${typeIcons[item.type] || '📄'}</span>`;
    }

    return `
      <div class="pb-card" draggable="true" data-item-id="${item.id}" ${item.url ? 'data-has-url="true"' : ''} data-url="${pbEscape(item.url || '')}">
        <div class="pb-card-actions">
          <button class="pb-card-action-btn pb-edit-btn" data-item-id="${item.id}">✏️ Edit</button>
          <button class="pb-card-action-btn danger pb-remove-btn" data-item-id="${item.id}">🗑️</button>
        </div>
        <div class="pb-card-preview${(item.type === 'quote' || item.type === 'text') ? ' pb-card-preview--text' : ''}">${preview}</div>
        <div class="pb-card-info">
          <div class="pb-card-title">${title}</div>
          ${item.description ? `<div class="pb-card-desc">${pbEscape(item.description.substring(0, 120))}</div>` : ''}
          ${item.note ? `<div class="pb-card-note">${pbEscape(item.note)}</div>` : ''}
          <div class="pb-card-meta">
            <span class="pb-card-type">${typeIcons[item.type] || ''} ${item.type}</span>
            <span class="pb-card-date">${date}</span>
          </div>
        </div>
      </div>`;
  }).join('');
}

// Public helper for other sidebar code (e.g. the tab context menu's "Add to
// Pinboard" submenu): re-fetch items only when the passed board matches the
// one currently open in the panel, with a small delay so the server-side OG
// fetch has time to complete.
export function refreshPinboardIfOpen(boardId, delayMs = 800) {
  if (pbState.currentBoardId === boardId) {
    setTimeout(() => {
      // User may have switched boards during the delay window; skip the
      // refresh silently if the open board no longer matches the one whose
      // items we were going to reload.
      if (pbState.currentBoardId !== boardId) return;
      pbRefreshItems(boardId);
    }, delayMs);
  }
}

async function pbCreateBoard() {
  // showPrompt is a classic global from shell/js/modal.js — reach it via window
  // since this module has no import for it.
  const name = await window.showPrompt('New board', 'Board name…');
  if (!name) return;
  const emoji = await window.showPrompt('Board emoji (optional)', 'e.g. 📌', '📌') || '📌';
  try {
    const res = await fetch('http://localhost:8765/pinboards', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
      body: JSON.stringify({ name, emoji })
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  } catch (err) {
    pbReportError('create board', err);
  }
  loadPinboardPanel();
}
