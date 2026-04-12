(() => {
    const renderer = window.__tandemRenderer;
    if (!renderer) {
      console.error('[wingman] Missing renderer bridge');
      return;
    }

    const overlay = renderer.overlay;
    const screenshotButton = document.getElementById('btn-screenshot');
    const regionOverlay = document.getElementById('region-capture-overlay');
    const regionBox = document.getElementById('region-capture-box');

    function getTabs() {
      return renderer.getTabs();
    }

    // ═══════════════════════════════════════════════
    // Wingman badge → right-click or long-press → open settings
    const wingmanBadge = document.querySelector('.wingman-badge');
    wingmanBadge.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      window.openSettings?.();
    });
    let wingmanBadgePressTimer = null;
    wingmanBadge.addEventListener('mousedown', () => {
      wingmanBadgePressTimer = setTimeout(() => window.openSettings?.(), 600);
    });
    wingmanBadge.addEventListener('mouseup', () => { clearTimeout(wingmanBadgePressTimer); });
    wingmanBadge.addEventListener('mouseleave', () => { clearTimeout(wingmanBadgePressTimer); });
    wingmanBadge.style.cursor = 'pointer';
    wingmanBadge.title = 'Right-click for settings';

    function updateRegionBox(startX, startY, currentX, currentY) {
      const left = Math.min(startX, currentX);
      const top = Math.min(startY, currentY);
      const width = Math.abs(currentX - startX);
      const height = Math.abs(currentY - startY);
      regionBox.style.display = 'block';
      regionBox.style.left = `${left}px`;
      regionBox.style.top = `${top}px`;
      regionBox.style.width = `${width}px`;
      regionBox.style.height = `${height}px`;
    }

    function selectRegion() {
      return new Promise((resolve) => {
        let startX = 0;
        let startY = 0;
        let dragging = false;

        regionOverlay.classList.add('active');
        regionBox.style.display = 'none';

        const cleanup = (result = null) => {
          regionOverlay.classList.remove('active');
          regionBox.style.display = 'none';
          regionOverlay.removeEventListener('mousedown', onMouseDown);
          regionOverlay.removeEventListener('mousemove', onMouseMove);
          regionOverlay.removeEventListener('mouseup', onMouseUp);
          window.removeEventListener('keydown', onKeyDown, true);
          resolve(result);
        };

        const onMouseDown = (event) => {
          dragging = true;
          startX = event.clientX;
          startY = event.clientY;
          updateRegionBox(startX, startY, startX, startY);
        };

        const onMouseMove = (event) => {
          if (!dragging) return;
          updateRegionBox(startX, startY, event.clientX, event.clientY);
        };

        const onMouseUp = (event) => {
          if (!dragging) return cleanup();
          dragging = false;
          const left = Math.min(startX, event.clientX);
          const top = Math.min(startY, event.clientY);
          const width = Math.abs(event.clientX - startX);
          const height = Math.abs(event.clientY - startY);
          if (width < 4 || height < 4) {
            cleanup();
            return;
          }
          cleanup({ x: left, y: top, width, height });
        };

        const onKeyDown = (event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            cleanup();
          }
        };

        regionOverlay.addEventListener('mousedown', onMouseDown);
        regionOverlay.addEventListener('mousemove', onMouseMove);
        regionOverlay.addEventListener('mouseup', onMouseUp);
        window.addEventListener('keydown', onKeyDown, true);
      });
    }

    async function captureScreenshotMode(mode) {
      if (!window.tandem) return;

      if (mode === 'region') {
        const region = await selectRegion();
        if (!region) return;
        // Wait two frames so the overlay is fully painted away before capture
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        await window.tandem.captureScreenshot('region', region);
        return;
      }

      await window.tandem.captureScreenshot(mode);
    }

    screenshotButton.addEventListener('click', (event) => {
      event.stopPropagation();
      const rect = screenshotButton.getBoundingClientRect();
      void window.tandem?.showScreenshotMenu({
        x: Math.round(rect.left),
        y: Math.round(rect.bottom + 6),
      });
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
          window.chatRouter?.ensureConnected();
        }
        document.getElementById('panel-screenshots').style.display = tab === 'screenshots' ? 'flex' : 'none';
        // ClaroNote disabled — decoupled, coming in a later update
        // document.getElementById('panel-claronote').style.display = tab === 'claronote' ? 'flex' : 'none';
        // if (tab === 'claronote') { window.initClaroNote?.(); }
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

        const rawSource = event.data.source || 'user';
        const source = ['wingman', 'user'].includes(rawSource) ? rawSource : 'user';
        const sourceEmoji = source === 'wingman' ? '🤖' : '👤';
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
        for (const [id, entry] of getTabs()) {
          if (id === data.tabId) {
            const sourceEl = entry.tabEl.querySelector('.tab-source');
            if (sourceEl) {
              if (data.source === 'wingman') {
                sourceEl.textContent = '🤖';
                sourceEl.title = 'AI controlled — click to take over';
                sourceEl.style.display = '';
              } else {
                sourceEl.textContent = '';
                sourceEl.title = '';
                sourceEl.style.display = 'none';
              }
            }
            // Visual indicator: purple bottom border for AI tabs
            if (data.source === 'wingman') {
              entry.tabEl.style.borderBottom = '2px solid #7c3aed';
            } else {
              entry.tabEl.style.borderBottom = '';
            }
          }
        }
      });

      // User claims an AI tab by focusing it (click on tab header)
      // The click handler already calls focusTab, we hook into it to also claim
      const origTabClickHandler = (tabId) => {
        // Check if this is an AI tab
        const entry = getTabs().get(tabId);
        if (entry) {
          const sourceEl = entry.tabEl.querySelector('.tab-source');
          if (sourceEl && sourceEl.textContent === '🤖') {
            // Claim the tab for User
            fetch('http://localhost:8765/tabs/source', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ tabId, source: 'user' })
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
      window.tandem.onScreenshotModeSelected((mode) => {
        void captureScreenshotMode(mode);
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
          cls = 'user';
          name = 'You';
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

      async function persistChatMessage(from, text, image, notifyWebhook = false) {
        if (!window.tandem?.persistChatMessage) return false;
        try {
          const result = await window.tandem.persistChatMessage({ from, text, image, notifyWebhook });
          return Boolean(result?.ok);
        } catch {
          return false;
        }
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
        if (btnOC) btnOC.classList.toggle('active', activeId === 'openclaw');
        if (btnCL) btnCL.classList.toggle('active', activeId === 'claude');
        if (btnBoth) btnBoth.classList.toggle('active', activeId === 'both');

        if (activeId === 'both') {
          const ocConn = openclawBackend.isConnected();
          const clConn = claudeBackend.isConnected();
          const bothConnected = ocConn && clConn;
          const anyConnected = ocConn || clConn;
          wsDot.style.background = anyConnected ? 'var(--success)' : 'var(--accent)';
          if (bothConnected) {
            wsStatusText.textContent = 'Wingman + Claude Connected';
          } else if (ocConn) {
            wsStatusText.textContent = 'Wingman Connected, Claude Disconnected';
          } else if (clConn) {
            wsStatusText.textContent = 'Wingman Disconnected, Claude Connected';
          } else {
            wsStatusText.textContent = 'Wingman + Claude Disconnected';
          }
          inputEl.placeholder = 'Message to Wingman & Claude... (@wingman/@claude for specific)';
        } else {
          // Single backend mode
          const backend = router.getActive();
          if (backend) {
            const connected = backend.isConnected();
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
        // Store any locally typed user messages before clearing
        const localRobinMessages = [];
        for (const child of messagesEl.children) {
          if (child.classList.contains('user') && child.dataset.localMessage === 'true') {
            localRobinMessages.push({
              role: 'user',
              text: child.querySelector('.msg-text').textContent,
              timestamp: child.querySelector('.msg-time').textContent,
              source: 'user'
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
            // Re-add local user messages
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
              // Re-add local user messages
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

      if (btnOC) btnOC.addEventListener('click', () => switchBackend('openclaw'));
      if (btnCL) btnCL.addEventListener('click', () => switchBackend('claude'));
      if (btnBoth) btnBoth.addEventListener('click', () => switchBackend('both'));

      // ── Connection status dots ──

      router.onConnectionChange((connected, backendId) => {
        if (backendId === 'openclaw') {
          if (dotOC) dotOC.classList.toggle('connected', connected);
        } else if (backendId === 'claude') {
          if (dotCL) dotCL.classList.toggle('connected', connected);
        }
        if (dotBoth) dotBoth.classList.toggle('connected', openclawBackend.isConnected() && claudeBackend.isConnected());

        // Update status bar for current mode
        if (currentMode === 'both') {
          updateBackendUI('both');
        } else if (backendId === router.getActiveId()) {
          const backend = router.getActive();
          const effectiveConnected = backend ? backend.isConnected() : connected;
          wsDot.style.background = effectiveConnected ? 'var(--success)' : 'var(--accent)';
          wsStatusText.textContent = effectiveConnected ? `${backend.name} Connected` : `${backend.name} Disconnected`;
        }
      });

      // ── Message handling ──

      // Single-backend message handler (existing behavior)
      router.onMessage((msg, type, backendId) => {
        if (currentMode === 'both') return; // handled by dualMode

        if (type === 'historyReload') {
          // Store any locally typed user messages before processing history
          const localRobinMessages = [];
          for (const child of messagesEl.children) {
            if (child.classList.contains('user') && child.dataset.localMessage === 'true') {
              localRobinMessages.push({
                role: 'user',
                text: child.querySelector('.msg-text').textContent,
                timestamp: child.querySelector('.msg-time').textContent,
                source: 'user'
              });
            }
          }

          // Finalize any active streaming messages with correct timestamp
          for (const [convId, streamData] of streamingMessages.entries()) {
            const timeEl = streamData.element.querySelector('.msg-time');
            if (timeEl) timeEl.textContent = formatTime(Date.now());
          }
          messagesEl.innerHTML = '';
          streamingMessages.clear();
          currentConversationId = null;

          if (Array.isArray(msg)) {
            for (const historyMsg of msg) {
              const el = appendMessage(historyMsg.role, historyMsg.text, historyMsg.timestamp, historyMsg.source, historyMsg.image);
              el.dataset.fromHistory = 'true';
            }
          }

          setTimeout(() => {
            for (const localMsg of localRobinMessages) {
              let alreadyExists = false;
              for (const child of messagesEl.children) {
                if (child.classList.contains('user') &&
                  child.querySelector('.msg-text').textContent === localMsg.text &&
                  child.dataset.fromHistory === 'true') {
                  alreadyExists = true;
                  break;
                }
              }

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

            // Ensure streaming element stays at the end (after any user messages sent during streaming)
            const currentIndex = Array.from(messagesEl.children).indexOf(streamData.element);
            const lastIndex = messagesEl.children.length - 1;
            if (currentIndex !== lastIndex) {
              ensureElementAtBottom(streamData.element);
            }
          }
        } else {
          const shouldPersistOpenClawFinal = backendId === 'openclaw' && msg._final && msg.text;
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
            if (backendId === 'openclaw' && msg.text) {
              void persistChatMessage('wingman', msg.text);
            }
            currentConversationId = null;
          } else if (shouldPersistOpenClawFinal) {
            void persistChatMessage('wingman', msg.text);
          }
          // Only append a new element if this is NOT a final event (final reuses the streaming element)
          if (!msg._final) {
            appendMessage(msg.role, msg.text, msg.timestamp, msg.source, msg.image);
            if (backendId === 'openclaw' && msg.text) {
              void persistChatMessage('wingman', msg.text, msg.image);
            }
          }
        }
      });

      // Dual-mode message handler (Fase 5) — both backends at once
      let dualStreamingConversations = {}; // per-backend conversation tracking
      dualMode.onMessage((msg, type, backendId) => {
        if (type === 'historyReload') {
          // Store any locally typed user messages before clearing
          const localRobinMessages = [];
          for (const child of messagesEl.children) {
            if (child.classList.contains('user') && child.dataset.localMessage === 'true') {
              localRobinMessages.push({
                role: 'user',
                text: child.querySelector('.msg-text').textContent,
                timestamp: child.querySelector('.msg-time').textContent,
                source: 'user'
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

            // Re-add local user messages that aren't in history
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
          const shouldPersistOpenClawFinal = backendId === 'openclaw' && msg._final && msg.text;
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
            if (backendId === 'openclaw' && msg.text) {
              void persistChatMessage('wingman', msg.text);
            }
            delete dualStreamingConversations[backendId];
          } else if (shouldPersistOpenClawFinal) {
            void persistChatMessage('wingman', msg.text);
          }
          if (!msg._final) {
            appendMessage(msg.role, msg.text, msg.timestamp, msg.source, msg.image);
            if (backendId === 'openclaw' && msg.text) {
              void persistChatMessage('wingman', msg.text, msg.image);
            }
          }
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

      async function sendMessage() {
        const text = inputEl.value.trim();

        // Image paste: send via IPC (before text-only check)
        if (pendingImage) {
          const imageData = pendingImage;
          clearImagePreview();
          inputEl.value = '';
          inputEl.style.height = '';

          // Show local preview immediately
          const robinMsg = appendMessage('user', text || '', Date.now(), 'user');
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
          const robinMsg = appendMessage('user', text, Date.now(), 'user');
          robinMsg.dataset.localMessage = 'true';

          dualMode.sendMessage(text);
        } else {
          // Single backend mode
          const backend = router.getActive();
          const activeId = router.getActiveId();

          // OpenClaw: send through the official gateway chat path.
          if (activeId === 'openclaw') {
            const robinMsg = appendMessage('user', text, Date.now(), 'user');
            robinMsg.dataset.localMessage = 'true';
            const sentViaGateway = await router.sendMessage(text);
            if (sentViaGateway) {
              void persistChatMessage('user', text);
            } else {
              appendMessage('assistant', '⚠️ Wingman could not reach OpenClaw.', Date.now(), 'wingman');
            }
          } else {
            // For Claude, needs WebSocket connection
            if (!backend || !backend.isConnected()) return;
            await router.sendMessage(text);
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

      // ── Mic button — native voice to text (Apple Speech / Whisper) ──
      const micBtn = document.getElementById('chat-mic-btn');
      let micRecording = false;
      let micMediaRecorder = null;
      let micChunks = [];
      let micStream = null;

      // Show mic button only on Linux (macOS users use system dictation Fn+Fn)
      if (micBtn && window.tandem?.getPlatform) {
        const platform = window.tandem.getPlatform();
        if (platform !== 'darwin') micBtn.style.display = '';
      }

      if (micBtn) {
        micBtn.addEventListener('click', async () => {
          if (micRecording) {
            // Stop recording → transcribe
            micRecording = false;
            micBtn.classList.remove('active');
            micBtn.textContent = '⏳';
            micBtn.title = 'Transcribing...';
            if (micMediaRecorder && micMediaRecorder.state !== 'inactive') {
              micMediaRecorder.stop();
            }
          } else {
            // Start recording
            try {
              micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
              micChunks = [];
              micMediaRecorder = new MediaRecorder(micStream, { mimeType: 'audio/webm' });

              micMediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) micChunks.push(e.data);
              };

              micMediaRecorder.onstop = async () => {
                // Stop mic stream
                if (micStream) { micStream.getTracks().forEach(t => t.stop()); micStream = null; }

                if (micChunks.length === 0) {
                  micBtn.textContent = '🎤';
                  micBtn.title = 'Voice input';
                  return;
                }

                // Combine chunks → ArrayBuffer
                const blob = new Blob(micChunks, { type: 'audio/webm' });
                const arrayBuffer = await blob.arrayBuffer();

                // Send to main process for transcription
                try {
                  const result = await window.tandem.transcribeAudio(arrayBuffer, 'nl-BE');
                  if (result.ok && result.text) {
                    const current = inputEl.value.trim();
                    inputEl.value = current ? current + ' ' + result.text.trim() : result.text.trim();
                    inputEl.dispatchEvent(new Event('input'));
                    inputEl.style.height = '';
                    inputEl.style.height = Math.min(inputEl.scrollHeight, 80) + 'px';
                    inputEl.focus();
                  } else {
                    console.warn('[mic-btn] Transcription failed:', result.error);
                  }
                } catch (e) {
                  console.error('[mic-btn] Transcription error:', e);
                }

                micBtn.textContent = '🎤';
                micBtn.title = 'Voice input';
                micMediaRecorder = null;
                micChunks = [];
              };

              micMediaRecorder.start();
              micRecording = true;
              micBtn.classList.add('active');
              micBtn.textContent = '🔴';
              micBtn.title = 'Recording... (click to stop & transcribe)';

            } catch (err) {
              console.error('[mic-btn] Failed to start recording:', err);
              micBtn.textContent = '🎤';
              micBtn.title = 'Voice input';
              if (err.name === 'NotAllowedError') {
                alert('Microphone access denied.\n\nGo to System Settings → Privacy & Security → Microphone and enable Tandem.');
              }
            }
          }
        });
      }

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
          // Skip user messages — already shown optimistically in the UI
          if (msg.from === 'user') return;
          const source = msg.from; // 'wingman' or 'claude'
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
    // Emergency stop + Approval System (Phase 4)
    // ═══════════════════════════════════════════════
    (() => {
      const noodremBtn = document.getElementById('noodrem-btn');
      const approvalContainer = document.getElementById('approval-container');

      // Emergency stop — debounced emergency stop (prevents spam)
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
            liveToggleBtn.title = liveEnabled ? 'Live Mode ON — Wingman is watching' : 'Live Mode OFF';
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

      // Escape key = emergency stop (global handler, always works)
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
      // Sync panel open state to backend so notifications are suppressed when panel is visible
      if (window.tandem?.setPanelOpen) window.tandem.setPanelOpen(isOpen);
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

    window.chatRouter = chatRouter;
    window.dismissAlert = dismissAlert;
    window.toggleWingmanPanel = toggleWingmanPanel;
    window.updatePanelLayout = updatePanelLayout;
})();
