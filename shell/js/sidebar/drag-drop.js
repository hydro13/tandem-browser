/**
 * Tab drag-and-drop reordering onto workspace icons.
 *
 * Loaded from: shell/js/sidebar/index.js
 * window exports: none
 */

export function initDragDrop({ moveTabToWorkspace }) {
  const itemsEl = document.getElementById('sidebar-items');

  itemsEl.addEventListener('dragover', (e) => {
    const wsBtn = e.target.closest('[data-ws-id]');
    if (!wsBtn) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    wsBtn.classList.add('ws-drop-active');
  });

  itemsEl.addEventListener('dragleave', (e) => {
    const wsBtn = e.target.closest('[data-ws-id]');
    if (wsBtn) wsBtn.classList.remove('ws-drop-active');
  });

  itemsEl.addEventListener('drop', async (e) => {
    e.preventDefault();
    // Remove highlight from all workspace icons
    itemsEl.querySelectorAll('.ws-drop-active').forEach(el => el.classList.remove('ws-drop-active'));

    const wsBtn = e.target.closest('[data-ws-id]');
    if (!wsBtn) return;
    const domTabId = e.dataTransfer.getData('text/tab-id');
    if (!domTabId) return;
    const targetWsId = wsBtn.dataset.wsId;
    await moveTabToWorkspace(domTabId, targetWsId);
  });
}
