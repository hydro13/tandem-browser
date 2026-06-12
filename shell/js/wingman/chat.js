/**
 * Wingman chat — multi-backend router orchestration, backend selector UI,
 * send + input handlers, image paste, connection status.
 *
 * Loaded from: shell/js/wingman/index.js
 * window exports: chatRouter — set by index.js from initChat() return.
 *   (Kept as window binding for classic scripts and main-process IPC.)
 *
 * External globals used (loaded via classic <script> tags in shell/index.html
 * BEFORE this module): ChatRouter, TandemLocalBackend, OpenClawBackend,
 * ClaudeActivityBackend, DualMode. They are not ES modules, so they must be referenced as bare
 * identifiers rather than imported.
 *
 * initChat() return shape matches prior `chatRouter` object:
 *   { ensureConnected, disconnect, router, dualMode, sendMessage }
 *
 * Notes on return shape:
 *   - `sendMessage(text)` is a raw programmatic send (no image-paste plumbing,
 *     no input-field clearing, no typing-indicator toggle). It's used by
 *     main-process inject flows and the chat-inject IPC handler. For the
 *     interactive send path, see the internal `sendMessage` wired to the
 *     input field's Enter handler and the send button click.
 *   - `router` and `dualMode` are exposed so external code (classic scripts,
 *     IPC handlers) can observe or drive the underlying state without
 *     going through the UI. Treat both as read-mostly; mutating router
 *     state from outside will desync the selector UI.
 */

import { createStreamingRenderer } from './chat-streaming.js';

