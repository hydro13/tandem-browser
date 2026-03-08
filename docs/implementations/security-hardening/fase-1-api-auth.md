# Phase 1 — API Auth: Tighten the Local Trust Boundary

> **Feature:** Security hardening
> **Sessions:** 1 session
> **Priority:** HIGH
> **Depends on:** None

---

## Goal Or This Phase

Make the local HTTP API stop trusting loopback traffic as equivalent to a fully
authorized caller. The end result should be an explicit caller model where
sensitive routes require a bearer token or an approved internal path.

---

## Existing Code To Read — Only This

| File | Look for | Why |
|------|----------|-----|
| `src/api/server.ts` | `class TandemAPI` | current auth and CORS behavior |
| `src/api/context.ts` | `getActiveWC()`, `getSessionWC()` | caller assumptions and tab access helpers |
| `src/api/routes/extensions.ts` | route registration | extension-origin usage |
| `src/main.ts` | `startAPI()` | API startup path |
| `AGENTS.md` | full file | workflow and anti-detect rules |

---

## Build In This Phase

### 1. Define Caller Classes

Document and implement distinct treatment for:

- shell/internal caller
- OpenClaw/local automation client
- trusted extension caller
- unknown local process

### 2. Require Explicit Auth For HTTP

Remove the blanket "loopback means trusted" model for sensitive routes.

Expected direction:

- `/status` may remain unauthenticated
- normal HTTP routes require `Authorization: Bearer`
- any internal bypass must be explicit and narrow

### 3. Remove Weak Legacy Paths

Reduce or remove:

- query-string token auth
- broad origin-based fallback trust
- assumptions that `127.0.0.1` is enough on its own

---

## Acceptance Criteria

```bash
TOKEN=$(cat ~/.tandem/api-token)

# Without token, sensitive route should fail
curl http://127.0.0.1:8765/tabs/list
# Expect: 401 or equivalent auth failure

# With token, route should work
curl -H "Authorization: Bearer $TOKEN" \
  http://127.0.0.1:8765/tabs/list
# Expect: current success payload such as {"tabs":[...],"groups":[...]}

# Query-string token auth should no longer work
curl "http://127.0.0.1:8765/tabs/list?token=$TOKEN"
# Expect: 401 or equivalent auth failure

# Health check remains available
curl http://127.0.0.1:8765/status
# Expect: healthy status payload
```

**Manual verification:**

- [ ] Shell UI still works normally
- [ ] OpenClaw can still access the browser through the intended auth path
- [ ] No unexpected page-side access to the API appears

---

## Known Pitfalls

- Breaking shell calls that currently depend on implicit loopback trust
- Breaking extension shims that still assume unauthenticated localhost access
- Leaving behind one legacy bypass that defeats the entire phase
