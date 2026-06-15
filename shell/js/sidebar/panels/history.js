/**
 * Sidebar history panel — recent-page list, per-term search, sync-device tabs.
 *
 * Loaded from: shell/js/sidebar/index.js (via activateItem when 'history' is selected)
 * window exports: none
 */

import { getToken } from '../config.js';
import { hideWebviews, safeSetPanelHTML } from '../webview.js';
import { escapeHtml, getFaviconUrl, wireFaviconFallbacks } from '../util.js';

// === HISTORY PANEL MODULE ===
export async function loadHistoryPanel() {
  const content = document.getElementById('sidebar-panel-content');
  hideWebviews();
  content.classList.remove('webview-mode');

  safeSetPanelHTML(`
    <div class="history-panel">
      <div class="history-search-wrap">
        <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clip-rule="evenodd"/></svg>
        <input class="history-search" id="history-search" type="text" placeholder="Search history…">
      </div>
      <div class="history-list" id="history-list">
        <div class="bm-empty">Loading…</div>
      </div>
      <div id="sync-devices-section" style="display:none">
        <div class="history-section-header">Your Devices</div>
        <div id="sync-devices-list"></div>
      </div>
    </div>`);

  // Fetch history
  try {
    const res = await fetch('http://localhost:8765/history', { headers: { Authorization: `Bearer ${getToken()}` } });
    const data = await res.json();
    const entries = data.entries || [];
    const listEl = document.getElementById('history-list');
    if (listEl) {
      listEl.innerHTML = renderHistoryItems(entries);
      attachHistoryClickHandlers(listEl);
    }
  } catch (e) {
    const listEl = document.getElementById('history-list');
    if (listEl) listEl.innerHTML = '<div class="bm-empty">Failed to load history</div>';
  }

  // Search handler
  let historySearchTimer;
  document.getElementById('history-search')?.addEventListener('input', async (e) => {
    clearTimeout(historySearchTimer);
    const q = e.target.value.trim();
    if (!q) {
      const res = await fetch('http://localhost:8765/history', { headers: { Authorization: `Bearer ${getToken()}` } });
      const data = await res.json();
      const listEl = document.getElementById('history-list');
      if (listEl) { listEl.innerHTML = renderHistoryItems(data.entries || []); attachHistoryClickHandlers(listEl); }
      return;
    }
    historySearchTimer = setTimeout(async () => {
      const res = await fetch(`http://localhost:8765/history/search?q=${encodeURIComponent(q)}`, { headers: { Authorization: `Bearer ${getToken()}` } });
      const data = await res.json();
      const listEl = document.getElementById('history-list');
      if (listEl) { listEl.innerHTML = renderHistoryItems(data.results || []); attachHistoryClickHandlers(listEl); }
    }, 250);
  });

  // Load sync devices
  loadSyncDevices();
}

// Exported for tests: titles and URLs are page-controlled, so both the text
// and the attribute positions must be escaped.
export function renderHistoryItems(entries) {
  if (!entries || entries.length === 0) return '<div class="bm-empty">No history</div>';
  return entries.slice(0, 200).map(e => {
    const fav = e.url ? getFaviconUrl(e.url) : null;
    const img = fav ? `<img src="${escapeHtml(fav)}" data-favicon>` : '';
    const title = escapeHtml(e.title || e.url || 'Untitled');
    const url = escapeHtml(e.url || '');
    return `<div class="bm-item url" data-url="${url}">
      <div class="bm-icon">${img}</div>
      <span class="bm-name" title="${url}">${title}</span>
    </div>`;
  }).join('');
}

function attachHistoryClickHandlers(listEl) {
  wireFaviconFallbacks(listEl);
  listEl.querySelectorAll('.bm-item.url').forEach(el => {
    el.addEventListener('click', () => {
      const url = el.dataset.url;
      if (url && window.tandem) window.tandem.newTab(url);
    });
  });
}

async function loadSyncDevices() {
  const section = document.getElementById('sync-devices-section');
  const list = document.getElementById('sync-devices-list');
  if (!section || !list) return;

  try {
    const res = await fetch('http://localhost:8765/sync/devices', { headers: { Authorization: `Bearer ${getToken()}` } });
    const data = await res.json();
    const devices = data.devices || [];
    if (!devices.length) { section.style.display = 'none'; return; }

    section.style.display = 'block';
    let html = '';
    for (const device of devices) {
      html += `<div class="sync-device-name">${escapeHtml(device.name)}</div>`;
      for (const tab of (device.tabs || [])) {
        const fav = tab.url ? getFaviconUrl(tab.url) : null;
        const img = fav ? `<img class="sync-tab-favicon" src="${escapeHtml(fav)}" data-favicon>` : '<div class="sync-tab-favicon"></div>';
        const title = escapeHtml(tab.title || tab.url || 'Untitled');
        const truncUrl = (tab.url || '').length > 60 ? tab.url.substring(0, 60) + '…' : (tab.url || '');
        html += `<div class="sync-tab-item" data-url="${escapeHtml(tab.url || '')}" title="${escapeHtml(truncUrl)}">
          ${img}
          <span class="sync-tab-title">${title}</span>
        </div>`;
      }
    }
    list.innerHTML = html;
    wireFaviconFallbacks(list);
    list.querySelectorAll('.sync-tab-item').forEach(el => {
      el.addEventListener('click', () => {
        const url = el.dataset.url;
        if (url && window.tandem) window.tandem.newTab(url);
      });
    });
  } catch {
    section.style.display = 'none';
  }
}
