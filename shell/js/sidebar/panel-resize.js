/**
 * Left-sidebar panel resize handle.
 *
 * Loaded from: shell/js/sidebar/index.js
 * window exports: none
 */

import { getConfig, getToken } from './config.js';

const DEFAULT_PANEL_WIDTH = 340;
const MIN_PANEL_WIDTH = 180;
const MAX_PANEL_WIDTH = () => window.innerWidth - 100; // always fits any screen

export function getPanelWidth(id) {
  return (getConfig().panelWidths && getConfig().panelWidths[id]) || DEFAULT_PANEL_WIDTH;
}

export function setPanelWidth(width) {
  const panel = document.getElementById('sidebar-panel');
  panel.style.width = width + 'px';
  panel.style.setProperty('--panel-width', width + 'px');
}

async function savePanelWidth(id, width) {
  if (!getConfig().panelWidths) getConfig().panelWidths = {};
  getConfig().panelWidths[id] = width;
  await fetch('http://localhost:8765/sidebar/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
    body: JSON.stringify({ panelWidths: getConfig().panelWidths })
  });
}

export function initPanelResize() {
  // Resize drag logic
  let resizeDragging = false;
  let resizeStartX = 0;
  let resizeStartWidth = 0;
  let resizeActiveId = null;

  const resizeHandle = document.getElementById('sidebar-panel-resize');

  // Drag cover: transparent full-screen div that blocks webviews from eating mouse events
  const dragCover = document.createElement('div');
  dragCover.style.cssText = 'position:fixed;inset:0;z-index:9999;cursor:ew-resize;display:none;';
  document.body.appendChild(dragCover);

  resizeHandle.addEventListener('mousedown', (e) => {
    e.preventDefault();
    resizeDragging = true;
    resizeStartX = e.clientX;
    const panel = document.getElementById('sidebar-panel');
    resizeStartWidth = panel.offsetWidth;
    resizeActiveId = getConfig().activeItemId;
    resizeHandle.classList.add('dragging');
    document.body.style.userSelect = 'none';
    dragCover.style.display = 'block'; // block webview mouse capture
  });

  document.addEventListener('mousemove', (e) => {
    if (!resizeDragging) return;
    const delta = e.clientX - resizeStartX;
    const newWidth = Math.min(MAX_PANEL_WIDTH(), Math.max(MIN_PANEL_WIDTH, resizeStartWidth + delta));
    setPanelWidth(newWidth);
  });

  document.addEventListener('mouseup', async (e) => {
    if (!resizeDragging) return;
    resizeDragging = false;
    resizeHandle.classList.remove('dragging');
    document.body.style.userSelect = '';
    dragCover.style.display = 'none'; // restore webview interaction
    if (resizeActiveId) {
      const panel = document.getElementById('sidebar-panel');
      await savePanelWidth(resizeActiveId, panel.offsetWidth);
    }
  });
}
