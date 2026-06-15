// Shared escaper from shell/js/html-escape.js (loaded in <head>).
const { escapeHtml } = window.tandemEscape;

const API = window.tandemApi?.baseUrl() || window.__TANDEM_API_BASE__ || 'http://127.0.0.1:8765';
let allBookmarks = [];
let currentFolderId = null; // null = root, or folder id
let currentFolderPath = []; // breadcrumb path
let editingId = null;
let isNewFolder = false;
let isNewBookmark = false;

function createEmptyState(text) {
  const el = document.createElement('div');
  el.className = 'empty-state';
  el.textContent = text;
  return el;
}

function parseSafeNavigationUrl(rawUrl) {
  try {
    const parsed = new URL(rawUrl, window.location.href);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function createFavicon(hostname) {
  const img = document.createElement('img');
  img.src = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=32`;
  img.alt = '';
  img.addEventListener('error', () => {
    const parent = img.parentElement;
    if (parent) parent.textContent = '🔗';
  });
  return img;
}

function navigateToBookmark(rawUrl) {
  const parsed = parseSafeNavigationUrl(rawUrl);
  if (parsed) {
    window.location.assign(parsed.href);
  }
}

function createActionButton(className, label, id) {
  const button = document.createElement('button');
  button.className = className;
  button.dataset.id = id || '';
  button.textContent = label;
  return button;
}

function buildActions(item) {
  const actions = document.createElement('div');
  actions.className = 'bm-actions';
  actions.appendChild(createActionButton('edit', 'Edit', item.id || ''));
  actions.appendChild(createActionButton('delete', 'Delete', item.id || ''));
  return actions;
}

function buildBookmarkRow(item, includeActions = true) {
  const el = document.createElement('div');
  el.className = 'bm-item';

  let hostname = '';
  const parsedUrl = parseSafeNavigationUrl(item.url || '');
  if (parsedUrl) hostname = parsedUrl.hostname;

  const icon = document.createElement('div');
  icon.className = 'bm-icon';
  icon.appendChild(createFavicon(hostname));

  const info = document.createElement('div');
  info.className = 'bm-info';
  const name = document.createElement('div');
  name.className = 'bm-name';
  name.textContent = item.name || hostname;
  const url = document.createElement('div');
  url.className = 'bm-url';
  url.textContent = item.url || '';
  info.append(name, url);

  el.append(icon, info);
  if (includeActions) {
    el.appendChild(buildActions(item));
  }

  return { el, info };
}

function buildFolderRow(item) {
  const el = document.createElement('div');
  el.className = 'bm-item';

  const icon = document.createElement('div');
  icon.className = 'bm-icon';
  icon.innerHTML = '&#x1F4C1;';

  const info = document.createElement('div');
  info.className = 'bm-info';
  const name = document.createElement('div');
  name.className = 'bm-name';
  name.textContent = item.name || '';
  const count = document.createElement('div');
  count.className = 'bm-url';
  count.textContent = `${item.children ? item.children.length : 0} items`;
  info.append(name, count);

  el.append(icon, info, buildActions(item));
  return { el, info };
}

// Fetch all bookmarks
async function fetchBookmarks() {
  const res = await fetch(`${API}/bookmarks`);
  const data = await res.json();
  allBookmarks = data.bookmarks || [];
  renderTree();
  renderList();
}

// Find folder by ID in tree
function findFolder(id, list = allBookmarks) {
  for (const item of list) {
    if (item.id === id) return item;
    if (item.children) {
      const found = findFolder(id, item.children);
      if (found) return found;
    }
  }
  return null;
}

// Get items for current folder
function getCurrentItems() {
  if (!currentFolderId) return allBookmarks;
  const folder = findFolder(currentFolderId);
  return folder && folder.children ? folder.children : [];
}

// Render folder tree in sidebar
function renderTree() {
  const tree = document.getElementById('folder-tree');
  tree.innerHTML = '';

  // All Bookmarks root
  const root = document.createElement('div');
  root.className = `tree-item ${!currentFolderId ? 'active' : ''}`;
  root.innerHTML = '<span class="icon">&#x1F4D6;</span><span class="name">Alle Bookmarks</span>';
  root.addEventListener('click', () => navigateToFolder(null, []));
  tree.appendChild(root);

  // Render folders recursively
  function renderFolders(items, container, path = []) {
    for (const item of items) {
      if (item.type !== 'folder') continue;
      const el = document.createElement('div');
      el.className = `tree-item ${currentFolderId === item.id ? 'active' : ''}`;
      el.innerHTML = `<span class="icon">&#x1F4C1;</span><span class="name">${escapeHtml(item.name)}</span>`;
      const itemPath = [...path, { id: item.id, name: item.name }];
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        navigateToFolder(item.id, itemPath);
      });
      container.appendChild(el);

      if (item.children && item.children.some(c => c.type === 'folder')) {
        const children = document.createElement('div');
        children.className = 'tree-children';
        renderFolders(item.children, children, itemPath);
        container.appendChild(children);
      }
    }
  }

  renderFolders(allBookmarks, tree);
}

