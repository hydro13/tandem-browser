/**
 * ClaudeActivityBackend — Polls GET /chat for Claude MCP activity
 * Implements ChatBackend interface (see src/chat/interfaces.ts)
 *
 * Creates a chat loop: User (browser) <-> Claude (Cowork) via MCP.
 * Claude writes via tandem_send_message MCP tool -> POST /chat from:"claude"
 * User writes via this backend -> POST /chat from:"user"
 * Claude reads via tandem_get_chat_history MCP tool -> GET /chat
 */
class ClaudeActivityBackend {
  constructor() {
    this.id = 'claude';
    this.name = 'Claude';
    this.icon = '🤖';

    this._connected = false;
    this._pollTimer = null;
    this._pollInterval = 2000; // 2 seconds
    this._lastSeenId = 0;
    this._apiBase = 'http://localhost:8765';

    this._messageCallbacks = [];
    this._typingCallbacks = [];
    this._connectionCallbacks = [];
  }

  async connect() {
    // Check if Tandem API is reachable
    try {
      const res = await fetch(`${this._apiBase}/status`);
      if (res.ok) {
        this._setConnected(true);
        this._startPolling();
        // Load initial history
        await this._loadHistory();
      } else {
        this._setConnected(false);
      }
    } catch (e) {
      console.warn('[ClaudeActivityBackend] API not reachable:', e.message);
      this._setConnected(false);
    }
  }

  async disconnect() {
    this._stopPolling();
    this._setConnected(false);
  }

  isConnected() {
    return this._connected;
  }

  async sendMessage(text) {
    if (!text) return;
    try {
      const res = await fetch(`${this._apiBase}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, from: 'user' })
      });
      if (res.ok) {
        const data = await res.json();
        // Emit the sent message locally
        this._emit('message', {
          id: data.message?.id?.toString() || crypto.randomUUID(),
          role: 'user',
          text,
          source: 'user',
          timestamp: Date.now()
        });
      }
    } catch (e) {
      console.warn('[ClaudeActivityBackend] Send failed:', e.message);
    }
  }

  onMessage(cb) { this._messageCallbacks.push(cb); }
  onTyping(cb) { this._typingCallbacks.push(cb); }
  onConnectionChange(cb) { this._connectionCallbacks.push(cb); }

  // ── Private ────────────────────────────────────

  _startPolling() {
    this._stopPolling();
    this._pollTimer = setInterval(() => this._poll(), this._pollInterval);
  }

  _stopPolling() {
    if (this._pollTimer) {
      clearInterval(this._pollTimer);
      this._pollTimer = null;
    }
  }

  async _poll() {
    try {
      const url = this._lastSeenId
        ? `${this._apiBase}/chat?since_id=${this._lastSeenId}`
        : `${this._apiBase}/chat?limit=50`;
      const res = await fetch(url);
      if (!res.ok) {
        if (this._connected) this._setConnected(false);
        return;
      }
      if (!this._connected) this._setConnected(true);

      const data = await res.json();
      const messages = data.messages || [];

      for (const m of messages) {
        if (m.id > this._lastSeenId) {
          this._lastSeenId = m.id;
          // Only emit Claude messages (not our own user messages) during polling
          if (m.from === 'claude' || m.from === 'wingman') {
            this._emit('message', {
              id: m.id.toString(),
              role: 'assistant',
              text: m.text,
              source: 'claude',
              timestamp: m.timestamp || Date.now()
            });
          }
        }
      }
    } catch (e) {
      if (this._connected) this._setConnected(false);
    }
  }

  async _loadHistory() {
    try {
      const res = await fetch(`${this._apiBase}/chat?limit=50`);
      if (!res.ok) return;
      const data = await res.json();
      const messages = data.messages || [];

      const parsed = [];
      for (const m of messages) {
        if (m.id > this._lastSeenId) this._lastSeenId = m.id;
        parsed.push({
          id: m.id.toString(),
          role: m.from === 'user' ? 'user' : 'assistant',
          text: m.text,
          source: m.from === 'user' ? 'user' : 'claude',
          timestamp: m.timestamp || Date.now()
        });
      }

      // Emit all as history reload
      if (parsed.length > 0) {
        this._emit('historyReload', parsed);
      }
    } catch (e) {
      console.warn('[ClaudeActivityBackend] History load failed:', e.message);
    }
  }

  _setConnected(connected) {
    if (this._connected !== connected) {
      this._connected = connected;
      for (const cb of this._connectionCallbacks) cb(connected);
    }
  }

  _emit(type, data) {
    if (type === 'message' || type === 'historyReload') {
      for (const cb of this._messageCallbacks) cb(data, type);
    } else if (type === 'typing') {
      for (const cb of this._typingCallbacks) cb(data);
    }
  }
}
