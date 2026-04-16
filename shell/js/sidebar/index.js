/**
 * Sidebar module entry point — panels, workspaces, tab context menu, drag-drop.
 *
 * Loaded from: shell/index.html as <script type="module" src="js/sidebar/index.js">
 * window exports: ocSidebar (consumed by shell/js/shortcut-router.js:35 for the
 *   Cmd+B bookmarks shortcut), __tandemShowTabContextMenu (consumed by main.js
 *   via window.__tandemShowTabContextMenu, already set via window. inside the IIFE).
 */

import { ICONS, WORKSPACE_ICONS } from './constants.js';
import {
  getToken, getConfig, setConfig,
  isSetupPanelOpen, setSetupPanelOpen,
  getWorkspaces, setWorkspaces,
  getActiveWorkspaceId, setActiveWorkspaceId,
} from './config.js';
import { initDragDrop } from './drag-drop.js';
import { initPanelResize, getPanelWidth, setPanelWidth } from './panel-resize.js';
import { createSetupPanel } from './panels/setup.js';
import {
  COMMUNICATION_IDS,
  loadWebviewInPanel, hideWebviews, safeSetPanelHTML,
  getOrCreateWebview, getWebview, hasWebview,
} from './webview.js';
import { loadHistoryPanel } from './panels/history.js';

  // ═══════════════════════════════════════
  // SIDEBAR
  // ═══════════════════════════════════════
  const ocSidebar = (() => {

    function getIconSvg(slug) {
      if (WORKSPACE_ICONS[slug]) return WORKSPACE_ICONS[slug];
      // If the slug isn't a known icon name, render it directly (supports emoji icons)
      if (slug && typeof slug === 'string' && slug.trim()) {
        return `<span class="workspace-emoji-icon">${slug}</span>`;
      }
      return WORKSPACE_ICONS.home;
    }

    async function loadQuickLinksConfig() {
      const response = await fetch('http://localhost:8765/config', {
        headers: { Authorization: `Bearer ${getToken()}` }
      });
      if (!response.ok) throw new Error('Failed to load quick links');
      return response.json();
    }

    function isQuickLinkableUrl(url) {
      return /^https?:\/\//i.test(url || '');
    }

    function normalizeQuickLinkUrl(url) {
      const parsed = new URL(url);
      parsed.hash = '';
      return parsed.toString();
    }

    async function addQuickLink(url, label) {
      const data = await loadQuickLinksConfig();
      const normalizedUrl = normalizeQuickLinkUrl(url);
      const quickLinks = (data.general?.quickLinks || []).filter((link) => {
        try {
          return normalizeQuickLinkUrl(link?.url) !== normalizedUrl;
        } catch {
          return true;
        }
      });
      quickLinks.push({ label, url: normalizedUrl });
      const response = await fetch('http://localhost:8765/config', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`
        },
        body: JSON.stringify({ general: { quickLinks } })
      });
      if (!response.ok) throw new Error('Failed to save quick links');
      return response.json();
    }

    async function removeQuickLink(url) {
      const data = await loadQuickLinksConfig();
      const normalizedUrl = normalizeQuickLinkUrl(url);
      const quickLinks = (data.general?.quickLinks || []).filter((link) => {
        try {
          return normalizeQuickLinkUrl(link?.url) !== normalizedUrl;
        } catch {
          return true;
        }
      });
      const response = await fetch('http://localhost:8765/config', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`
        },
        body: JSON.stringify({ general: { quickLinks } })
      });
      if (!response.ok) throw new Error('Failed to save quick links');
      return response.json();
    }

    async function loadConfig() {
      const r = await fetch('http://localhost:8765/sidebar/config', { headers: { Authorization: `Bearer ${getToken()}` } });
      const data = await r.json();
      setConfig(data.config);
      getConfig().activeItemId = null; // always start with panel closed
      applyPinState(getConfig().panelPinned || false);
      render();
    }

    function renderItemHTML(item) {
      const icon = ICONS[item.id];
      const isActive = getConfig().activeItemId === item.id;
      const isMessenger = COMMUNICATION_IDS.includes(item.id);

      if (isMessenger && icon?.brand) {
        const bg = icon.brand;
        return `
          <button class="sidebar-item messenger-item ${isActive ? 'active' : ''}"
            data-id="${item.id}" title="${item.label}">
            <div class="messenger-icon" style="background:${bg}">
              ${icon.svg}
            </div>
            <span class="sidebar-item-label">${item.label}</span>
          </button>`;
      }
      return `
        <button class="sidebar-item ${isActive ? 'active' : ''}"
          data-id="${item.id}" title="${item.label}">
          ${icon?.svg || ''}
          <span class="sidebar-item-label">${item.label}</span>
        </button>`;
    }

    function renderWorkspaceIcons() {
      if (!getWorkspaces().length) return '';
      const icons = getWorkspaces().map(ws => {
        const isActive = ws.id === getActiveWorkspaceId();
        return `
          <button class="sidebar-item workspace-icon ${isActive ? 'active' : ''}"
            data-ws-id="${ws.id}" title="${ws.name}">
            <div class="workspace-icon-inner ${isActive ? 'ws-strip-active' : 'ws-strip-inactive'}">
              <span class="workspace-svg-icon">${getIconSvg(ws.icon)}</span>
            </div>
          </button>`;
      }).join('');
      const addBtn = `
        <button class="sidebar-item workspace-add-btn" data-ws-action="add" title="Add workspace">
          <span class="workspace-add-icon">+</span>
        </button>`;
      return icons + addBtn;
    }

    function render() {
      if (!getConfig()) return;
      const sidebar = document.getElementById('sidebar');
      const itemsEl = document.getElementById('sidebar-items');
      sidebar.dataset.state = getConfig().state;

      const sorted = getConfig().items.filter(i => i.enabled).sort((a, b) => a.order - b.order);
      // Section 1 = workspaces (dynamic icons, not from config items)
      const sec2 = sorted.filter(i => i.order >= 10 && i.order < 20);
      const sec3 = sorted.filter(i => i.order >= 20);

      // 3 sections: workspace icons / communication / utilities, with group headers + separators
      const wsHtml = renderWorkspaceIcons();
      itemsEl.innerHTML =
        (wsHtml ? '<p class="sidebar-group-header">Workspaces</p>' : '') +
        wsHtml +
        (wsHtml && sec2.length ? '<div class="sidebar-separator"></div>' : '') +
        (sec2.length ? '<p class="sidebar-group-header">Communication</p>' : '') +
        sec2.map(renderItemHTML).join('') +
        (sec2.length && sec3.length ? '<div class="sidebar-separator"></div>' : '') +
        (sec3.length ? '<p class="sidebar-group-header">Browser Utilities</p>' : '') +
        sec3.map(renderItemHTML).join('');

      // Panel — skip title/open state when setup panel is open
      const panel = document.getElementById('sidebar-panel');
      const panelTitle = document.getElementById('sidebar-panel-title');
      if (!isSetupPanelOpen()) {
        if (getConfig().activeItemId) {
          const activeItem = getConfig().items.find(i => i.id === getConfig().activeItemId);
          panel.classList.add('open');
          panelTitle.textContent = activeItem?.label || '';
          // Apply saved width for this item
          const savedWidth = getPanelWidth(getConfig().activeItemId);
          setPanelWidth(savedWidth);
        } else {
          panel.classList.remove('open');
          panel.style.width = ''; // clear inline style so CSS animates to 0
          panel.style.removeProperty('--panel-width');
        }
      }

      // Wide toggle button
      const toggleBtn = document.getElementById('sidebar-toggle-width');
      const toggleLabel = getConfig().state === 'wide' ? 'Collapse' : 'Expand';
      toggleBtn.innerHTML = (getConfig().state === 'wide' ? '\u2039' : '\u203a') + `<span class="sidebar-footer-label">${toggleLabel}</span>`;
      toggleBtn.title = toggleLabel;
    }

    async function activateItem(id) {
      await fetch(`http://localhost:8765/sidebar/items/${id}/activate`, {
        method: 'POST', headers: { Authorization: `Bearer ${getToken()}` }
      });
      setSetupPanelOpen(false);
      const newActive = getConfig().activeItemId === id ? null : id;
      getConfig().activeItemId = newActive;
      render();

      if (newActive && COMMUNICATION_IDS.includes(newActive)) {
        loadWebviewInPanel(newActive);
      } else if (newActive && BOOKMARK_PANEL_IDS.includes(newActive)) {
        loadBookmarkPanel();
      } else if (newActive === 'history') {
        loadHistoryPanel();
      } else if (newActive === 'pinboards') {
        loadPinboardPanel();
      } else {
        hideWebviews();
        const content = document.getElementById('sidebar-panel-content');
        content.classList.remove('webview-mode');
      }
    }

    async function toggleState() {
      const newState = getConfig().state === 'wide' ? 'narrow' : 'wide';
      await fetch('http://localhost:8765/sidebar/state', {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: newState })
      });
      getConfig().state = newState;
      render();
    }

    async function toggleVisibility() {
      const newState = getConfig().state === 'hidden' ? 'narrow' : 'hidden';
      await fetch('http://localhost:8765/sidebar/state', {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: newState })
      });
      getConfig().state = newState;
      render();
    }

    // === BOOKMARKS PANEL MODULE ===
    const BOOKMARK_PANEL_IDS = ['bookmarks'];

    const bmState = {
      all: null,         // full bookmark tree from API
      currentFolder: null, // current folder node
      path: [],          // breadcrumb trail [{id, name}]
      searchMode: false,
    };

    function getFaviconUrl(url) {
      try { return `https://www.google.com/s2/favicons?domain=${new URL(url).hostname}&sz=32`; }
      catch { return null; }
    }

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

    async function loadBookmarkPanel() {
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

    // === PINBOARD PANEL MODULE ===
    const pbState = { currentBoardId: null, currentBoardName: '', currentBoardEmoji: '', currentLayout: 'default', currentBackground: 'dark' };

    function pbEscape(text) {
      const d = document.createElement('div');
      d.textContent = text;
      return d.innerHTML;
    }

    async function loadPinboardPanel() {
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
          <button class="pb-board-delete" data-board-id="${b.id}" title="Delete board">&times;</button>
        </div>
      `).join('');

      container.querySelectorAll('.pb-board-item').forEach(el => {
        el.addEventListener('click', (e) => {
          if (e.target.classList.contains('pb-board-delete')) return;
          pbOpenBoard(el.dataset.boardId, el.dataset.name, el.dataset.emoji);
        });
      });
      container.querySelectorAll('.pb-board-delete').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const boardId = btn.dataset.boardId;
          await fetch(`http://localhost:8765/pinboards/${boardId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${getToken()}` } });
          loadPinboardPanel();
        });
      });
    }

    async function pbOpenBoard(boardId, name, emoji) {
      pbState.currentBoardId = boardId;
      pbState.currentBoardName = name;
      pbState.currentBoardEmoji = emoji;
      const content = document.getElementById('sidebar-panel-content');

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
            await fetch(`http://localhost:8765/pinboards/${boardId}/settings`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
              body: JSON.stringify({ layout })
            });
          });
        });
        panel.querySelectorAll('[data-bg]').forEach(opt => {
          opt.addEventListener('click', async () => {
            const bg = opt.dataset.bg;
            pbState.currentBackground = bg;
            pbApplyGridClasses();
            panel.querySelectorAll('[data-bg]').forEach(o => o.classList.remove('active'));
            opt.classList.add('active');
            await fetch(`http://localhost:8765/pinboards/${boardId}/settings`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
              body: JSON.stringify({ background: bg })
            });
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
        await fetch(`http://localhost:8765/pinboards/${boardId}/items`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
          body: JSON.stringify({ type: 'text', content: text })
        });
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

      try {
        const res = await fetch(`http://localhost:8765/pinboards/${boardId}/items`, { headers: { Authorization: `Bearer ${getToken()}` } });
        const data = await res.json();
        pbRenderItems(data.items || []);
      } catch {
        document.getElementById('pb-item-list').innerHTML = '<div class="bm-empty">Failed to load items</div>';
      }
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
        await fetch(`http://localhost:8765/pinboards/${boardId}/items/${item.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
          body: JSON.stringify({ title, content, note: content })
        });
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

    function pbRenderItems(items) {
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

      // Remove handler with fade-out
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
        await fetch(`http://localhost:8765/pinboards/${pbState.currentBoardId}/items/${itemId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${getToken()}` } });
        setTimeout(() => {
          if (card) card.remove();
          if (container.querySelectorAll('.pb-card').length === 0) {
            container.className = 'pb-items-empty';
            container.innerHTML = '<div class="bm-empty"><div style="font-size:48px;margin-bottom:12px;">📌</div><p>All items removed.</p></div>';
          }
        }, 250);
      });

      // Edit handler
      container.addEventListener('click', (e) => {
        const editBtn = e.target.closest('.pb-edit-btn');
        if (!editBtn) return;
        e.stopPropagation();
        const itemId = editBtn.dataset.itemId;
        const item = items.find(i => i.id === itemId);
        if (item && pbState.currentBoardId) pbOpenEditModal(item, pbState.currentBoardId);
      });

      // Click on link/image cards opens URL in new tab
      container.querySelectorAll('.pb-card[data-has-url="true"]').forEach(card => {
        card.addEventListener('click', (e) => {
          if (e.target.closest('.pb-card-actions')) return;
          const url = card.dataset.url;
          if (url && window.tandem) window.tandem.newTab(url);
        });
      });

      // Drag-and-drop reorder
      pbSetupDragAndDrop(container);

      // Inline editing: double-click on text/quote card body or link card title
      container.querySelectorAll('.pb-card').forEach(card => {
        const itemId = card.dataset.itemId;
        const item = items.find(i => i.id === itemId);
        if (!item) return;

        if (item.type === 'text' || item.type === 'quote') {
          const body = card.querySelector('.pb-card-text-preview');
          if (body) {
            body.addEventListener('dblclick', (e) => {
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
                  await fetch(`http://localhost:8765/pinboards/${pbState.currentBoardId}/items/${itemId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
                    body: JSON.stringify({ content: newText })
                  });
                }
              });
              body.addEventListener('keydown', (ke) => {
                if (ke.key === 'Escape') {
                  body.textContent = originalText;
                  body.contentEditable = 'false';
                }
              });
            });
          }
        }

        if (item.type === 'link') {
          const titleEl = card.querySelector('.pb-card-title');
          if (titleEl) {
            titleEl.addEventListener('dblclick', (e) => {
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
                  await fetch(`http://localhost:8765/pinboards/${pbState.currentBoardId}/items/${itemId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
                    body: JSON.stringify({ title: newText })
                  });
                }
              });
              titleEl.addEventListener('keydown', (ke) => {
                if (ke.key === 'Escape') {
                  titleEl.textContent = originalText;
                  titleEl.contentEditable = 'false';
                  titleEl.style.whiteSpace = '';
                }
              });
            });
          }
        }
      });
    }

    function pbSetupDragAndDrop(container) {
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
        await fetch(`http://localhost:8765/pinboards/${pbState.currentBoardId}/items/reorder`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
          body: JSON.stringify({ itemIds: newOrder })
        });
        container.querySelectorAll('.pb-drag-over').forEach(el => el.classList.remove('pb-drag-over'));
      });
    }

    async function pbCreateBoard() {
      const name = await showPrompt('New board', 'Board name…');
      if (!name) return;
      const emoji = await showPrompt('Board emoji (optional)', 'e.g. 📌', '📌') || '📌';
      await fetch('http://localhost:8765/pinboards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ name, emoji })
      });
      loadPinboardPanel();
    }

    function applyPinState(pinned) {
      const panel = document.getElementById('sidebar-panel');
      const pinBtn = document.getElementById('sidebar-panel-pin');
      if (pinned) {
        panel.classList.add('pinned');
        pinBtn && pinBtn.classList.add('active');
      } else {
        panel.classList.remove('pinned');
        pinBtn && pinBtn.classList.remove('active');
      }
    }

    const setupPanel = createSetupPanel({ hideWebviews, safeSetPanelHTML, render });

    // === WORKSPACE FUNCTIONS ===
    async function loadWorkspaces() {
      try {
        const r = await fetch('http://localhost:8765/workspaces', { headers: { Authorization: `Bearer ${getToken()}` } });
        const data = await r.json();
        if (data.ok) {
          setWorkspaces(data.workspaces);
          setActiveWorkspaceId(data.activeId);
          render();
          filterTabBar();
        }
      } catch (e) { /* workspace API not yet available during startup */ }
    }

    async function switchWorkspace(id) {
      try {
        const r = await fetch(`http://localhost:8765/workspaces/${id}/switch`, {
          method: 'POST', headers: { Authorization: `Bearer ${getToken()}` }
        });
        const data = await r.json();
        if (data.ok) {
          setActiveWorkspaceId(data.workspace.id);
          // Update the local workspace's tabIds
          const ws = getWorkspaces().find(w => w.id === id);
          if (ws) Object.assign(ws, data.workspace);
          render();
          filterTabBar();
        }
      } catch (e) { console.error('switchWorkspace failed:', e); }
    }

    function getNextWorkspaceName() {
      const existing = getWorkspaces().map(w => w.name);
      let n = 1;
      while (existing.includes(`Workspace ${n}`)) n++;
      return `Workspace ${n}`;
    }

    function renderIconGrid(selectedIcon) {
      const slugs = Object.keys(WORKSPACE_ICONS);
      return slugs.map(slug => {
        const isSelected = slug === selectedIcon;
        return `<button class="ws-icon-grid-btn ${isSelected ? 'selected' : ''}" data-icon-slug="${slug}" title="${slug}">
          <span class="ws-icon-grid-svg">${WORKSPACE_ICONS[slug]}</span>
        </button>`;
      }).join('');
    }

    function showWorkspaceForm(content, mode, existingWs) {
      const isEdit = mode === 'edit';
      const title = isEdit ? 'Edit workspace' : 'Create workspace';
      const btnLabel = isEdit ? 'Save' : 'Create';
      const defaultIcon = isEdit ? existingWs.icon : Object.keys(WORKSPACE_ICONS)[0];
      const defaultName = isEdit ? existingWs.name : getNextWorkspaceName();

      safeSetPanelHTML(`
        <div class="ws-form-sheet">
          <div class="ws-form-title">${title}</div>
          <div class="ws-form-section-label">Icon</div>
          <div class="ws-icon-grid" id="ws-icon-grid">${renderIconGrid(defaultIcon)}</div>
          <div class="ws-form-section-label">Name</div>
          <input type="text" class="ws-form-input" id="ws-form-name" value="${defaultName}" placeholder="${getNextWorkspaceName()}" />
          <div class="ws-form-actions">
            <button class="ws-form-btn-cancel" id="ws-form-cancel">Cancel</button>
            <button class="ws-form-btn-primary" id="ws-form-submit">${btnLabel}</button>
          </div>
          ${isEdit ? `<button class="ws-form-btn-delete" id="ws-form-delete">Delete workspace</button>` : ''}
          <div class="ws-form-delete-confirm" id="ws-form-delete-confirm" style="display:none;">
            <span>Are you sure? Tabs will move to Default.</span>
            <div class="ws-form-delete-confirm-actions">
              <button class="ws-form-btn-cancel" id="ws-form-delete-no">No</button>
              <button class="ws-form-btn-danger" id="ws-form-delete-yes">Yes, delete</button>
            </div>
          </div>
        </div>`);

      let selectedIcon = defaultIcon;

      // Icon grid selection
      content.querySelectorAll('.ws-icon-grid-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          content.querySelectorAll('.ws-icon-grid-btn').forEach(b => b.classList.remove('selected'));
          btn.classList.add('selected');
          selectedIcon = btn.dataset.iconSlug;
        });
      });

      // Auto-focus name input
      const nameInput = content.querySelector('#ws-form-name');
      nameInput.focus();
      nameInput.select();

      // Cancel
      content.querySelector('#ws-form-cancel').addEventListener('click', () => {
        openWorkspacePanel();
      });

      // Submit
      content.querySelector('#ws-form-submit').addEventListener('click', async () => {
        const name = nameInput.value.trim();
        if (!name) return;
        try {
          if (isEdit) {
            const r = await fetch(`http://localhost:8765/workspaces/${existingWs.id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
              body: JSON.stringify({ name, icon: selectedIcon })
            });
            const data = await r.json();
            if (data.ok) {
              const idx = getWorkspaces().findIndex(w => w.id === existingWs.id);
              if (idx >= 0) getWorkspaces()[idx] = data.workspace;
              render();
            }
          } else {
            const r = await fetch('http://localhost:8765/workspaces', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
              body: JSON.stringify({ name, icon: selectedIcon })
            });
            const data = await r.json();
            if (data.ok) {
              getWorkspaces().push(data.workspace);
              render();
            }
          }
        } catch (e) { console.error('workspace form submit failed:', e); }
        openWorkspacePanel();
      });

      // Enter key on input submits
      nameInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') content.querySelector('#ws-form-submit').click();
        if (e.key === 'Escape') openWorkspacePanel();
      });

      // Delete (edit mode only)
      if (isEdit) {
        content.querySelector('#ws-form-delete').addEventListener('click', () => {
          content.querySelector('#ws-form-delete').style.display = 'none';
          content.querySelector('#ws-form-delete-confirm').style.display = '';
        });
        content.querySelector('#ws-form-delete-no').addEventListener('click', () => {
          content.querySelector('#ws-form-delete-confirm').style.display = 'none';
          content.querySelector('#ws-form-delete').style.display = '';
        });
        content.querySelector('#ws-form-delete-yes').addEventListener('click', async () => {
          try {
            await fetch(`http://localhost:8765/workspaces/${existingWs.id}`, {
              method: 'DELETE', headers: { Authorization: `Bearer ${getToken()}` }
            });
            await loadWorkspaces();
          } catch (e) { console.error('workspace delete failed:', e); }
          openWorkspacePanel();
        });
      }
    }

    function filterTabBar() {
      // Find active workspace
      const ws = getWorkspaces().find(w => w.id === getActiveWorkspaceId());
      if (!ws) return;
      const allowedTabIds = new Set(ws.tabIds);

      // Get all tab elements from the tab bar
      const tabEls = document.querySelectorAll('#tab-bar .tab[data-tab-id]');
      const visibleTabIds = [];
      tabEls.forEach(el => {
        const tabId = el.dataset.tabId;
        // Get webContentsId for this tab from the webview
        const wv = document.querySelector(`webview[data-tab-id="${tabId}"]`);
        if (!wv) return;
        const wcId = wv.getWebContentsId ? wv.getWebContentsId() : null;
        const visible = wcId !== null && allowedTabIds.has(wcId);
        el.style.display = visible ? '' : 'none';
        if (visible) {
          visibleTabIds.push(tabId);
        } else {
          wv.classList.remove('active');
        }
      });

      if (visibleTabIds.length === 0) return;

      const activeWebview = document.querySelector('webview.active[data-tab-id]');
      const activeTabId = activeWebview?.dataset?.tabId || null;
      if (!activeTabId || !visibleTabIds.includes(activeTabId)) {
        if (window.tandem) {
          window.tandem.focusTab(visibleTabIds[0]);
        }
      }
    }

    async function openWorkspacePanel() {
      setSetupPanelOpen(false);
      getConfig().activeItemId = '__workspaces';
      const panel = document.getElementById('sidebar-panel');
      const titleEl = document.getElementById('sidebar-panel-title');
      const content = document.getElementById('sidebar-panel-content');

      titleEl.textContent = 'Workspaces';
      panel.classList.add('open');
      setPanelWidth(getPanelWidth('__workspaces'));

      // Hide webviews
      hideWebviews();
      content.classList.remove('webview-mode');

      // Refresh workspace data
      await loadWorkspaces();

      const rows = getWorkspaces().map(ws => {
        const isActive = ws.id === getActiveWorkspaceId();
        return `
          <div class="ws-panel-item ${isActive ? 'active' : ''}" data-ws-panel-id="${ws.id}">
            <div class="ws-panel-icon-svg">${getIconSvg(ws.icon)}</div>
            <span class="ws-panel-name">${ws.name}</span>
            ${isActive ? '<span class="ws-panel-check">✓</span>' : ''}
            ${!ws.isDefault ? `<button class="ws-panel-edit" data-ws-edit="${ws.id}" title="Edit">···</button>` : ''}
          </div>`;
      }).join('');

      safeSetPanelHTML(`
        <div class="ws-panel">
          <button class="ws-panel-add" id="ws-panel-add-btn">+ Add workspace</button>
          ${rows}
        </div>`);

      // Event handlers
      content.querySelector('#ws-panel-add-btn')?.addEventListener('click', () => {
        showWorkspaceForm(content, 'create', null);
      });
      content.querySelectorAll('.ws-panel-item').forEach(el => {
        el.addEventListener('click', async (e) => {
          if (e.target.closest('.ws-panel-edit')) return;
          await switchWorkspace(el.dataset.wsPanelId);
          await openWorkspacePanel();
        });
      });
      content.querySelectorAll('.ws-panel-edit').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const id = btn.dataset.wsEdit;
          const ws = getWorkspaces().find(w => w.id === id);
          if (ws) showWorkspaceForm(content, 'edit', ws);
        });
      });
    }

    function init() {
      loadConfig();
      // Load workspaces after a short delay to ensure API is ready
      setTimeout(loadWorkspaces, 500);
      initDragDrop({ moveTabToWorkspace });
      initPanelResize();

      document.getElementById('sidebar-items').addEventListener('click', e => {
        // Handle workspace icon clicks
        const wsBtn = e.target.closest('[data-ws-id]');
        if (wsBtn) { switchWorkspace(wsBtn.dataset.wsId); return; }
        // Handle workspace add button
        const wsAdd = e.target.closest('[data-ws-action="add"]');
        if (wsAdd) { openWorkspacePanel(); return; }
        // Handle regular sidebar items
        const btn = e.target.closest('.sidebar-item:not([data-ws-id]):not([data-ws-action])');
        if (btn && btn.dataset.id) activateItem(btn.dataset.id);
      });
      document.getElementById('sidebar-toggle-width').addEventListener('click', toggleState);

      document.getElementById('sidebar-panel-pin').addEventListener('click', async () => {
        getConfig().panelPinned = !getConfig().panelPinned;
        applyPinState(getConfig().panelPinned);
        await fetch('http://localhost:8765/sidebar/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
          body: JSON.stringify({ panelPinned: getConfig().panelPinned })
        });
      });

      document.getElementById('sidebar-panel-reload').addEventListener('click', () => {
        if (getConfig().activeItemId && hasWebview(getConfig().activeItemId)) {
          getWebview(getConfig().activeItemId).reload();
        }
      });

      document.getElementById('sidebar-panel-close').addEventListener('click', () => {
        const panel = document.getElementById('sidebar-panel');
        panel.classList.remove('open');
        // Hide webviews but don't remove them (preserve login state)
        hideWebviews();
        const content = document.getElementById('sidebar-panel-content');
        content.classList.remove('webview-mode');
        // Remove non-webview content
        Array.from(content.children).forEach(child => {
          if (!child.classList.contains('sidebar-webview')) child.remove();
        });
        document.getElementById('sidebar-panel-title').textContent = '';
        setSetupPanelOpen(false);
        getConfig().activeItemId = null;
        render();
      });

      document.getElementById('sidebar-customize').addEventListener('click', () => {
        if (isSetupPanelOpen()) {
          // Toggle off — close the panel
          const panel = document.getElementById('sidebar-panel');
          panel.classList.remove('open');
          setSetupPanelOpen(false);
          hideWebviews();
        } else {
          setupPanel.renderSetupPanel(getConfig().items);
        }
      });

      document.getElementById('sidebar-tips').addEventListener('click', () => {
        const webview = document.querySelector('webview.active');
        if (webview) {
          const shellPath = window.location.href.replace(/\/[^/]*$/, '');
          webview.loadURL(shellPath + '/help.html');
        }
      });

      // Shortcut: Cmd+Shift+B (Mac) / Ctrl+Shift+B (Windows/Linux)
      document.addEventListener('keydown', e => {
        if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'B') {
          e.preventDefault();
          toggleVisibility();
        }
      });

      // Listen for main process signal to reload a sidebar webview (e.g. after Google auth)
      if (window.tandem && window.tandem.onReloadSidebarWebview) {
        window.tandem.onReloadSidebarWebview((id) => {
          const wv = getWebview(id);
          if (wv) wv.reload();
          // If Gmail partition reloads, also reload Calendar (they share persist:gmail session)
          if (id === 'gmail') {
            const calendarWv = getWebview('calendar');
            if (calendarWv) calendarWv.reload();
          }
        });
      }

      // Listen for workspace switch events from main process
      if (window.tandem && window.tandem.onWorkspaceSwitched) {
        window.tandem.onWorkspaceSwitched((workspace) => {
          setActiveWorkspaceId(workspace.id);
          // Update local workspace data
          const idx = getWorkspaces().findIndex(w => w.id === workspace.id);
          if (idx >= 0) getWorkspaces()[idx] = workspace;
          render();
          filterTabBar();
        });
      }

      // Refresh pinboard view when a pin is added via page context menu
      if (window.tandem && window.tandem.onPinboardItemAdded) {
        window.tandem.onPinboardItemAdded((boardId) => {
          if (pbState.currentBoardId === boardId) {
            setTimeout(() => pbRefreshItems(boardId), 800); // delay for OG fetch
          }
        });
      }
    }

    // === TAB CONTEXT MENU (custom DOM, no IPC) ===
    let ctxMenuEl = null;

    function getWebContentsIdForTab(domTabId) {
      const wv = document.querySelector(`webview[data-tab-id="${domTabId}"]`);
      return wv && wv.getWebContentsId ? wv.getWebContentsId() : null;
    }

    function getTabWorkspaceId(domTabId) {
      const wcId = getWebContentsIdForTab(domTabId);
      if (wcId === null) return null;
      const ws = getWorkspaces().find(w => w.tabIds && w.tabIds.includes(wcId));
      return ws ? ws.id : null;
    }

    async function moveTabToWorkspace(domTabId, targetWsId) {
      const wcId = getWebContentsIdForTab(domTabId);
      if (wcId === null) return;
      try {
        await fetch(`http://localhost:8765/workspaces/${targetWsId}/move-tab`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
          body: JSON.stringify({ tabId: wcId })
        });
        await loadWorkspaces();
        filterTabBar();
        const ws = getWorkspaces().find(w => w.id === targetWsId);
        console.log(`Tab moved to workspace ${ws ? ws.name : targetWsId}`);
      } catch (e) { console.error('moveTabToWorkspace failed:', e); }
    }

    function closeCtxMenu() {
      if (ctxMenuEl) { ctxMenuEl.remove(); ctxMenuEl = null; }
    }

    async function showTabContextMenu(domTabId, x, y) {
      closeCtxMenu();

      const wv = document.querySelector('webview[data-tab-id="'+domTabId+'"]');
      const isMuted = wv ? wv.audioMuted : false;
      const currentWsId = getTabWorkspaceId(domTabId);
      const targets = getWorkspaces().filter(ws => ws.id !== currentWsId);

      // Pre-fetch pinboards (fast — same-machine API call)
      let pbBoards = [];
      try {
        const pbRes = await fetch('http://localhost:8765/pinboards', { headers: { Authorization: `Bearer ${getToken()}` } });
        const pbData = await pbRes.json();
        pbBoards = pbData.boards || [];
      } catch { /* Tandem not running or no boards */ }

      const menu = document.createElement('div');
      menu.className = 'tandem-ctx-menu';
      menu.style.left = x + 'px';
      menu.style.top = y + 'px';

      function addItem(label, onClick) {
        const item = document.createElement('div');
        item.className = 'tandem-ctx-menu-item';
        item.textContent = label;
        item.addEventListener('click', () => { closeCtxMenu(); onClick(item); });
        menu.appendChild(item);
        return item;
      }

      function addSep() {
        const sep = document.createElement('div');
        sep.className = 'tandem-ctx-separator';
        menu.appendChild(sep);
      }

      // — New Tab
      addItem('New Tab', () => { window.tandem.newTab(); });

      addSep();

      // — Reload
      addItem('Reload', () => { if (wv) wv.reload(); });

      // — Duplicate Tab
      addItem('Duplicate Tab', () => { if (wv) window.tandem.newTab(wv.src); });

      // — Copy Page Address
      addItem('Copy Page Address', (itemEl) => {
        if (wv) {
          navigator.clipboard.writeText(wv.src);
          itemEl.textContent = 'Copied!';
          setTimeout(() => { itemEl.textContent = 'Copy Page Address'; }, 1000);
        }
      });

      if (wv && isQuickLinkableUrl(wv.src)) {
        const quickLinksData = await loadQuickLinksConfig().catch(() => null);
        const currentQuickLinks = quickLinksData?.general?.quickLinks || [];
        const currentUrl = normalizeQuickLinkUrl(wv.src);
        const alreadyQuickLink = currentQuickLinks.some((link) => {
          try {
            return normalizeQuickLinkUrl(link?.url) === currentUrl;
          } catch {
            return false;
          }
        });
        addItem(alreadyQuickLink ? 'Remove from Quick Links' : 'Add to Quick Links', async () => {
          try {
            if (alreadyQuickLink) {
              await removeQuickLink(currentUrl);
            } else {
              await addQuickLink(currentUrl, wv.getTitle() || currentUrl);
            }
          } catch {
            // Ignore save failures for now; the menu just closes.
          }
        });
      }

      addSep();

      // — Move to Workspace (submenu)
      if (targets.length > 0) {
        const wsItem = document.createElement('div');
        wsItem.className = 'tandem-ctx-menu-item';
        wsItem.innerHTML = '<span>Move to Workspace</span><span class="ctx-arrow">▶</span>';

        const sub = document.createElement('div');
        sub.className = 'tandem-ctx-submenu';
        targets.forEach(ws => {
          const si = document.createElement('div');
          si.className = 'tandem-ctx-submenu-item';
          const icon = getIconSvg(ws.icon);
          si.innerHTML = '<span class="ws-ctx-icon">' + icon + '</span><span>' + ws.name + '</span>';
          si.addEventListener('click', () => {
            closeCtxMenu();
            moveTabToWorkspace(domTabId, ws.id);
          });
          sub.appendChild(si);
        });
        wsItem.appendChild(sub);
        menu.appendChild(wsItem);

        addSep();
      }

      // — Add to Pinboard (submenu)
      {
        const pbItem = document.createElement('div');
        pbItem.className = 'tandem-ctx-menu-item';
        pbItem.innerHTML = '<span>📌 Add to Pinboard</span><span class="ctx-arrow">▶</span>';

        const pbSub = document.createElement('div');
        pbSub.className = 'tandem-ctx-submenu';

        if (pbBoards.length === 0) {
          const empty = document.createElement('div');
          empty.className = 'tandem-ctx-submenu-item';
          empty.style.opacity = '0.5';
          empty.style.cursor = 'default';
          empty.textContent = 'No boards yet';
          pbSub.appendChild(empty);
        } else {
          pbBoards.forEach(board => {
            const si = document.createElement('div');
            si.className = 'tandem-ctx-submenu-item';
            si.innerHTML = '<span>' + board.emoji + ' ' + board.name + '</span>';
            si.addEventListener('click', async () => {
              closeCtxMenu();
              const tabUrl = wv ? wv.src : '';
              const tabTitle = wv ? wv.getTitle() : '';
              await fetch('http://localhost:8765/pinboards/' + board.id + '/items', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
                body: JSON.stringify({ type: 'link', url: tabUrl, title: tabTitle })
              });
              // Visual flash feedback on the tab
              const tabEl = document.querySelector('.tab[data-tab-id="' + domTabId + '"]');
              if (tabEl) {
                tabEl.classList.add('pin-flash');
                setTimeout(() => tabEl.classList.remove('pin-flash'), 700);
              }
              // Refresh board if it's currently open
              if (pbState.currentBoardId === board.id) {
                setTimeout(() => pbRefreshItems(board.id), 800); // slight delay for OG fetch
              }
            });
            pbSub.appendChild(si);
          });
        }

        pbItem.appendChild(pbSub);
        menu.appendChild(pbItem);
        addSep();
      }

      // — Mute / Unmute Tab
      addItem(isMuted ? 'Unmute Tab' : 'Mute Tab', () => {
        if (wv) wv.audioMuted = !isMuted;
      });

      // — Set Emoji (submenu)
      {
        const emojiItem = document.createElement('div');
        emojiItem.className = 'tandem-ctx-menu-item';
        const tabEl = document.querySelector('.tab[data-tab-id="' + domTabId + '"]');
        const tabEmojiSpan = tabEl ? tabEl.querySelector('.tab-emoji') : null;
        const currentEmoji = (tabEmojiSpan && tabEmojiSpan.style.display !== 'none') ? tabEmojiSpan.textContent : '';
        const emojiLabel = document.createElement('span');
        emojiLabel.textContent = currentEmoji ? ('Emoji: ' + currentEmoji) : 'Set Emoji...';
        const emojiArrow = document.createElement('span');
        emojiArrow.className = 'ctx-arrow';
        emojiArrow.textContent = '▶';
        emojiItem.appendChild(emojiLabel);
        emojiItem.appendChild(emojiArrow);

        const emojiSub = document.createElement('div');
        emojiSub.className = 'tandem-ctx-submenu tandem-emoji-grid';

        if (currentEmoji) {
          const removeItem = document.createElement('div');
          removeItem.className = 'tandem-ctx-submenu-item';
          removeItem.textContent = 'Remove Emoji';
          removeItem.addEventListener('click', async () => {
            closeCtxMenu();
            await fetch('http://localhost:8765/tabs/' + encodeURIComponent(domTabId) + '/emoji', {
              method: 'DELETE',
              headers: { Authorization: 'Bearer ' + getToken() }
            });
          });
          emojiSub.appendChild(removeItem);
          const sep = document.createElement('div');
          sep.className = 'tandem-ctx-separator';
          emojiSub.appendChild(sep);
        }

        const emojis = [
          '🔥','⭐','💡','🚀','✅','❌','⚠️','🎯','💬','📌',
          '📚','🧪','🔧','🎨','📊','🔒','👀','💰','🎵','❤️',
          '🏠','📧','🛒','📝','🗂️','🌍','☁️','📸','🎮','🤖',
          '🧠','🔍','📅','🎁','🏷️','⏰','🔔','💻','📱','🎬',
          '🍕','☕','🌟','💎','🦊','🐛','🏗️','📦','🔗','🏆',
        ];
        const grid = document.createElement('div');
        grid.className = 'tandem-emoji-picker';
        emojis.forEach(emoji => {
          const btn = document.createElement('span');
          btn.className = 'tandem-emoji-btn';
          btn.textContent = emoji;
          btn.addEventListener('click', async () => {
            closeCtxMenu();
            await fetch('http://localhost:8765/tabs/' + encodeURIComponent(domTabId) + '/emoji', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + getToken() },
              body: JSON.stringify({ emoji: emoji })
            });
          });
          grid.appendChild(btn);
        });
        emojiSub.appendChild(grid);

        emojiItem.appendChild(emojiSub);
        menu.appendChild(emojiItem);
      }

      addSep();

      // — Close Tab
      addItem('Close Tab', () => { window.tandem.closeTab(domTabId); });

      // — Close Other Tabs
      addItem('Close Other Tabs', () => {
        const allTabs = document.querySelectorAll('#tab-bar .tab[data-tab-id]');
        allTabs.forEach(t => {
          const tid = t.dataset.tabId;
          if (tid && tid !== domTabId) window.tandem.closeTab(tid);
        });
      });

      // — Close Tabs to the Right
      addItem('Close Tabs to the Right', () => {
        const allTabs = Array.from(document.querySelectorAll('#tab-bar .tab[data-tab-id]'));
        const idx = allTabs.findIndex(t => t.dataset.tabId === domTabId);
        if (idx >= 0) {
          for (let i = idx + 1; i < allTabs.length; i++) {
            const tid = allTabs[i].dataset.tabId;
            if (tid) window.tandem.closeTab(tid);
          }
        }
      });

      document.body.appendChild(menu);
      ctxMenuEl = menu;

      // Auto-flip if menu extends beyond viewport
      const rect = menu.getBoundingClientRect();
      if (rect.right > window.innerWidth) menu.style.left = Math.max(0, window.innerWidth - rect.width - 8) + 'px';
      if (rect.bottom > window.innerHeight) menu.style.top = Math.max(0, window.innerHeight - rect.height - 8) + 'px';

      // Flip submenu left if near right edge
      requestAnimationFrame(() => {
        const menuRight = menu.getBoundingClientRect().right;
        if (menuRight + 180 > window.innerWidth) {
          const subs = menu.querySelectorAll('.tandem-ctx-submenu');
          subs.forEach(s => s.classList.add('flip-left'));
        }
      });

      // Close on click outside, Escape, scroll
      const closeHandler = (e) => {
        if (ctxMenuEl && !ctxMenuEl.contains(e.target)) { closeCtxMenu(); cleanup(); }
      };
      const escHandler = (e) => {
        if (e.key === 'Escape') { closeCtxMenu(); cleanup(); }
      };
      const scrollHandler = () => { closeCtxMenu(); cleanup(); };
      function cleanup() {
        document.removeEventListener('mousedown', closeHandler);
        document.removeEventListener('keydown', escHandler);
        window.removeEventListener('scroll', scrollHandler, true);
      }
      setTimeout(() => {
        document.addEventListener('mousedown', closeHandler);
        document.addEventListener('keydown', escHandler);
        window.addEventListener('scroll', scrollHandler, true);
      }, 0);
    }

    // Expose globally so main.js can call it
    window.__tandemShowTabContextMenu = showTabContextMenu;

    return { init, loadConfig, activateItem, toggleVisibility };
  })();


// Expose ocSidebar on window so classic scripts (shortcut-router.js) can reach it.
window.ocSidebar = ocSidebar;
  document.addEventListener('DOMContentLoaded', () => ocSidebar.init());
