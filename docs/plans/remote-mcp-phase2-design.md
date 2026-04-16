# Phase 2: Remote MCP Support — Design Note

**Status:** Draft
**Date:** 2026-04-16
**Author:** Robin Waslander + Claude
**Depends on:** Phase 1 (remote agent pairing, Tailscale HTTP onboarding) — merged

---

## 1. Goal

Allow a paired remote agent (connected over Tailscale) to use Tandem's full MCP tool surface — the same 250+ tools available to local agents via stdio — over the network.

The result: a remote Claude Code instance (or any MCP-capable agent) can add Tandem as an MCP server and get the same experience as a local agent, with no degradation in tool coverage.

---

## 2. Non-goals

- **No public internet exposure.** Tailscale-only remains the rule.
- **No separate trust tier for remote MCP.** A paired agent is a paired agent — local and remote are connection categories, not permission levels.
- **No enterprise IAM / scopes / roles.** The pairing model (paired / paused / revoked / removed) is the only access model.
- **No cloud broker or relay.**
- **No new auth mechanism.** Reuse binding tokens from Phase 1.
- **No MCP-over-WebSocket.** The MCP SDK's Streamable HTTP transport already supports long-lived SSE streams for server-initiated messages. WebSocket adds complexity without benefit.
- **No changes to the existing stdio MCP path.** Local agents continue using stdio exactly as before.
- **No generic "remote browser infrastructure."** This serves Tandem's shared human-AI workspace model.

---

## 3. Designs Considered

### Design A: Streamable HTTP MCP on the existing Express server

**Approach:** Mount a `/mcp` route on Tandem's existing Express server. Use the MCP SDK's `StreamableHTTPServerTransport` to handle MCP-over-HTTP. Register the same `McpServer` instance with the same 250+ tools. Auth flows through the existing Bearer token middleware — both local api-tokens and `tdm_ast_*` binding tokens work unchanged.

**How auth works:** Existing Express auth middleware runs before the MCP route. Bearer token (local or binding) validated exactly as for any other API route. The `StreamableHTTPServerTransport.handleRequest(req, res)` receives an already-authorized request.

**How transport works:** MCP SDK's Streamable HTTP transport. Client POSTs JSON-RPC to `/mcp`, server responds inline or upgrades to SSE for streaming. Supports session IDs for stateful mode. Works over plain HTTP (Tailscale provides encryption).

**Security implications:**
- Same auth surface as all other API routes — no new attack vectors
- MCP session IDs add a secondary binding but are not a security boundary
- Rate limiting and binding pause/revoke apply identically

**Complexity:** Low-medium. The MCP SDK provides the transport. Tool registration is already modular (`register*Tools(server)`). Main work: instantiate a second McpServer for HTTP transport, mount it, wire auth.

**Risk:** Low. The transport is SDK-provided and well-tested. The tool surface is identical. Auth is reused.

**Edge cases:**
- Concurrent MCP sessions from multiple remote agents (session isolation)
- SSE connection drops over Tailscale (reconnection handling built into SDK)
- Large responses (screenshots, page content) over network latency
- MCP server lifecycle tied to Express server (simpler than managing child processes)

---

### Design B: MCP-over-HTTP bridge (proxy to stdio child process)

**Approach:** Keep the MCP server as a separate stdio process. Add a bridge/proxy in the Express server that: spawns an MCP child process per remote session, translates incoming HTTP MCP requests into stdin writes, reads stdout responses, and pipes them back as HTTP responses.

**How auth works:** Auth at the bridge layer using existing Bearer token middleware. Bridge spawns child process with local api-token so it can call the HTTP API.

**How transport works:** HTTP → bridge → stdio pipe → MCP server → stdio pipe → bridge → HTTP. Custom protocol translation layer.

**Security implications:**
- Child process management adds attack surface (process exhaustion, zombie processes)
- Token leakage risk if child processes are not properly isolated
- Bridge is custom code that must correctly translate between HTTP and stdio semantics

**Complexity:** High. Requires: process pool management, stdio↔HTTP protocol translation, session-to-process mapping, process lifecycle (spawn, health check, kill), error propagation across process boundaries, handling of SSE streaming through a stdio proxy.

**Risk:** Medium-high. Custom protocol bridge is fragile. Stdio is synchronous/streaming in ways that don't map cleanly to HTTP request/response. Process management adds operational complexity.

