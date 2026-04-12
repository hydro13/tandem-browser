/**
 * OpenClawBackend — WebSocket chat with OpenClaw (Wingman)
 * Implements ChatBackend interface (see src/chat/interfaces.ts)
 *
 * Extracted from inline ocChat IIFE in index.html.
 * Connect params are prepared by Tandem so the browser client can present
 * a signed device identity without exposing private keys in the renderer.
 */
class OpenClawBackend {
  constructor() {
    this.id = 'openclaw';
    this.name = 'Wingman';
    this.icon = '🐙';

    this._ws = null;
    this._connected = false;
    this._reconnectDelay = 1000;
    this._reconnectTimer = null;
    this._streamingMsg = null;
    this._streamingText = '';
    this._pendingCallbacks = new Map();

    this._sessionKey = 'agent:main:main';
    this._wsUrl = 'ws://127.0.0.1:18789';
    this._apiBase = 'http://localhost:8765';

    // Callback registrations
    this._messageCallbacks = [];
    this._typingCallbacks = [];
    this._connectionCallbacks = [];
  }

  async connect() {
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
    if (!text) return false;
    const connected = await this._ensureConnected();
    if (!connected) return false;

    const res = await this._sendRequestAsync('chat.send', {
      sessionKey: this._sessionKey,
      message: text,
      idempotencyKey: crypto.randomUUID()
    });
    const payload = this._getResponsePayload(res);
    return Boolean(
      res
      && res.ok !== false
      && !res.error
      && payload
      && (payload.runId || payload.status === 'started' || payload.status === 'in_flight' || payload.status === 'ok')
    );
  }

  onMessage(cb) { this._messageCallbacks.push(cb); }
  onTyping(cb) { this._typingCallbacks.push(cb); }
  onConnectionChange(cb) { this._connectionCallbacks.push(cb); }

  /** Load chat history from OpenClaw */
  loadHistory(onMessages) {
    this._sendRequest('chat.history', { sessionKey: this._sessionKey, limit: 20 }, (res) => {
      const payload = this._getResponsePayload(res);
      if (!payload) return;
      const msgs = payload.messages || payload;
      if (!Array.isArray(msgs)) return;
      const parsed = [];
      for (const m of msgs) {
        const text = this._extractMessageText(m);
        if (text) {
          parsed.push({
            id: m.id || crypto.randomUUID(),
            role: m.role,
            text,
            source: m.role === 'user' ? 'user' : 'openclaw',
            timestamp: m.timestamp || m.createdAt || Date.now()
          });
        }
      }
      // Sort chronologically (oldest first) — chat.history may return newest-first
      parsed.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
      this._invokeCallback(onMessages, [parsed]);
    });
  }

  // ── Private ────────────────────────────────────

  async _fetchConnectParams(nonce) {
    try {
      const res = await fetch(`${this._apiBase}/config/openclaw-connect?nonce=${encodeURIComponent(nonce)}`);
      if (!res.ok) {
        console.warn('[OpenClawBackend] Could not fetch connect params:', res.statusText);
        return null;
      }
      const data = await res.json();
      return data.params || null;
    } catch (e) {
      console.warn('[OpenClawBackend] Connect param fetch failed:', e.message);
      return null;
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
          this._fetchConnectParams(msg.payload?.nonce || '').then((params) => {
            if (!params) {
              this._setConnected(false);
              return;
            }

            params.userAgent = navigator.userAgent;
            params.locale = navigator.language;

            this._sendRequest('connect', params, (res) => {
              const payload = this._getResponsePayload(res);
              if (res && res.ok !== false && payload) {
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
          }).catch((error) => {
            console.error('[OpenClawBackend] Connect preparation failed:', error?.message || error);
            this._setConnected(false);
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
        if (cb) {
          this._pendingCallbacks.delete(msg.id);
          this._invokeCallback(cb, [this._normalizeResponse(msg)]);
        }
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
      this._invokeCallback(cb, [{ error: { code: 'NOT_CONNECTED', message: 'WebSocket not connected' } }]);
      return null;
    }
    const id = crypto.randomUUID();
    if (cb) this._pendingCallbacks.set(id, cb);
    this._ws.send(JSON.stringify({ type: 'req', id, method, params }));
    return id;
  }

  _sendRequestAsync(method, params) {
    return new Promise((resolve) => {
      const id = this._sendRequest(method, params, (res) => resolve(res));
      if (!id) {
        return;
      }
    });
  }

  async _ensureConnected(timeoutMs = 4000) {
    if (this._connected) return true;

    await this.connect();
    if (this._connected) return true;

    return new Promise((resolve) => {
      let settled = false;
      const onChange = (connected) => {
        if (!connected || settled) return;
        settled = true;
        cleanup();
        resolve(true);
      };
      const cleanup = () => {
        clearTimeout(timer);
        const index = this._connectionCallbacks.indexOf(onChange);
        if (index >= 0) this._connectionCallbacks.splice(index, 1);
      };
      const timer = setTimeout(() => {
        if (settled) return;
        cleanup();
        resolve(this._connected);
      }, timeoutMs);

      this._connectionCallbacks.push(onChange);
    });
  }

  _handleChatEvent(payload) {
    const { state, message } = payload;
    if (state === 'delta') {
      this._emit('typing', true);
      const text = this._extractMessageText(message);
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
      const finalText = this._extractMessageText(message) || this._streamingText;
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
    for (const cb of this._connectionCallbacks) this._invokeCallback(cb, [connected]);
  }

  _emit(type, data) {
    if (type === 'message' || type === 'historyReload') {
      for (const cb of this._messageCallbacks) this._invokeCallback(cb, [data, type]);
    } else if (type === 'typing') {
      for (const cb of this._typingCallbacks) this._invokeCallback(cb, [data]);
    }
  }

  _invokeCallback(cb, args = []) {
    if (typeof cb === 'function') {
      cb(...args);
    }
  }

  _extractMessageText(message) {
    if (!message) return '';
    if (Array.isArray(message.content)) {
      return message.content
        .filter((part) => part && part.type === 'text' && typeof part.text === 'string')
        .map((part) => part.text)
        .join('\n');
    }
    return message.text || message.content || '';
  }

  _normalizeResponse(response) {
    if (!response || typeof response !== 'object') {
      return { ok: false, error: { code: 'INVALID_RESPONSE', message: 'Invalid response frame' } };
    }

    if (Object.prototype.hasOwnProperty.call(response, 'payload') || Object.prototype.hasOwnProperty.call(response, 'ok')) {
      return {
        ...response,
        result: response.payload
      };
    }

    return {
      ...response,
      ok: !response.error,
      payload: response.result
    };
  }

  _getResponsePayload(response) {
    return response?.payload ?? response?.result ?? null;
  }
}