export function initChat() {
  const messagesEl = document.getElementById('chat-messages');
  const inputEl = document.getElementById('chat-input');
  const sendBtn = document.getElementById('chat-send-btn');
  const typingEl = document.getElementById('typing-indicator');
  const wsDot = document.getElementById('ws-dot');
  const wsStatusText = document.getElementById('ws-status-text');
  const backendSelector = document.getElementById('chat-backend-selector');

  // Safety check
  if (!messagesEl || !inputEl || !sendBtn || !typingEl || !wsDot || !wsStatusText) {
    console.error('[chatRouter] Missing required DOM elements, chat will not initialize');
    return { ensureConnected() { }, disconnect() { } };
  }

  if (backendSelector && backendSelector.children.length === 0) {
    backendSelector.innerHTML = `
      <button class="backend-option" id="btn-backend-tandem" title="Use Tandem's built-in MCP/API chat">
        <span class="backend-dot" id="dot-tandem"></span><span>Tandem</span>
      </button>
      <button class="backend-option" id="btn-backend-openclaw" title="Use the local OpenClaw gateway">
        <span class="backend-dot" id="dot-openclaw"></span><span>OpenClaw</span>
      </button>
      <button class="backend-option" id="btn-backend-claude" title="Use MCP activity polling">
        <span class="backend-dot" id="dot-claude"></span><span>Claude</span>
      </button>
      <button class="backend-option" id="btn-backend-both" title="Send to every connected backend">
        <span class="backend-dot" id="dot-both"></span><span>All</span>
      </button>
    `;
    backendSelector.style.display = 'none';
  }

  const renderer = createStreamingRenderer({ messagesEl });
  const {
    appendMessage,
    handleRouterMessage,
    handleDualMessage,
    clear: clearStreaming,
  } = renderer;

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
  const tandemBackend = new TandemLocalBackend();
  const openclawBackend = new OpenClawBackend();
  const claudeBackend = new ClaudeActivityBackend();

  router.register(tandemBackend);
  router.register(openclawBackend);
  router.register(claudeBackend);

  // ── DualMode setup (Fase 5) ──
  // Must happen AFTER backends are registered — the DualMode constructor
  // iterates router.getAllBackends().
  const dualMode = new DualMode(router);
  let currentMode = 'tandem'; // 'tandem' | 'openclaw' | 'claude' | 'both'

  // ── Backend selector UI ──

  const btnTD = document.getElementById('btn-backend-tandem');
  const btnOC = document.getElementById('btn-backend-openclaw');
  const btnCL = document.getElementById('btn-backend-claude');
  const btnBoth = document.getElementById('btn-backend-both');
  const dotTD = document.getElementById('dot-tandem');
  const dotOC = document.getElementById('dot-openclaw');
  const dotCL = document.getElementById('dot-claude');
  const dotBoth = document.getElementById('dot-both');

  function setBackendOptionVisible(button, visible) {
    if (!button) return;
    button.style.display = visible ? 'flex' : 'none';
  }

  function hasConfiguredAgent(...types) {
    const agents = tandemBackend.getConnectedAgents?.() || [];
    return agents.some((agent) => types.includes(agent.type));
  }

  function updateVisibleChannels() {
    const primary = tandemBackend.getPrimaryAgent?.();
    const showTandem = Boolean(primary);
    const showOpenClaw = hasConfiguredAgent('openclaw');
    const showClaude = hasConfiguredAgent('claude', 'claude-code');
    const visibleCount = [showTandem, showOpenClaw, showClaude].filter(Boolean).length;

    setBackendOptionVisible(btnTD, showTandem);
    setBackendOptionVisible(btnOC, showOpenClaw);
    setBackendOptionVisible(btnCL, showClaude);
    setBackendOptionVisible(btnBoth, visibleCount > 1);

    if (backendSelector) {
      backendSelector.style.display = visibleCount > 0 ? 'flex' : 'none';
    }

    if (currentMode === 'openclaw' && !showOpenClaw) switchBackend('tandem');
    if (currentMode === 'claude' && !showClaude) switchBackend('tandem');
    if (currentMode === 'both' && visibleCount <= 1) switchBackend('tandem');
  }

  function updateTandemChannelLabel() {
    const primary = tandemBackend.getPrimaryAgent?.();
    const label = primary?.label || 'Tandem';
    const labelEl = btnTD?.querySelector('span:last-child');
    if (labelEl) labelEl.textContent = label;
  }

  function updateBackendUI(activeId) {
    updateTandemChannelLabel();
    updateVisibleChannels();
    if (btnTD) btnTD.classList.toggle('active', activeId === 'tandem');
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
      } else if (activeId === 'tandem') {
        inputEl.placeholder = 'Message to Tandem Wingman...';
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
      } else if (activeId === 'tandem') {
        typingText.textContent = 'Tandem Wingman is thinking...';
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
    clearStreaming();

    if (id === 'both') {
      // In "both" mode, set router to openclaw as default but enable dual mode
      router.setActive('openclaw');
      dualMode.setEnabled(true);
      // Load combined history — OpenClaw first, then Claude
      openclawBackend.loadHistory((msgs) => {
        for (const m of msgs) {
          const el = appendMessage(m.role, m.text, m.timestamp, m.source, m.image, m.actorLabel);
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
            const el = appendMessage(m.role, m.text, m.timestamp, m.source, m.image, m.actorLabel);
            el.dataset.fromHistory = 'true';
          }
          // Re-add local user messages
          for (const localMsg of localRobinMessages) {
            const el = appendMessage(localMsg.role, localMsg.text, localMsg.timestamp, localMsg.source, localMsg.image);
            el.dataset.localMessage = 'true';
          }
        });
      } else if (id === 'tandem') {
        tandemBackend.loadHistory((msgs) => {
          for (const m of msgs) {
            const el = appendMessage(m.role, m.text, m.timestamp, m.source, m.image, m.actorLabel);
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

  if (btnTD) btnTD.addEventListener('click', () => switchBackend('tandem'));
  if (btnOC) btnOC.addEventListener('click', () => switchBackend('openclaw'));
  if (btnCL) btnCL.addEventListener('click', () => switchBackend('claude'));
  if (btnBoth) btnBoth.addEventListener('click', () => switchBackend('both'));

  // ── Connection status dots ──

  router.onConnectionChange((connected, backendId) => {
    if (backendId === 'tandem') {
      updateTandemChannelLabel();
      if (dotTD) dotTD.classList.toggle('connected', connected);
    } else if (backendId === 'openclaw') {
      if (dotOC) dotOC.classList.toggle('connected', connected);
    } else if (backendId === 'claude') {
      if (dotCL) dotCL.classList.toggle('connected', connected);
    }
    if (dotBoth) dotBoth.classList.toggle('connected', tandemBackend.isConnected() || openclawBackend.isConnected() || claudeBackend.isConnected());

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

  router.onMessage((msg, type, backendId) => {
    handleRouterMessage(msg, type, backendId, { currentMode, persistChatMessage });
  });

  dualMode.onMessage((msg, type, backendId) => {
    handleDualMessage(msg, type, backendId, { persistChatMessage });
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
    imagePreviewEl.replaceChildren();
    const img = document.createElement('img');
    img.src = dataUrl;
    img.alt = 'Preview';
    const removeBtn = document.createElement('button');
    removeBtn.className = 'remove-preview';
    removeBtn.title = 'Remove image';
    removeBtn.textContent = '✕';
    imagePreviewEl.append(img, removeBtn);
    imagePreviewEl.style.display = 'block';
    removeBtn.addEventListener('click', () => {
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
        // Local and Claude backends both expose their own connection state.
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

  // ── Initialize ──

  // Load saved backend from config. OpenClaw stays supported, but a missing
  // gateway falls back to Tandem's built-in MCP/API chat.
  router.connectAll();
  fetch('http://localhost:8765/config')
    .then(r => r.json())
    .then(cfg => {
      const saved = cfg.general && cfg.general.activeBackend;
      if (saved === 'tandem') switchBackend('tandem');
      else if (saved === 'claude') {
        switchBackend('claude');
        setTimeout(() => {
          const primary = tandemBackend.getPrimaryAgent?.();
          if (currentMode === 'claude' && primary && primary.type !== 'claude-code') {
            switchBackend('tandem');
          }
        }, 1500);
      }
      else if (saved === 'both') switchBackend('both');
      else {
        switchBackend('openclaw');
        setTimeout(() => {
          if (currentMode === 'openclaw' && !openclawBackend.isConnected() && tandemBackend.isConnected()) {
            switchBackend('tandem');
          }
        }, 4500);
      }
    })
    .catch(() => switchBackend('tandem'));

  // Listen for incoming Wingman messages pushed via POST /chat API
  if (window.tandem && window.tandem.onChatMessage) {
    window.tandem.onChatMessage((msg) => {
      // msg: {id, from, text, timestamp, image}
      // Skip user messages — already shown optimistically in the UI
      if (msg.clear) {
        clearStreaming();
        return;
      }
      if (msg.from === 'user') return;
      const source = msg.from; // 'wingman' or 'claude'
      appendMessage('assistant', msg.text, msg.timestamp, source, msg.image, msg.actorLabel);
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
}