**Edge cases:**
- Process crashes mid-session (need restart + session recovery)
- Backpressure between HTTP client and stdio pipe
- Memory leaks from orphaned child processes
- Startup latency for each new session (process spawn time)

---

### Design C: Remote stdio via Tailscale SSH

**Approach:** Don't change the MCP server. Remote agents use `tailscale ssh <tandem-host> node /path/to/dist/mcp/server.js` as their MCP stdio command. Tailscale SSH tunnels the stdio streams.

**How auth works:** Tailscale SSH ACLs control who can SSH. Once connected, the MCP process reads the local `~/.tandem/api-token` from the Tandem host's filesystem. No binding tokens involved.

**How transport works:** Tailscale SSH creates an encrypted tunnel. Stdio streams flow through it. From the MCP server's perspective, it's running locally.

**Security implications:**
- Requires Tailscale SSH to be enabled (additional Tailscale configuration burden)
- Bypasses the binding token model entirely — SSH access = full access
- No pause/revoke granularity — can only revoke at Tailscale ACL level
- Shell access to the Tandem host is a broader privilege than API access
- The MCP process runs as the Tandem host's user, with access to the full filesystem

**Complexity:** Low on Tandem's side (zero code changes). High on the user's side (Tailscale SSH setup, ACLs, path management, Node.js must be available on the host).

**Risk:** Medium. Bypasses Tandem's own auth model. Requires SSH-level trust which is a much broader grant than API access. Not aligned with Phase 1's pairing model.

**Edge cases:**
- SSH session drops (MCP server dies, no session recovery)
- Node.js version mismatch on remote host
- Path to dist/mcp/server.js varies by installation
- No visibility in Tandem UI (no binding, no "Connected Agents" display)
- Cannot distinguish multiple remote agents
- User must manage Tailscale SSH ACLs separately from Tandem pairing

---

## 4. Recommended Design: A (Streamable HTTP MCP on Express)

**Why Design A wins:**

| Criterion | A (HTTP MCP) | B (Bridge) | C (SSH) |
|-----------|:---:|:---:|:---:|
| Reuses Phase 1 auth | ✅ | ✅ | ❌ |
| Reuses Phase 1 pairing | ✅ | ✅ | ❌ |
| SDK-provided transport | ✅ | ❌ | N/A |
| Visible in Connected Agents UI | ✅ | ✅ | ❌ |
| No custom protocol translation | ✅ | ❌ | ✅ |
| No process management | ✅ | ❌ | ❌ (SSH) |
| Pause/revoke granularity | ✅ | ✅ | ❌ |
| User setup complexity | Low | Low | High |
| Code complexity | Low-med | High | Zero |
| Aligned with product philosophy | ✅ | ✅ | ❌ |

Design A is the clear winner because:

1. **It reuses everything Phase 1 built.** Binding tokens, pairing flow, pause/revoke, Connected Agents UI — all work unchanged.
2. **The MCP SDK already provides the transport.** `StreamableHTTPServerTransport` is production-grade, handles SSE, sessions, reconnection.
3. **No custom protocol bridge.** Tools relay to the same HTTP API either way — there's no semantic gap to bridge.
4. **The user story stays simple.** Pair your agent (same flow as Phase 1), configure it as an MCP server pointing at `http://100.x.y.z:8765/mcp`, done.
5. **Local and remote are parallel paths, not layered.** Local agents use stdio. Remote agents use Streamable HTTP. Both hit the same McpServer tool registrations. Neither is a wrapper around the other.

Design B is over-engineered — it adds a fragile custom bridge to preserve stdio as the "real" transport, when the SDK already provides a native HTTP transport. Design C bypasses Tandem's auth model entirely and requires SSH-level trust, which contradicts the pairing philosophy.

---

## 5. Architecture

```
Local agent (same machine)              Remote agent (Tailscale)
     │                                        │
     │ stdio                                  │ HTTP POST /mcp
     ▼                                        │ Authorization: Bearer tdm_ast_...
┌──────────────┐                              ▼
│ MCP Server   │                     ┌──────────────────┐
│ (child proc) │                     │ Express server    │
│ stdio transport│                   │   auth middleware │
│ ─── tools ───│─── HTTP ──▶        │   ▼               │
│              │   localhost         │ /mcp route        │
└──────────────┘                     │   StreamableHTTP  │
                                     │   transport       │
                                     │   ─── tools ───── │──▶ same tool handlers
                                     └──────────────────┘      (register*Tools)
```

