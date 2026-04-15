# Test Report: Remote Agent Pairing — Phase 1

> **Date:** 2026-04-15
> **Branch:** feature/agent-bootstrap-and-pairing
> **Tandem version:** 0.73.0
> **Tester:** Claude Code (Opus 4.6) + Robin Waslander (manual UI + live remote testing)

---

## What was built

Phase 1 of remote agent connectivity for Tandem Browser:

1. **PairingManager** — setup code generation, token exchange, binding lifecycle, JSON persistence
2. **Bootstrap routes** — `/agent`, `/skill`, `/agent/manifest`, `/agent/version` with request-aware base URLs and correct route names
3. **Pairing routes** — setup-code generation, exchange, bindings CRUD, whoami, address detection
4. **Binding token auth** — paired agents authenticate with `tdm_ast_` tokens alongside existing `api-token`
5. **Onboarding-first Settings UI** — "Connect your AI to Tandem" with two modes (on this machine / on another machine), address detection, generated instruction block with `bindingKind`, binding management
6. **Address detection** — automatic local and Tailscale address detection via `GET /pairing/addresses`
7. **Listen host default** — `apiListenHost` defaults to `0.0.0.0` (local + remote simultaneously), with config migration for existing installs

---

## Automated test results

| Test file | Tests | Status |
|---|---|---|
| `src/pairing/tests/manager.test.ts` | 42 | All pass |
| `src/api/tests/routes/bootstrap.test.ts` | 10 | All pass |
| `src/api/tests/routes/pairing.test.ts` | 28 (routes + detectAddresses) | All pass |
| **Full suite (115 files)** | **2382 pass, 39 skipped** | **Zero regressions** |

TypeScript: clean compile (`tsc --noEmit`, zero errors).

---

## Live tests (manual, against running Tandem)

### Setup code lifecycle

| Test | Result |
|---|---|
| Generate setup code via UI | TDM-XXXX-XXXX displayed with countdown |
| Generate setup code via API (`POST /pairing/setup-code`) | Code returned with TTL |
| Code format matches `TDM-[A-Z0-9]{4}-[A-Z0-9]{4}` | Yes |
| Previous unused code cancelled on new generation | Yes |

### Token exchange

| Test | Result |
|---|---|
| Exchange valid code via `POST /pairing/exchange` (local) | Token `tdm_ast_...` returned, binding created |
| Exchange valid code via remote Tailscale host | Token returned, binding created, remote agent operational |
| Exchange with missing fields | 400 with specific field error |
| Exchange with invalid code format | 400 "Invalid setup code format" |
| Exchange consumed code | 400 "already been used" |
| Case-insensitive code matching | Yes (lowercase accepted) |

### Binding token auth

| Test | Result |
|---|---|
| `GET /pairing/whoami` with valid binding token | Returns full binding info |
| Protected route with valid binding token (local) | Authorized (full API access) |
| Protected route with valid binding token (remote via Tailscale) | Authorized (full API access) |
| Protected route with invalid token | 401 Unauthorized |
| Protected route with paused binding token | 401 Unauthorized |
| Protected route with revoked binding token | 401 Unauthorized |

### Binding state transitions

| Test | Result |
|---|---|
| Pair (local) | Binding created, visible in UI, token works |
| Pair (remote via Tailscale) | Binding created, visible in UI, remote agent can use all HTTP endpoints |
| Pause (via UI) | Token rejected, binding shows paused state |
| Resume (via UI) | Token works again, binding shows paired state |
| Revoke (via UI) | Token permanently rejected |
| Remove (via UI) | Binding removed from list, audit events preserved |

### Remote Tailscale connectivity (proven)

| Test | Environment | Result |
|---|---|---|
| Remote pairing over Tailscale | Windows 11 + VS Code + Claude Code → Apple laptop | Successful |
| Remote HTTP API usage | Same setup | Agent inspected and controlled live browser |
| Bootstrap route serving correct remote URLs | Tailscale IP in Host header | `baseUrl` correctly reflects Tailscale address |
| Local + remote simultaneous access | Both local MCP and remote HTTP | Both work at the same time |

### Bootstrap/discovery routes

| Route | Result |
|---|---|
| `GET /agent` | Markdown bootstrap page with correct route names, version-matched, Tailscale guidance |
| `GET /agent/version` | JSON with structured transport info (HTTP: local+remote, MCP: local only) |
| `GET /agent/manifest` | Full manifest with correct endpoints, structured transports |
| `GET /skill` | Version-matched quick-start with correct route names |

All four routes are public (no auth required), serve correct route names, and use request-aware base URLs.

### MCP connectivity

| Test | Result |
|---|---|
| `tandem_browser_status` via MCP (local, stdio) | Works — returns ready state, active tab, version |
| MCP unaffected by binding pause/revoke | Correct — MCP uses local api-token, not binding token |
| Remote MCP | Not available — remote agents use HTTP API |

---

## What is proven

- Full pairing lifecycle: generate code, exchange, authenticate, pause, resume, revoke, remove
- **Remote Tailscale connectivity works end-to-end** (Windows 11 ↔ macOS, VS Code + Claude Code as remote client)
- Local and remote connections work simultaneously (not either/or)
- Binding token auth works alongside existing api-token without interference
- UI reflects binding state correctly with live controls
- Bootstrap surface provides version-matched discovery with correct route names
- Address detection finds Tailscale interfaces automatically
- Config migration handles existing `127.0.0.1` installs
- Zero regressions in existing test suite (2382 tests)

## What is not yet proven

- **Remote MCP** — not in phase 1 scope; remote agents use HTTP API
- **Token persistence across Tandem restart** — bindings save to disk but restart continuity not explicitly tested
- **Multiple concurrent remote agents** — only single-remote-agent flows tested
- **UI auto-refresh polling** — code exists but not explicitly verified in live testing

---

## Phase-1 remote HTTP coverage fixes

The following issues were identified and fixed in a remote HTTP API coverage audit:

1. **Preview URLs hardcoded to `127.0.0.1:8765`** — `POST /preview`, `PUT /preview/:id`, and `GET /preview/:id` (404 page) used hardcoded localhost URLs in responses. Fixed to use request-aware `Host` header so remote agents get correct URLs.
2. **WebSocket `/watch/live` rejected binding tokens** — `authorizeWatchLiveRequest()` only validated local api-tokens. Fixed to also accept `tdm_ast_` binding tokens, so remote paired agents can use live watch notifications.
3. **`/agent/manifest` listed only ~10 endpoints** — expanded to cover ~150 endpoints across 25 route families, giving remote agents a real discovery surface.
4. **`/dialog/pick-folder` crashed for remote callers** — added guard that returns 422 with clear error when no BrowserWindow is available.

---

## Known follow-up items (phase 2+)

1. **Remote MCP** — binding tokens need an MCP network transport (phase 2)
2. **Token rotation** — not in phase 1 (design doc: phase 3)
3. **Audit event log UI** — events are stored but no viewer yet (phase 3)
4. **CORS for browser-origin remote requests** — curl/SDK works fine, browser-based remote UIs would need CORS expansion
5. **Native messaging proxy CSP** — hardcodes `127.0.0.1:8765` in extension manifests (only affects local extensions, not remote agents)
6. **Security Gatekeeper WebSocket** — uses its own ephemeral secret, not binding tokens (local-only by design)
