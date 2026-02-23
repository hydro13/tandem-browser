/**
 * OpenClawBackend — WebSocket chat with OpenClaw (Copilot)
 * Implements ChatBackend interface (see src/chat/interfaces.ts)
 *
 * Extracted from inline ocChat IIFE in index.html.
 * Token is loaded dynamically from ~/.openclaw/openclaw.json via API.
 */
class OpenClawBackend {
  constructor() {
    this.id = 'openclaw';
    this.name = 'Copilot';
    this.icon = '🐙';

    this._ws = null;
    this._connected = false;
    this._reconnectDelay = 1000;
    this._reconnectTimer = null;
    this._streamingMsg = null;
    this._streamingText = '';
    this._pendingCallbacks = new Map();
    this._token = null;

    this._sessionKey = 'agent:main:main';
    this._wsUrl = 'ws://127.0.0.1:18789';
    this._apiBase = 'http://localhost:8765';

    // Callback registrations
    this._messageCallbacks = [];
    this._typingCallbacks = [];
    this._connectionCallbacks = [];
  }

  async connect() {
    if (!this._token) {
      await this._fetchToken();
    }
    this._doConnect();
  }

  async disconnect() {
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
    if (this._ws) {
      this._ws.close();
      this._ws = null;
    }
    this._setConnected(false);
  }

  isConnected() {
    return this._connected;
  }

  async sendMessage(text) {
    if (!text || !this._connected) return;
    this._sendRequest('chat.send', {
      sessionKey: this._sessionKey,
      message: text,
      idempotencyKey: crypto.randomUUID()
    });
  }

  onMessage(cb) { this._messageCallbacks.push(cb); }
  onTyping(cb) { this._typingCallbacks.push(cb); }
  onConnectionChange(cb) { this._connectionCallbacks.push(cb); }

  /** Load chat history from OpenClaw */
  loadHistory(onMessages) {
    this._sendRequest('chat.history', { sessionKey: this._sessionKey, limit: 20 }, (res) => {
      if (!res.result) return;
      const msgs = res.result.messages || res.result;
      if (!Array.isArray(msgs)) return;
      const parsed = [];
      for (const m of msgs) {
        const text = Array.isArray(m.content)
          ? m.content.filter(c => c.type === 'text').map(c => c.text).join('\n')
          : (m.text || m.content || '');
        if (text) {
          parsed.push({
            id: m.id || crypto.randomUUID(),
            role: m.role,
            text,
            source: m.role === 'user' ? 'robin' : 'openclaw',
            timestamp: m.timestamp || m.createdAt || Date.now()
          });
        }
      }
      // Sort chronologically (oldest first) — chat.history may return newest-first
      parsed.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
      if (onMessages) onMessages(parsed);
    });
  }

  // ── Private ────────────────────────────────────

  async _fetchToken() {
    try {
      const res = await fetch(`${this._apiBase}/config/openclaw-token`);
      if (!res.ok) {
        console.warn('[OpenClawBackend] Could not fetch token:', res.statusText);
        return;
      }
      const data = await res.json();
      this._token = data.token;
    } catch (e) {
      console.warn('[OpenClawBackend] Token fetch failed:', e.message);
    }
  }

  _doConnect() {
    if (this._ws && (this._ws.readyState === WebSocket.OPEN || this._ws.readyState === WebSocket.CONNECTING)) return;

    this._ws = new WebSocket(this._wsUrl);

    this._ws.onopen = () => { /* wait for connect.challenge event */ };

    this._ws.onmessage = (e) => {
      let msg;
      try { msg = JSON.parse(e.data); } catch { return; }

      if (msg.type === 'event') {
        if (msg.event === 'connect.challenge') {
          this._sendRequest('connect', {
            minProtocol: 3, maxProtocol: 3,
            client: { id: 'webchat', version: '1.0', platform: 'browser', mode: 'webchat', instanceId: crypto.randomUUID() },
            role: 'operator',
            scopes: ['operator.admin'],
            auth: { token: this._token },
            userAgent: navigator.userAgent,
            locale: navigator.language
          }, (res) => {
            if (res.result) {
              this._setConnected(true);
              this._reconnectDelay = 1000;
              // Load history after connecting (emit as historyReload so UI clears first)
              this.loadHistory((msgs) => {
                this._emit('historyReload', msgs);
              });
            } else {
              console.error('[OpenClawBackend] Connect failed:', res.error);
              this._setConnected(false);
            }
          });
        }
        if (msg.event === 'chat') {
          // If we receive chat events, we're definitely connected
          if (!this._connected) this._setConnected(true);
          this._handleChatEvent(msg.payload);
        }
      }

      if (msg.type === 'res' && msg.id) {
        const cb = this._pendingCallbacks.get(msg.id);
        if (cb) { this._pendingCallbacks.delete(msg.id); cb(msg); }
      }
    };

    this._ws.onclose = () => {
      this._setConnected(false);
      this._pendingCallbacks.clear();
      this._scheduleReconnect();
    };

    this._ws.onerror = () => { /* onclose will fire */ };
  }

  _sendRequest(method, params, cb) {
    if (!this._ws || this._ws.readyState !== WebSocket.OPEN) {
      if (cb) cb({ error: { code: 'NOT_CONNECTED', message: 'WebSocket not connected' } });
      return null;
    }
    const id = crypto.randomUUID();
    if (cb) this._pendingCallbacks.set(id, cb);
    this._ws.send(JSON.stringify({ type: 'req', id, method, params }));
    return id;
  }

  _handleChatEvent(payload) {
    const { state, message } = payload;
    if (state === 'delta') {
      this._emit('typing', true);
      const text = (message && (message.text || (Array.isArray(message.content) ? message.content.filter(c => c.type === 'text').map(c => c.text).join('') : ''))) || '';
      this._streamingText = text || this._streamingText;
      this._emit('message', {
        id: 'streaming',
        role: 'assistant',
        text: this._streamingText,
        source: 'openclaw',
        timestamp: Date.now(),
        _streaming: true
      });
    } else if (state === 'final') {
      this._emit('typing', false);
      const finalText = this._streamingText;
      this._streamingMsg = null;
      this._streamingText = '';
      // Emit a non-streaming message to finalize the UI element
      if (finalText) {
        this._emit('message', {
          id: crypto.randomUUID(),
          role: 'assistant',
          text: finalText,
          source: 'openclaw',
          timestamp: Date.now(),
          _final: true
        });
      }
    } else if (state === 'error') {
      this._emit('typing', false);
      this._streamingMsg = null;
      this._streamingText = '';
      this._emit('message', {
        id: crypto.randomUUID(),
        role: 'assistant',
        text: '⚠️ Error: ' + (message?.text || 'Unknown error'),
        source: 'openclaw',
        timestamp: Date.now()
      });
    }
  }

  _scheduleReconnect() {
    if (this._reconnectTimer) clearTimeout(this._reconnectTimer);
    this._reconnectTimer = setTimeout(() => {
      this._reconnectDelay = Math.min(this._reconnectDelay * 1.5, 15000);
      this._doConnect();
    }, this._reconnectDelay);
  }

  _setConnected(connected) {
    this._connected = connected;
    for (const cb of this._connectionCallbacks) cb(connected);
  }

  _emit(type, data) {
    if (type === 'message' || type === 'historyReload') {
      for (const cb of this._messageCallbacks) cb(data, type);
    } else if (type === 'typing') {
      for (const cb of this._typingCallbacks) cb(data);
    }
  }
}