Key insight: **MCP tools are thin HTTP relays.** Every tool calls `apiCall('POST', '/navigate', ...)` against localhost. For the in-process HTTP MCP server, tools call the same API routes — the Express server talks to itself. This is a feature, not a bug: it means the MCP tool layer has zero coupling to the transport, and all authorization, rate limiting, and audit happen at the API layer.

However, there's an optimization opportunity: since the HTTP MCP server runs **inside** the Express process, tools could optionally call route handlers directly instead of making HTTP round-trips. This is a Phase 2.1 optimization, not a launch requirement.

---

## 6. Auth Model

**No new auth mechanism.** The existing Bearer token flow handles everything:

1. Remote agent pairs via Phase 1 flow → receives `tdm_ast_*` binding token
2. Agent configures Tandem as MCP server: `http://100.x.y.z:8765/mcp`
3. MCP client sends `Authorization: Bearer tdm_ast_...` header with every request
4. Express auth middleware validates token → allows request → MCP transport handles it
5. Pause/revoke binding → MCP requests rejected (401) → agent loses MCP access

**MCP session IDs** (from StreamableHTTPServerTransport) provide session continuity but are **not a security boundary**. Auth is always the Bearer token.

**Local agents** remain unchanged: stdio transport, `~/.tandem/api-token`, no pairing needed.

### Token flow for MCP clients

Most MCP clients (Claude Code, Cursor, etc.) support custom headers in their MCP server configuration. Example `claude.json`:

```json
{
  "mcpServers": {
    "tandem": {
      "type": "streamable-http",
      "url": "http://100.64.0.1:8765/mcp",
      "headers": {
        "Authorization": "Bearer tdm_ast_..."
      }
    }
  }
}
```

If an MCP client doesn't support custom headers, we can also support token-in-URL as a fallback: `http://100.64.0.1:8765/mcp?token=tdm_ast_...` (extracted in middleware, same validation). This should be documented as a fallback, not the primary path.

---

## 7. Transport Model

**Protocol:** MCP Streamable HTTP (spec-compliant, SDK-provided)

**Endpoint:** `POST /mcp` (JSON-RPC request/response), `GET /mcp` (SSE stream for server-initiated messages)

**Session management:** Stateful mode with `sessionIdGenerator: () => randomUUID()`. Sessions are per-agent-connection. Session ID returned in `Mcp-Session-Id` response header.

**Lifecycle:**
- Agent sends `initialize` request → new session created
- Subsequent requests include `Mcp-Session-Id` header
- Session cleaned up on `DELETE /mcp` or timeout
- Binding revocation terminates all sessions for that binding

**SSE streaming:** Used for server-initiated notifications (resource updates). The existing event listener pattern (browser events → resource updates) works identically — instead of piping through stdio, notifications go through the SSE stream.

**No TLS required.** Tailscale provides end-to-end encryption. HTTP is fine within the Tailscale network.

---

## 8. Discovery / Bootstrap Implications

### Changes to `/agent/version`

```json
"transports": {
  "http": { "available": true, "local": true, "remote": true },
  "mcp": {
    "available": true,
    "local": true,
    "remote": true,
    "localTransport": "stdio",
    "remoteTransport": "streamable-http",
    "remoteEndpoint": "/mcp",
    "note": "Local: stdio. Remote: Streamable HTTP at /mcp with Bearer auth."
  }
}
```

### Changes to `/agent/manifest`

Add MCP connection instructions:

```json
"mcp": {
  "endpoint": "/mcp",
  "transport": "streamable-http",
  "auth": "bearer-token",
  "sessionHeader": "Mcp-Session-Id",
  "capabilities": ["tools", "resources"],
  "toolCount": 250
}
```

### Changes to `/agent` (markdown bootstrap)

Add a section for remote MCP setup:

```markdown
## MCP Connection (remote agents)

If your agent supports MCP over Streamable HTTP, connect to:

    POST http://<tandem-address>:8765/mcp
    Authorization: Bearer <your-binding-token>

This gives you access to all 250+ Tandem tools via MCP protocol.
Pair first using the setup code flow, then use the binding token.
```

### Changes to `/pairing/exchange`

When a remote agent pairs with `transportModes: ['mcp']` or `['http', 'mcp']`, the exchange response should include MCP connection details:

```json
{
  "token": "tdm_ast_...",
  "bindingId": "...",
  "mcp": {
    "endpoint": "/mcp",
    "transport": "streamable-http"
  }
}
```

