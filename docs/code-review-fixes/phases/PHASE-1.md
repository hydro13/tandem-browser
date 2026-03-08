# Phase 1: Triviale Safe Fixes

> **Risk:** Zero | **Effort:** ~30 min | **Dependencies:** None

## Goal

Fix 8 issues that are each 1-5 lines or code, have zero architectural impact, and cannot cause regressions. These are the "free wins" from the code review.

## Fixes

### 1.1 Guardian backpressure conditie: `&&` → `||`

**Review issue:** #14
**File:** `src/security/guardian.ts`, line 53

The backpressure guard uses `&&` but should use `||`. Currently, items are always queued when the gatekeeper is connected, even if there are 100+ pending decisions (memory leak).

**Current code:**
```ts
if (!status.connected && status.pendingDecisions >= 100) return;
```

**Fix:**
```ts
if (!status.connected || status.pendingDecisions >= 100) return;
```

---

### 1.2 SecurityDB not closed bij app quit

**Review issue:** #16
**File:** `src/security/security-manager.ts`, `destroy()` method

`SecurityManager.destroy()` does not call `this.db.close()`. The WAL is never checkpointed.

**Fix:** Add `this.db.close()` at the end or the `destroy()` method. Find the `destroy()` method in `SecurityManager` and add the call. Make sure it's the last line (after all other cleanup).

---

### 1.3 productName "Google Chrome" → "Tandem Browser"

**Review issue:** #18
**File:** `package.json`, line 47

**Current code:**
```json
"productName": "Google Chrome",
```

**Fix:**
```json
"productName": "Tandem Browser",
```

---

### 1.4 DEBUG console.logs verwijderen out onboarding

**Review issue:** #19
**File:** `shell/index.html`, around lines 5624-5724

Remove all `console.log('[DEBUG]` lines from the `showOnboarding()` and `showOnboardingStep()` functions. There are ~17 or them. Remove only the `console.log('[DEBUG]` lines, don't touch any other code.

---

### 1.5 Hardcoded 'levelsio' username verwijderen

**Review issue:** #20
**File:** `src/agents/x-scout.ts`, line 262

**Current code:**
```ts
const profilesToVisit = ['levelsio']; // TODO: dynamic selection
```

**Fix:**
```ts
const profilesToVisit: string[] = []; // TODO: dynamic selection from config/findings
```

---

### 1.6 cookieCounts eviction add

**Review issue:** #23
**File:** `src/security/guardian.ts`, `analyzeResponseHeaders` method (around line 560)

The `cookieCounts` Folder grows without bound. Add a max-size check.

**Fix:** After the `this.cookieCounts.set(...)` line, add eviction logic:

```ts
// Evict oldest entries when folder exceeds 1000 domains
if (this.cookieCounts.size > 1000) {
  const firstKey = this.cookieCounts.keys().next().value;
  if (firstKey) this.cookieCounts.delete(firstKey);
}
```

---

### 1.7 focusByIndex: usage listTabs() for correcte order

**Review issue:** #24
**File:** `src/tabs/manager.ts`, line 273

`focusByIndex` uses `Array.from(this.tabs.values())` which is insertion order, not the sorted order that `listTabs()` returns. Cmd+1-9 focuses the wrong tab when pinned tabs exist.

**Current code:**
```ts
async focusByIndex(index: number): Promise<boolean> {
  const tabs = Array.from(this.tabs.values());
```

**Fix:**
```ts
async focusByIndex(index: number): Promise<boolean> {
  const tabs = this.listTabs();
```

---

### 1.8 SSE token via header i.p.v. query parameter

**Review issue:** #9
**File:** `src/mcp/server.ts`, around line 730

The API token is sent as a URL query parameter, which leaks to logs and Referer headers.

**Current code:**
```ts
const url = `http://localhost:8765/events/stream${token ? `?token=${token}` : ''}`;

const connect = () => {
  fetch(url).then(async (response) => {
```

**Fix:**
```ts
const url = 'http://localhost:8765/events/stream';

const connect = () => {
  fetch(url, token ? { headers: { 'Authorization': `Bearer ${token}` } } : {}).then(async (response) => {
```

---

## Verification Checklist

After all fixes, verify:

- [ ] `npx tsc --noEmit` — 0 errors (gateway test file errors are pre-existing)
- [ ] App launches with `npm start`
- [ ] Browse to google.com — page loads
- [ ] Security status check: `curl -H "Authorization: Bearer $(cat ~/.tandem/api-token)" http://127.0.0.1:8765/security/status` returns JSON
- [ ] No `[DEBUG]` lines in the browser DevTools console during onboarding
- [ ] Cmd+1 focuses the first visible tab (not insertion-order first)

## Commit Message

```bash
git commit -m "$(cat <<'EOF'
fix(review): Phase 1 — triviale safe fixes

- Guardian backpressure: && → || (prevent unbounded queue)
- SecurityDB: close() called on app quit (WAL checkpoint)
- productName: "Google Chrome" → "Tandem Browser"
- Remove 17 [DEBUG] console.logs from onboarding
- Remove hardcoded 'levelsio' from X Scout
- Add cookieCounts eviction (max 1000 domains)
- focusByIndex: use listTabs() for correct pinned-tab order
- SSE token: send via Authorization header, not query param

Ref: docs/CODE-REVIEW-2026-02-26.md

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
git push origin main
```
