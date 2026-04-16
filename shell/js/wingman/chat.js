/**
 * Wingman chat — multi-backend router orchestration, backend selector UI,
 * send + input handlers, image paste, mic button (Task 5 will extract),
 * connection status.
 *
 * Loaded from: shell/js/wingman/index.js
 * window exports: chatRouter — set by index.js from initChat() return.
 *   (Kept as window binding for classic scripts and main-process IPC.)
 *
 * External globals used (loaded via classic <script> tags in shell/index.html
 * BEFORE this module): ChatRouter, OpenClawBackend, ClaudeActivityBackend,
 * DualMode. They are not ES modules, so they must be referenced as bare
 * identifiers rather than imported.
 *
 * initChat() return shape matches prior `chatRouter` object:
 *   { ensureConnected, disconnect, router, dualMode, sendMessage }
 */

import { createStreamingRenderer } from './chat-streaming.js';

export function initChat() {
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
  const openclawBackend = new OpenClawBackend();
  const claudeBackend = new ClaudeActivityBackend();

  router.register(openclawBackend);
  router.register(claudeBackend);

  // ── DualMode setup (Fase 5) ──
  // Must happen AFTER backends are registered — the DualMode constructor
  // iterates router.getAllBackends().
  const dualMode = new DualMode(router);
  let currentMode = 'openclaw'; // 'openclaw' | 'claude' | 'both'

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
    clearStreaming();

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
  // (Task 5 will extract this into its own module.)
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
}