// Navigate to folder
function navigateToFolder(folderId, path) {
  currentFolderId = folderId;
  currentFolderPath = path;
  renderTree();
  renderList();
  renderBreadcrumb();
}

// Render breadcrumb
function renderBreadcrumb() {
  const el = document.getElementById('breadcrumb');
  el.replaceChildren();

  const root = document.createElement('span');
  root.dataset.id = '';
  root.textContent = 'Alle Bookmarks';
  el.appendChild(root);

  for (const item of currentFolderPath) {
    const sep = document.createElement('span');
    sep.className = 'sep';
    sep.textContent = '›';
    el.appendChild(sep);

    const crumb = document.createElement('span');
    crumb.dataset.id = item.id || '';
    crumb.textContent = item.name || '';
    el.appendChild(crumb);
  }

  el.querySelectorAll('span[data-id]').forEach(span => {
    span.addEventListener('click', () => {
      const id = span.dataset.id || null;
      const idx = currentFolderPath.findIndex(p => p.id === id);
      const path = id ? currentFolderPath.slice(0, idx + 1) : [];
      navigateToFolder(id, path);
    });
  });
}

// Render bookmark list
function renderList() {
  const list = document.getElementById('bookmark-list');
  const items = getCurrentItems();
  list.replaceChildren();

  if (items.length === 0) {
    list.appendChild(createEmptyState('No bookmarks in this folder'));
    return;
  }

  // Sort: folders first, then by name
  const sorted = [...items].sort((a, b) => {
    if (a.type === 'folder' && b.type !== 'folder') return -1;
    if (a.type !== 'folder' && b.type === 'folder') return 1;
    return (a.name || '').localeCompare(b.name || '');
  });

  for (const item of sorted) {
    let row;

    if (item.type === 'folder') {
      row = buildFolderRow(item);
      row.el.addEventListener('dblclick', () => {
        const path = [...currentFolderPath, { id: item.id, name: item.name }];
        navigateToFolder(item.id, path);
      });
      row.info.addEventListener('click', () => {
        const path = [...currentFolderPath, { id: item.id, name: item.name }];
        navigateToFolder(item.id, path);
      });
    } else {
      row = buildBookmarkRow(item, true);
      row.info.addEventListener('click', () => {
        navigateToBookmark(item.url || '');
      });
    }

    const el = row.el;

    // Edit button
    el.querySelector('.edit')?.addEventListener('click', (e) => {
      e.stopPropagation();
      openEditDialog(item);
    });

    // Delete button
    el.querySelector('.delete')?.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (confirm(`Delete "${item.name}"?`)) {
        await fetch(`${API}/bookmarks/remove`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: item.id }),
        });
        fetchBookmarks();
      }
    });

    list.appendChild(el);
  }
}

// Edit dialog
function openEditDialog(item) {
  editingId = item ? item.id : null;
  isNewFolder = false;
  isNewBookmark = false;
  document.getElementById('dialog-title').textContent = item ? 'Edit' : 'New';
  document.getElementById('dialog-name').value = item ? item.name : '';
  document.getElementById('dialog-url').value = item && item.url ? item.url : '';
  document.getElementById('dialog-url-group').style.display = item && item.type === 'folder' ? 'none' : 'block';
  document.getElementById('dialog-overlay').classList.add('open');
  document.getElementById('dialog-name').focus();
}

