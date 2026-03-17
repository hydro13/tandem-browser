/**
 * ChatRouter — Routes messages to the active chat backend
 * Manages backend registration, switching, and unified message handling.
 *
 * See src/chat/interfaces.ts for type definitions.
 */
class ChatRouter {
  constructor() {
    this._backends = new Map();
    this._activeBackendId = null;
    this._messageCallbacks = [];
    this._typingCallbacks = [];
    this._connectionCallbacks = [];
    this._switchCallbacks = [];
  }

  register(backend) {
    this._backends.set(backend.id, backend);

    // Wire backend events through the router
    backend.onMessage((msg, type) => {
      // Only forward if this is the active backend
      if (backend.id === this._activeBackendId) {
        for (const cb of this._messageCallbacks) cb(msg, type, backend.id);
      }
    });

    backend.onTyping((typing) => {
      if (backend.id === this._activeBackendId) {
        for (const cb of this._typingCallbacks) cb(typing, backend.id);
      }
    });

    backend.onConnectionChange((connected) => {
      for (const cb of this._connectionCallbacks) cb(connected, backend.id);
    });
  }

  setActive(id) {
    const backend = this._backends.get(id);
    if (!backend) {
      console.warn('[ChatRouter] Unknown backend:', id);
      return;
    }
    this._activeBackendId = id;
    // Notify switch listeners
    for (const cb of this._switchCallbacks) cb(id, backend);
  }

  getActive() {
    return this._backends.get(this._activeBackendId) || null;
  }

  getActiveId() {
    return this._activeBackendId;
  }

  getBackend(id) {
    return this._backends.get(id) || null;
  }

  getAllBackends() {
    return Array.from(this._backends.values());
  }

  async sendMessage(text) {
    const backend = this.getActive();
    if (!backend) {
      console.warn('[ChatRouter] No active backend');
      return false;
    }
    return backend.sendMessage(text);
  }

  async connectAll() {
    for (const backend of this._backends.values()) {
      try {
        await backend.connect();
      } catch (e) {
        console.warn(`[ChatRouter] Failed to connect ${backend.id}:`, e.message);
      }
    }
  }

  async disconnectAll() {
    for (const backend of this._backends.values()) {
      try {
        await backend.disconnect();
      } catch (e) {
        console.warn(`[ChatRouter] Failed to disconnect ${backend.id}:`, e.message);
      }
    }
  }

  onMessage(cb) { this._messageCallbacks.push(cb); }
  onTyping(cb) { this._typingCallbacks.push(cb); }
  onConnectionChange(cb) { this._connectionCallbacks.push(cb); }
  onSwitch(cb) { this._switchCallbacks.push(cb); }
}
