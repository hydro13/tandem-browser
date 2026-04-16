/**
 * Sidebar setup panel — toggle which sidebar items are shown.
 *
 * Loaded from: shell/js/sidebar/index.js
 * window exports: none
 */

import { ICONS } from '../constants.js';
import { getConfig, setConfig, setSetupPanelOpen, getToken } from '../config.js';

const SETUP_SECTIONS = [
  { title: 'Workspaces',        ids: ['workspaces'] },
  { title: 'Communication',     ids: ['calendar','gmail','whatsapp','telegram','discord','slack','instagram','x'] },
  { title: 'Browser Utilities', ids: ['pinboards','bookmarks','history'] },
];

export function createSetupPanel({ hideWebviews, safeSetPanelHTML, render }) {
  function renderSetupPanel(items) {
    const panel = document.getElementById('sidebar-panel');
    const titleEl = document.getElementById('sidebar-panel-title');
    const content = document.getElementById('sidebar-panel-content');

    setSetupPanelOpen(true);
    getConfig().activeItemId = null;
    titleEl.textContent = 'Sidebar Setup';
    panel.classList.add('open');

    // Detach cached webviews before innerHTML wipe (preserve login state)
    hideWebviews();
    content.classList.remove('webview-mode');

    const rows = SETUP_SECTIONS.map((section, si) => {
      const itemRows = section.ids.map(id => {
        const item = items.find(i => i.id === id);
        if (!item) return '';
        const icon = ICONS[id];
        const iconHtml = `<div class="setup-item-icon-sm" style="background:rgba(255,255,255,0.08)">${icon ? icon.svg : ''}</div>`;
        return `
            <div class="setup-item">
              ${iconHtml}
              <span class="setup-item-label">${item.label}</span>
              <label class="toggle-switch">
                <input type="checkbox" data-item-id="${id}" ${item.enabled ? 'checked' : ''}>
                <span class="toggle-slider"></span>
              </label>
            </div>`;
      }).join('');
      const sep = si < SETUP_SECTIONS.length - 1 ? '<div class="setup-separator"></div>' : '';
      return `<p class="setup-section-title">${section.title}</p>${itemRows}${sep}`;
    }).join('');

    safeSetPanelHTML(rows);

    // Toggle handlers
    content.querySelectorAll('input[data-item-id]').forEach(input => {
      input.addEventListener('change', async (e) => {
        const id = e.target.dataset.itemId;
        await fetch(`http://localhost:8765/sidebar/items/${id}/toggle`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${getToken()}` }
        });
        const r = await fetch('http://localhost:8765/sidebar/config', {
          headers: { Authorization: `Bearer ${getToken()}` }
        });
        const data = await r.json();
        setConfig(data.config);
        render();
      });
    });
  }

  return { renderSetupPanel };
}