---

## 9. UX / Onboarding Implications

### Settings → Connected Agents

- Bindings with `transportModes` including `'mcp'` should show an MCP badge/indicator
- The onboarding instructions for "On another machine" should include MCP config examples
- Consider a "Copy MCP config" button that generates the JSON snippet for common clients

### Onboarding copy changes

The "On another machine" flow currently shows HTTP API connection instructions. Add a tab or section for MCP:

```
Connect via MCP (recommended for Claude Code, Cursor, etc.):

1. Pair using the setup code above
2. Add to your MCP config:
   {
     "tandem": {
       "type": "streamable-http",
       "url": "http://<tailscale-ip>:8765/mcp",
       "headers": { "Authorization": "Bearer <token>" }
     }
   }
```

### No new pairing flow

The pairing flow is unchanged. Remote MCP agents pair exactly like remote HTTP agents. The `transportModes` field in the exchange request already supports `['mcp']`. The only difference is what the agent does after pairing — connect to `/mcp` instead of calling individual HTTP routes.

---

## 10. Security Model Implications

### No new attack surface

The `/mcp` endpoint is behind the same auth middleware as every other route. It requires a valid Bearer token (local or binding). Unauthenticated requests get 401.

### Session hijacking

MCP session IDs are UUIDs, not security tokens. An attacker who steals a session ID still needs the Bearer token. Session IDs provide continuity, not authentication.

### Denial of service

Each MCP session holds an SSE connection. Rate limit session creation per binding (e.g., max 5 concurrent sessions per binding). Clean up idle sessions after timeout (e.g., 30 minutes no activity).

### Binding revocation

When a binding is paused or revoked:
1. Future MCP requests return 401
2. Active SSE streams should be terminated
3. Session state cleaned up

This requires the MCP layer to check binding state on each request (already happens in auth middleware) and to have a mechanism to close active transports when a binding is revoked. Implementation: `PairingManager` emits `'binding-changed'` events → MCP session manager listens and closes affected transports.

### Audit trail

MCP requests should be logged in the same audit trail as HTTP API requests. The binding's `lastUsedAt` timestamp updates on MCP requests just as it does on HTTP requests.

---

## 11. Compatibility / Parity with Local MCP

| Feature | Local (stdio) | Remote (Streamable HTTP) |
|---------|:---:|:---:|
| Tool count | 250+ | 250+ (identical) |
| Resources | 5 | 5 (identical) |
| Resource notifications | ✅ (SSE → stdio) | ✅ (SSE stream built-in) |
| Auth | api-token (filesystem) | binding token (Bearer header) |
| Pairing required | No | Yes |
| Transport | stdio | Streamable HTTP |
| Session management | Implicit (process) | Explicit (session ID) |
| Concurrent agents | One per process | Multiple (session isolation) |
| Latency | ~0ms (localhost HTTP) | Tailscale network RTT |
| Large payloads | Fast (localhost) | Network-bound |

**Full tool parity** is a hard requirement. The same `register*Tools(server)` functions are called for both transports. If a tool works locally, it works remotely. No tool filtering, no capability reduction.

### Implementation detail: shared tool registration

The 28 `register*Tools()` functions currently take a `McpServer` instance. They'll be called on both:
- The stdio McpServer (existing, in child process)
- The HTTP McpServer (new, in Express process)

Since tools are stateless HTTP relays, this works without modification. The only difference is the API base URL:
- Stdio MCP: `http://localhost:8765` (existing `api-client.ts`)
- HTTP MCP: Could call localhost or use direct handler invocation

For Phase 2 launch, both use `http://localhost:8765`. Direct handler invocation is an optimization for later.

---

## 12. Open Questions

1. **MCP client header support.** Do all target MCP clients (Claude Code, Cursor, Windsurf, Copilot) support custom headers for Streamable HTTP servers? Need to verify. If not, the `?token=` URL fallback becomes more important.

2. **SSE connection limits.** How many concurrent SSE connections can the Express server handle before performance degrades? Should we cap sessions per binding?

3. **Tool registration sharing.** Should we extract tool registration into a shared module imported by both the stdio server and the Express server, or duplicate the registration calls? Shared module is cleaner but creates a build dependency.

4. **API base URL for in-process MCP.** The HTTP MCP server runs inside the Express process. Its tools call `http://localhost:8765/...` which is the same Express server. This works (server handles its own requests) but adds unnecessary network hops. Is direct handler invocation worth the complexity for v1? **Recommendation: no, ship with localhost relay first.**

