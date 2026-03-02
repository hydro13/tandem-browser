    function escapeHtml(s) {
      return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
    }

    // ═══════════════════════════════════════════════
    // Platform detection & Chrome-style title bar setup
    // ═══════════════════════════════════════════════

    // Detect platform and add class to body for CSS targeting
    (async () => {
      const platform = await window.tandem?.getPlatform?.() || 'unknown';
      document.body.classList.add(`platform-${platform}`);
    })();

    // Hamburger menu button
    const btnAppMenu = document.getElementById('btn-app-menu');
    if (btnAppMenu) {
      btnAppMenu.addEventListener('click', (e) => {
        if (window.tandem) {
          const rect = btnAppMenu.getBoundingClientRect();
          window.tandem.showAppMenu(Math.round(rect.left), Math.round(rect.bottom));
        }
      });
    }

    // Window control buttons (Linux/Windows)
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

    // Double-click on tab bar (empty areas) to maximize/restore
    const tabBarEl = document.getElementById('tab-bar');
    if (tabBarEl) {
      tabBarEl.addEventListener('dblclick', (e) => {
        // Only trigger if clicking on the tab bar itself (not on tabs or buttons)
        if (e.target === tabBarEl || e.target.classList.contains('tab-bar-spacer')) {
          if (window.tandem) window.tandem.maximizeWindow();
        }
      });
    }

    // Update maximize button icon when window state changes
    async function updateMaximizeButton() {
      if (btnMaximize && window.tandem?.isWindowMaximized) {
        const isMaximized = await window.tandem.isWindowMaximized();
        if (isMaximized) {
          // Restore icon (two overlapping squares)
          btnMaximize.innerHTML = '<svg viewBox="0 0 10 10"><path d="M2,2 L8,2 L8,8 L2,8 Z M3,3 L3,7 L7,7 L7,3 Z M3,1 L9,1 L9,7 M1,3 L1,9 L7,9" stroke="currentColor" fill="none" stroke-width="1" /></svg>';
          btnMaximize.title = 'Restore';
        } else {
          // Maximize icon (single square)
          btnMaximize.innerHTML = '<svg viewBox="0 0 10 10"><path d="M0,0 L10,0 L10,10 L0,10 Z M1,1 L1,9 L9,9 L9,1 Z" /></svg>';
          btnMaximize.title = 'Maximize';
        }
      }
    }

    // Update on resize with debounce
    let resizeTimeout;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(updateMaximizeButton, 100);
    });

    // Initial update
    updateMaximizeButton();

    // ═══════════════════════════════════════════════
    // Tab management system (renderer side)
    // ═══════════════════════════════════════════════

    const tabBar = document.getElementById('tab-bar');
    const btnNewTab = document.getElementById('btn-new-tab');
    const urlBar = document.getElementById('url-bar');
    const statusDot = document.getElementById('status-dot');
    const container = document.getElementById('webview-container');
    const overlay = document.getElementById('wingman-overlay');

    /** Map of tabId → { webview, tabEl } */
    const tabs = new Map();
    let activeTabId = null;

    /**
     * Exposed to main process via window.__tandemTabs
     * TabManager calls these via executeJavaScript
     */
    window.__tandemTabs = {
      /** Create a new webview, return its webContentsId */
      createTab(tabId, url, partition) {
        partition = partition || 'persist:tandem';
        const wv = document.createElement('webview');
        wv.setAttribute('src', url);
        wv.setAttribute('allowpopups', '');
        wv.setAttribute('partition', partition);
        wv.dataset.tabId = tabId;
        container.appendChild(wv);

        // Create tab bar element
        const tabEl = document.createElement('div');
        tabEl.className = 'tab';
        tabEl.dataset.tabId = tabId;
        tabEl.draggable = true;
        tabEl.innerHTML = `
          <span class="tab-source" title="You controlled">👤</span>
          <span class="group-dot" style="display:none"></span>
          <img class="tab-favicon" src="" style="display:none">
          <span class="tab-title">New Tab</span>
          <button class="tab-close" title="Sluit tab">✕</button>
        `;

        // Click to focus
        tabEl.addEventListener('click', (e) => {
          if (e.target.classList.contains('tab-close')) return;
          if (window.tandem) window.tandem.focusTab(tabId);
        });

        // Right-click context menu (custom DOM menu for workspace move)
        tabEl.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          if (window.__tandemShowTabContextMenu) {
            window.__tandemShowTabContextMenu(tabEl.dataset.tabId, e.clientX, e.clientY);
          }
        });

        // Drag start for workspace drag-and-drop
        tabEl.addEventListener('dragstart', (e) => {
          e.dataTransfer.setData('text/tab-id', tabEl.dataset.tabId);
          e.dataTransfer.effectAllowed = 'move';
        });

        // Close button
        tabEl.querySelector('.tab-close').addEventListener('click', () => {
          if (window.tandem) window.tandem.closeTab(tabId);
        });

        // Insert before the + button
        tabBar.insertBefore(tabEl, btnNewTab);

        tabs.set(tabId, { webview: wv, tabEl });

        // Wire up webview events
        wv.addEventListener('did-navigate', (e) => updateTabMeta(tabId, { url: e.url }));
        wv.addEventListener('did-navigate-in-page', (e) => {
          if (e.isMainFrame) updateTabMeta(tabId, { url: e.url });
        });
        wv.addEventListener('page-title-updated', (e) => updateTabMeta(tabId, { title: e.title }));
        wv.addEventListener('page-favicon-updated', (e) => {
          if (e.favicons && e.favicons.length > 0) {
            updateTabMeta(tabId, { favicon: e.favicons[0] });
          }
        });
        wv.addEventListener('did-start-loading', () => {
          if (tabId === activeTabId) statusDot.classList.add('loading');
        });
        wv.addEventListener('did-stop-loading', () => {
          if (tabId === activeTabId) statusDot.classList.remove('loading');
        });

        // Return webContentsId (available after dom-ready)
        return new Promise((resolve) => {
          wv.addEventListener('dom-ready', () => {
            resolve(wv.getWebContentsId());
          }, { once: true });
        });
      },

      /** Remove a tab */
      removeTab(tabId) {
        const entry = tabs.get(tabId);
        if (!entry) return;
        entry.webview.remove();
        entry.tabEl.remove();
        tabs.delete(tabId);
      },

      /** Focus/show a tab */
      focusTab(tabId) {
        // Hide all webviews, show the target
        for (const [id, entry] of tabs) {
          if (id === tabId) {
            entry.webview.classList.add('active');
            entry.tabEl.classList.add('active');
          } else {
            entry.webview.classList.remove('active');
            entry.tabEl.classList.remove('active');
          }
        }
        activeTabId = tabId;

        // Update URL bar
        const entry = tabs.get(tabId);
        if (entry) {
          try {
            const url = entry.webview.getURL();
            urlBar.value = url || '';
          } catch (_) { }

          // Restore zoom level for this tab
          const zoomLevel = tabZoomLevels.get(tabId) || 0;
          entry.webview.setZoomLevel(zoomLevel);
        }

        // Per-tab canvas visibility: will be handled by draw system
        // Defer to avoid scope issues with redraw() function
        setTimeout(() => {
          const canvas = document.getElementById('draw-canvas');
          const toolbar = document.getElementById('draw-toolbar');

          if (typeof redraw === 'function') {
            if (drawCanvasTabId === tabId && drawEnabled) {
              // Active draw mode on this tab - show canvas and toolbar
              if (canvas) canvas.classList.add('active');
              // Install scroll listener for this tab
              const entry = tabs.get(tabId);
              if (entry && entry.webview) {
                installScrollListener(entry.webview, tabId);
              }
              if (toolbar) toolbar.classList.add('visible');
              redraw(); // Render shapes for this tab
            } else if (typeof tabShapes !== 'undefined' && tabShapes.has(tabId) && tabShapes.get(tabId).length > 0) {
              // This tab has saved shapes (but draw mode might be off) - show canvas only
              if (canvas) canvas.classList.add('active');
              if (toolbar) toolbar.classList.remove('visible');
              // Temporarily set drawCanvasTabId to render this tab's shapes
              const prevTabId = drawCanvasTabId;
              drawCanvasTabId = tabId;
              redraw();
              drawCanvasTabId = prevTabId;
            } else {
              // No shapes and no active draw mode - hide everything
              if (canvas) canvas.classList.remove('active');
              if (toolbar) toolbar.classList.remove('visible');
            }
          }
        }, 0);
      },
    };

    /** Update tab metadata in both UI and main process */
    function updateTabMeta(tabId, data) {
      const entry = tabs.get(tabId);
      if (!entry) return;

      if (data.title) {
        entry.tabEl.querySelector('.tab-title').textContent = data.title;
        if (tabId === activeTabId) document.title = `${data.title} — Tandem`;
      }
      if (data.url && tabId === activeTabId) {
        urlBar.value = data.url;
      }
      if (data.favicon) {
        const img = entry.tabEl.querySelector('.tab-favicon');
        img.src = data.favicon;
        img.style.display = '';
      }

      // Notify main process
      if (window.tandem) {
        window.tandem.sendTabUpdate({ tabId, ...data });
      }
    }

    // ═══════════════════════════════════════════════
    // Initial tab — create on load
    // ═══════════════════════════════════════════════

    (async () => {
      // The initial tab is created by the renderer, then registered with main
      // Determine newtab URL — use file:// path to shell/newtab.html
      const shellPath = window.location.href.replace(/\/[^/]*$/, '');
      const initialUrl = shellPath + '/newtab.html';
      const wv = document.createElement('webview');
      wv.setAttribute('src', initialUrl);
      wv.setAttribute('allowpopups', '');
      wv.setAttribute('partition', 'persist:tandem');
      wv.dataset.tabId = '__initial';
      container.appendChild(wv);

      const tabEl = document.createElement('div');
      tabEl.className = 'tab active';
      tabEl.dataset.tabId = '__initial';
      tabEl.draggable = true;
      tabEl.innerHTML = `
        <span class="tab-source" title="You controlled">👤</span>
        <span class="group-dot" style="display:none"></span>
        <img class="tab-favicon" src="" style="display:none">
        <span class="tab-title">New Tab</span>
        <button class="tab-close" title="Sluit tab">✕</button>
      `;
      tabBar.insertBefore(tabEl, btnNewTab);

      wv.classList.add('active');
      activeTabId = '__initial';
      urlBar.value = '';

      tabs.set('__initial', { webview: wv, tabEl });

      // Wire up events
      wv.addEventListener('did-navigate', (e) => updateTabMeta('__initial', { url: e.url }));
      wv.addEventListener('did-navigate-in-page', (e) => {
        if (e.isMainFrame) updateTabMeta('__initial', { url: e.url });
      });
      wv.addEventListener('page-title-updated', (e) => updateTabMeta('__initial', { title: e.title }));
      wv.addEventListener('page-favicon-updated', (e) => {
        if (e.favicons && e.favicons.length > 0) updateTabMeta('__initial', { favicon: e.favicons[0] });
      });
      wv.addEventListener('did-start-loading', () => statusDot.classList.add('loading'));
      wv.addEventListener('did-stop-loading', () => statusDot.classList.remove('loading'));

      // Register with main process once ready
      wv.addEventListener('dom-ready', () => {
        const wcId = wv.getWebContentsId();
        if (window.tandem) {
          window.tandem.registerTab(wcId, initialUrl);
        }
      }, { once: true });

      // Handle the rename once main assigns a real tabId
      if (window.tandem) {
        window.tandem.onTabRegistered((data) => {
          const entry = tabs.get('__initial');
          if (entry) {
            tabs.delete('__initial');
            entry.webview.dataset.tabId = data.tabId;
            entry.tabEl.dataset.tabId = data.tabId;

            // Rewire click handlers
            entry.tabEl.onclick = null;
            entry.tabEl.addEventListener('click', (e) => {
              if (e.target.classList.contains('tab-close')) return;
              if (window.tandem) window.tandem.focusTab(data.tabId);
            });
            entry.tabEl.addEventListener('contextmenu', (e) => {
              e.preventDefault();
              if (window.__tandemShowTabContextMenu) {
                window.__tandemShowTabContextMenu(entry.tabEl.dataset.tabId, e.clientX, e.clientY);
              }
            });
            entry.tabEl.querySelector('.tab-close').addEventListener('click', () => {
              if (window.tandem) window.tandem.closeTab(data.tabId);
            });

            tabs.set(data.tabId, entry);
            activeTabId = data.tabId;

            // Re-register event listeners with new tabId
            entry.webview.addEventListener('did-navigate', (e) => updateTabMeta(data.tabId, { url: e.url }));
            entry.webview.addEventListener('page-title-updated', (e) => updateTabMeta(data.tabId, { title: e.title }));
            entry.webview.addEventListener('page-favicon-updated', (e) => {
              if (e.favicons && e.favicons.length > 0) updateTabMeta(data.tabId, { favicon: e.favicons[0] });
            });
          }
        });
      }

      // Tab close handler for initial tab
      tabEl.querySelector('.tab-close').addEventListener('click', () => {
        if (window.tandem && activeTabId) window.tandem.closeTab(activeTabId);
      });
      tabEl.addEventListener('click', (e) => {
        if (e.target.classList.contains('tab-close')) return;
        if (window.tandem && activeTabId) window.tandem.focusTab(activeTabId);
      });
      // contextmenu listener is added in onTabRegistered handler (with resolved tabId)

      // Drag start for workspace drag-and-drop
      tabEl.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/tab-id', tabEl.dataset.tabId);
        e.dataTransfer.effectAllowed = 'move';
      });
    })();

    // ═══════════════════════════════════════════════
    // Navigation toolbar
    // ═══════════════════════════════════════════════

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

    urlBar.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        let url = urlBar.value.trim();
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
          if (url.includes('.') && !url.includes(' ')) {
            url = 'https://' + url;
          } else {
            url = 'https://duckduckgo.com/?q=' + encodeURIComponent(url);
          }
        }
        const entry = tabs.get(activeTabId);
        if (entry) entry.webview.loadURL(url);
      }
    });

    // ═══════════════════════════════════════════════
    // New tab button
    // ═══════════════════════════════════════════════

    btnNewTab.addEventListener('click', () => {
      if (window.tandem) window.tandem.newTab();
    });

    // ═══════════════════════════════════════════════
    // Keyboard shortcuts (from main process)
    // ═══════════════════════════════════════════════

    if (window.tandem) {
      window.tandem.onShortcut((action) => {
        if (action === 'new-tab') {
          window.tandem.newTab();
        } else if (action === 'close-tab') {
          if (activeTabId) window.tandem.closeTab(activeTabId);
        } else if (action === 'quick-screenshot') {
          window.tandem.quickScreenshot();
        } else if (action === 'open-settings') {
          openSettings();
        } else if (action === 'bookmark-page') {
          toggleBookmarkCurrentPage();
        } else if (action === 'toggle-bookmarks-bar') {
          toggleBookmarksBar();
        } else if (action === 'find-in-page') {
          toggleFindBar(true);
        } else if (action === 'open-history') {
          openHistoryPage();
        } else if (action === 'open-bookmarks') {
          const shellPath = window.location.href.replace(/\/[^/]*$/, '');
          window.tandem.newTab(shellPath + '/bookmarks.html');
        } else if (action === 'show-about') {
          showAboutOverlay();
         } else if (action === 'show-shortcuts') {
          showShortcutsOverlay();
        } else if (action === 'zoom-in') {
          changeZoom('in');
        } else if (action === 'zoom-out') {
          changeZoom('out');
        } else if (action === 'zoom-reset') {
          changeZoom('reset');
        } else if (action.startsWith('focus-tab-')) {
          const index = parseInt(action.replace('focus-tab-', ''), 10);
          window.tandem.focusTabByIndex(index);
        } else if (action === 'claronote-record') {
          // Switch to ClaroNote tab and toggle recording
          document.querySelectorAll('.panel-tab').forEach(b => b.classList.remove('active'));
          document.querySelector('[data-panel-tab="claronote"]').classList.add('active');
          document.getElementById('panel-activity').style.display = 'none';
          document.getElementById('panel-chat').style.display = 'none';
          document.getElementById('panel-screenshots').style.display = 'none';
          document.getElementById('panel-claronote').style.display = 'flex';

          // Open panel if closed
          if (!document.getElementById('wingman-panel').classList.contains('open')) {
            document.getElementById('wingman-panel').classList.add('open');
            updatePanelLayout();
          }

          // Initialize and toggle recording
          initClaroNote().then(() => {
            toggleClaroNoteRecording();
          });
        } else if (action === 'voice-input') {
          // Toggle voice input
          if (window.tandem) window.tandem.toggleVoice();
        } else if (action === 'show-onboarding') {
          // Manually show onboarding
          showOnboarding();
        }
      });

      // Open URL in new tab (from About window links)

    }

    // ═══════════════════════════════════════════════
    // Zoom functionality
    // ═══════════════════════════════════════════════

    let tabZoomLevels = new Map(); // Store zoom levels per tab
    let zoomIndicatorTimeout = null;

    function changeZoom(direction) {
      const entry = tabs.get(activeTabId);
      if (!entry) return;

      const currentZoom = tabZoomLevels.get(activeTabId) || 0;
      let newZoom = currentZoom;

      if (direction === 'in') {
        newZoom = Math.min(currentZoom + 1, 5); // Max zoom in
      } else if (direction === 'out') {
        newZoom = Math.max(currentZoom - 1, -5); // Max zoom out
      } else if (direction === 'reset') {
        newZoom = 0;
      }

      if (newZoom !== currentZoom) {
        tabZoomLevels.set(activeTabId, newZoom);
        entry.webview.setZoomLevel(newZoom);
        showZoomIndicator(newZoom);
      }
    }

    function showZoomIndicator(zoomLevel) {
      // Create or get zoom indicator
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

      // Clear previous timeout
      if (zoomIndicatorTimeout) {
        clearTimeout(zoomIndicatorTimeout);
      }

      // Hide after 2 seconds
      zoomIndicatorTimeout = setTimeout(() => {
        indicator.style.opacity = '0';
      }, 2000);
    }

    // ═══════════════════════════════════════════════
    // Wingman badge → right-click or long-press → open settings
    const wingmanBadge = document.querySelector('.wingman-badge');
    wingmanBadge.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      openSettings();
    });
    let wingmanBadgePressTimer = null;
    wingmanBadge.addEventListener('mousedown', () => {
      wingmanBadgePressTimer = setTimeout(() => openSettings(), 600);
    });
    wingmanBadge.addEventListener('mouseup', () => { clearTimeout(wingmanBadgePressTimer); });
    wingmanBadge.addEventListener('mouseleave', () => { clearTimeout(wingmanBadgePressTimer); });
    wingmanBadge.style.cursor = 'pointer';
    wingmanBadge.title = 'Right-click for settings';

    // Screenshot toolbar button
    document.getElementById('btn-screenshot').addEventListener('click', () => {
      if (window.tandem) window.tandem.quickScreenshot();
    });

    // ═══════════════════════════════════════════════
    // Wingman alerts
    // ═══════════════════════════════════════════════

    if (window.tandem) {
      window.tandem.onWingmanAlert((data) => {
        document.getElementById('alert-title').textContent = data.title;
        document.getElementById('alert-body').textContent = data.body;
        overlay.classList.add('visible');
        setTimeout(dismissAlert, 15000);
      });
    }

    function dismissAlert() {
      overlay.classList.remove('visible');
    }

    // ═══════════════════════════════════════════════
    // Wingman Panel
    // ═══════════════════════════════════════════════

    const wingmanPanel = document.getElementById('wingman-panel');
    const panelBody = document.getElementById('panel-body');

    // Panel tab switching
    document.querySelectorAll('.panel-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.panel-tab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const tab = btn.dataset.panelTab;
        document.getElementById('panel-activity').style.display = tab === 'activity' ? 'flex' : 'none';
        document.getElementById('panel-chat').style.display = tab === 'chat' ? 'flex' : 'none';
        if (tab === 'chat') {
          chatRouter.ensureConnected();
        }
        document.getElementById('panel-screenshots').style.display = tab === 'screenshots' ? 'flex' : 'none';
        document.getElementById('panel-claronote').style.display = tab === 'claronote' ? 'flex' : 'none';

        // Initialize ClaroNote if switching to that tab
        if (tab === 'claronote') {
          initClaroNote();
        }
      });
    });

    // Panel toggle from main process
    if (window.tandem) {
      window.tandem.onPanelToggle((data) => {
        if (data.open) {
          wingmanPanel.classList.add('open');
        } else {
          wingmanPanel.classList.remove('open');
        }
        updatePanelLayout();
      });

      // Activity events
      window.tandem.onActivityEvent((event) => {
        const activityEl = document.getElementById('panel-activity');
        const icons = { navigate: '🧭', click: '👆', scroll: '📜', input: '⌨️', 'tab-switch': '🔀', 'tab-open': '➕', 'tab-close': '✖️' };
        const icon = icons[event.type] || '•';
        const time = new Date(event.timestamp).toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        let text = event.type;
        if (event.data.url) text = `${event.type}: ${event.data.url}`;
        else if (event.data.selector) text = `${event.type}: ${event.data.selector}`;
        else if (event.data.title) text = `${event.type}: ${event.data.title}`;

        const rawSource = event.data.source || 'robin';
        const source = ['kees', 'robin'].includes(rawSource) ? rawSource : 'robin';
        const sourceEmoji = source === 'kees' ? '🤖' : '👤';
        const item = document.createElement('div');
        item.className = 'activity-item';
        item.innerHTML = `<span class="a-icon">${icon}</span><span class="a-source ${source}">${sourceEmoji}</span><span class="a-text">${escapeHtml(text)}</span><span class="a-time">${time}</span>`;
        activityEl.appendChild(item);
        activityEl.scrollTop = activityEl.scrollHeight;
        // Keep max 200 items
        while (activityEl.children.length > 200) activityEl.removeChild(activityEl.firstChild);
      });

      // Tab source changes (🧀/👤 indicator) + AI tab visual border
      window.tandem.onTabSourceChanged((data) => {
        for (const [id, entry] of tabs) {
          if (id === data.tabId) {
            const sourceEl = entry.tabEl.querySelector('.tab-source');
            if (sourceEl) {
              sourceEl.textContent = data.source === 'kees' ? '🤖' : '👤';
              sourceEl.title = data.source === 'kees' ? 'AI controlled — click to take over' : 'You controlled';
            }
            // Visual indicator: purple bottom border for AI tabs
            if (data.source === 'kees') {
              entry.tabEl.style.borderBottom = '2px solid #7c3aed';
            } else {
              entry.tabEl.style.borderBottom = '';
            }
          }
        }
      });

      // Robin claims an AI tab by focusing it (click on tab header)
      // The click handler already calls focusTab, we hook into it to also claim
      const origTabClickHandler = (tabId) => {
        // Check if this is an AI tab
        const entry = tabs.get(tabId);
        if (entry) {
          const sourceEl = entry.tabEl.querySelector('.tab-source');
          if (sourceEl && sourceEl.textContent === '🤖') {
            // Claim the tab for Robin
            fetch('http://localhost:8765/tabs/source', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ tabId, source: 'robin' })
            }).catch(() => { });
          }
        }
      };
      // Hook into existing tab click by patching focusTab handler
      const _origFocusTab = window.__tandemTabs.focusTab;
      window.__tandemTabs.focusTab = function (tabId) {
        origTabClickHandler(tabId);
        return _origFocusTab.call(window.__tandemTabs, tabId);
      };

      // Open URL in new tab (from popup redirect)
      window.tandem.onOpenUrlInNewTab((url) => {
        if (url) window.tandem.newTab(url);
      });

      // Wingman chat injection from context menu — fill input but let user review before sending
      window.tandem.onWingmanChatInject((text) => {
        // Switch to chat tab in panel
        const chatTab = document.querySelector('[data-panel-tab="chat"]');
        if (chatTab) chatTab.click();
        // Fill chat input (user reviews and presses Enter/Send)
        const chatInput = document.getElementById('chat-input');
        if (chatInput) {
          chatInput.value = text;
          chatInput.dispatchEvent(new Event('input'));
          chatInput.focus();
        }
      });

      // Bookmark status changed from context menu
      window.tandem.onBookmarkStatusChanged(async (data) => {
        const bookmarkStar = document.getElementById('btn-bookmark');
        if (bookmarkStar) {
          bookmarkStar.classList.toggle('bookmarked', data.bookmarked);
          bookmarkStar.textContent = data.bookmarked ? '★' : '☆';
        }
      });

      // Screenshot notifications
      window.tandem.onScreenshotTaken((data) => {
        const listEl = document.getElementById('screenshot-list');
        // Remove placeholder text if present
        const placeholder = listEl.querySelector('p');
        if (placeholder) placeholder.remove();
        const div = document.createElement('div');
        div.innerHTML = `<div class="ss-label">${escapeHtml(data.filename)}</div>`;
        listEl.prepend(div);
      });
    }

    // ═══════════════════════════════════════════════
    // Chat Router — Multi-backend chat (Phase 3)
    // ═══════════════════════════════════════════════
    const chatRouter = (() => {
      const messagesEl = document.getElementById('chat-messages');
      const inputEl = document.getElementById('chat-input');
      const sendBtn = document.getElementById('chat-send-btn');
      const typingEl = document.getElementById('typing-indicator');
      const wsDot = document.getElementById('ws-dot');
      const wsStatusText = document.getElementById('ws-status-text');

      // Safety check
      if (!messagesEl || !inputEl || !sendBtn || !typingEl || !wsDot || !wsStatusText) {
        console.error('[chatRouter] Missing required DOM elements, chat will not initialize');
        return { ensureConnected() { }, disconnect() { } };
      }

      // ── Shared helpers ──

      function scrollToBottom() {
        requestAnimationFrame(() => {
          messagesEl.scrollTop = messagesEl.scrollHeight;
        });
      }

      function ensureElementAtBottom(element) {
        // Ensure the element is at the very bottom of the container
        messagesEl.appendChild(element);
        scrollToBottom();
      }

      function formatTime(ts) {
        if (!ts) return '';
        const d = new Date(typeof ts === 'number' ? (ts < 1e12 ? ts * 1000 : ts) : ts);
        return d.toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit' });
      }

      function escapeHtml(s) {
        return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
      }

      function appendMessage(role, text, timestamp, source, image) {
        const sourceClass = source || 'openclaw';
        let cls, name;
        if (role === 'user') {
          cls = 'robin';
          name = 'Robin';
        } else if (sourceClass === 'claude') {
          cls = 'claude';
          name = 'Claude';
        } else {
          cls = 'wingman';
          name = 'Wingman';
        }
        const el = document.createElement('div');
        el.className = `chat-msg ${cls} source-${source || sourceClass}`;
        el.innerHTML = `<div class="msg-from">${escapeHtml(name)}</div><div class="msg-text">${escapeHtml(text)}</div><div class="msg-time">${formatTime(timestamp)}</div>`;
        // Add image if present
        if (image) {
          const msgText = el.querySelector('.msg-text');
          const img = document.createElement('img');
          img.src = `http://localhost:8765/chat/image/${image}`;
          img.className = 'chat-msg-image';
          img.addEventListener('click', () => window.open(img.src, '_blank'));
          img.onerror = () => { img.style.display = 'none'; };
          msgText.appendChild(img);
        }
        messagesEl.appendChild(el);
        scrollToBottom();
        return el;
      }

      // ── Router setup ──

      const router = new ChatRouter();
      const openclawBackend = new OpenClawBackend();
      const claudeBackend = new ClaudeActivityBackend();

      router.register(openclawBackend);
      router.register(claudeBackend);

      // ── DualMode setup (Fase 5) ──
      const dualMode = new DualMode(router);
      let currentMode = 'openclaw'; // 'openclaw' | 'claude' | 'both'

      // Track streaming message elements per conversation
      let streamingMessages = new Map(); // conversationId -> { element, startTime }
      let currentConversationId = null;

      // ── Backend selector UI ──

      const btnOC = document.getElementById('btn-backend-openclaw');
      const btnCL = document.getElementById('btn-backend-claude');
      const btnBoth = document.getElementById('btn-backend-both');
      const dotOC = document.getElementById('dot-openclaw');
      const dotCL = document.getElementById('dot-claude');
      const dotBoth = document.getElementById('dot-both');

      function updateBackendUI(activeId) {
        btnOC.classList.toggle('active', activeId === 'openclaw');
        btnCL.classList.toggle('active', activeId === 'claude');
        btnBoth.classList.toggle('active', activeId === 'both');

        if (activeId === 'both') {
          // In both mode — OpenClaw always available via webhook
          const clConn = claudeBackend.isConnected();
          wsDot.style.background = 'var(--success)'; // Always connected (OpenClaw via webhook)
          if (clConn) {
            wsStatusText.textContent = 'Wingman + Claude Connected';
          } else {
            wsStatusText.textContent = 'Wingman Connected, Claude Disconnected';
          }
          inputEl.placeholder = 'Message to Wingman & Claude... (@wingman/@claude for specific)';
        } else {
          // Single backend mode
          const backend = router.getActive();
          if (backend) {
            // OpenClaw uses webhook path (always available if Tandem API is running)
            const isOC = router.getActiveId() === 'openclaw';
            const connected = isOC ? true : backend.isConnected();
            wsDot.style.background = connected ? 'var(--success)' : 'var(--accent)';
            wsStatusText.textContent = connected ? `${backend.name} Connected` : `${backend.name} Disconnected`;
          }
          if (activeId === 'claude') {
            inputEl.placeholder = 'Message to Claude...';
          } else {
            inputEl.placeholder = 'Message to Wingman...';
          }
        }

        // Update typing indicator text
        const typingText = typingEl.querySelector('span:last-child');
        if (typingText) {
          if (activeId === 'both') {
            typingText.textContent = 'AI is thinking...';
          } else if (activeId === 'claude') {
            typingText.textContent = 'Claude is thinking...';
          } else {
            typingText.textContent = 'Wingman is typing...';
          }
        }
      }

      function switchBackend(id) {
        // Store any locally typed Robin messages before clearing
        const localRobinMessages = [];
        for (const child of messagesEl.children) {
          if (child.classList.contains('robin') && child.dataset.localMessage === 'true') {
            localRobinMessages.push({
              role: 'user',
              text: child.querySelector('.msg-text').textContent,
              timestamp: child.querySelector('.msg-time').textContent,
              source: 'robin'
            });
          }
        }

        currentMode = id;
        messagesEl.innerHTML = '';
        streamingMessages.clear();
        currentConversationId = null;

        if (id === 'both') {
          // In "both" mode, set router to openclaw as default but enable dual mode
          router.setActive('openclaw');
          dualMode.setEnabled(true);
          // Load combined history — OpenClaw first, then Claude
          openclawBackend.loadHistory((msgs) => {
            for (const m of msgs) {
              const el = appendMessage(m.role, m.text, m.timestamp, m.source, m.image);
              el.dataset.fromHistory = 'true';
            }
            // Re-add local Robin messages
            for (const localMsg of localRobinMessages) {
              const el = appendMessage(localMsg.role, localMsg.text, localMsg.timestamp, localMsg.source, localMsg.image);
              el.dataset.localMessage = 'true';
            }
          });
        } else {
          dualMode.setEnabled(false);
          router.setActive(id);
          if (id === 'openclaw') {
            openclawBackend.loadHistory((msgs) => {
              for (const m of msgs) {
                const el = appendMessage(m.role, m.text, m.timestamp, m.source, m.image);
                el.dataset.fromHistory = 'true';
              }
              // Re-add local Robin messages
              for (const localMsg of localRobinMessages) {
                const el = appendMessage(localMsg.role, localMsg.text, localMsg.timestamp, localMsg.source, localMsg.image);
                el.dataset.localMessage = 'true';
              }
            });
          } else {
            claudeBackend._loadHistory();
          }
        }

        updateBackendUI(id);

        // Persist choice to config
        fetch('http://localhost:8765/config', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ general: { activeBackend: id } })
        }).catch(() => { });
      }

      btnOC.addEventListener('click', () => switchBackend('openclaw'));
      btnCL.addEventListener('click', () => switchBackend('claude'));
      btnBoth.addEventListener('click', () => switchBackend('both'));

      // ── Connection status dots ──

      router.onConnectionChange((connected, backendId) => {
        if (backendId === 'openclaw') {
          // OpenClaw always "connected" via webhook path (WebSocket is optional for receiving)
          dotOC.classList.add('connected');
        } else if (backendId === 'claude') {
          dotCL.classList.toggle('connected', connected);
        }
        // Update "both" dot — OpenClaw always available
        dotBoth.classList.add('connected');

        // Update status bar for current mode
        if (currentMode === 'both') {
          updateBackendUI('both');
        } else if (backendId === router.getActiveId()) {
          const backend = router.getActive();
          const isOC = backendId === 'openclaw';
          const effectiveConnected = isOC ? true : connected;
          wsDot.style.background = effectiveConnected ? 'var(--success)' : 'var(--accent)';
          wsStatusText.textContent = effectiveConnected ? `${backend.name} Connected` : `${backend.name} Disconnected`;
        }
      });

      // ── Message handling ──

      // Single-backend message handler (existing behavior)
      router.onMessage((msg, type, backendId) => {
        if (currentMode === 'both') return; // handled by dualMode

        if (type === 'historyReload') {
          // Store any locally typed Robin messages before processing history
          const localRobinMessages = [];
          for (const child of messagesEl.children) {
            if (child.classList.contains('robin') && child.dataset.localMessage === 'true') {
              localRobinMessages.push({
                role: 'user',
                text: child.querySelector('.msg-text').textContent,
                timestamp: child.querySelector('.msg-time').textContent,
                source: 'robin'
              });
            }
          }

          // Finalize any active streaming messages with correct timestamp
          for (const [convId, streamData] of streamingMessages.entries()) {
            const timeEl = streamData.element.querySelector('.msg-time');
            if (timeEl) timeEl.textContent = formatTime(Date.now());
          }
          streamingMessages.clear();
          currentConversationId = null;

          // Re-add local Robin messages after any history operations
          setTimeout(() => {
            for (const localMsg of localRobinMessages) {
              // Check if this message is already in the DOM (from history)
              let alreadyExists = false;
              for (const child of messagesEl.children) {
                if (child.classList.contains('robin') &&
                  child.querySelector('.msg-text').textContent === localMsg.text &&
                  child.dataset.fromHistory === 'true') {
                  alreadyExists = true;
                  break;
                }
              }

              // Only add if not already present from history
              if (!alreadyExists) {
                const el = appendMessage(localMsg.role, localMsg.text, localMsg.timestamp, localMsg.source, localMsg.image);
                el.dataset.localMessage = 'true';
              }
            }
          }, 0);
          return;
        }

        if (msg._streaming) {
          // Start new conversation if needed
          if (!currentConversationId) {
            currentConversationId = crypto.randomUUID();
          }

          let streamData = streamingMessages.get(currentConversationId);
          if (!streamData) {
            // Create new streaming message element - always insert at the very end
            const element = appendMessage(msg.role, msg.text, msg.timestamp, msg.source, msg.image);
            streamData = {
              element,
              startTime: Date.now(),
              lastPosition: messagesEl.children.length - 1
            };
            streamingMessages.set(currentConversationId, streamData);
          } else {
            // Update existing streaming element content
            streamData.element.querySelector('.msg-text').innerHTML = escapeHtml(msg.text);

            // Ensure streaming element stays at the end (after any Robin messages sent during streaming)
            const currentIndex = Array.from(messagesEl.children).indexOf(streamData.element);
            const lastIndex = messagesEl.children.length - 1;
            if (currentIndex !== lastIndex) {
              ensureElementAtBottom(streamData.element);
            }
          }
        } else {
          // Finalize current conversation
          if (currentConversationId) {
            const streamData = streamingMessages.get(currentConversationId);
            if (streamData) {
              // Update timestamp to show completion time
              const timeEl = streamData.element.querySelector('.msg-time');
              if (timeEl) timeEl.textContent = formatTime(Date.now());
              // Move to bottom one last time
              messagesEl.appendChild(streamData.element);
              scrollToBottom();
              streamingMessages.delete(currentConversationId);
            }
            currentConversationId = null;
          }
          // Only append a new element if this is NOT a final event (final reuses the streaming element)
          if (!msg._final) {
            appendMessage(msg.role, msg.text, msg.timestamp, msg.source, msg.image);
          }
        }
      });

      // Dual-mode message handler (Fase 5) — both backends at once
      let dualStreamingConversations = {}; // per-backend conversation tracking
      dualMode.onMessage((msg, type, backendId) => {
        if (type === 'historyReload') {
          // Store any locally typed Robin messages before clearing
          const localRobinMessages = [];
          for (const child of messagesEl.children) {
            if (child.classList.contains('robin') && child.dataset.localMessage === 'true') {
              localRobinMessages.push({
                role: 'user',
                text: child.querySelector('.msg-text').textContent,
                timestamp: child.querySelector('.msg-time').textContent,
                source: 'robin'
              });
            }
          }

          // Clear and rebuild to avoid duplicates
          messagesEl.innerHTML = '';
          streamingMessages.clear();
          dualStreamingConversations = {};

          if (Array.isArray(msg)) {
            for (const m of msg) {
              const el = appendMessage(m.role, m.text, m.timestamp, m.source, m.image);
              el.dataset.fromHistory = 'true';
            }

            // Re-add local Robin messages that aren't in history
            for (const localMsg of localRobinMessages) {
              const el = appendMessage(localMsg.role, localMsg.text, localMsg.timestamp, localMsg.source, localMsg.image);
              el.dataset.localMessage = 'true';
            }
          }
          return;
        }

        if (msg._streaming) {
          // Start new conversation for this backend if needed
          if (!dualStreamingConversations[backendId]) {
            dualStreamingConversations[backendId] = {
              conversationId: crypto.randomUUID(),
              started: false
            };
          }

          const convId = dualStreamingConversations[backendId].conversationId;
          let streamData = streamingMessages.get(convId);

          if (!streamData) {
            // Create new streaming message element
            const element = appendMessage(msg.role, msg.text, msg.timestamp, msg.source, msg.image);
            streamData = {
              element,
              startTime: Date.now(),
              backendId
            };
            streamingMessages.set(convId, streamData);
            dualStreamingConversations[backendId].started = true;
          } else {
            // Update existing streaming element content
            streamData.element.querySelector('.msg-text').innerHTML = escapeHtml(msg.text);

            // Ensure streaming element stays at the end
            const currentIndex = Array.from(messagesEl.children).indexOf(streamData.element);
            const lastIndex = messagesEl.children.length - 1;
            if (currentIndex !== lastIndex) {
              ensureElementAtBottom(streamData.element);
            }
          }
        } else {
          // Finalize conversation for this backend
          if (dualStreamingConversations[backendId]) {
            const convId = dualStreamingConversations[backendId].conversationId;
            const streamData = streamingMessages.get(convId);
            if (streamData) {
              // Update timestamp to show completion time
              const timeEl = streamData.element.querySelector('.msg-time');
              if (timeEl) timeEl.textContent = formatTime(Date.now());
              streamingMessages.delete(convId);
            }
            delete dualStreamingConversations[backendId];
          }
          appendMessage(msg.role, msg.text, msg.timestamp, msg.source, msg.image);
        }
      });

      router.onTyping((typing) => {
        if (currentMode !== 'both') {
          typingEl.classList.toggle('active', typing);
        }
      });

      dualMode.onTyping((typing, backendId) => {
        // In dual mode, show typing if any backend is typing
        typingEl.classList.toggle('active', typing);
        const typingText = typingEl.querySelector('span:last-child');
        if (typingText && typing) {
          const name = backendId === 'openclaw' ? 'Wingman' : 'Claude';
          typingText.textContent = `${name} is typing...`;
        }
      });

      router.onSwitch((id) => {
        if (currentMode !== 'both') {
          updateBackendUI(id);
        }
      });

      // ── Image paste/drop support ──

      let pendingImage = null; // base64 data URL
      const imagePreviewEl = document.getElementById('chat-image-preview');

      inputEl.addEventListener('paste', (e) => {
        const items = e.clipboardData?.items;
        if (!items) return;
        for (const item of items) {
          if (item.type.startsWith('image/')) {
            e.preventDefault();
            const blob = item.getAsFile();
            if (!blob) return;
            const reader = new FileReader();
            reader.onload = () => {
              pendingImage = reader.result;
              showImagePreview(pendingImage);
            };
            reader.readAsDataURL(blob);
            return;
          }
        }
      });

      inputEl.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
      });

      inputEl.addEventListener('drop', (e) => {
        e.preventDefault();
        const file = e.dataTransfer?.files?.[0];
        if (file && file.type.startsWith('image/')) {
          const reader = new FileReader();
          reader.onload = () => {
            pendingImage = reader.result;
            showImagePreview(pendingImage);
          };
          reader.readAsDataURL(file);
        }
      });

      function showImagePreview(dataUrl) {
        imagePreviewEl.innerHTML = `
          <img src="${dataUrl}" alt="Preview">
          <button class="remove-preview" title="Remove image">✕</button>
        `;
        imagePreviewEl.style.display = 'block';
        imagePreviewEl.querySelector('.remove-preview').addEventListener('click', () => {
          clearImagePreview();
        });
      }

      function clearImagePreview() {
        pendingImage = null;
        imagePreviewEl.innerHTML = '';
        imagePreviewEl.style.display = 'none';
      }

      // ── Send message (input + button) ──

      function sendMessage() {
        const text = inputEl.value.trim();

        // Image paste: send via IPC (before text-only check)
        if (pendingImage) {
          const imageData = pendingImage;
          clearImagePreview();
          inputEl.value = '';
          inputEl.style.height = '';

          // Show local preview immediately
          const robinMsg = appendMessage('user', text || '', Date.now(), 'robin');
          robinMsg.dataset.localMessage = 'true';
          const msgText = robinMsg.querySelector('.msg-text');
          const img = document.createElement('img');
          img.src = imageData;
          img.className = 'chat-msg-image';
          img.addEventListener('click', () => window.open(imageData, '_blank'));
          msgText.appendChild(img);

          // Send to main process via IPC
          if (window.tandem?.sendChatImage) {
            window.tandem.sendChatImage(text, imageData);
          }
          return;
        }

        if (!text) return;

        inputEl.value = '';
        inputEl.style.height = '';

        if (currentMode === 'both') {
          // Dual mode: parse @-mentions, send to appropriate backends
          const { target, cleanText } = DualMode.parseMention(text);
          if (!cleanText) return;

          // Check if target backend(s) connected
          if (target === 'claude' && !claudeBackend.isConnected()) return;
          if (target === 'openclaw' && !openclawBackend.isConnected()) return;
          if (target === 'both' && !openclawBackend.isConnected() && !claudeBackend.isConnected()) return;

          // Show user message (display original text with @-mention for clarity)
          const robinMsg = appendMessage('user', text, Date.now(), 'robin');
          robinMsg.dataset.localMessage = 'true';

          dualMode.sendMessage(text);
        } else {
          // Single backend mode
          const backend = router.getActive();
          const activeId = router.getActiveId();

          // OpenClaw: always send via IPC→webhook (doesn't need WebSocket to be connected)
          if (activeId === 'openclaw') {
            const robinMsg = appendMessage('user', text, Date.now(), 'robin');
            robinMsg.dataset.localMessage = 'true';
            // IPC → panelManager.addChatMessage → webhook → /hooks/wake → Wingman receives it
            window.tandem?.sendChatMessage(text);
          } else {
            // For Claude, needs WebSocket connection
            if (!backend || !backend.isConnected()) return;
            router.sendMessage(text);
          }
        }
      }

      inputEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          sendMessage();
        }
      });
      inputEl.addEventListener('input', () => {
        inputEl.style.height = '';
        inputEl.style.height = Math.min(inputEl.scrollHeight, 80) + 'px';
      });
      sendBtn.addEventListener('click', sendMessage);

      // ── Initialize ──

      // Load saved backend from config, fallback to openclaw
      router.connectAll();
      fetch('http://localhost:8765/config')
        .then(r => r.json())
        .then(cfg => {
          const saved = cfg.general && cfg.general.activeBackend;
          if (saved === 'claude') switchBackend('claude');
          else if (saved === 'both') switchBackend('both');
          else switchBackend('openclaw');
        })
        .catch(() => switchBackend('openclaw'));

      // Listen for incoming Wingman messages pushed via POST /chat API
      if (window.tandem && window.tandem.onChatMessage) {
        window.tandem.onChatMessage((msg) => {
          // msg: {id, from, text, timestamp, image}
          // Skip robin messages — already shown optimistically in the UI
          if (msg.from === 'robin') return;
          const source = msg.from; // 'kees' or 'claude'
          appendMessage('assistant', msg.text, msg.timestamp, source, msg.image);
          if (messagesEl) messagesEl.scrollTop = messagesEl.scrollHeight;
        });
      }

      return {
        ensureConnected() { router.connectAll(); },
        disconnect() { router.disconnectAll(); },
        router,
        dualMode,
        sendMessage(text) {
          if (currentMode === 'both') return dualMode.sendMessage(text);
          return router.sendMessage(text);
        }
      };
    })();

    // ═══════════════════════════════════════════════
    // Noodrem + Approval System (Fase 4)
    // ═══════════════════════════════════════════════
    (() => {
      const noodremBtn = document.getElementById('noodrem-btn');
      const approvalContainer = document.getElementById('approval-container');

      // Noodrem — debounced emergency stop (prevents spam)
      let _noodremLast = 0;
      function fireNoodrem() {
        const now = Date.now();
        if (now - _noodremLast < 2000) return; // 2s debounce
        _noodremLast = now;
        if (window.tandem && window.tandem.emergencyStop) {
          window.tandem.emergencyStop();
        } else {
          fetch('http://localhost:8765/emergency-stop', { method: 'POST' }).catch(() => { });
        }
      }

      if (noodremBtn) {
        noodremBtn.addEventListener('click', fireNoodrem);
      }

      // ═══ Live Mode Toggle ═══
      const liveToggleBtn = document.getElementById('live-toggle-btn');
      let liveEnabled = false;
      if (liveToggleBtn) {
        liveToggleBtn.addEventListener('click', async () => {
          try {
            const res = await fetch('http://localhost:8765/live/toggle', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ enabled: !liveEnabled }),
            });
            const data = await res.json();
            liveEnabled = data.enabled;
            liveToggleBtn.style.color = liveEnabled ? '#e94560' : 'var(--text-dim)';
            liveToggleBtn.style.borderColor = liveEnabled ? '#e94560' : 'rgba(255,255,255,0.15)';
            liveToggleBtn.title = liveEnabled ? 'Live Mode AAN — Wingman kijkt mee' : 'Live Mode UIT';
          } catch (e) {
            console.error('Live toggle failed:', e);
          }
        });
        // Listen for live mode changes from main process
        if (window.tandem && window.tandem.onLiveModeChanged) {
          window.tandem.onLiveModeChanged((data) => {
            liveEnabled = data.enabled;
            liveToggleBtn.style.color = liveEnabled ? '#e94560' : 'var(--text-dim)';
            liveToggleBtn.style.borderColor = liveEnabled ? '#e94560' : 'rgba(255,255,255,0.15)';
          });
        }
      }

      // Escape key = noodrem (global handler, always works)
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && e.shiftKey) {
          e.preventDefault();
          e.stopPropagation();
          fireNoodrem();
        }
      }, true);

      // Listen for approval requests from main process
      if (window.tandem && window.tandem.onApprovalRequest) {
        window.tandem.onApprovalRequest((data) => {
          showApprovalCard(data);
        });
      }

      function showApprovalCard(data) {
        if (!approvalContainer) return;
        approvalContainer.style.display = 'block';

        const card = document.createElement('div');
        card.className = 'approval-card';
        card.dataset.requestId = data.requestId;

        const riskClass = data.riskLevel === 'high' ? 'risk-high' : 'risk-medium';
        const riskLabel = data.riskLevel === 'high' ? 'Hoog risico' : 'Medium risico';
        const actionDesc = data.action ? `${data.action.type}: ${JSON.stringify(data.action.params || {}).slice(0, 80)}` : '';

        card.innerHTML = `
          <div class="approval-title">🤖 Wingman wants to perform an action:</div>
          <div class="approval-desc">${escapeHtmlSimple(data.description || '')}</div>
          <div class="approval-desc" style="font-family:monospace;font-size:10px;">${escapeHtmlSimple(actionDesc)}</div>
          <span class="approval-risk ${riskClass}">${riskLabel}</span>
          <div class="approval-actions">
            <button class="btn-approve" data-task="${data.taskId}" data-step="${data.stepId}">✅ Goedkeuren</button>
            <button class="btn-reject" data-task="${data.taskId}" data-step="${data.stepId}">❌ Afwijzen</button>
          </div>
        `;

        card.querySelector('.btn-approve').addEventListener('click', () => {
          fetch(`http://localhost:8765/tasks/${data.taskId}/approve`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ stepId: data.stepId })
          }).catch(() => { });
          card.remove();
          if (approvalContainer.children.length === 0) approvalContainer.style.display = 'none';
        });

        card.querySelector('.btn-reject').addEventListener('click', () => {
          fetch(`http://localhost:8765/tasks/${data.taskId}/reject`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ stepId: data.stepId })
          }).catch(() => { });
          card.remove();
          if (approvalContainer.children.length === 0) approvalContainer.style.display = 'none';
        });

        approvalContainer.appendChild(card);
      }

      function escapeHtmlSimple(s) {
        return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      }

      // Emergency stop clears all approval cards
      if (window.tandem) {
        const origOnEmergency = window.tandem.onTabSourceChanged; // listen for emergency-stop event via IPC
      }
      // Also poll for emergency stop events (backup)
      window.addEventListener('message', (e) => {
        if (e.data && e.data.type === 'emergency-stop' && approvalContainer) {
          approvalContainer.innerHTML = '';
          approvalContainer.style.display = 'none';
        }
      });
    })();

    // Panel resize
    const resizeHandle = document.getElementById('panel-resize');
    const panelToggleBtn = document.getElementById('wingman-panel-toggle');
    const webviewContainer = document.getElementById('webview-container');
    let resizing = false;

    // Restore saved panel width
    const savedPanelWidth = localStorage.getItem('wingman-panel-width');
    if (savedPanelWidth) {
      const w = parseInt(savedPanelWidth);
      if (w >= 280 && w <= 700) wingmanPanel.style.width = w + 'px';
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
    }

    // Toggle panel function
    function toggleWingmanPanel() {
      wingmanPanel.classList.toggle('open');
      updatePanelLayout();
    }

    // Listen for transition end to update layout smoothly
    wingmanPanel.addEventListener('transitionend', updatePanelLayout);

    // Toggle button click
    panelToggleBtn.addEventListener('click', toggleWingmanPanel);

    // Wingman badge single click toggles panel
    wingmanBadge.addEventListener('click', (e) => {
      if (wingmanBadgePressTimer) clearTimeout(wingmanBadgePressTimer);
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

    // ═══════════════════════════════════════════════
    // Draw/Annotatie Tool
    // ═══════════════════════════════════════════════

    const drawCanvas = document.getElementById('draw-canvas');
    const drawToolbar = document.getElementById('draw-toolbar');
    const ctx = drawCanvas.getContext('2d');

    let drawEnabled = false;
    let drawCanvasTabId = null; // Track which tab the canvas belongs to
    let currentTool = 'line';
    let currentColor = '#e94560';
    let toolActive = false; // Tool is actively selected (can draw)
    let isDrawing = false;
    let startX = 0, startY = 0;
    /** Store completed shapes PER TAB */
    const tabShapes = new Map(); // Map<tabId, shapes[]>
    /** Store scroll offset PER TAB */
    const tabScrollOffsets = new Map(); // Map<tabId, {x, y}>
    /** Current freeform path points */
    let currentPath = [];

    // Helper: get shapes array for current tab (create if not exists)
    function getShapesForCurrentTab() {
      if (!drawCanvasTabId) return [];
      if (!tabShapes.has(drawCanvasTabId)) {
        tabShapes.set(drawCanvasTabId, []);
      }
      return tabShapes.get(drawCanvasTabId);
    }

    // Helper: get scroll offset for current tab
    function getScrollOffset() {
      if (!drawCanvasTabId) return { x: 0, y: 0 };
      if (!tabScrollOffsets.has(drawCanvasTabId)) {
        tabScrollOffsets.set(drawCanvasTabId, { x: 0, y: 0 });
      }
      return tabScrollOffsets.get(drawCanvasTabId);
    }

    function resizeCanvas() {
      const rect = drawCanvas.parentElement.getBoundingClientRect();
      drawCanvas.width = rect.width;
      drawCanvas.height = rect.height;
      redraw();
    }
    window.addEventListener('resize', resizeCanvas);
    setTimeout(resizeCanvas, 100);

    // Scroll polling interval handle
    let scrollPollInterval = null;

    // Install scroll listener in webview to track page scroll position
    const scrollJS = `(function() {
      return {
        x: window.scrollX || window.pageXOffset || 0,
        y: window.scrollY || window.pageYOffset || 0
      };
    })();`;

    async function installScrollListener(wv, tabId) {
      // Stop any existing polling
      if (scrollPollInterval) {
        clearInterval(scrollPollInterval);
        scrollPollInterval = null;
      }

      // Immediate first read of scroll position
      try {
        const initialScroll = await wv.executeJavaScript(scrollJS);
        tabScrollOffsets.set(tabId, initialScroll);
        redraw();
      } catch (err) {
        tabScrollOffsets.set(tabId, { x: 0, y: 0 });
      }

      // Continue polling for scroll changes
      scrollPollInterval = setInterval(async () => {
        if (!drawEnabled || drawCanvasTabId !== tabId) {
          clearInterval(scrollPollInterval);
          scrollPollInterval = null;
          return;
        }

        try {
          const scrollPos = await wv.executeJavaScript(scrollJS);
          const currentOffset = tabScrollOffsets.get(tabId) || { x: 0, y: 0 };
          if (scrollPos.x !== currentOffset.x || scrollPos.y !== currentOffset.y) {
            tabScrollOffsets.set(tabId, scrollPos);
            redraw();
          }
        } catch (err) {
          // Webview might be destroyed or navigating
        }
      }, 50);
    }

    function redraw() {
      ctx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
      const shapes = getShapesForCurrentTab();
      const scroll = getScrollOffset();

      // Apply scroll offset: translate canvas so shapes stay at page position
      ctx.save();
      ctx.translate(-scroll.x, -scroll.y);

      for (const shape of shapes) {
        drawShape(shape);
      }

      ctx.restore();
    }

    function drawShape(s) {
      ctx.strokeStyle = s.color;
      ctx.fillStyle = s.color;
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      if (s.type === 'line') {
        ctx.beginPath();
        if (s.points.length > 0) {
          ctx.moveTo(s.points[0].x, s.points[0].y);
          for (let i = 1; i < s.points.length; i++) {
            ctx.lineTo(s.points[i].x, s.points[i].y);
          }
        }
        ctx.stroke();
      } else if (s.type === 'rect') {
        ctx.strokeRect(s.x, s.y, s.w, s.h);
      } else if (s.type === 'circle') {
        const rx = Math.abs(s.w) / 2;
        const ry = Math.abs(s.h) / 2;
        const cx = s.x + s.w / 2;
        const cy = s.y + s.h / 2;
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        ctx.stroke();
      } else if (s.type === 'arrow') {
        const dx = s.ex - s.sx;
        const dy = s.ey - s.sy;
        const angle = Math.atan2(dy, dx);
        const len = Math.sqrt(dx * dx + dy * dy);
        // Line
        ctx.beginPath();
        ctx.moveTo(s.sx, s.sy);
        ctx.lineTo(s.ex, s.ey);
        ctx.stroke();
        // Arrowhead
        const headLen = Math.min(20, len * 0.3);
        ctx.beginPath();
        ctx.moveTo(s.ex, s.ey);
        ctx.lineTo(s.ex - headLen * Math.cos(angle - 0.4), s.ey - headLen * Math.sin(angle - 0.4));
        ctx.moveTo(s.ex, s.ey);
        ctx.lineTo(s.ex - headLen * Math.cos(angle + 0.4), s.ey - headLen * Math.sin(angle + 0.4));
        ctx.stroke();
      } else if (s.type === 'text') {
        ctx.font = 'bold 16px -apple-system, sans-serif';
        ctx.fillText(s.text, s.x, s.y);
      }
    }

    drawCanvas.addEventListener('mousedown', (e) => {
      if (!drawEnabled || !toolActive) return; // Only draw if tool is active
      isDrawing = true;
      const rect = drawCanvas.getBoundingClientRect();
      const scroll = getScrollOffset();
      // Store in page coordinates (canvas coords + scroll offset)
      startX = e.clientX - rect.left + scroll.x;
      startY = e.clientY - rect.top + scroll.y;
      if (currentTool === 'line') {
        currentPath = [{ x: startX, y: startY }];
      }
    });

    drawCanvas.addEventListener('mousemove', (e) => {
      if (!isDrawing || !drawEnabled) return;
      const rect = drawCanvas.getBoundingClientRect();
      const scroll = getScrollOffset();
      // Store in page coordinates
      const mx = e.clientX - rect.left + scroll.x;
      const my = e.clientY - rect.top + scroll.y;

      if (currentTool === 'line') {
        currentPath.push({ x: mx, y: my });
        redraw();
        // Draw current path live
        ctx.strokeStyle = currentColor;
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(currentPath[0].x, currentPath[0].y);
        for (let i = 1; i < currentPath.length; i++) {
          ctx.lineTo(currentPath[i].x, currentPath[i].y);
        }
        ctx.stroke();
      } else {
        // Preview shape
        redraw();
        const preview = buildShape(mx, my);
        if (preview) drawShape(preview);
      }
    });

    drawCanvas.addEventListener('mouseup', (e) => {
      if (!isDrawing || !drawEnabled) return;
      isDrawing = false;
      const rect = drawCanvas.getBoundingClientRect();
      const scroll = getScrollOffset();
      // Store in page coordinates
      const mx = e.clientX - rect.left + scroll.x;
      const my = e.clientY - rect.top + scroll.y;

      const shapes = getShapesForCurrentTab();
      if (currentTool === 'text') {
        const text = prompt('Tekst:');
        if (text) shapes.push({ type: 'text', x: startX, y: startY, text, color: currentColor });
      } else if (currentTool === 'line') {
        if (currentPath.length > 1) {
          shapes.push({ type: 'line', points: [...currentPath], color: currentColor });
        }
        currentPath = [];
      } else {
        const shape = buildShape(mx, my);
        if (shape) shapes.push(shape);
      }
      redraw();
    });

    function buildShape(mx, my) {
      if (currentTool === 'rect') {
        return { type: 'rect', x: Math.min(startX, mx), y: Math.min(startY, my), w: Math.abs(mx - startX), h: Math.abs(my - startY), color: currentColor };
      } else if (currentTool === 'circle') {
        return { type: 'circle', x: Math.min(startX, mx), y: Math.min(startY, my), w: mx - startX, h: my - startY, color: currentColor };
      } else if (currentTool === 'arrow') {
        return { type: 'arrow', sx: startX, sy: startY, ex: mx, ey: my, color: currentColor };
      }
      return null;
    }

    // Draw tool buttons - toggle on/off
    document.querySelectorAll('.draw-toolbar button[data-tool]').forEach(btn => {
      btn.addEventListener('click', () => {
        const wasActive = btn.classList.contains('active');

        // Deactivate all tools first
        document.querySelectorAll('.draw-toolbar button[data-tool]').forEach(b => b.classList.remove('active'));

        if (wasActive) {
          // Clicking active tool → deactivate (page interaction mode)
          toolActive = false;
          drawCanvas.classList.remove('drawing');
        } else {
          // Clicking inactive tool → activate (drawing mode)
          btn.classList.add('active');
          currentTool = btn.dataset.tool;
          toolActive = true;
          drawCanvas.classList.add('drawing');
        }
      });
    });

    // Color buttons
    document.querySelectorAll('.draw-toolbar .color-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.draw-toolbar .color-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentColor = btn.dataset.color;
      });
    });

    // Clear
    document.getElementById('btn-draw-clear').addEventListener('click', () => {
      if (drawCanvasTabId) {
        tabShapes.set(drawCanvasTabId, []); // Clear shapes for current tab
      }
      redraw();
    });

    // Snap for Wingman
    document.getElementById('btn-snap-wingman').addEventListener('click', () => {
      if (window.tandem) window.tandem.snapForWingman();
    });

    // Draw mode toggle from main process
    if (window.tandem) {
      window.tandem.onDrawMode((data) => {
        drawEnabled = data.enabled;
        if (drawEnabled) {
          drawCanvasTabId = activeTabId; // Bind canvas to current tab
          drawCanvas.classList.add('active');
          drawToolbar.classList.add('visible');
          resizeCanvas();

          // Install scroll listener in active webview
          const entry = tabs.get(activeTabId);
          if (entry && entry.webview) {
            installScrollListener(entry.webview, activeTabId);
          }
        } else {
          drawCanvas.classList.remove('active');
          drawToolbar.classList.remove('visible');
          drawCanvasTabId = null; // Unbind when disabled
        }
      });

      window.tandem.onDrawClear(() => {
        if (drawCanvasTabId) {
          tabShapes.set(drawCanvasTabId, []); // Clear shapes for current tab
        }
        redraw();
      });
    }

    /**
     * Composite screenshot: webview capture + canvas annotations → base64 PNG.
     * Called from main process via executeJavaScript.
     */
    window.__tandemDraw = {
      compositeScreenshot(webviewBase64) {
        return new Promise((resolve) => {
          const img = new Image();
          img.onload = () => {
            const offscreen = document.createElement('canvas');
            offscreen.width = img.width;
            offscreen.height = img.height;
            const octx = offscreen.getContext('2d');
            // Draw webview screenshot
            octx.drawImage(img, 0, 0);
            // Scale annotations to match webview size
            const scaleX = img.width / drawCanvas.width;
            const scaleY = img.height / drawCanvas.height;
            octx.scale(scaleX, scaleY);
            // Draw annotations canvas on top
            octx.drawImage(drawCanvas, 0, 0);
            // Export as base64 PNG (strip data URL prefix)
            const dataUrl = offscreen.toDataURL('image/png');
            resolve(dataUrl.replace(/^data:image\/png;base64,/, ''));
          };
          img.src = 'data:image/png;base64,' + webviewBase64;
        });
      }
    };

    // ═══════════════════════════════════════════════
    // Wire up webview activity tracking to panel
    // ═══════════════════════════════════════════════

    // Override the existing updateTabMeta to also log activity
    const _origUpdateTabMeta = updateTabMeta;
    updateTabMeta = function (tabId, data) {
      // Track navigation
      if (data.url && window.tandem) {
        // Activity is tracked via IPC in main process, but we also
        // need webview events. We'll send them up.
      }
      _origUpdateTabMeta(tabId, data);
    };

    // Patch __tandemTabs.createTab to add activity tracking on webview events
    const _origCreateTab = window.__tandemTabs.createTab;
    window.__tandemTabs.createTab = function (tabId, url, partition) {
      const result = _origCreateTab.call(window.__tandemTabs, tabId, url, partition);
      // After tab is created, wire activity events
      const entry = tabs.get(tabId);
      if (entry && entry.webview) {
        wireActivityEvents(entry.webview, tabId);
      }
      return result;
    };

    function wireActivityEvents(wv, tabId) {
      // Track navigation events → main process activity tracker
      wv.addEventListener('did-navigate', (e) => {
        if (window.tandem) window.tandem.sendWebviewEvent({ type: 'did-navigate', url: e.url, tabId });
      });
      wv.addEventListener('did-navigate-in-page', (e) => {
        if (e.isMainFrame && window.tandem) {
          window.tandem.sendWebviewEvent({ type: 'did-navigate-in-page', url: e.url, tabId });
        }
      });
      wv.addEventListener('did-finish-load', () => {
        if (window.tandem) {
          window.tandem.sendWebviewEvent({
            type: 'did-finish-load',
            url: wv.getURL(),
            title: wv.getTitle(),
            tabId
          });
        }
      });
      wv.addEventListener('did-start-loading', () => {
        if (window.tandem) window.tandem.sendWebviewEvent({ type: 'loading-start', tabId });
      });
      wv.addEventListener('did-stop-loading', () => {
        if (window.tandem) window.tandem.sendWebviewEvent({ type: 'loading-stop', tabId });
      });

      // Wingman Vision: scroll/selection/form tracking moved to CDP Runtime.addBinding (see DevToolsManager)
    }

    // Also wire activity events for the initial tab
    (() => {
      const initialEntry = tabs.get(activeTabId);
      if (initialEntry && initialEntry.webview) {
        wireActivityEvents(initialEntry.webview, activeTabId);
      }
    })();

    // ═══════════════════════════════════════════════
    // Voice Input (Web Speech API — runs in SHELL, NOT webview!)
    // ═══════════════════════════════════════════════

    let speechRecognition = null;
    let voiceActive = false;

    function startVoiceRecognition() {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRecognition) {
        console.warn('Web Speech API not available');
        return;
      }

      speechRecognition = new SpeechRecognition();
      speechRecognition.lang = 'nl-BE';
      speechRecognition.continuous = true;
      speechRecognition.interimResults = true;

      speechRecognition.onresult = (event) => {
        let interimText = '';
        let finalText = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalText += transcript;
          } else {
            interimText += transcript;
          }
        }

        // Show live transcript
        const liveEl = document.getElementById('voice-live-text');
        if (liveEl) liveEl.textContent = interimText || finalText;

        // Send to main process
        if (window.tandem) {
          if (finalText) {
            window.tandem.sendVoiceTranscript(finalText, true);
            if (liveEl) liveEl.textContent = '';
            // Voice → ChatRouter: send final transcript to active backend
            if (typeof chatRouter !== 'undefined' && chatRouter.router) {
              chatRouter.sendMessage(finalText);
            }
          } else if (interimText) {
            window.tandem.sendVoiceTranscript(interimText, false);
          }
        }
      };

      speechRecognition.onerror = (event) => {
        console.warn('Speech recognition error:', event.error);
        if (event.error !== 'no-speech') {
          stopVoiceRecognition();
        }
      };

      speechRecognition.onend = () => {
        // Auto-restart if still supposed to be listening
        if (voiceActive && speechRecognition) {
          try { speechRecognition.start(); } catch (e) { }
        }
      };

      try {
        speechRecognition.start();
        voiceActive = true;
        document.getElementById('voice-indicator').classList.add('active');
        // Switch to chat tab
        document.querySelectorAll('.panel-tab').forEach(b => b.classList.remove('active'));
        document.querySelector('[data-panel-tab="chat"]').classList.add('active');
        document.getElementById('panel-activity').style.display = 'none';
        document.getElementById('panel-chat').style.display = 'flex';
        document.getElementById('panel-screenshots').style.display = 'none';
      } catch (e) {
        console.error('Failed to start speech recognition:', e);
      }
    }

    function stopVoiceRecognition() {
      voiceActive = false;
      if (speechRecognition) {
        try { speechRecognition.stop(); } catch (e) { }
        speechRecognition = null;
      }
      document.getElementById('voice-indicator').classList.remove('active');
      document.getElementById('voice-live-text').textContent = '';
      if (window.tandem) window.tandem.sendVoiceStatus(false);
    }

    if (window.tandem) {
      window.tandem.onVoiceToggle((data) => {
        if (data.listening) {
          startVoiceRecognition();
        } else {
          stopVoiceRecognition();
        }
      });

      // Voice transcript display (from main process, for final messages)
      window.tandem.onVoiceTranscript((data) => {
        // Already handled via onChatMessage for final messages
      });

      // Auto-snapshot request from activity tracker
      window.tandem.onAutoSnapshotRequest((data) => {
        // Trigger snap silently
        window.tandem.snapForWingman();
      });
    }

    // ═══════════════════════════════════════════════
    // Settings — open in active tab
    // ═══════════════════════════════════════════════
    function openSettings() {
      const shellPath = window.location.href.replace(/\/[^/]*$/, '');
      const settingsUrl = shellPath + '/settings.html';
      const entry = tabs.get(activeTabId);
      if (entry) {
        entry.webview.loadURL(settingsUrl);
      }
    }

    // Handle tandem://settings in URL bar
    const _origUrlBarKeydown = urlBar.onkeydown;
    urlBar.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const val = urlBar.value.trim();
        if (val === 'tandem://settings') {
          e.preventDefault();
          e.stopImmediatePropagation();
          openSettings();
          return;
        }
      }
    }, true); // capture phase to run before existing handler

    // Chat polling removed — OpenClaw webchat iframe handles everything

    // ═══════════════════════════════════════════════
    // New tab page navigation messages
    // ═══════════════════════════════════════════════
    window.addEventListener('message', (e) => {
      if (e.data && e.data.type === 'tandem-newtab-navigate' && e.data.url) {
        const entry = tabs.get(activeTabId);
        if (entry) entry.webview.loadURL(e.data.url);
      }
    });

    // ═══════════════════════════════════════════════
    // Bookmarks bar + star
    // ═══════════════════════════════════════════════

    const bookmarkStar = document.getElementById('btn-bookmark');
    const bookmarksBar = document.getElementById('bookmarks-bar');
    let bookmarksBarVisible = true;

    async function updateBookmarkStar() {
      const entry = tabs.get(activeTabId);
      if (!entry) return;
      try {
        const url = entry.webview.getURL();
        if (!url || url.startsWith('file://') || url === 'about:blank') {
          bookmarkStar.textContent = '☆';
          bookmarkStar.classList.remove('bookmarked');
          return;
        }
        const resp = await fetch(`http://localhost:8765/bookmarks/check?url=${encodeURIComponent(url)}`);
        if (resp.ok) {
          const data = await resp.json();
          if (data.bookmarked) {
            bookmarkStar.textContent = '★';
            bookmarkStar.classList.add('bookmarked');
          } else {
            bookmarkStar.textContent = '☆';
            bookmarkStar.classList.remove('bookmarked');
          }
        }
      } catch { /* API not ready */ }
    }

    async function toggleBookmarkCurrentPage() {
      const entry = tabs.get(activeTabId);
      if (!entry) return;
      try {
        const url = entry.webview.getURL();
        const title = entry.webview.getTitle() || url;
        if (!url || url.startsWith('file://') || url === 'about:blank') return;

        if (bookmarkStar.classList.contains('bookmarked')) {
          // Remove bookmark
          const checkResp = await fetch(`http://localhost:8765/bookmarks/check?url=${encodeURIComponent(url)}`);
          if (checkResp.ok) {
            const checkData = await checkResp.json();
            if (checkData.bookmark) {
              await fetch('http://localhost:8765/bookmarks/remove', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: checkData.bookmark.id }),
              });
            }
          }
        } else {
          // Add bookmark
          await fetch('http://localhost:8765/bookmarks/add', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: title, url }),
          });
        }
        updateBookmarkStar();
        loadBookmarksBar();
      } catch { /* ignore */ }
    }

    bookmarkStar.addEventListener('click', toggleBookmarkCurrentPage);

    function toggleBookmarksBar() {
      bookmarksBarVisible = !bookmarksBarVisible;
      if (bookmarksBarVisible) {
        loadBookmarksBar();
      } else {
        bookmarksBar.classList.remove('visible');
      }
      // Persist to config
      fetch('http://localhost:8765/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ general: { showBookmarksBar: bookmarksBarVisible } }),
      }).catch(() => { });
    }

    // Transparent overlay to catch clicks outside dropdowns
    const bmOverlay = document.createElement('div');
    bmOverlay.id = 'bm-click-overlay';
    bmOverlay.style.cssText = 'display:none;position:fixed;top:0;left:0;width:100%;height:100%;z-index:499;';
    document.body.appendChild(bmOverlay);

    function closeAllBookmarkDropdowns() {
      document.querySelectorAll('.bm-dropdown.open').forEach(d => d.classList.remove('open'));
      bmOverlay.style.display = 'none';
    }

    bmOverlay.addEventListener('click', closeAllBookmarkDropdowns);

    function openBookmarkDropdown(dropdown) {
      // Close all other dropdowns first
      document.querySelectorAll('.bm-dropdown.open').forEach(d => {
        d.classList.remove('open');
        d.style.left = '';
        d.style.right = '';
      });
      dropdown.classList.add('open');
      // Flip top-level dropdown if it overflows right edge
      const rect = dropdown.getBoundingClientRect();
      if (rect.right > window.innerWidth) {
        dropdown.style.left = 'auto';
        dropdown.style.right = '0';
      }
      bmOverlay.style.display = 'block';
    }

    function createBookmarkLink(item) {
      const a = document.createElement('a');
      let hostname = '';
      try { hostname = new URL(item.url).hostname; } catch { }
      const shortName = (item.name || hostname).substring(0, 40);
      a.innerHTML = `<img src="https://www.google.com/s2/favicons?domain=${hostname}&sz=32" onerror="this.style.display='none'"> ${escapeHtml(shortName)}`;
      a.title = item.url;
      a.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        closeAllBookmarkDropdowns();
        const entry = tabs.get(activeTabId);
        if (entry) entry.webview.loadURL(item.url);
      });
      return a;
    }

    function createFolderDropdown(items) {
      const dropdown = document.createElement('div');
      dropdown.className = 'bm-dropdown';

      for (const child of items) {
        if (child.type === 'url' && child.url) {
          dropdown.appendChild(createBookmarkLink(child));
        } else if (child.type === 'folder' && child.children) {
          const subfolder = document.createElement('div');
          subfolder.className = 'bm-subfolder';
          const label = document.createElement('span');
          label.textContent = (child.name || 'Folder').substring(0, 35);
          const icon = document.createElement('span');
          icon.className = 'bm-folder-icon';
          icon.textContent = '📁';
          subfolder.appendChild(icon);
          subfolder.appendChild(label);

          const subDropdown = createFolderDropdown(child.children);
          subfolder.appendChild(subDropdown);

          // Click on the subfolder label/icon to toggle sub-dropdown
          subfolder.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            // Close sibling sub-dropdowns at same level
            const parent = subfolder.parentElement;
            if (parent) {
              parent.querySelectorAll('.bm-subfolder > .bm-dropdown.open').forEach(d => {
                if (d !== subDropdown) { d.classList.remove('open', 'flip-left', 'flip-top'); }
              });
            }
            subDropdown.classList.toggle('open');
            if (subDropdown.classList.contains('open')) {
              // Reset positioning
              subDropdown.classList.remove('flip-left', 'flip-top');
              const rect = subDropdown.getBoundingClientRect();
              // Flip left if overflows right edge
              if (rect.right > window.innerWidth) subDropdown.classList.add('flip-left');
              // Flip up if overflows bottom edge
              if (rect.bottom > window.innerHeight) subDropdown.classList.add('flip-top');
            }
          });

          dropdown.appendChild(subfolder);
        }
      }

      if (items.length === 0) {
        const empty = document.createElement('div');
        empty.style.cssText = 'padding: 6px 12px; font-size: 11px; color: #555;';
        empty.textContent = '(leeg)';
        dropdown.appendChild(empty);
      }

      return dropdown;
    }

    // Build a bar element (link or folder) from bookmark data
    function createBarElement(item) {
      if (item.type === 'url' && item.url) {
        return createBookmarkLink(item);
      } else if (item.type === 'folder' && item.children) {
        const folder = document.createElement('div');
        folder.className = 'bm-folder';
        folder.innerHTML = `<span class="bm-folder-icon">📁</span> ${escapeHtml((item.name || 'Folder').substring(0, 25))}`;
        const dropdown = createFolderDropdown(item.children);
        folder.appendChild(dropdown);
        folder.addEventListener('click', (e) => {
          e.stopPropagation();
          if (dropdown.classList.contains('open')) {
            closeAllBookmarkDropdowns();
          } else {
            openBookmarkDropdown(dropdown);
          }
        });
        return folder;
      }
      return null;
    }

    let barItems = []; // cached bookmark data for relayout

    function layoutBookmarksBar() {
      if (!bookmarksBarVisible || barItems.length === 0) return;

      bookmarksBar.innerHTML = '';
      bookmarksBar.classList.add('visible');

      // Add all items first
      const elements = [];
      for (const item of barItems) {
        const el = createBarElement(item);
        if (el) {
          bookmarksBar.appendChild(el);
          elements.push({ el, item });
        }
      }

      // Measure: find which items overflow the bar
      const barRight = bookmarksBar.getBoundingClientRect().right - 12; // minus padding
      let overflowIndex = -1;
      // Reserve ~40px for the >> button
      const reserveWidth = 40;

      for (let i = 0; i < elements.length; i++) {
        const elRect = elements[i].el.getBoundingClientRect();
        if (elRect.right > barRight - reserveWidth) {
          overflowIndex = i;
          break;
        }
      }

      if (overflowIndex < 0) return; // everything fits

      // Remove overflow items from bar
      const overflowItems = [];
      for (let i = overflowIndex; i < elements.length; i++) {
        bookmarksBar.removeChild(elements[i].el);
        overflowItems.push(elements[i].item);
      }

      // Create >> overflow button with dropdown
      const chevron = document.createElement('div');
      chevron.className = 'bm-overflow';
      chevron.textContent = '»';

      const overflowDropdown = document.createElement('div');
      overflowDropdown.className = 'bm-dropdown';
      // Build dropdown items from overflow data
      for (const item of overflowItems) {
        if (item.type === 'url' && item.url) {
          overflowDropdown.appendChild(createBookmarkLink(item));
        } else if (item.type === 'folder' && item.children) {
          const subfolder = document.createElement('div');
          subfolder.className = 'bm-subfolder';
          const icon = document.createElement('span');
          icon.className = 'bm-folder-icon';
          icon.textContent = '📁';
          const label = document.createElement('span');
          label.textContent = (item.name || 'Folder').substring(0, 35);
          subfolder.appendChild(icon);
          subfolder.appendChild(label);
          const subDropdown = createFolderDropdown(item.children);
          subfolder.appendChild(subDropdown);
          subfolder.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            overflowDropdown.querySelectorAll('.bm-subfolder > .bm-dropdown.open').forEach(d => {
              if (d !== subDropdown) d.classList.remove('open', 'flip-left', 'flip-top');
            });
            subDropdown.classList.toggle('open');
            if (subDropdown.classList.contains('open')) {
              subDropdown.classList.remove('flip-left', 'flip-top');
              const rect = subDropdown.getBoundingClientRect();
              if (rect.right > window.innerWidth) subDropdown.classList.add('flip-left');
              if (rect.bottom > window.innerHeight) subDropdown.classList.add('flip-top');
            }
          });
          overflowDropdown.appendChild(subfolder);
        }
      }

      chevron.appendChild(overflowDropdown);
      chevron.addEventListener('click', (e) => {
        e.stopPropagation();
        if (overflowDropdown.classList.contains('open')) {
          closeAllBookmarkDropdowns();
        } else {
          openBookmarkDropdown(overflowDropdown);
        }
      });

      bookmarksBar.appendChild(chevron);
    }

    // Relayout on window resize
    window.addEventListener('resize', () => {
      if (bookmarksBarVisible && barItems.length > 0) layoutBookmarksBar();
    });

    async function loadBookmarksBar() {
      if (!bookmarksBarVisible) return;

      let retries = 3;
      while (retries > 0) {
        try {
          const resp = await fetch('http://localhost:8765/bookmarks');
          if (!resp.ok) {
            retries--;
            if (retries > 0) { await new Promise(r => setTimeout(r, 1000)); continue; }
            return;
          }
          const data = await resp.json();
          barItems = (data.bar || []).slice(0, 30);
          if (barItems.length === 0) {
            bookmarksBar.classList.remove('visible');
            return;
          }
          layoutBookmarksBar();
          break;
        } catch (err) {
          retries--;
          if (retries > 0) { await new Promise(r => setTimeout(r, 1000)); }
        }
      }
    }

    // Load bookmarks bar on startup — respect config
    setTimeout(async () => {
      try {
        const res = await fetch('http://localhost:8765/config');
        if (res.ok) {
          const cfg = await res.json();
          if (cfg.general && cfg.general.showBookmarksBar === false) {
            bookmarksBarVisible = false;
            bookmarksBar.classList.remove('visible');
            return;
          }
        }
      } catch { /* API not ready, show bar by default */ }
      loadBookmarksBar();
    }, 1500);

    // Update star when URL changes
    const _prevUpdateTabMeta2 = updateTabMeta;
    updateTabMeta = function (tabId, data) {
      _prevUpdateTabMeta2(tabId, data);
      if (data.url && tabId === activeTabId) {
        setTimeout(updateBookmarkStar, 200);
      }
    };

    // ═══════════════════════════════════════════════
    // Find in page
    // ═══════════════════════════════════════════════

    const findBar = document.getElementById('find-bar');
    const findInput = document.getElementById('find-input');
    const findCount = document.getElementById('find-count');
    let findActive = false;

    function toggleFindBar(show) {
      if (show === undefined) show = !findActive;
      findActive = show;
      if (show) {
        findBar.classList.add('visible');
        findInput.focus();
        findInput.select();
      } else {
        findBar.classList.remove('visible');
        findInput.value = '';
        findCount.textContent = '';
        // Stop finding
        const entry = tabs.get(activeTabId);
        if (entry) entry.webview.stopFindInPage('clearSelection');
      }
    }

    function doFind(forward) {
      const text = findInput.value;
      if (!text) {
        findCount.textContent = '';
        return;
      }
      const entry = tabs.get(activeTabId);
      if (!entry) return;
      entry.webview.findInPage(text, { forward: forward !== false });
    }

    findInput.addEventListener('input', () => doFind(true));
    findInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        doFind(!e.shiftKey);
      } else if (e.key === 'Escape') {
        toggleFindBar(false);
      }
    });
    document.getElementById('find-next').addEventListener('click', () => doFind(true));
    document.getElementById('find-prev').addEventListener('click', () => doFind(false));
    document.getElementById('find-close').addEventListener('click', () => toggleFindBar(false));

    // Listen for find results from webview
    function wireFindEvents(wv) {
      wv.addEventListener('found-in-page', (e) => {
        if (e.result) {
          findCount.textContent = `${e.result.activeMatchOrdinal}/${e.result.matches}`;
        }
      });
    }

    // Wire find events for existing and new tabs
    const _origCreateTab2 = window.__tandemTabs.createTab;
    window.__tandemTabs.createTab = function (tabId, url, partition) {
      const result = _origCreateTab2.call(window.__tandemTabs, tabId, url, partition);
      const entry = tabs.get(tabId);
      if (entry && entry.webview) wireFindEvents(entry.webview);
      return result;
    };
    // Wire for initial tab
    (() => {
      const entry = tabs.get(activeTabId);
      if (entry && entry.webview) wireFindEvents(entry.webview);
    })();

    // ═══════════════════════════════════════════════
    // History page
    // ═══════════════════════════════════════════════

    function openHistoryPage() {
      const shellPath = window.location.href.replace(/\/[^/]*$/, '');
      const historyUrl = shellPath + '/history.html';
      const entry = tabs.get(activeTabId);
      if (entry) entry.webview.loadURL(historyUrl);
    }

    // Clear URL bar when on newtab page
    function isNewtabUrl(url) {
      return url && (url.includes('newtab.html') || url.startsWith('file://') && url.endsWith('newtab.html'));
    }

    // Patch updateTabMeta to clear URL bar on newtab
    const _prevUpdateTabMeta = updateTabMeta;
    updateTabMeta = function (tabId, data) {
      _prevUpdateTabMeta(tabId, data);
      if (data.url && tabId === activeTabId && isNewtabUrl(data.url)) {
        urlBar.value = '';
      }
    };

    // ═══════════════════════════════════════════════
    // Screenshot preview with actual images in panel
    // ═══════════════════════════════════════════════

    // Override screenshot-taken handler to show base64 preview
    if (window.tandem) {
      // Remove old handler and add enhanced one
      window.tandem.onScreenshotTaken((data) => {
        const listEl = document.getElementById('screenshot-list');
        const placeholder = listEl.querySelector('p');
        if (placeholder) placeholder.remove();

        const div = document.createElement('div');
        div.className = 'ss-item';
        if (data.base64) {
          const imgSrc = `data:image/png;base64,${data.base64}`;
          div.innerHTML = `
            <img src="${imgSrc}" alt="${escapeHtml(data.filename)}" title="Klik om te vergroten">
            <div class="ss-label">${escapeHtml(data.filename)}</div>
          `;
          div.querySelector('img').addEventListener('click', () => {
            const win = window.open('', '_blank', 'width=1200,height=800');
            if (win) {
              win.document.write(`<!DOCTYPE html><html><head><title>${data.filename}</title><style>body{margin:0;background:#111;display:flex;align-items:center;justify-content:center;min-height:100vh;}img{max-width:100%;max-height:100vh;}</style></head><body><img src="${imgSrc}"></body></html>`);
            }
          });
        } else {
          div.innerHTML = `<div class="ss-label">${escapeHtml(data.filename)}</div>`;
        }
        listEl.prepend(div);
      });
    }

    // ═══════════════════════════════════════════════
    // ClaroNote Integration
    // ═══════════════════════════════════════════════

    let claroNoteInitialized = false;
    let claroNoteRecording = false;
    let claroNoteTimer = null;
    let claroNoteStartTime = 0;
    let claroNoteMediaRecorder = null;
    let claroNoteAudioChunks = [];
    let claroNoteAudioStream = null;
    let claroNoteAnalyser = null;
    let claroNoteWaveformRAF = null;

    async function initClaroNote() {
      if (claroNoteInitialized) return;
      try {
        const response = await fetch('http://localhost:8765/claronote/status');
        const data = await response.json();
        if (data.authenticated) {
          showClaroNoteMain(data.user);
          await loadClaroNoteNotes();
        } else {
          showClaroNoteLogin();
        }
        claroNoteInitialized = true;
        setupClaroNoteEventListeners();
      } catch (error) {
        console.error('Failed to initialize ClaroNote:', error);
        showClaroNoteError('Verbindingsfout met ClaroNote API');
      }
    }

    function showClaroNoteLogin() {
      document.getElementById('claronote-login').style.display = 'block';
      document.getElementById('claronote-main').style.display = 'none';
    }

    function showClaroNoteMain(user) {
      document.getElementById('claronote-login').style.display = 'none';
      document.getElementById('claronote-main').style.display = 'flex';
    }

    function showClaroNoteError(message) {
      const errorEl = document.getElementById('claronote-error');
      errorEl.textContent = message;
      errorEl.style.display = 'block';
      setTimeout(() => { errorEl.style.display = 'none'; }, 5000);
    }

    function setupClaroNoteEventListeners() {
      const loginForm = document.getElementById('claronote-login-form');
      if (loginForm) loginForm.addEventListener('submit', async (e) => { e.preventDefault(); await handleClaroNoteLogin(); });
      const recordBtn = document.getElementById('claronote-record-btn');
      if (recordBtn) recordBtn.addEventListener('click', toggleClaroNoteRecording);
      const refreshBtn = document.getElementById('claronote-refresh');
      if (refreshBtn) refreshBtn.addEventListener('click', loadClaroNoteNotes);
    }

    async function handleClaroNoteLogin() {
      const emailEl = document.getElementById('claronote-email');
      const passwordEl = document.getElementById('claronote-password');
      const loginBtn = document.getElementById('claronote-login-btn');
      if (!emailEl || !passwordEl || !loginBtn) return;
      const email = emailEl.value;
      const password = passwordEl.value;
      if (!email || !password) return;
      loginBtn.textContent = 'Inloggen...';
      loginBtn.disabled = true;
      try {
        const response = await fetch('http://localhost:8765/claronote/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password })
        });
        const data = await response.json();
        if (data.success) {
          showClaroNoteMain(data.user);
          await loadClaroNoteNotes();
        } else {
          showClaroNoteError(data.error || 'Inloggen mislukt');
        }
      } catch (error) {
        showClaroNoteError('Netwerk fout');
      } finally {
        loginBtn.textContent = 'Inloggen';
        loginBtn.disabled = false;
      }
    }

    async function toggleClaroNoteRecording() {
      if (claroNoteRecording) {
        await stopClaroNoteRecording();
      } else {
        await startClaroNoteRecording();
      }
    }

    async function startClaroNoteRecording() {
      try {
        // Request microphone access — actual audio capture in renderer
        claroNoteAudioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        claroNoteMediaRecorder = new MediaRecorder(claroNoteAudioStream, { mimeType: 'audio/webm' });
        claroNoteAudioChunks = [];

        claroNoteMediaRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) claroNoteAudioChunks.push(e.data);
        };

        claroNoteMediaRecorder.start(1000); // collect chunks every second
        claroNoteRecording = true;
        claroNoteStartTime = Date.now();

        // Setup waveform visualization
        try {
          const audioCtx = new AudioContext();
          const source = audioCtx.createMediaStreamSource(claroNoteAudioStream);
          claroNoteAnalyser = audioCtx.createAnalyser();
          claroNoteAnalyser.fftSize = 256;
          source.connect(claroNoteAnalyser);
          drawClaroNoteWaveform();
        } catch (e) { /* waveform optional */ }

        updateRecordingUI();
        startRecordingTimer();

        // Notify server (state tracking only)
        fetch('http://localhost:8765/claronote/record/start', { method: 'POST' }).catch(() => { });
      } catch (error) {
        showClaroNoteError('Microfoon niet beschikbaar');
      }
    }

    async function stopClaroNoteRecording() {
      if (!claroNoteMediaRecorder) return;

      return new Promise((resolve) => {
        claroNoteMediaRecorder.onstop = async () => {
          claroNoteRecording = false;
          const duration = Math.round((Date.now() - claroNoteStartTime) / 1000);

          // Cleanup audio stream
          if (claroNoteAudioStream) {
            claroNoteAudioStream.getTracks().forEach(t => t.stop());
            claroNoteAudioStream = null;
          }
          if (claroNoteWaveformRAF) { cancelAnimationFrame(claroNoteWaveformRAF); claroNoteWaveformRAF = null; }
          claroNoteAnalyser = null;

          updateRecordingUI();
          stopRecordingTimer();
          document.getElementById('claronote-status-text').textContent = 'Uploaden...';

          // Convert to base64 and upload via API proxy
          try {
            const blob = new Blob(claroNoteAudioChunks, { type: 'audio/webm' });
            const reader = new FileReader();
            reader.onloadend = async () => {
              try {
                const base64 = reader.result.split(',')[1];
                const resp = await fetch('http://localhost:8765/claronote/upload', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ audioBase64: base64, duration })
                });
                const data = await resp.json();
                if (data.ok && data.noteId) {
                  document.getElementById('claronote-status-text').textContent = 'Verwerken...';
                  pollNoteStatus(data.noteId);
                } else {
                  document.getElementById('claronote-status-text').textContent = 'Upload mislukt';
                  setTimeout(() => { document.getElementById('claronote-status-text').textContent = 'Klaar om op te nemen'; }, 3000);
                }
              } catch (err) {
                document.getElementById('claronote-status-text').textContent = 'Upload mislukt';
                setTimeout(() => { document.getElementById('claronote-status-text').textContent = 'Klaar om op te nemen'; }, 3000);
              }
              resolve();
            };
            reader.readAsDataURL(blob);
          } catch (err) {
            document.getElementById('claronote-status-text').textContent = 'Upload mislukt';
            resolve();
          }
        };

        claroNoteMediaRecorder.stop();
        fetch('http://localhost:8765/claronote/record/stop', { method: 'POST' }).catch(() => { });
      });
    }

    function drawClaroNoteWaveform() {
      if (!claroNoteAnalyser || !claroNoteRecording) return;
      const waveformEl = document.getElementById('claronote-waveform');
      const bufLen = claroNoteAnalyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufLen);
      claroNoteAnalyser.getByteFrequencyData(dataArray);
      const bars = 20;
      const step = Math.floor(bufLen / bars);
      let stops = [];
      for (let i = 0; i < bars; i++) {
        const val = dataArray[i * step] / 255;
        stops.push(`rgba(233,69,96,${val * 0.8 + 0.1}) ${(i / bars) * 100}%`);
      }
      waveformEl.style.background = `linear-gradient(90deg, ${stops.join(', ')})`;
      claroNoteWaveformRAF = requestAnimationFrame(drawClaroNoteWaveform);
    }

    function updateRecordingUI() {
      const recordBtn = document.getElementById('claronote-record-btn');
      const statusText = document.getElementById('claronote-status-text');
      const waveform = document.getElementById('claronote-waveform');
      if (claroNoteRecording) {
        recordBtn.style.background = 'var(--warning)';
        recordBtn.textContent = '⏹️';
        statusText.textContent = 'Opname bezig...';
        waveform.style.display = 'block';
      } else {
        recordBtn.style.background = 'var(--accent)';
        recordBtn.textContent = '🎙️';
        statusText.textContent = 'Klaar om op te nemen';
        waveform.style.display = 'none';
      }
    }

    function startRecordingTimer() {
      claroNoteTimer = setInterval(() => {
        const elapsed = Math.floor((Date.now() - claroNoteStartTime) / 1000);
        const minutes = Math.floor(elapsed / 60);
        const seconds = elapsed % 60;
        document.getElementById('claronote-timer').textContent =
          `${minutes}:${seconds.toString().padStart(2, '0')}`;
      }, 1000);
    }

    function stopRecordingTimer() {
      if (claroNoteTimer) {
        clearInterval(claroNoteTimer);
        claroNoteTimer = null;
        document.getElementById('claronote-timer').textContent = '';
      }
    }

    async function loadClaroNoteNotes() {
      try {
        const response = await fetch('http://localhost:8765/claronote/notes?limit=10');
        const data = await response.json();

        if (data.notes) {
          displayClaroNoteNotes(data.notes);
        }
      } catch (error) {
        console.error('Failed to load notes:', error);
      }
    }

    function displayClaroNoteNotes(notes) {
      const listEl = document.getElementById('claronote-notes-list');

      if (notes.length === 0) {
        listEl.innerHTML = '<p style="font-size:12px;color:var(--text-dim);text-align:center;padding:20px;">Nog geen notities opgenomen</p>';
        return;
      }

      listEl.innerHTML = '';

      notes.forEach(note => {
        const noteEl = document.createElement('div');
        noteEl.style.cssText = 'padding:10px 15px;border-bottom:1px solid rgba(255,255,255,0.03);cursor:pointer;transition:background 0.15s;';

        // Status indicator
        let statusColor = 'var(--text-dim)';
        let statusText = note.status;
        if (note.status === 'READY') { statusColor = 'var(--success)'; statusText = 'Klaar'; }
        else if (note.status === 'PROCESSING') { statusColor = 'var(--warning)'; statusText = 'Verwerken...'; }
        else if (note.status === 'UPLOADING') { statusColor = 'var(--accent)'; statusText = 'Uploaden...'; }
        else if (note.status === 'ERROR') { statusColor = 'var(--warning)'; statusText = 'Fout'; }

        noteEl.innerHTML = `
          <div style="display:flex;justify-content:between;align-items:flex-start;gap:8px;">
            <div style="flex:1;">
              <div style="font-size:12px;color:var(--text);margin-bottom:4px;font-weight:500;">
                ${note.title || 'Notitie'}
              </div>
              ${note.summary ? `
                <div style="font-size:11px;color:var(--text-dim);margin-bottom:6px;line-height:1.3;">
                  ${note.summary.length > 100 ? note.summary.substring(0, 100) + '...' : note.summary}
                </div>
              ` : ''}
              <div style="font-size:10px;color:var(--text-dim);display:flex;gap:8px;">
                <span>${Math.floor(note.duration / 60)}:${(note.duration % 60).toString().padStart(2, '0')}</span>
                <span>•</span>
                <span>${new Date(note.createdAt).toLocaleDateString('nl-NL')}</span>
              </div>
            </div>
            <div style="flex-shrink:0;font-size:10px;color:${statusColor};">
              ${statusText}
            </div>
          </div>
        `;

        noteEl.addEventListener('mouseenter', () => {
          noteEl.style.background = 'rgba(255,255,255,0.03)';
        });

        noteEl.addEventListener('mouseleave', () => {
          noteEl.style.background = '';
        });

        noteEl.addEventListener('click', () => {
          showNoteDetails(note);
        });

        listEl.appendChild(noteEl);
      });
    }

    function showNoteDetails(note) {
      // Create a simple modal/overlay to show full transcript
      const modal = document.createElement('div');
      modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0,0,0,0.8);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 10000;
      `;

      const content = document.createElement('div');
      content.style.cssText = `
        background: var(--surface);
        border-radius: 12px;
        padding: 20px;
        max-width: 600px;
        max-height: 80vh;
        overflow-y: auto;
        color: var(--text);
        border: 1px solid rgba(255,255,255,0.1);
      `;

      content.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:15px;">
          <h3 style="margin:0;color:var(--text);">${note.title || 'Notitie'}</h3>
          <button onclick="this.parentElement.parentElement.parentElement.remove()" 
                  style="background:none;border:none;color:var(--text-dim);cursor:pointer;font-size:18px;">✕</button>
        </div>
        
        <div style="margin-bottom:15px;font-size:11px;color:var(--text-dim);display:flex;gap:12px;">
          <span>Duur: ${Math.floor(note.duration / 60)}:${(note.duration % 60).toString().padStart(2, '0')}</span>
          <span>Datum: ${new Date(note.createdAt).toLocaleString('nl-NL')}</span>
        </div>
        
        ${note.summary ? `
          <div style="margin-bottom:15px;">
            <h4 style="margin:0 0 8px 0;font-size:12px;color:var(--accent);">Samenvatting</h4>
            <div style="font-size:12px;line-height:1.4;">${note.summary}</div>
          </div>
        ` : ''}
        
        ${note.transcript ? `
          <div>
            <h4 style="margin:0 0 8px 0;font-size:12px;color:var(--accent);">Transcript</h4>
            <div style="font-size:12px;line-height:1.5;white-space:pre-wrap;">${note.transcript}</div>
          </div>
        ` : '<div style="font-size:12px;color:var(--text-dim);">Transcript nog niet beschikbaar</div>'}
      `;

      modal.appendChild(content);
      document.body.appendChild(modal);

      // Close on backdrop click
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          modal.remove();
        }
      });
    }

    async function pollNoteStatus(noteId) {
      try {
        const response = await fetch(`http://localhost:8765/claronote/notes/${noteId}`);
        const data = await response.json();

        if (data.note && (data.note.status === 'PROCESSING' || data.note.status === 'UPLOADING')) {
          // Still processing, poll again in 2 seconds
          setTimeout(() => pollNoteStatus(noteId), 2000);
        } else {
          // Done processing, update UI
          document.getElementById('claronote-status-text').textContent = 'Klaar om op te nemen';
          await loadClaroNoteNotes();
        }
      } catch (error) {
        console.error('Polling error:', error);
        document.getElementById('claronote-status-text').textContent = 'Klaar om op te nemen';
      }
    }

    // ═══════════════════════════════════════════════
    // Extension Toolbar (Phase 5b)
    // ═══════════════════════════════════════════════

    const MAX_VISIBLE_EXTENSIONS = 6;
    let extToolbarData = [];

    function escHtml(str) {
      const d = document.createElement('div');
      d.textContent = str;
      return d.innerHTML;
    }

    function renderExtToolbar(extensions) {
      extToolbarData = extensions || [];
      const container = document.getElementById('ext-toolbar');
      const overflowBtn = document.getElementById('ext-overflow-btn');
      const overflowDropdown = document.getElementById('ext-overflow-dropdown');
      if (!container) return;

      // Remove existing extension buttons (keep overflow btn + dropdown)
      container.querySelectorAll('.ext-toolbar-btn').forEach(el => el.remove());

      if (extToolbarData.length === 0) {
        overflowBtn.style.display = 'none';
        overflowDropdown.classList.remove('visible');
        return;
      }

      // Split into visible (pinned first, then by order, up to MAX) and overflow
      const visible = extToolbarData.slice(0, MAX_VISIBLE_EXTENSIONS);
      const overflow = extToolbarData.slice(MAX_VISIBLE_EXTENSIONS);

      // Render visible buttons (insert before overflow button)
      for (const ext of visible) {
        const btn = document.createElement('button');
        btn.className = 'ext-toolbar-btn';
        btn.title = escHtml(ext.title || ext.name);
        btn.dataset.extId = ext.id;

        const img = document.createElement('img');
        img.src = ext.icon;
        img.alt = ext.name;
        img.draggable = false;
        btn.appendChild(img);

        // Badge
        if (ext.badgeText) {
          const badge = document.createElement('span');
          badge.className = 'ext-badge';
          badge.textContent = ext.badgeText;
          if (ext.badgeColor) badge.style.background = ext.badgeColor;
          btn.appendChild(badge);
        }

        // Left click: open popup
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          if (ext.popupUrl && window.tandem) {
            const rect = btn.getBoundingClientRect();
            window.tandem.openExtensionPopup(ext.id, {
              x: Math.round(rect.left),
              y: Math.round(rect.bottom + 4)
            });
          }
        });

        // Right click: context menu
        btn.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (window.tandem) {
            window.tandem.showExtensionContextMenu(ext.id);
          }
        });

        container.insertBefore(btn, overflowBtn);
      }

      // Overflow button
      if (overflow.length > 0) {
        overflowBtn.style.display = 'flex';
        renderExtOverflow(overflow, overflowDropdown);
      } else {
        overflowBtn.style.display = 'none';
        overflowDropdown.classList.remove('visible');
      }
    }

    function renderExtOverflow(extensions, dropdown) {
      dropdown.innerHTML = '';
      for (const ext of extensions) {
        const item = document.createElement('button');
        item.className = 'ext-overflow-item';

        const img = document.createElement('img');
        img.src = ext.icon;
        img.alt = ext.name;
        img.draggable = false;
        item.appendChild(img);

        const name = document.createElement('span');
        name.textContent = ext.name;
        item.appendChild(name);

        if (ext.badgeText) {
          const badge = document.createElement('span');
          badge.className = 'ext-badge';
          badge.textContent = ext.badgeText;
          if (ext.badgeColor) badge.style.background = ext.badgeColor;
          item.appendChild(badge);
        }

        // Left click: open popup
        item.addEventListener('click', (e) => {
          e.stopPropagation();
          dropdown.classList.remove('visible');
          if (ext.popupUrl && window.tandem) {
            const rect = item.getBoundingClientRect();
            window.tandem.openExtensionPopup(ext.id, {
              x: Math.round(rect.left),
              y: Math.round(rect.bottom + 4)
            });
          }
        });

        // Right click: context menu
        item.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          e.stopPropagation();
          dropdown.classList.remove('visible');
          if (window.tandem) {
            window.tandem.showExtensionContextMenu(ext.id);
          }
        });

        dropdown.appendChild(item);
      }
    }

    // Toggle overflow dropdown
    (function () {
      const overflowBtn = document.getElementById('ext-overflow-btn');
      const overflowDropdown = document.getElementById('ext-overflow-dropdown');
      if (overflowBtn && overflowDropdown) {
        overflowBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          overflowDropdown.classList.toggle('visible');
        });
        // Close dropdown on click outside
        document.addEventListener('click', () => {
          overflowDropdown.classList.remove('visible');
        });
      }
    })();

    // Listen for toolbar updates from main process
    if (window.tandem) {
      window.tandem.onExtensionToolbarUpdate((extensions) => {
        renderExtToolbar(extensions);
      });

      // Listen for extension remove requests (from context menu)
      window.tandem.onExtensionRemoveRequest(async (data) => {
        const confirmed = confirm(`Remove "${data.name}" from Tandem?`);
        if (!confirmed) return;
        try {
          const resp = await fetch(`http://localhost:8765/extensions/uninstall/${data.diskId || data.id}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
          });
          if (resp.ok) {
            // Refresh toolbar
            const exts = await window.tandem.getToolbarExtensions();
            renderExtToolbar(exts);
          }
        } catch (err) {
          console.warn('Extension remove failed:', err);
        }
      });

      // Listen for toolbar refresh (triggered by API install/uninstall)
      window.tandem.onExtensionToolbarRefresh(async () => {
        try {
          const exts = await window.tandem.getToolbarExtensions();
          renderExtToolbar(exts);
        } catch (e) {
          console.warn('Extension toolbar refresh failed:', e);
        }
      });

      // Load initial toolbar state
      window.tandem.getToolbarExtensions().then(exts => {
        renderExtToolbar(exts);
      }).catch(() => { });
    }

// ═══ About Overlay ═══
function showAboutOverlay() {
  const overlay = document.getElementById('about-overlay');
  if (overlay) {
    overlay.style.display = 'flex';
  }
}

function hideAboutOverlay() {
  const overlay = document.getElementById('about-overlay');
  if (overlay) {
    overlay.style.display = 'none';
  }
}

// Initialize About overlay event listeners
document.addEventListener('DOMContentLoaded', () => {
  const aboutClose = document.getElementById('about-close');
  const aboutOverlay = document.getElementById('about-overlay');
  const aboutGithubLink = document.getElementById('about-github-link');
  
  if (aboutClose) {
    aboutClose.addEventListener('click', hideAboutOverlay);
  }
  
  if (aboutOverlay) {
    aboutOverlay.addEventListener('click', (e) => {
      if (e.target === aboutOverlay) hideAboutOverlay();
    });
  }
  
  if (aboutGithubLink) {
    aboutGithubLink.addEventListener('click', (e) => {
      e.preventDefault();
      if (window.tandem) window.tandem.newTab('https://github.com/hydro13');
      hideAboutOverlay();
    });
  }
  
  // Listen for show-about event from main process
  if (window.tandem && window.tandem.onShortcut) {
    const originalHandler = window.tandem.onShortcut;
    // Add show-about to shortcuts
  }
});
