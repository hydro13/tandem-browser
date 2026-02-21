# Security Fixes

Targeted fixes for security gaps discovered during real-world testing of Tandem's 6-layer security system.

## Phases

| Phase | Fix | Status |
|-------|-----|--------|
| 1 | Real redirect blocking + WS false positive | PENDING |

## Background

During stress testing on 21 feb 2026, two gaps were found:

1. **Redirect bypass:** The LinkedIn `/redir/redirect?url=...` pattern bypassed all security layers.
   Root cause: `onBeforeRedirect` fires after Electron follows the redirect — can't cancel.
   Fix: Use `onHeadersReceived` which fires before the redirect is followed and supports `cancel: true`.

2. **WebSocket false positive:** `ws://127.0.0.1:18789/` (Tandem's own gatekeeper WebSocket)
   was being logged as `unknown-ws-endpoint` severity:medium.
   Fix: Add localhost exclusion to `analyzeWebSocket()` in outbound-guard.ts.
