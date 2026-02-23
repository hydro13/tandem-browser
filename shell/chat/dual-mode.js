/**
 * DualMode — Sends messages to both backends simultaneously (Fase 5)
 *
 * Features:
 * - @claude → only ClaudeActivityBackend
 * - @copilot → only OpenClawBackend
 * - No @-mention in "both" mode → both backends
 * - Answers labeled per source (source: 'openclaw' | 'claude')
 * - Each answer arrives independently and is shown separately
 */
class DualMode {
  constructor(router) {
    this._router = router;
    this._enabled = false;
    this._messageCallbacks = [];
    this._typingCallbacks = [];

    // Wire up message forwarding from both backends in dual mode
    for (const backend of router.getAllBackends()) {
      backend.onMessage((msg, type) => {
        if (this._enabled) {
          for (const cb of this._messageCallbacks) cb(msg, type, backend.id);
        }
      });

      backend.onTyping((typing) => {
        if (this._enabled) {
          for (const cb of this._typingCallbacks) cb(typing, backend.id);
        }
      });
    }
  }

  /**
   * Enable or disable dual mode.
   */
  setEnabled(enabled) {
    this._enabled = enabled;
  }

  isEnabled() {
    return this._enabled;
  }

  /**
   * Parse @-mention from message text.
   * Returns { target: 'claude' | 'openclaw' | 'both', cleanText: string }
   */
  static parseMention(text) {
    const trimmed = text.trim();
    const lc = trimmed.toLowerCase();

    if (lc.startsWith('@claude ') || lc === '@claude') {
      return { target: 'claude', cleanText: trimmed.slice(7).trim() };
    }
    if (lc.startsWith('@copilot ') || lc === '@copilot') {
      return { target: 'openclaw', cleanText: trimmed.slice(5).trim() };
    }

    return { target: 'both', cleanText: trimmed };
  }

  /**
   * Send a message with @-mention routing.
   * - @claude → only claude backend
   * - @copilot → only openclaw backend
   * - no mention → both backends
   */
  async sendMessage(text) {
    if (!text) return;

    const { target, cleanText } = DualMode.parseMention(text);
    if (!cleanText) return;

    if (target === 'claude') {
      const backend = this._router.getBackend('claude');
      if (backend && backend.isConnected()) {
        await backend.sendMessage(cleanText);
      }
    } else if (target === 'openclaw') {
      const backend = this._router.getBackend('openclaw');
      if (backend && backend.isConnected()) {
        await backend.sendMessage(cleanText);
      }
    } else {
      // Send to both — fire and forget, don't let one failure block the other
      const promises = [];
      for (const backend of this._router.getAllBackends()) {
        if (backend.isConnected()) {
          promises.push(
            backend.sendMessage(cleanText).catch((e) => {
              console.warn(`[DualMode] Failed to send to ${backend.id}:`, e.message);
            })
          );
        }
      }
      await Promise.all(promises);
    }
  }

  onMessage(cb) { this._messageCallbacks.push(cb); }
  onTyping(cb) { this._typingCallbacks.push(cb); }
}
