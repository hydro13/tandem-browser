/**
 * Sidebar module entry point — pure orchestration. Renders the sidebar item
 * strip, routes clicks to panel modules (bookmarks, history, pinboard,
 * workspaces, messengers), wires drag-drop and panel-resize, and handles the
 * customize/tips/pin/close buttons. All panel-specific logic lives in
 * ./panels/* and ./tab-context-menu.js.
 *
 * Loaded from: shell/index.html as <script type="module" src="js/sidebar/index.js">
 * window exports: ocSidebar (consumed by shell/js/shortcut-router.js:35 for the
 *   Cmd+B bookmarks shortcut). __tandemShowTabContextMenu is installed by
 *   tab-context-menu.js as a side effect of its import.
 */

import { ICONS } from './constants.js';
import {
  getToken, getConfig, setConfig,
  isSetupPanelOpen, setSetupPanelOpen,
  getWorkspaces,
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
import { PINBOARD_PANEL_IDS, loadPinboardPanel } from './panels/pinboard.js';
import {
  WORKSPACE_PANEL_ID,
  openWorkspacePanel,
  loadWorkspaces,
  filterTabBar,
  getIconSvg,
  switchWorkspace,
  setWorkspacesRender,
} from './panels/workspaces.js';
// Importing tab-context-menu installs window.__tandemShowTabContextMenu as a
// side effect; moveTabToWorkspace is passed to initDragDrop below.
import { moveTabToWorkspace } from './tab-context-menu.js';

  // ═══════════════════════════════════════
  // SIDEBAR
  // ═══════════════════════════════════════
  const ocSidebar = (() => {

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
      } else if (newActive === WORKSPACE_PANEL_ID) {
        openWorkspacePanel();
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

    function init() {
      // Let the workspaces panel module trigger re-renders here when it
      // mutates workspace state (create/edit/delete/switch).
      setWorkspacesRender(render);

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
        const shellPath = window.location.href.replace(/\/[^/]*$/, '');
        if (window.tandem && window.tandem.newTab) {
          window.tandem.newTab(shellPath + '/help.html');
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

    return { init, loadConfig, activateItem, toggleVisibility };
  })();


// Expose ocSidebar on window so classic scripts (shortcut-router.js) can reach it.
window.ocSidebar = ocSidebar;
  document.addEventListener('DOMContentLoaded', () => ocSidebar.init());
