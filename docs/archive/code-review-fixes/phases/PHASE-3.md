# Phase 3: Auth Hardening

> **Risk:** Medium | **Effort:** ~1 hour | **Dependencies:** Phase 1, 2

## Goal

Close the authentication bypass that allows any local process to call the full API without a token. Fix the path traversal in the screenshot endpoint. Secure the identity auth endpoint.

## Important Context

- The auth middleware is in `src/api/server.ts`, lines 228-244
- The auth token is stored at `~/.tandem/api-token` and generated on first startup
- The shell loads via `file://` protocol — its Origin header is `file://`
- The MCP server reads the token from `~/.tandem/api-token` and sends it as a Bearer header
- All external tools (curl, AI agents) must use the token
- **Critical:** The `file://` origin bypass MUST remain — the shell needs it. Only the `!origin` (empty/missing origin) bypass must be removed.

## Fixes

### 3.1 Remove the `!origin` auth bypass

**Review issue:** #1
**File:** `src/api/server.ts`, around line 230

**Current code:**
```ts
if (origin === 'file://' || origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1') || !origin) {
  return next();
}
```

**Fix:** Remove the `|| !origin` condition. Keep the other conditions:

```ts
if (origin === 'file://' || origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1')) {
  return next();
}
```

**Why keep localhost?** The MCP server and internal tools run on localhost and send an Origin header with `http://localhost`. They also send a Bearer token, but the localhost bypass is a defense-in-depth measure for the internal API. The key security fix is removing `!origin` — that's the path that allows curl/scripts with NO origin to bypass auth entirely.

**Test immediately after this fix:**
```bash
# Should return 401:
curl -s http://127.0.0.1:8765/security/status | head -1

# Should still work (with token):
curl -s -H "Authorization: Bearer $(cat ~/.tandem/api-token)" http://127.0.0.1:8765/security/status | head -1

# Shell should still work (file:// origin) — verify by launching the app
```

---

### 3.2 Validate `/screenshot?save=` path

**Review issue:** #2
**File:** `src/api/server.ts`, around lines 613-617

**Current code:**
```ts
if (req.query.save) {
  const fs = require('fs');
  const filePath = req.query.save as string;
  fs.writeFileSync(filePath, png);
  res.json({ ok: true, path: filePath, size: png.length });
}
```

**Fix:** Validate the path before writing. Only allow saves to the user's Desktop or Downloads folder:

```ts
if (req.query.save) {
  const fs = require('fs');
  const path = require('path');
  const os = require('os');
  const filePath = path.resolve(req.query.save as string);

  // Only allow saving to Desktop or Downloads
  const allowedDirs = [
    path.join(os.homedir(), 'Desktop'),
    path.join(os.homedir(), 'Downloads'),
    path.join(os.homedir(), '.tandem'),
  ];
  const isAllowed = allowedDirs.some(dir => filePath.startsWith(dir + path.sep) || filePath === dir);

  if (!isAllowed) {
    res.status(400).json({ error: 'Save path must be in ~/Desktop, ~/Downloads, or ~/.tandem' });
    return;
  }

  fs.writeFileSync(filePath, png);
  res.json({ ok: true, path: filePath, size: png.length });
}
```

Note: `path` and `os` may already be imported at the top or the file. Check before adding duplicate imports. Use the existing imports if available.

---

### 3.3 Secure `/extensions/identity/auth`

**Review issue:** #8
**File:** `src/api/server.ts`, around line 224

**Current code:**
```ts
if (req.path === '/extensions/identity/auth') return next();
```

This skips auth entirely for the identity endpoint.

**Fix:** Remove this line. The endpoint should go through the normal auth middleware. Extension service workers running on localhost will be covered by the localhost origin bypass. If they don't send an Origin header, they should send a Bearer token (which they can read from `~/.tandem/api-token`).

**Test:** After removing this line, verify that the app still starts and that extension OAuth flows still work (if any extensions are installed that use chrome.identity).

---

## Verification Checklist

- [ ] `npx tsc --noEmit` — 0 errors
- [ ] `curl http://127.0.0.1:8765/security/status` → 401 Unauthorized
- [ ] `curl -H "Authorization: Bearer $(cat ~/.tandem/api-token)" http://127.0.0.1:8765/security/status` → valid JSON
- [ ] App launches, shell works (file:// origin still whitelisted)
- [ ] Screenshot save only works to ~/Desktop, ~/Downloads, ~/.tandem
- [ ] `curl -X POST http://127.0.0.1:8765/execute-js -H "Content-Type: application/json" -d '{"code":"1+1"}'` → 401
- [ ] MCP server still works (test: `npm run mcp` — should connect without auth errors)
- [ ] All Phase 1+2 fixes still work

## Commit Message

```bash
git commit -m "$(cat <<'EOF'
fix(review): Phase 3 — auth hardening

- Remove !origin auth bypass (curl/scripts no longer skip auth)
- Validate /screenshot?save= path (restrict to Desktop/Downloads/~.tandem)
- Remove /extensions/identity/auth auth exemption

Ref: docs/CODE-REVIEW-2026-02-26.md

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
git push origin main
```
