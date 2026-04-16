/**
 * Chat streaming renderer — encapsulates streaming message state and
 * rendering primitives (append, scroll, escape, format).
 *
 * Loaded from: shell/js/wingman/chat.js
 * window exports: none
 *
 * createStreamingRenderer({ messagesEl }) returns:
 *   - appendMessage(role, text, ts, source, image) → HTMLElement
 *   - scrollToBottom()
 *   - ensureElementAtBottom(element)
 *   - escapeHtml(s)
 *   - formatTime(ts)
 *   - handleRouterMessage(msg, type, backendId, ctx)  // single-mode
 *   - handleDualMessage(msg, type, backendId, ctx)    // dual-mode
 *   - clear()  // wipe streaming state (used on backend switch)
 *
 *   `ctx` passes: { currentMode, persistChatMessage(from, text, image?) }
 *   so the renderer doesn't need to know about router/mode state.
 */

export function createStreamingRenderer({ messagesEl }) {
  // Track streaming message elements per conversation
  const streamingMessages = new Map(); // conversationId -> { element, startTime }
  let currentConversationId = null;
  let dualStreamingConversations = {}; // per-backend conversation tracking

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

  // Single-backend message handler (existing behavior)
  function handleRouterMessage(msg, type, backendId, ctx) {
    const { currentMode, persistChatMessage } = ctx;
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
  }

  // Dual-mode message handler (Fase 5) — both backends at once
  function handleDualMessage(msg, type, backendId, ctx) {
    const { persistChatMessage } = ctx;

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
  }

  function clear() {
    streamingMessages.clear();
    currentConversationId = null;
    dualStreamingConversations = {};
    messagesEl.innerHTML = '';
  }

  return {
    appendMessage,
    scrollToBottom,
    ensureElementAtBottom,
    escapeHtml,
    formatTime,
    handleRouterMessage,
    handleDualMessage,
    clear,
  };
}
