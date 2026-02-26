# Phase 6: Overig (Sandbox, MCP, Cleanup)

> **Risk:** High | **Effort:** ~1-2 hours | **Dependencies:** Phase 1, 2, 3, 4, 5

## Goal

Enable the Electron sandbox on the main window, add an approval gate to the MCP `tandem_execute_js` tool, clean up dist/ duplicate files, and move `KNOWN_WS_SERVICES` to `types.ts`.

## Important Context

- `sandbox: true` may break the preload script if it uses Node.js APIs directly. Read `src/preload.ts` FIRST before changing sandbox. If the preload uses `require('fs')`, `require('path')`, `require('child_process')`, etc., those calls MUST be moved to IPC handlers in main.ts before enabling sandbox.
- If enabling sandbox would require major preload refactoring, **skip it** and document why in STATUS.md. The other fixes in this phase are still valuable.
- The MCP approval gate should use whatever mechanism is available (e.g., `requiresApproval` on the tool definition, or a custom check). Read `src/mcp/server.ts` to understand the MCP SDK's capabilities first.
- The dist/ duplicate files are macOS Finder copy artifacts (space-2 naming) and safe to delete.

## Fixes

### 6.1 Enable sandbox on main window (CONDITIONAL)

**Review issue:** #5
**File:** `src/main.ts`, line 246

**First:** Read `src/preload.ts` completely. Check if it uses any Node.js built-in modules directly (not through contextBridge).

**If preload does NOT use Node.js APIs directly:**
```ts
// Change:
sandbox: false,  // Required for preload/contextBridge to work
// To:
sandbox: true,
```

**If preload DOES use Node.js APIs directly:**
Skip this fix. Document in STATUS.md:
- Which Node.js APIs the preload uses
- What would need to change to enable sandbox
- Mark this as a future task

**Test thoroughly:** After changing sandbox, verify:
- App launches
- Shell loads (not blank white screen)
- All contextBridge APIs work (navigate, tabs, chat, etc.)
- DevTools console shows no errors about missing modules

---

### 6.2 MCP `tandem_execute_js` approval gate

**Review issue:** #7
**File:** `src/mcp/server.ts`, around lines 219-230

Read the MCP SDK documentation/types to understand if there's a built-in `requiresApproval` mechanism for tools.

**If the MCP SDK supports `annotations.requiresHumanApproval`:**
```ts
server.tool(
  'tandem_execute_js',
  'Execute JavaScript code in the active browser tab. Returns the result.',
  {
    code: z.string().describe('JavaScript code to execute'),
  },
  async ({ code }) => {
    const result = await apiCall('POST', '/execute-js', { code });
    await logActivity('execute_js', code.substring(0, 80));
    return { content: [{ type: 'text', text: JSON.stringify(result.result ?? result, null, 2) }] };
  }
);
```

Add the `annotations` property if the SDK supports it. Check the `@modelcontextprotocol/sdk` package for the correct API.

**If the SDK does not support annotations:** Add a log warning before execution:
```ts
console.warn(`[MCP] tandem_execute_js called with code: ${code.substring(0, 100)}`);
```

Document the limitation in STATUS.md.

---

### 6.3 Delete dist/ duplicate files

**Review issue:** #21

These are macOS Finder copy artifacts (the " 2" naming pattern):

```bash
rm -f "dist/main 2.js" "dist/main 2.js.map" "dist/main 2.d.ts"
rm -f "dist/preload 2.js" "dist/preload 2.js.map" "dist/preload 2.d.ts"
rm -rf "dist/activity/tracker 2.js" "dist/activity/tracker 2.d.ts" "dist/activity/tracker 2.js.map"
rm -rf "dist/voice/recognition 2.js" "dist/voice/recognition 2.d.ts" "dist/voice/recognition 2.js.map"
rm -rf "dist/stealth 2"
rm -rf "dist/api 2"
```

**First** check which " 2" files exist with `ls -la dist/ | grep " 2"` and `find dist -name "* 2*"`. Only delete files that actually exist.

**Note:** Also check if `dist/` should be in `.gitignore`. If it's currently tracked by git, this is a larger decision. Just delete the " 2" files for now and document the `.gitignore` question in STATUS.md.

---

### 6.4 Move KNOWN_WS_SERVICES to types.ts

**Review issue:** #2 (CLAUDE.md compliance)
**Files:** `src/security/outbound-guard.ts` lines 6-21, `src/security/types.ts`

**Current:** `KNOWN_WS_SERVICES` is defined locally in `outbound-guard.ts`.
**Rule:** `docs/security-upgrade/CLAUDE.md` says shared constants go in `types.ts`.

**Fix:**
1. Cut the `KNOWN_WS_SERVICES` const from `outbound-guard.ts`
2. Paste it into `src/security/types.ts` (export it)
3. Import it in `outbound-guard.ts`: `import { ..., KNOWN_WS_SERVICES } from './types';`
4. Add it to the existing import line if one exists, or create a new import

---

## Verification Checklist

- [ ] `npx tsc --noEmit` — 0 errors
- [ ] App launches with `npm start`
- [ ] If sandbox was enabled: shell loads, all features work
- [ ] If sandbox was skipped: documented in STATUS.md
- [ ] MCP execute_js has approval/logging (test if MCP SDK supports annotations)
- [ ] No " 2" files left in dist/
- [ ] `KNOWN_WS_SERVICES` is exported from `src/security/types.ts`
- [ ] `src/security/outbound-guard.ts` imports it from `./types`
- [ ] Browse to google.com, github.com — everything works
- [ ] All Phase 1+2+3+4+5 fixes still work
- [ ] Full regression: security, extensions, chat, bookmarks, history

## Commit Message

```bash
git commit -m "$(cat <<'EOF'
fix(review): Phase 6 — sandbox, MCP, cleanup

- Enable sandbox: true on main window (or document why skipped)
- MCP tandem_execute_js: add approval/logging gate
- Delete dist/ macOS duplicate "2" files
- Move KNOWN_WS_SERVICES to security/types.ts (CLAUDE.md compliance)

Ref: docs/CODE-REVIEW-2026-02-26.md

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
git push origin main
```
