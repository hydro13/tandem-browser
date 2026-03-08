(() => {
    const renderer = window.__tandemRenderer;
    if (!renderer) {
      console.error('[main] Missing renderer bridge');
      return;
    }

    function getActiveTabId() {
      return renderer.getActiveTabId();
    }

    // ═══════════════════════════════════════════════
    // Platform detection & Chrome-style title bar setup
    // ═══════════════════════════════════════════════

    (async () => {
      const platform = await window.tandem?.getPlatform?.() || 'unknown';
      document.body.classList.add(`platform-${platform}`);
    })();

    const btnAppMenu = document.getElementById('btn-app-menu');
    if (btnAppMenu) {
      btnAppMenu.addEventListener('click', () => {
        if (!window.tandem) return;
        const rect = btnAppMenu.getBoundingClientRect();
        window.tandem.showAppMenu(Math.round(rect.left), Math.round(rect.bottom));
      });
    }

    const btnMinimize = document.getElementById('btn-window-minimize');
    const btnMaximize = document.getElementById('btn-window-maximize');
    const btnClose = document.getElementById('btn-window-close');

    if (btnMinimize) {
      btnMinimize.addEventListener('click', () => {
        if (window.tandem) window.tandem.minimizeWindow();
      });
    }

    if (btnMaximize) {
      btnMaximize.addEventListener('click', () => {
        if (window.tandem) window.tandem.maximizeWindow();
      });
    }

    if (btnClose) {
      btnClose.addEventListener('click', () => {
        if (window.tandem) window.tandem.closeWindow();
      });
    }

    const tabBarEl = document.getElementById('tab-bar');
    if (tabBarEl) {
      tabBarEl.addEventListener('dblclick', (event) => {
        if (event.target === tabBarEl || event.target.classList.contains('tab-bar-spacer')) {
          if (window.tandem) window.tandem.maximizeWindow();
        }
      });
    }

    async function updateMaximizeButton() {
      if (!btnMaximize || !window.tandem?.isWindowMaximized) return;

      const isMaximized = await window.tandem.isWindowMaximized();
      if (isMaximized) {
        btnMaximize.innerHTML = '<svg viewBox="0 0 10 10"><path d="M2,2 L8,2 L8,8 L2,8 Z M3,3 L3,7 L7,7 L7,3 Z M3,1 L9,1 L9,7 M1,3 L1,9 L7,9" stroke="currentColor" fill="none" stroke-width="1" /></svg>';
        btnMaximize.title = 'Restore';
      } else {
        btnMaximize.innerHTML = '<svg viewBox="0 0 10 10"><path d="M0,0 L10,0 L10,10 L0,10 Z M1,1 L1,9 L9,9 L9,1 Z" /></svg>';
        btnMaximize.title = 'Maximize';
      }
    }

    let resizeTimeout;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(updateMaximizeButton, 100);
    });
    updateMaximizeButton();

    // ═══════════════════════════════════════════════
    // Keyboard shortcuts (from main process)
    // ═══════════════════════════════════════════════

    if (window.tandem) {
      window.tandem.onShortcut((action) => {
        if (action === 'new-tab') {
          window.tandem.newTab();
        } else if (action === 'close-tab') {
          const activeTabId = getActiveTabId();
          if (activeTabId) window.tandem.closeTab(activeTabId);
        } else if (action === 'quick-screenshot') {
          window.tandem.quickScreenshot();
        } else if (action === 'open-settings') {
          window.openSettings?.();
        } else if (action === 'bookmark-page') {
          window.openBookmarkPopup?.();
        } else if (action === 'toggle-bookmarks-bar') {
          window.toggleBookmarksBar?.();
        } else if (action === 'find-in-page') {
          window.toggleFindBar?.(true);
        } else if (action === 'open-history') {
          window.openHistoryPage?.();
        } else if (action === 'open-bookmarks') {
          if (typeof ocSidebar !== 'undefined') ocSidebar.activateItem('bookmarks');
        } else if (action === 'show-about') {
          renderAboutPanel();
        } else if (action === 'show-shortcuts') {
          showShortcutsOverlay();
        } else if (action === 'zoom-in') {
          window.changeZoom?.('in');
        } else if (action === 'zoom-out') {
          window.changeZoom?.('out');
        } else if (action === 'zoom-reset') {
          window.changeZoom?.('reset');
        } else if (action.startsWith('focus-tab-')) {
          const index = parseInt(action.replace('focus-tab-', ''), 10);
          window.tandem.focusTabByIndex(index);
        } else if (action === 'claronote-record') {
          document.querySelectorAll('.panel-tab').forEach((button) => button.classList.remove('active'));
          document.querySelector('[data-panel-tab="claronote"]').classList.add('active');
          document.getElementById('panel-activity').style.display = 'none';
          document.getElementById('panel-chat').style.display = 'none';
          document.getElementById('panel-screenshots').style.display = 'none';
          document.getElementById('panel-claronote').style.display = 'flex';

          if (!document.getElementById('wingman-panel').classList.contains('open')) {
            document.getElementById('wingman-panel').classList.add('open');
            if (typeof window.updatePanelLayout === 'function') {
              window.updatePanelLayout();
            }
          }

          if (typeof window.initClaroNote === 'function') {
            window.initClaroNote().then(() => {
              if (typeof window.toggleClaroNoteRecording === 'function') {
                window.toggleClaroNoteRecording();
              }
            });
          }
        } else if (action === 'voice-input') {
          window.tandem.toggleVoice();
        } else if (action === 'show-onboarding') {
          showOnboarding();
        }
      });
    }

})();
