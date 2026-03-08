(() => {
    const renderer = window.__tandemRenderer;
    if (!renderer) {
      console.error('[main] Missing renderer bridge');
      return;
    }

    function getTabs() {
      return renderer.getTabs();
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

    // ═══════════════════════════════════════════════
    // Draw/Annotatie Tool
    // ═══════════════════════════════════════════════

    const drawCanvas = document.getElementById('draw-canvas');
    const drawToolbar = document.getElementById('draw-toolbar');
    const ctx = drawCanvas.getContext('2d');

    let drawEnabled = false;
    let drawCanvasTabId = null;
    let currentTool = 'line';
    let currentColor = '#e94560';
    let toolActive = false;
    let isDrawing = false;
    let startX = 0;
    let startY = 0;
    const tabShapes = new Map();
    const tabScrollOffsets = new Map();
    let currentPath = [];
    let scrollPollInterval = null;

    function getShapesForCurrentTab() {
      if (!drawCanvasTabId) return [];
      if (!tabShapes.has(drawCanvasTabId)) {
        tabShapes.set(drawCanvasTabId, []);
      }
      return tabShapes.get(drawCanvasTabId);
    }

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

    const scrollJS = `(function() {
      return {
        x: window.scrollX || window.pageXOffset || 0,
        y: window.scrollY || window.pageYOffset || 0
      };
    })();`;

    async function installScrollListener(webview, tabId) {
      if (scrollPollInterval) {
        clearInterval(scrollPollInterval);
        scrollPollInterval = null;
      }

      try {
        const initialScroll = await webview.executeJavaScript(scrollJS);
        tabScrollOffsets.set(tabId, initialScroll);
        redraw();
      } catch {
        tabScrollOffsets.set(tabId, { x: 0, y: 0 });
      }

      scrollPollInterval = setInterval(async () => {
        if (!drawEnabled || drawCanvasTabId !== tabId) {
          clearInterval(scrollPollInterval);
          scrollPollInterval = null;
          return;
        }

        try {
          const scrollPos = await webview.executeJavaScript(scrollJS);
          const currentOffset = tabScrollOffsets.get(tabId) || { x: 0, y: 0 };
          if (scrollPos.x !== currentOffset.x || scrollPos.y !== currentOffset.y) {
            tabScrollOffsets.set(tabId, scrollPos);
            redraw();
          }
        } catch {
          // Webview might be destroyed or navigating.
        }
      }, 50);
    }

    function redraw() {
      ctx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
      const shapes = getShapesForCurrentTab();
      const scroll = getScrollOffset();

      ctx.save();
      ctx.translate(-scroll.x, -scroll.y);

      for (const shape of shapes) {
        drawShape(shape);
      }

      ctx.restore();
    }

    function drawShape(shape) {
      ctx.strokeStyle = shape.color;
      ctx.fillStyle = shape.color;
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      if (shape.type === 'line') {
        ctx.beginPath();
        if (shape.points.length > 0) {
          ctx.moveTo(shape.points[0].x, shape.points[0].y);
          for (let index = 1; index < shape.points.length; index += 1) {
            ctx.lineTo(shape.points[index].x, shape.points[index].y);
          }
        }
        ctx.stroke();
      } else if (shape.type === 'rect') {
        ctx.strokeRect(shape.x, shape.y, shape.w, shape.h);
      } else if (shape.type === 'circle') {
        const rx = Math.abs(shape.w) / 2;
        const ry = Math.abs(shape.h) / 2;
        const cx = shape.x + shape.w / 2;
        const cy = shape.y + shape.h / 2;
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        ctx.stroke();
      } else if (shape.type === 'arrow') {
        const dx = shape.ex - shape.sx;
        const dy = shape.ey - shape.sy;
        const angle = Math.atan2(dy, dx);
        const len = Math.sqrt(dx * dx + dy * dy);
        const headLen = Math.min(20, len * 0.3);

        ctx.beginPath();
        ctx.moveTo(shape.sx, shape.sy);
        ctx.lineTo(shape.ex, shape.ey);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(shape.ex, shape.ey);
        ctx.lineTo(shape.ex - headLen * Math.cos(angle - 0.4), shape.ey - headLen * Math.sin(angle - 0.4));
        ctx.moveTo(shape.ex, shape.ey);
        ctx.lineTo(shape.ex - headLen * Math.cos(angle + 0.4), shape.ey - headLen * Math.sin(angle + 0.4));
        ctx.stroke();
      } else if (shape.type === 'text') {
        ctx.font = 'bold 16px -apple-system, sans-serif';
        ctx.fillText(shape.text, shape.x, shape.y);
      }
    }

    function buildShape(mx, my) {
      if (currentTool === 'rect') {
        return { type: 'rect', x: Math.min(startX, mx), y: Math.min(startY, my), w: Math.abs(mx - startX), h: Math.abs(my - startY), color: currentColor };
      }
      if (currentTool === 'circle') {
        return { type: 'circle', x: Math.min(startX, mx), y: Math.min(startY, my), w: mx - startX, h: my - startY, color: currentColor };
      }
      if (currentTool === 'arrow') {
        return { type: 'arrow', sx: startX, sy: startY, ex: mx, ey: my, color: currentColor };
      }
      return null;
    }

    function syncDrawSurfaceForTab(tabId) {
      setTimeout(() => {
        const entry = tabId ? getTabs().get(tabId) : null;

        if (drawCanvasTabId === tabId && drawEnabled) {
          drawCanvas.classList.add('active');
          if (entry?.webview) {
            installScrollListener(entry.webview, tabId);
          }
          drawToolbar.classList.add('visible');
          redraw();
          return;
        }

        if (tabId && tabShapes.has(tabId) && tabShapes.get(tabId).length > 0) {
          drawCanvas.classList.add('active');
          drawToolbar.classList.remove('visible');
          const previousTabId = drawCanvasTabId;
          drawCanvasTabId = tabId;
          redraw();
          drawCanvasTabId = previousTabId;
          return;
        }

        drawCanvas.classList.remove('active');
        drawToolbar.classList.remove('visible');
      }, 0);
    }

    drawCanvas.addEventListener('mousedown', (event) => {
      if (!drawEnabled || !toolActive) return;
      isDrawing = true;
      const rect = drawCanvas.getBoundingClientRect();
      const scroll = getScrollOffset();
      startX = event.clientX - rect.left + scroll.x;
      startY = event.clientY - rect.top + scroll.y;
      if (currentTool === 'line') {
        currentPath = [{ x: startX, y: startY }];
      }
    });

    drawCanvas.addEventListener('mousemove', (event) => {
      if (!isDrawing || !drawEnabled) return;
      const rect = drawCanvas.getBoundingClientRect();
      const scroll = getScrollOffset();
      const mx = event.clientX - rect.left + scroll.x;
      const my = event.clientY - rect.top + scroll.y;

      if (currentTool === 'line') {
        currentPath.push({ x: mx, y: my });
        redraw();
        ctx.strokeStyle = currentColor;
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(currentPath[0].x, currentPath[0].y);
        for (let index = 1; index < currentPath.length; index += 1) {
          ctx.lineTo(currentPath[index].x, currentPath[index].y);
        }
        ctx.stroke();
      } else {
        redraw();
        const preview = buildShape(mx, my);
        if (preview) drawShape(preview);
      }
    });

    drawCanvas.addEventListener('mouseup', (event) => {
      if (!isDrawing || !drawEnabled) return;
      isDrawing = false;
      const rect = drawCanvas.getBoundingClientRect();
      const scroll = getScrollOffset();
      const mx = event.clientX - rect.left + scroll.x;
      const my = event.clientY - rect.top + scroll.y;

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

    document.querySelectorAll('.draw-toolbar button[data-tool]').forEach((button) => {
      button.addEventListener('click', () => {
        const wasActive = button.classList.contains('active');
        document.querySelectorAll('.draw-toolbar button[data-tool]').forEach((candidate) => candidate.classList.remove('active'));

        if (wasActive) {
          toolActive = false;
          drawCanvas.classList.remove('drawing');
        } else {
          button.classList.add('active');
          currentTool = button.dataset.tool;
          toolActive = true;
          drawCanvas.classList.add('drawing');
        }
      });
    });

    document.querySelectorAll('.draw-toolbar .color-btn').forEach((button) => {
      button.addEventListener('click', () => {
        document.querySelectorAll('.draw-toolbar .color-btn').forEach((candidate) => candidate.classList.remove('active'));
        button.classList.add('active');
        currentColor = button.dataset.color;
      });
    });

    document.getElementById('btn-draw-clear').addEventListener('click', () => {
      if (drawCanvasTabId) {
        tabShapes.set(drawCanvasTabId, []);
      }
      redraw();
    });

    document.getElementById('btn-snap-wingman').addEventListener('click', () => {
      if (window.tandem) window.tandem.snapForWingman();
    });

    if (window.tandem) {
      window.tandem.onDrawMode((data) => {
        drawEnabled = data.enabled;
        if (drawEnabled) {
          drawCanvasTabId = getActiveTabId();
          drawCanvas.classList.add('active');
          drawToolbar.classList.add('visible');
          resizeCanvas();

          const entry = getTabs().get(drawCanvasTabId);
          if (entry?.webview) {
            installScrollListener(entry.webview, drawCanvasTabId);
          }
        } else {
          drawCanvas.classList.remove('active');
          drawToolbar.classList.remove('visible');
          drawCanvasTabId = null;
        }

        syncDrawSurfaceForTab(getActiveTabId());
      });

      window.tandem.onDrawClear(() => {
        if (drawCanvasTabId) {
          tabShapes.set(drawCanvasTabId, []);
        }
        redraw();
      });
    }

    renderer.onActiveTabChanged(syncDrawSurfaceForTab);
    syncDrawSurfaceForTab(getActiveTabId());

    window.__tandemDraw = {
      compositeScreenshot(webviewBase64) {
        return new Promise((resolve) => {
          const img = new Image();
          img.onload = () => {
            const offscreen = document.createElement('canvas');
            offscreen.width = img.width;
            offscreen.height = img.height;
            const octx = offscreen.getContext('2d');
            octx.drawImage(img, 0, 0);
            const scaleX = img.width / drawCanvas.width;
            const scaleY = img.height / drawCanvas.height;
            octx.scale(scaleX, scaleY);
            octx.drawImage(drawCanvas, 0, 0);
            const dataUrl = offscreen.toDataURL('image/png');
            resolve(dataUrl.replace(/^data:image\/png;base64,/, ''));
          };
          img.src = 'data:image/png;base64,' + webviewBase64;
        });
      },
    };
})();
