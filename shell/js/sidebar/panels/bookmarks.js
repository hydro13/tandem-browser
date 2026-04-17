/**
 * Sidebar bookmarks panel — list, folders, add/edit/delete, search, breadcrumbs.
 *
 * Loaded from: shell/js/sidebar/index.js (via activateItem when 'bookmarks' is selected)
 * window exports: none
 */

import { getToken } from '../config.js';
import { hideWebviews, safeSetPanelHTML } from '../webview.js';
import { getFaviconUrl } from '../util.js';

// === BOOKMARKS PANEL MODULE ===
export const BOOKMARK_PANEL_IDS = ['bookmarks'];

const bmState = {
  all: null,         // full bookmark tree from API
  currentFolder: null, // current folder node
  path: [],          // breadcrumb trail [{id, name}]
  searchMode: false,
};

function folderIcon() {
  return `<svg viewBox="0 0 20 20" fill="currentColor" style="color:#aaa"><path d="M2 6a2 2 0 012-2h4l2 2h6a2 2 0 012 2v7a2 2 0 01-2 2H4a2 2 0 01-2-2V6z"/></svg>`;
}

function chevronIcon() {
  return `<svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clip-rule="evenodd"/></svg>`;
}

function editIcon() {
  return `<svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"/></svg>`;
}

function trashIcon() {
  return `<svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"/></svg>`;
}

function renderBmItems(items) {
  if (!items || items.length === 0) return '<div class="bm-empty">Empty folder</div>';
  const folders = items.filter(i => i.type === 'folder');
  const urls    = items.filter(i => i.type === 'url');
  const sorted  = [...folders, ...urls];
  return sorted.map(item => {
    const actions = `<div class="bm-actions">
      <button class="bm-action-btn bm-edit-btn" data-action="edit" data-id="${item.id}" title="Edit">${editIcon()}</button>
      <button class="bm-action-btn bm-delete-btn" data-action="delete" data-id="${item.id}" title="Delete">${trashIcon()}</button>
    </div>`;
    if (item.type === 'folder') {
      return `<div class="bm-item folder" data-id="${item.id}" data-type="folder" data-name="${item.name.replace(/"/g, '&quot;')}">
        <div class="bm-icon">${folderIcon()}</div>
        <span class="bm-name">${item.name}</span>
        ${actions}
        <div class="bm-chevron">${chevronIcon()}</div>
      </div>`;
    } else {
      const fav = getFaviconUrl(item.url);
      const img = fav ? `<img src="${fav}" onerror="this.style.display='none'">` : '';
      return `<div class="bm-item url" data-id="${item.id}" data-type="url" data-url="${item.url}" data-name="${item.name.replace(/"/g, '&quot;')}">
        <div class="bm-icon">${img}</div>
        <span class="bm-name" title="${item.url}">${item.name}</span>
        ${actions}
      </div>`;
    }
  }).join('');
}

function renderBmBreadcrumb() {
  const content = document.getElementById('bm-breadcrumb');
  if (!content) return;
  const parts = [{ id: null, name: 'Bookmarks' }, ...bmState.path];
  content.innerHTML = parts.map((p, i) => {
    const isLast = i === parts.length - 1;
    return (isLast ? '' : `<span class="bm-sep">›</span>`) +
      `<span class="bm-crumb ${isLast ? 'active' : ''}" data-crumb-id="${p.id ?? ''}">${p.name}</span>`;
  }).reverse().join('');
}

function bmNavigateFolder(node) {
  if (!node) { bmState.currentFolder = null; bmState.path = []; }
  else bmState.currentFolder = node;
  refreshBmList();
  renderBmBreadcrumb();
}

function refreshBmList() {
  const listEl = document.getElementById('bm-list');
  if (!listEl) return;
  const items = bmState.currentFolder ? bmState.currentFolder.children : bmState.all?.children;
  listEl.innerHTML = renderBmItems(items);
  // Attach click handlers (ignore clicks on action buttons)
  listEl.querySelectorAll('.bm-item').forEach(el => {
    el.addEventListener('click', (e) => {
      if (e.target.closest('.bm-action-btn')) return;
      const type = el.dataset.type;
      if (type === 'url') {
        const url = el.dataset.url;
        if (url && window.tandem) window.tandem.newTab(url);
      } else if (type === 'folder') {
        const folderId = el.dataset.id;
        const items = bmState.currentFolder ? bmState.currentFolder.children : bmState.all?.children;
        const folder = items?.find(i => i.id === folderId);
        if (folder) {
          bmState.path.push({ id: folder.id, name: folder.name });
          bmNavigateFolder(folder);
        }
      }
    });
  });
  // Edit buttons
  listEl.querySelectorAll('.bm-edit-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const item = btn.closest('.bm-item');
      const id = item.dataset.id;
      const name = item.dataset.name;
      const url = item.dataset.url || '';
      const type = item.dataset.type;
      showBmEditForm(id, name, url, type);
    });
  });
  // Delete buttons
  listEl.querySelectorAll('.bm-delete-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      const item = btn.closest('.bm-item');
      const name = item.dataset.name;
      if (!confirm(`Delete "${name}"?`)) return;
      try {
        await fetch('http://localhost:8765/bookmarks/remove', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
          body: JSON.stringify({ id }),
        });
        await reloadBmData();
      } catch { /* ignore */ }
    });
  });
}