5. **Event notifications for remote MCP.** The stdio MCP server starts an SSE listener to `localhost:8765/events/stream` for resource update notifications. The HTTP MCP server runs inside Express and can listen to the EventEmitter directly. Should we implement this optimization in Phase 2 or defer? **Recommendation: defer, use the same SSE listener pattern for consistency.**

6. **Session cleanup on Tailscale disconnect.** If a Tailscale peer goes offline, SSE connections will hang until TCP timeout. Should we implement heartbeat-based session cleanup? **Recommendation: yes, implement a 5-minute heartbeat timeout.**

---

## 13. Recommended Implementation Order

### Step 1: Shared tool registration module
Extract the 28 `register*Tools()` calls and resource registrations from `src/mcp/server.ts` into a shared `src/mcp/register-all.ts` module. Both the existing stdio server and the new HTTP server will import it.

**Files:** `src/mcp/register-all.ts` (new), `src/mcp/server.ts` (simplified)
**Tests:** Verify stdio MCP still works after extraction.

### Step 2: In-process McpServer with Streamable HTTP transport
Create `src/mcp/http-transport.ts` that:
- Instantiates a `McpServer` with the shared tool registrations
- Creates a `StreamableHTTPServerTransport` in stateful mode
- Exposes an Express-compatible request handler

**Files:** `src/mcp/http-transport.ts` (new)
**Tests:** Unit tests for session creation, tool dispatch, auth rejection.

### Step 3: Mount `/mcp` route on Express server
Wire the HTTP MCP transport into the Express app behind the existing auth middleware.

**Files:** `src/api/server.ts` (add route), `src/api/routes/mcp.ts` (new route module)
**Tests:** Integration tests: authenticated MCP request → tool response, unauthenticated → 401.

### Step 4: Event notifications for HTTP MCP
Wire browser events → resource update notifications for HTTP MCP sessions (same pattern as stdio SSE listener, but in-process).

**Files:** `src/mcp/http-transport.ts` (add event listener)
**Tests:** Verify resource update notifications fire on navigation events.

### Step 5: Session lifecycle management
Implement session limits (max per binding), idle timeout cleanup, and binding revocation → session termination.

**Files:** `src/mcp/http-transport.ts` (session manager)
**Tests:** Session limit enforcement, revocation cleanup.

### Step 6: Update bootstrap/discovery
Update `/agent/version`, `/agent/manifest`, `/agent`, and `/pairing/exchange` responses to advertise remote MCP support.

**Files:** `src/api/routes/bootstrap.ts`, `src/api/routes/pairing.ts`
**Tests:** Bootstrap response assertions.

### Step 7: Update onboarding UI
Add MCP connection instructions and "Copy MCP config" button to the Connected Agents settings panel.

**Files:** `shell/settings.html`
**Tests:** Manual verification in running Tandem.

### Step 8: End-to-end testing
Test with a real remote Claude Code instance over Tailscale:
- Pair via setup code
- Configure Tandem as Streamable HTTP MCP server
- Run tool calls
- Verify resource notifications
- Test pause/revoke → MCP disconnection

---

## 14. What This Does NOT Change

- **Local MCP via stdio:** Unchanged. Local agents keep using `node dist/mcp/server.js` via stdio.
- **HTTP API routes:** Unchanged. Remote agents can still use the HTTP API directly if they prefer.
- **Pairing flow:** Unchanged. Same setup code → exchange → binding token flow.
- **Trust model:** Unchanged. Paired = full access. No scopes, no roles, no reduced surface.
- **Tailscale-only rule:** Unchanged. No public internet exposure.

---

## Appendix: MCP SDK Transport Reference

The `@modelcontextprotocol/sdk` package (already a dependency) provides:

- `StdioServerTransport` — current local transport ✅
- `StreamableHTTPServerTransport` — Node.js HTTP compatible, supports Express ✅
- `SSEServerTransport` — legacy, superseded by Streamable HTTP
- `WebStandardStreamableHTTPServerTransport` — for Cloudflare/Deno/Bun (not needed)

`StreamableHTTPServerTransport` key features:
- Stateful mode with session IDs
- SSE streaming for server-initiated messages
- `handleRequest(req, res, parsedBody?)` — Express-compatible
- Session cleanup via `close()`
- Built-in reconnection support for SSE streams
