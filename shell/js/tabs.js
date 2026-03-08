(() => {
    function escapeHtml(s) {
      return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
    }

    const tabBar = document.getElementById('tab-bar');
    const btnNewTab = document.getElementById('btn-new-tab');
    const urlBar = document.getElementById('url-bar');
    const statusDot = document.getElementById('status-dot');
    const container = document.getElementById('webview-container');
    const overlay = document.getElementById('wingman-overlay');

    /** Map of tabId -> { webview, tabEl } */
    const tabs = new Map();
    let activeTabId = null;
    let updateTabMeta = baseUpdateTabMeta;
    const activeTabListeners = new Set();
    const tabZoomLevels = new Map();
    let zoomIndicatorTimeout = null;

    function notifyActiveTabChanged(tabId) {
      for (const listener of activeTabListeners) {
        try {
          listener(tabId);
        } catch (error) {
          console.error('[tabs] Active tab listener failed:', error);
        }
      }
    }

    function onActiveTabChanged(listener) {
      activeTabListeners.add(listener);
      return () => activeTabListeners.delete(listener);
    }

    function getTabUrl(entry) {
      if (!entry) return '';
      try {
        return entry.webview.getURL() || '';
      } catch {
        return '';
      }
    }

    function updateStatusDotForTab(tabId) {
      const entry = tabs.get(tabId);
      if (!entry) {
        statusDot.classList.remove('loading');
        return;
      }

      try {
        statusDot.classList.toggle('loading', entry.webview.isLoading());
      } catch {
        statusDot.classList.remove('loading');
      }
    }

    function focusRendererTab(tabId) {
      for (const [id, entry] of tabs) {
        entry.webview.classList.toggle('active', id === tabId);
        entry.tabEl.classList.toggle('active', id === tabId);
      }

      activeTabId = tabId;

      const entry = tabs.get(tabId);
      if (entry) {
        urlBar.value = getTabUrl(entry);
        const zoomLevel = tabZoomLevels.get(tabId) || 0;
        try {
          entry.webview.setZoomLevel(zoomLevel);
        } catch {
          // Webview may not be ready yet during initial shell bootstrap.
        }
      } else {
        urlBar.value = '';
      }

      updateStatusDotForTab(tabId);
      notifyActiveTabChanged(tabId);
    }

    function buildTabElement(tabId) {
      const tabEl = document.createElement('div');
      tabEl.className = 'tab';
      tabEl.dataset.tabId = tabId;
      tabEl.draggable = true;
      tabEl.innerHTML = `
        <span class="tab-source" title="You controlled">👤</span>
        <span class="group-dot" style="display:none"></span>
        <img class="tab-favicon" src="" style="display:none">
        <span class="tab-title">New Tab</span>
        <button class="tab-close" title="Close tab">✕</button>
      `;

      tabEl.addEventListener('click', (event) => {
        if (event.target.classList.contains('tab-close')) return;
        const currentTabId = tabEl.dataset.tabId;
        if (currentTabId && window.tandem) {
          window.tandem.focusTab(currentTabId);
        }
      });

      tabEl.addEventListener('contextmenu', (event) => {
        event.preventDefault();
        if (window.__tandemShowTabContextMenu) {
          window.__tandemShowTabContextMenu(tabEl.dataset.tabId, event.clientX, event.clientY);
        }
      });

      tabEl.addEventListener('dragstart', (event) => {
        event.dataTransfer.setData('text/tab-id', tabEl.dataset.tabId);
        event.dataTransfer.effectAllowed = 'move';
      });

      tabEl.querySelector('.tab-close').addEventListener('click', () => {
        const currentTabId = tabEl.dataset.tabId;
        if (currentTabId && window.tandem) {
          window.tandem.closeTab(currentTabId);
        }
      });

      return tabEl;
    }

    function wireActivityEvents(webview, getTabId) {
      webview.addEventListener('did-navigate', (event) => {
        const tabId = getTabId();
        if (tabId && window.tandem) {
          window.tandem.sendWebviewEvent({ type: 'did-navigate', url: event.url, tabId });
        }
      });

      webview.addEventListener('did-navigate-in-page', (event) => {
        const tabId = getTabId();
        if (event.isMainFrame && tabId && window.tandem) {
          window.tandem.sendWebviewEvent({ type: 'did-navigate-in-page', url: event.url, tabId });
        }
      });

      webview.addEventListener('did-finish-load', () => {
        const tabId = getTabId();
        if (tabId && window.tandem) {
          window.tandem.sendWebviewEvent({
            type: 'did-finish-load',
            url: webview.getURL(),
            title: webview.getTitle(),
            tabId,
          });
        }
      });

      webview.addEventListener('did-start-loading', () => {
        const tabId = getTabId();
        if (tabId === activeTabId) {
          statusDot.classList.add('loading');
        }
        if (tabId && window.tandem) {
          window.tandem.sendWebviewEvent({ type: 'loading-start', tabId });
        }
      });

      webview.addEventListener('did-stop-loading', () => {
        const tabId = getTabId();
        if (tabId === activeTabId) {
          statusDot.classList.remove('loading');
        }
        if (tabId && window.tandem) {
          window.tandem.sendWebviewEvent({ type: 'loading-stop', tabId });
        }
      });
    }

    function attachWebviewEvents(webview, getTabId) {
      webview.addEventListener('did-navigate', (event) => updateTabMeta(getTabId(), { url: event.url }));
      webview.addEventListener('did-navigate-in-page', (event) => {
        if (event.isMainFrame) {
          updateTabMeta(getTabId(), { url: event.url });
        }
      });
      webview.addEventListener('page-title-updated', (event) => updateTabMeta(getTabId(), { title: event.title }));
      webview.addEventListener('page-favicon-updated', (event) => {
        if (event.favicons && event.favicons.length > 0) {
          updateTabMeta(getTabId(), { favicon: event.favicons[0] });
        }
      });

      wireActivityEvents(webview, getTabId);
    }

    function createRendererTab(tabId, url, partition = 'persist:tandem', options = {}) {
      const webview = document.createElement('webview');
      webview.setAttribute('src', url);
      webview.setAttribute('allowpopups', '');
      webview.setAttribute('partition', partition);
      webview.dataset.tabId = tabId;
      container.appendChild(webview);

      const tabEl = buildTabElement(tabId);
      tabBar.insertBefore(tabEl, btnNewTab);

      const entry = { webview, tabEl };
      tabs.set(tabId, entry);

      attachWebviewEvents(webview, () => webview.dataset.tabId);

      if (options.active) {
        focusRendererTab(tabId);
      }

      return entry;
    }

    function cleanupTabDom(tabId) {
      const entry = tabs.get(tabId);
      if (!entry) return false;

      try { entry.webview.remove(); } catch { /* best effort */ }
      try { entry.tabEl.remove(); } catch { /* best effort */ }
      tabs.delete(tabId);
      return true;
    }

    function baseUpdateTabMeta(tabId, data) {
      const entry = tabs.get(tabId);
      if (!entry) return;

      if (data.title) {
        entry.tabEl.querySelector('.tab-title').textContent = data.title;
        if (tabId === activeTabId) {
          document.title = `${data.title} — Tandem`;
        }
      }

      if (data.url && tabId === activeTabId) {
        urlBar.value = data.url;
      }

      if (data.favicon) {
        const img = entry.tabEl.querySelector('.tab-favicon');
        img.src = data.favicon;
        img.style.display = '';
      }

      if (window.tandem) {
        window.tandem.sendTabUpdate({ tabId, ...data });
      }
    }

    function showZoomIndicator(zoomLevel) {
      let indicator = document.getElementById('zoom-indicator');
      if (!indicator) {
        indicator = document.createElement('div');
        indicator.id = 'zoom-indicator';
        indicator.style.cssText = `
          position: fixed;
          top: 20px;
          right: 20px;
          background: rgba(0, 0, 0, 0.8);
          color: white;
          padding: 8px 16px;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 600;
          z-index: 9999;
          pointer-events: none;
          backdrop-filter: blur(4px);
          transition: opacity 0.3s ease;
        `;
        document.body.appendChild(indicator);
      }

      const percentage = Math.round(Math.pow(1.2, zoomLevel) * 100);
      indicator.textContent = `${percentage}%`;
      indicator.style.opacity = '1';

      if (zoomIndicatorTimeout) {
        clearTimeout(zoomIndicatorTimeout);
      }

      zoomIndicatorTimeout = setTimeout(() => {
        indicator.style.opacity = '0';
      }, 2000);
    }

    function changeZoom(direction) {
      const entry = tabs.get(activeTabId);
      if (!entry) return;

      const currentZoom = tabZoomLevels.get(activeTabId) || 0;
      let nextZoom = currentZoom;

      if (direction === 'in') {
        nextZoom = Math.min(currentZoom + 1, 5);
      } else if (direction === 'out') {
        nextZoom = Math.max(currentZoom - 1, -5);
      } else if (direction === 'reset') {
        nextZoom = 0;
      }

      if (nextZoom !== currentZoom) {
        tabZoomLevels.set(activeTabId, nextZoom);
        entry.webview.setZoomLevel(nextZoom);
        showZoomIndicator(nextZoom);
      }
    }

    window.__tandemTabs = {
      createTab(tabId, url, partition) {
        const entry = createRendererTab(tabId, url, partition || 'persist:tandem');
        const TAB_INIT_TIMEOUT_MS = 15000;

        return new Promise((resolve, reject) => {
          let settled = false;
          const timer = setTimeout(() => {
            if (settled) return;
            settled = true;
            cleanupTabDom(tabId);
            reject(new Error(`Tab init timeout (${TAB_INIT_TIMEOUT_MS}ms): ${url}`));
          }, TAB_INIT_TIMEOUT_MS);

          entry.webview.addEventListener('dom-ready', () => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            resolve(entry.webview.getWebContentsId());
          }, { once: true });
        });
      },

      removeTab(tabId) {
        cleanupTabDom(tabId);
      },

      getTabIds() {
        return Array.from(tabs.keys());
      },

      cleanupOrphan(tabId) {
        return cleanupTabDom(tabId);
      },

      focusTab(tabId) {
        focusRendererTab(tabId);
      },
    };

    window.__tandemRenderer = {
      escapeHtml,
      overlay,
      urlBar,
      getTabs() {
        return tabs;
      },
      getActiveTabId() {
        return activeTabId;
      },
      getUpdateTabMeta() {
        return updateTabMeta;
      },
      setUpdateTabMeta(next) {
        updateTabMeta = next;
      },
      onActiveTabChanged,
    };

    window.changeZoom = changeZoom;

    document.getElementById('btn-back').onclick = () => {
      const entry = tabs.get(activeTabId);
      if (entry) entry.webview.goBack();
    };

    document.getElementById('btn-forward').onclick = () => {
      const entry = tabs.get(activeTabId);
      if (entry) entry.webview.goForward();
    };

    document.getElementById('btn-reload').onclick = () => {
      const entry = tabs.get(activeTabId);
      if (entry) entry.webview.reload();
    };

    urlBar.addEventListener('focus', () => urlBar.select());
    urlBar.addEventListener('click', () => urlBar.select());
    urlBar.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;

      let url = urlBar.value.trim();
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        if (url.includes('.') && !url.includes(' ')) {
          url = 'https://' + url;
        } else {
          url = 'https://duckduckgo.com/?q=' + encodeURIComponent(url);
        }
      }

      const entry = tabs.get(activeTabId);
      if (entry) {
        entry.webview.loadURL(url);
      }
    });

    btnNewTab.addEventListener('click', () => {
      if (window.tandem) window.tandem.newTab();
    });

    (async () => {
      const shellPath = window.location.href.replace(/\/[^/]*$/, '');
      const initialUrl = shellPath + '/newtab.html';
      const entry = createRendererTab('__initial', initialUrl, 'persist:tandem', { active: true });
      urlBar.value = '';

      entry.webview.addEventListener('dom-ready', () => {
        const wcId = entry.webview.getWebContentsId();
        if (window.tandem) {
          window.tandem.registerTab(wcId, initialUrl);
        }
      }, { once: true });

      if (window.tandem) {
        window.tandem.onTabRegistered((data) => {
          const initialEntry = tabs.get('__initial');
          if (!initialEntry) return;

          tabs.delete('__initial');
          initialEntry.webview.dataset.tabId = data.tabId;
          initialEntry.tabEl.dataset.tabId = data.tabId;
          tabs.set(data.tabId, initialEntry);

          if (activeTabId === '__initial') {
            activeTabId = data.tabId;
            notifyActiveTabChanged(data.tabId);
          }
        });
      }
    })();
})();
