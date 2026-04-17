/**
 * Sidebar workspaces panel — workspace list, create/edit/delete form, icon
 * grid, and tab-bar filtering by active workspace.
 *
 * All workspace I/O talks to the localhost:8765 HTTP API. Workspace state is
 * kept in config.js (getWorkspaces/setWorkspaces/getActiveWorkspaceId); this
 * module is a view over that state plus the tab-bar filter side-effect.
 *
 * The sidebar's render() is needed here to refresh the workspace icon strip
 * after mutations. Since panels/workspaces.js can't import from the index
 * (circular), index.js injects its render() via setWorkspacesRender() during
 * init(). Calls before init are no-ops, which is fine — nothing mutates
 * workspaces before the DOM is ready.
 *
 * Loaded from: shell/js/sidebar/index.js
 * window exports: none
 */

import { WORKSPACE_ICONS } from '../constants.js';
import {
  getToken,
  getConfig,
  setSetupPanelOpen,
  getWorkspaces, setWorkspaces,
  getActiveWorkspaceId, setActiveWorkspaceId,
} from '../config.js';
import { hideWebviews, safeSetPanelHTML } from '../webview.js';
import { getPanelWidth, setPanelWidth } from '../panel-resize.js';

// The sidebar panel id used when the workspaces panel is open. Not routed
// through activateItem — index.js's click handler calls openWorkspacePanel
// directly — but exported so callers have a stable reference.
export const WORKSPACE_PANEL_ID = '__workspaces';

// Injected by index.js during init() so the workspaces module can re-render
// the sidebar icon strip after mutations without importing from index.
let _render = () => {};
export function setWorkspacesRender(fn) { _render = fn; }

export function getIconSvg(slug) {
  if (WORKSPACE_ICONS[slug]) return WORKSPACE_ICONS[slug];
  // If the slug isn't a known icon name, render it directly (supports emoji icons)
  if (slug && typeof slug === 'string' && slug.trim()) {
    return `<span class="workspace-emoji-icon">${slug}</span>`;
  }
  return WORKSPACE_ICONS.home;
}

export async function loadWorkspaces() {
  try {
    const r = await fetch('http://localhost:8765/workspaces', { headers: { Authorization: `Bearer ${getToken()}` } });
    const data = await r.json();
    if (data.ok) {
      setWorkspaces(data.workspaces);
      setActiveWorkspaceId(data.activeId);
      _render();
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
      _render();
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
      <input type="text" class="ws-form-input" id="ws-form-name" placeholder="${getNextWorkspaceName()}" />
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
  nameInput.value = defaultName;
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
          _render();
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
          _render();
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

export function filterTabBar() {
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

export async function openWorkspacePanel() {
  setSetupPanelOpen(false);
  getConfig().activeItemId = WORKSPACE_PANEL_ID;
  const panel = document.getElementById('sidebar-panel');
  const titleEl = document.getElementById('sidebar-panel-title');
  const content = document.getElementById('sidebar-panel-content');

  titleEl.textContent = 'Workspaces';
  panel.classList.add('open');
  setPanelWidth(getPanelWidth(WORKSPACE_PANEL_ID));

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

// Exposed so index.js's click handler can invoke workspace switching from
// the sidebar icon strip without going through openWorkspacePanel.
export { switchWorkspace };