async function reloadBmData() {
  try {
    const res = await fetch('http://localhost:8765/bookmarks', { headers: { Authorization: `Bearer ${getToken()}` } });
    const data = await res.json();
    bmState.all = data.bookmarks?.[0] || { children: [] };
    // Re-navigate to current folder if possible
    if (bmState.path.length > 0) {
      let node = bmState.all;
      for (const p of bmState.path) {
        const child = node.children?.find(c => c.id === p.id);
        if (!child) { bmState.path = []; bmState.currentFolder = null; break; }
        node = child;
        bmState.currentFolder = node;
      }
    } else {
      bmState.currentFolder = null;
    }
    refreshBmList();
    renderBmBreadcrumb();
  } catch { /* ignore */ }
}

function showBmEditForm(id, name, url, type) {
  const listEl = document.getElementById('bm-list');
  if (!listEl) return;
  const item = listEl.querySelector(`.bm-item[data-id="${id}"]`);
  if (!item) return;
  const isFolder = type === 'folder';
  item.innerHTML = `
    <div class="bm-edit-form">
      <input class="bm-edit-input" id="bm-edit-name" type="text" value="${name.replace(/"/g, '&quot;')}" placeholder="Name">
      ${isFolder ? '' : `<input class="bm-edit-input" id="bm-edit-url" type="text" value="${url.replace(/"/g, '&quot;')}" placeholder="URL">`}
      <div class="bm-edit-actions">
        <button class="bm-edit-save" id="bm-edit-save">Save</button>
        <button class="bm-edit-cancel" id="bm-edit-cancel">Cancel</button>
      </div>
    </div>`;
  item.classList.add('editing');
  const nameInput = item.querySelector('#bm-edit-name');
  nameInput.focus();
  nameInput.select();

  item.querySelector('#bm-edit-save').addEventListener('click', async (e) => {
    e.stopPropagation();
    const newName = nameInput.value.trim();
    const newUrl = isFolder ? undefined : item.querySelector('#bm-edit-url')?.value.trim();
    if (!newName) return;
    try {
      const body = { id, name: newName };
      if (!isFolder && newUrl) body.url = newUrl;
      await fetch('http://localhost:8765/bookmarks/update', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify(body),
      });
      await reloadBmData();
    } catch { /* ignore */ }
  });

  item.querySelector('#bm-edit-cancel').addEventListener('click', (e) => {
    e.stopPropagation();
    refreshBmList();
  });

  // Save on Enter, cancel on Escape
  item.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') item.querySelector('#bm-edit-save').click();
    if (e.key === 'Escape') item.querySelector('#bm-edit-cancel').click();
  });
}

export async function loadBookmarkPanel() {
  const content = document.getElementById('sidebar-panel-content');
  // Hide all webviews
  hideWebviews();
  content.classList.remove('webview-mode');

  // Build panel HTML
  safeSetPanelHTML(`
    <div class="bookmark-panel">
      <div class="bm-toolbar">
        <div class="bookmark-search-wrap">
          <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clip-rule="evenodd"/></svg>
          <input class="bookmark-search" id="bm-search" type="text" placeholder="Search bookmarks…">
        </div>
        <button class="bm-toolbar-btn" id="bm-add-bookmark" title="Add bookmark">
          <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14"><path d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z"/></svg>
        </button>
        <button class="bm-toolbar-btn" id="bm-add-folder" title="Add folder">
          <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14"><path fill-rule="evenodd" d="M4 4a2 2 0 00-2 2v8a2 2 0 002 2h12a2 2 0 002-2V8a2 2 0 00-2-2h-5L9 4H4zm7 5a1 1 0 10-2 0v1H8a1 1 0 100 2h1v1a1 1 0 102 0v-1h1a1 1 0 100-2h-1V9z" clip-rule="evenodd"/></svg>
        </button>
      </div>
      <div class="bookmark-breadcrumb" id="bm-breadcrumb"></div>
      <div class="bookmark-list" id="bm-list">
        <div class="bm-empty">Loading…</div>
      </div>
    </div>`);

  // Fetch bookmarks if not cached
  if (!bmState.all) {
    const res = await fetch('http://localhost:8765/bookmarks', { headers: { Authorization: `Bearer ${getToken()}` } });
    const data = await res.json();
    bmState.all = data.bookmarks?.[0] || { children: [] }; // Bookmarks Bar root
  }

  bmState.currentFolder = null;
  bmState.path = [];
  refreshBmList();
  renderBmBreadcrumb();

  // Breadcrumb clicks
  document.getElementById('bm-breadcrumb').addEventListener('click', (e) => {
    const crumb = e.target.closest('.bm-crumb');
    if (!crumb || crumb.classList.contains('active')) return;
    const crumbId = crumb.dataset.crumbId;
    if (!crumbId) { bmState.path = []; bmNavigateFolder(null); return; }
    const idx = bmState.path.findIndex(p => p.id === crumbId);
    if (idx >= 0) { bmState.path = bmState.path.slice(0, idx + 1); }
    // Navigate to that folder node
    let node = bmState.all;
    for (const p of bmState.path) {
      node = node.children?.find(c => c.id === p.id) || node;
    }
    bmState.currentFolder = node.id === bmState.all.id ? null : node;
    refreshBmList();
    renderBmBreadcrumb();
  });

  // Search input
  let searchTimer;
  document.getElementById('bm-search').addEventListener('input', async (e) => {
    clearTimeout(searchTimer);
    const q = e.target.value.trim();
    if (!q) {
      bmState.searchMode = false;
      refreshBmList();
      renderBmBreadcrumb();
      return;
    }
    searchTimer = setTimeout(async () => {
      bmState.searchMode = true;
      const res = await fetch(`http://localhost:8765/bookmarks/search?q=${encodeURIComponent(q)}`, {
        headers: { Authorization: `Bearer ${getToken()}` }
      });
      const data = await res.json();
      const listEl = document.getElementById('bm-list');
      const breadEl = document.getElementById('bm-breadcrumb');
      if (listEl) listEl.innerHTML = renderBmItems(data.results || []);
      if (breadEl) breadEl.innerHTML = `<span class="bm-crumb active">Search results</span>`;
      // Attach URL click handlers for search results
      listEl?.querySelectorAll('.bm-item.url').forEach(el => {
        el.addEventListener('click', () => {
          const url = el.dataset.url;
          if (url && window.tandem) window.tandem.newTab(url);
        });
      });
    }, 250);
  });

  // + Bookmark button
  document.getElementById('bm-add-bookmark').addEventListener('click', () => {
    const listEl = document.getElementById('bm-list');
    if (!listEl) return;
    // Insert add form at top
    const form = document.createElement('div');
    form.className = 'bm-item editing';
    form.innerHTML = `
      <div class="bm-edit-form">
        <input class="bm-edit-input" id="bm-add-name" type="text" placeholder="Bookmark name">
        <input class="bm-edit-input" id="bm-add-url" type="text" placeholder="URL (https://...)">
        <div class="bm-edit-actions">
          <button class="bm-edit-save" id="bm-add-save">Add</button>
          <button class="bm-edit-cancel" id="bm-add-cancel">Cancel</button>
        </div>
      </div>`;
    listEl.prepend(form);
    form.querySelector('#bm-add-name').focus();

    form.querySelector('#bm-add-save').addEventListener('click', async () => {
      const name = form.querySelector('#bm-add-name').value.trim();
      const url = form.querySelector('#bm-add-url').value.trim();
      if (!name || !url) return;
      const parentId = bmState.currentFolder?.id || bmState.all?.id || '';
      try {
        await fetch('http://localhost:8765/bookmarks/add', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
          body: JSON.stringify({ name, url, parentId }),
        });
        await reloadBmData();
      } catch { /* ignore */ }
    });

    form.querySelector('#bm-add-cancel').addEventListener('click', () => form.remove());
    form.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') form.querySelector('#bm-add-save').click();
      if (e.key === 'Escape') form.remove();
    });
  });

  // + Folder button
  document.getElementById('bm-add-folder').addEventListener('click', () => {
    const listEl = document.getElementById('bm-list');
    if (!listEl) return;
    const form = document.createElement('div');
    form.className = 'bm-item editing';
    form.innerHTML = `
      <div class="bm-edit-form">
        <input class="bm-edit-input" id="bm-addfolder-name" type="text" placeholder="Folder name">
        <div class="bm-edit-actions">
          <button class="bm-edit-save" id="bm-addfolder-save">Add</button>
          <button class="bm-edit-cancel" id="bm-addfolder-cancel">Cancel</button>
        </div>
      </div>`;
    listEl.prepend(form);
    form.querySelector('#bm-addfolder-name').focus();

    form.querySelector('#bm-addfolder-save').addEventListener('click', async () => {
      const name = form.querySelector('#bm-addfolder-name').value.trim();
      if (!name) return;
      const parentId = bmState.currentFolder?.id || bmState.all?.id || '';
      try {
        await fetch('http://localhost:8765/bookmarks/add-folder', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
          body: JSON.stringify({ name, parentId }),
        });
        await reloadBmData();
      } catch { /* ignore */ }
    });

    form.querySelector('#bm-addfolder-cancel').addEventListener('click', () => form.remove());
    form.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') form.querySelector('#bm-addfolder-save').click();
      if (e.key === 'Escape') form.remove();
    });
  });
}
