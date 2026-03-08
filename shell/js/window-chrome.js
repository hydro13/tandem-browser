(() => {
    if (!window.__tandemRenderer) {
      console.error('[window-chrome] Missing renderer bridge');
      return;
    }

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
})();