function openNewFolderDialog() {
  editingId = null;
  isNewFolder = true;
  isNewBookmark = false;
  document.getElementById('dialog-title').textContent = 'New Folder';
  document.getElementById('dialog-name').value = '';
  document.getElementById('dialog-url').value = '';
  document.getElementById('dialog-url-group').style.display = 'none';
  document.getElementById('dialog-overlay').classList.add('open');
  document.getElementById('dialog-name').focus();
}

function openNewBookmarkDialog() {
  editingId = null;
  isNewFolder = false;
  isNewBookmark = true;
  document.getElementById('dialog-title').textContent = 'New Bookmark';
  document.getElementById('dialog-name').value = '';
  document.getElementById('dialog-url').value = 'https://';
  document.getElementById('dialog-url-group').style.display = 'block';
  document.getElementById('dialog-overlay').classList.add('open');
  document.getElementById('dialog-name').focus();
}

function closeDialog() {
  document.getElementById('dialog-overlay').classList.remove('open');
  editingId = null;
  isNewFolder = false;
  isNewBookmark = false;
}

async function saveDialog() {
  const name = document.getElementById('dialog-name').value.trim();
  const url = document.getElementById('dialog-url').value.trim();

  if (!name) return;

  if (isNewFolder) {
    await fetch(`${API}/bookmarks/add-folder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, parentId: currentFolderId }),
    });
  } else if (isNewBookmark) {
    if (!url) return;
    await fetch(`${API}/bookmarks/add`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, url, parentId: currentFolderId }),
    });
  } else if (editingId) {
    await fetch(`${API}/bookmarks/update`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: editingId, name, url: url || undefined }),
    });
  }

  closeDialog();
  fetchBookmarks();
}

// Search
let searchTimeout;
document.getElementById('search').addEventListener('input', (e) => {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(async () => {
    const q = e.target.value.trim();
    if (!q) {
      renderList();
      return;
    }
    const res = await fetch(`${API}/bookmarks/search?q=${encodeURIComponent(q)}`);
    const data = await res.json();
    const list = document.getElementById('bookmark-list');
    list.replaceChildren();

    if (!data.results || data.results.length === 0) {
      list.appendChild(createEmptyState('Geen resultaten'));
      return;
    }

    for (const item of data.results) {
      const row = buildBookmarkRow(item, false);
      row.el.addEventListener('click', () => {
        navigateToBookmark(item.url || '');
      });
      list.appendChild(row.el);
    }
  }, 300);
});

// Event listeners
document.getElementById('btn-dialog-cancel').addEventListener('click', closeDialog);
document.getElementById('btn-dialog-save').addEventListener('click', saveDialog);
document.getElementById('dialog-overlay').addEventListener('click', (e) => {
  if (e.target === document.getElementById('dialog-overlay')) closeDialog();
});
document.getElementById('btn-new-folder').addEventListener('click', openNewFolderDialog);
document.getElementById('btn-add-bookmark').addEventListener('click', openNewBookmarkDialog);

document.getElementById('btn-import-chrome').addEventListener('click', async () => {
  const btn = document.getElementById('btn-import-chrome');
  btn.textContent = 'Importing...';
  btn.disabled = true;
  try {
    const res = await fetch(`${API}/import/chrome/bookmarks`, { method: 'POST' });
    const data = await res.json();
    if (data.ok) {
      alert(`${data.count} bookmarks imported!`);
      fetchBookmarks();
    } else {
      alert('Import failed: ' + (data.error || 'Unknown error'));
    }
  } catch (e) {
    alert('Import failed: ' + e.message);
  }
  btn.textContent = 'Chrome Import';
  btn.disabled = false;
});

// Keyboard: Enter to save dialog, Escape to close
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && document.getElementById('dialog-overlay').classList.contains('open')) {
    saveDialog();
  }
  if (e.key === 'Escape') {
    closeDialog();
  }
});

// Init
fetchBookmarks();
renderBreadcrumb();

// Theme sync is handled by shell/js/theme.js (loaded in <head>).
