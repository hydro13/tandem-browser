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
  getWebview, hasWebview,
} from './webview.js';
import { loadHistoryPanel } from './panels/history.js';
import { BOOKMARK_PANEL_IDS, loadBookmarkPanel } from './panels/bookmarks.js';
import { PINBOARD_PANEL_IDS, loadPinboardPanel, refreshPinboardIfOpen } from './panels/pinboard.js';

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
      } else if (newActive && PINBOARD_PANEL_IDS.includes(newActive)) {
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

      // Pinboard item-added refresh hook is installed by the pinboard panel
      // module itself on first open (see panels/pinboard.js).
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
              // Refresh board if it's currently open (no-op otherwise).
              refreshPinboardIfOpen(board.id);
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
