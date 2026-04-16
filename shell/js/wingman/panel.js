/**
 * Wingman panel shell — DOM refs, tab switching, open/toggle, resize drag,
 * layout sync with webview.
 *
 * Loaded from: shell/js/wingman/index.js
 * window exports: openWingmanPanel, toggleWingmanPanel, updatePanelLayout
 *   (set inside initPanel so classic scripts + main-process IPC can call them).
 *
 * initPanel return shape: { openWingmanPanel, toggleWingmanPanel,
 *   updatePanelLayout, setActivePanelTab, isWingmanPanelOpen, panelToggleBtn,
 *   wingmanBadge } — exposed so index.js (handoff layer) can reuse the refs.
 */

export function initPanel({ hooks = {} } = {}) {
  const {
    getPreferredTabOnOpen = () => 'chat',
    onPanelOpened = () => {},
    onPanelClosed = () => {},
  } = hooks;

  const wingmanPanel = document.getElementById('wingman-panel');
  const panelToggleBtn = document.getElementById('wingman-panel-toggle');
  const resizeHandle = document.getElementById('panel-resize');
  const webviewContainer = document.getElementById('webview-container');
  const wingmanBadge = document.querySelector('.wingman-badge');

  let resizing = false;

  // Restore saved panel width
  const savedPanelWidth = localStorage.getItem('wingman-panel-width');
  if (savedPanelWidth) {
    const w = parseInt(savedPanelWidth, 10);
    if (w >= 280 && w <= 700) wingmanPanel.style.width = w + 'px';
  }

  function isWingmanPanelOpen() {
    return wingmanPanel.classList.contains('open');
  }

  function setActivePanelTab(tab) {
    document.querySelectorAll('.panel-tab').forEach(b => b.classList.remove('active'));
    const targetButton = document.querySelector(`[data-panel-tab="${tab}"]`);
    if (targetButton) {
      targetButton.classList.add('active');
    }
    document.getElementById('panel-activity').style.display = tab === 'activity' ? 'flex' : 'none';
    document.getElementById('panel-chat').style.display = tab === 'chat' ? 'flex' : 'none';
    if (tab === 'chat') {
      window.chatRouter?.ensureConnected();
    }
    document.getElementById('panel-screenshots').style.display = tab === 'screenshots' ? 'flex' : 'none';
  }

  function updatePanelLayout() {
    const isOpen = wingmanPanel.classList.contains('open');
    const pw = wingmanPanel.offsetWidth;
    if (isOpen) {
      webviewContainer.style.marginRight = pw + 'px';
      resizeHandle.style.right = pw + 'px';
      resizeHandle.style.display = 'block';
      panelToggleBtn.textContent = '▶';
      panelToggleBtn.style.right = pw + 'px';
      wingmanBadge.classList.add('panel-open');
    } else {
      webviewContainer.style.marginRight = '0';
      resizeHandle.style.display = 'none';
      panelToggleBtn.textContent = '◀';
      panelToggleBtn.style.right = '0';
      wingmanBadge.classList.remove('panel-open');
    }
    // Sync panel open state to backend so notifications are suppressed when panel is visible
    if (window.tandem?.setPanelOpen) window.tandem.setPanelOpen(isOpen);
  }

  function openWingmanPanel(preferredTab) {
    if (!wingmanPanel.classList.contains('open')) {
      wingmanPanel.classList.add('open');
    }
    setActivePanelTab(preferredTab || getPreferredTabOnOpen());
    updatePanelLayout();
    onPanelOpened();
  }

  function toggleWingmanPanel() {
    if (wingmanPanel.classList.contains('open')) {
      wingmanPanel.classList.remove('open');
      updatePanelLayout();
      onPanelClosed();
    } else {
      openWingmanPanel();
    }
  }

  // Panel tab switching
  document.querySelectorAll('.panel-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      setActivePanelTab(btn.dataset.panelTab);
      // ClaroNote disabled — decoupled, coming in a later update
      // document.getElementById('panel-claronote').style.display = tab === 'claronote' ? 'flex' : 'none';
      // if (tab === 'claronote') { window.initClaroNote?.(); }
    });
  });

  // Panel toggle from main process
  if (window.tandem) {
    window.tandem.onPanelToggle((data) => {
      if (data.open) {
        openWingmanPanel();
      } else {
        wingmanPanel.classList.remove('open');
        updatePanelLayout();
        onPanelClosed();
      }
    });
  }

  // Listen for transition end to update layout smoothly
  wingmanPanel.addEventListener('transitionend', updatePanelLayout);

  // Toggle button click
  panelToggleBtn.addEventListener('click', toggleWingmanPanel);

  // Wingman badge single click toggles panel. The long-press-to-settings
  // timer lives in index.js; its mouseup/mouseleave listeners (registered
  // in index.js after initPanel) clear the long-press timer before the
  // click event reaches us — browser event order on a physical click is
  // mousedown → mouseup → click regardless of listener registration order.
  wingmanBadge.addEventListener('click', () => {
    toggleWingmanPanel();
  });

  resizeHandle.addEventListener('mousedown', (e) => {
    resizing = true;
    resizeHandle.classList.add('dragging');
    wingmanPanel.style.transition = 'none';
    e.preventDefault();
  });
  document.addEventListener('mousemove', (e) => {
    if (!resizing) return;
    const panelWidth = window.innerWidth - e.clientX;
    if (panelWidth >= 280 && panelWidth <= 700) {
      wingmanPanel.style.width = panelWidth + 'px';
      webviewContainer.style.marginRight = panelWidth + 'px';
      resizeHandle.style.right = panelWidth + 'px';
      panelToggleBtn.style.right = panelWidth + 'px';
    }
  });
  document.addEventListener('mouseup', () => {
    if (resizing) {
      resizing = false;
      resizeHandle.classList.remove('dragging');
      wingmanPanel.style.transition = '';
      localStorage.setItem('wingman-panel-width', wingmanPanel.offsetWidth);
    }
  });

  // Initial layout
  updatePanelLayout();

  window.openWingmanPanel = openWingmanPanel;
  window.toggleWingmanPanel = toggleWingmanPanel;
  window.updatePanelLayout = updatePanelLayout;

  return {
    openWingmanPanel,
    toggleWingmanPanel,
    updatePanelLayout,
    setActivePanelTab,
    isWingmanPanelOpen,
    panelToggleBtn,
    wingmanBadge,
  };
}
