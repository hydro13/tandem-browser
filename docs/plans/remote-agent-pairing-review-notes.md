# Review Notes: Remote Agent Pairing — Phase 1

> **Branch:** feature/agent-bootstrap-and-pairing
> **Date:** 2026-04-15
> **Status:** Remote Tailscale connectivity proven in practice (Windows 11 + Claude Code → macOS)

---

## Key files

### New files

| File | Purpose | LOC |
| --- | --- | --- |
| `src/pairing/manager.ts` | Core pairing logic: setup codes, token exchange, binding CRUD, persistence | ~310 |
| `src/api/routes/bootstrap.ts` | Public discovery surface with request-aware base URLs, correct route names, structured transport info | ~250 |
| `src/api/routes/pairing.ts` | Pairing API: setup-code, exchange, bindings management, whoami, address detection | ~260 |
| `src/pairing/tests/manager.test.ts` | 42 unit tests for PairingManager | ~350 |
| `src/api/tests/routes/bootstrap.test.ts` | 10 route tests for bootstrap endpoints (incl. dynamic baseUrl, transport structure) | ~100 |
| `src/api/tests/routes/pairing.test.ts` | 28 tests for pairing routes + detectAddresses | ~330 |

### Modified files

| File | Change |
| --- | --- |
| `src/api/server.ts` | Import bootstrap/pairing routes; public route paths; `isBindingTokenValid()` for dual-token auth; listen host from config (default `0.0.0.0`) |
| `src/registry.ts` | Add `pairingManager: PairingManager` to ManagerRegistry |
| `src/bootstrap/types.ts` | Add `pairingManager: PairingManager` to RuntimeManagers |
| `src/bootstrap/runtime.ts` | Initialize PairingManager, wire into registry, add destroy call |
| `src/config/manager.ts` | Add `apiListenHost` (default `0.0.0.0`); migration from old `127.0.0.1` saved value |
| `src/api/tests/helpers.ts` | Add `pairingManager` mock to `createMockContext()` |
| `shell/settings.html` | Onboarding-first "Connect your AI to Tandem" with mode selector, address detection, instruction generation with `bindingKind`, binding cards, controls, polling |

---

## Architectural choices

### 1. Standalone manager + JSON storage
Follows existing Tandem patterns (BookmarkManager, PinboardManager). JSON at `~/.tandem/pairing/bindings.json` with 0600 permissions. Setup codes are in-memory only (correct for 5-min TTL ephemeral secrets).

### 2. Dual-token auth
Binding tokens (`tdm_ast_`) are validated alongside the existing local `api-token` in `classifyCaller()`. Both result in `local-automation` caller class (full API access). The existing auth path is untouched — binding validation is an additive check. Short-circuits on prefix so non-binding tokens skip the lookup.

### 3. SHA-256 token hashing (not argon2)
Design doc suggested SHA-256 + argon2. Implementation uses SHA-256 only. Rationale: the token is 256-bit random (not a password), so SHA-256 with timing-safe comparison is sufficient. Argon2 would add a native dependency and slow down every API request for no security gain.

### 4. Public bootstrap routes
`/agent`, `/skill`, `/agent/manifest`, `/agent/version` are unauthenticated. They contain no sensitive data — only version info, capability lists, and pairing instructions. This is intentional: an agent must be able to discover Tandem before it has a token.

### 5. Listen host defaults to 0.0.0.0
Local and remote connections must work simultaneously (not either/or). The server listens on all interfaces by default. Existing installs that had `127.0.0.1` saved are auto-migrated to `0.0.0.0` during config load. This migration was validated after hitting the exact problem during live Tailscale testing.

### 6. Structured transport info
The manifest and version endpoints report transports as structured objects (`{ http: { local: true, remote: true }, mcp: { local: true, remote: false } }`) rather than a flat array. This prevents remote agents from assuming MCP is available remotely.

---

## Things to verify in the diff

1. **`server.ts` auth changes** — `isBindingTokenValid()` is in the hot path for every API request. It short-circuits on the `tdm_ast_` prefix check, so non-binding tokens skip the lookup entirely.

2. **Public route set** — `/agent`, `/agent/version`, `/agent/manifest`, `/skill`, `/pairing/exchange`, `/pairing/whoami` are public. The exchange endpoint has its own rate limiter (10/min). The whoami endpoint does its own auth internally.

3. **Config migration** — `apiListenHost: "127.0.0.1"` is auto-migrated to `"0.0.0.0"` in `config/manager.ts load()`. This is a one-way migration — appropriate because `0.0.0.0` supports both local and remote.

4. **Bootstrap route names** — all route names in `/agent` and `/skill` were corrected to match actual routes (e.g. `/tabs/list` not `/list-tabs`). Verify against actual route registrations if in doubt.

5. **Instruction block `bindingKind`** — the generated instruction text now includes `"bindingKind": "local"` or `"bindingKind": "remote"` so bindings are classified correctly.

---

## Known limitations (acceptable for phase 1)

- Remote MCP not available (agents use HTTP API; phase 2 scope)
- No CORS support for browser-origin remote callers (curl/SDK works fine; phase 2)
- Token not rotatable (phase 3)
- No concurrent multi-agent stress testing done
- UI polling for auto-refresh on pairing exists but not explicitly verified in live testing
- `/dialog/pick-folder` is local-only (returns 422 for remote callers)
- Extension native messaging proxy routes are local-only (require chrome-extension:// origin)
- Security Gatekeeper WebSocket uses its own ephemeral secret (not binding tokens)

## Remote HTTP API coverage audit (post phase-1 fixes)

### Fixed in phase-1 coverage pass

- Preview routes (`POST /preview`, `PUT /preview/:id`, `GET /preview/:id`) now use request-aware base URLs instead of hardcoded `127.0.0.1:8765`
- WebSocket `/watch/live` now accepts binding tokens (`tdm_ast_`) alongside local api-tokens
- `/agent/manifest` expanded from ~10 endpoints to full route family coverage (~150 endpoints across 25 families)
- `/dialog/pick-folder` returns a clear 422 error for remote callers instead of crashing
- `/GET /preview/:id` 404 page uses relative link instead of hardcoded localhost

### Intentionally local-only (not bugs)

- MCP (stdio transport)
- `/dialog/pick-folder` (native OS dialog)
- Extension native messaging proxy (`/extensions/native-message`, `/extensions/native-message/ws`)
- Google Photos OAuth callback
- Security Gatekeeper WebSocket (`/security/gatekeeper`)

### Remote HTTP parity audit (final pass)

All HTTP route files were audited line-by-line for remaining remote-breaking patterns. Result: **no remaining remote-breaking gaps found**. Every endpoint reachable by a local `api-token` is equally reachable by a `tdm_ast_` binding token. Auth is uniform via `classifyCaller()` — there is no per-route auth divergence.

**Filesystem-path-in-response pattern (not a bug):** Several endpoints return a local filesystem path in the response body when they save files on the Tandem host (e.g. `GET /screenshot?save=...`, `POST /screenshot/application`, `POST /clipboard/save`, `POST /sessions/state/save`). These operations succeed remotely — the file is saved on the Tandem machine — but the `path` field is only meaningful locally. Remote agents should use the direct-data variants (e.g. `GET /screenshot` without `?save` returns PNG data directly). This is documented in the manifest `remoteNotes` section.

### Remaining items (phase 2+)

- CORS: browser-origin remote callers are blocked (CLI/SDK callers work fine without Origin header)
- Native messaging proxy CSP patches hardcode `127.0.0.1:8765` (only affects local extensions, not remote agents)
- Remote MCP transport
