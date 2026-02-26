# Phase 2: XSS Fixes + Crash Handler

> **Risk:** Low | **Effort:** ~45 min | **Dependencies:** Phase 1

## Goal

Fix all XSS vulnerabilities in the browser shell (innerHTML without escaping) and add a global crash handler so the app doesn't die silently on uncaught exceptions.

## Important Context

- `escapeHtml()` is already defined in `shell/index.html` at approximately line 2568
- The shell runs with `sandbox: false`, so XSS in the shell gives access to the preload bridge
- The chat panel already uses `escapeHtml()` correctly for message text — follow that pattern

## Fixes

### 2.1 XSS in activity feed

**Review issue:** #3
**File:** `shell/index.html`, around lines 2432-2441

The `onActivityEvent` function builds `text` from page-controlled data (URL, selector, title) and puts it directly into `innerHTML`.

**Fix:** Wrap the dynamic parts with `escapeHtml()`:

Find the line that does:
```js
item.innerHTML = `<span class="a-icon">${icon}</span>...<span class="a-text">${text}</span>...`;
```

Change `${text}` to `${escapeHtml(text)}` in the innerHTML template. The `icon` is a hardcoded emoji, so it doesn't need escaping.

---

### 2.2 XSS in bookmark rendering

**Review issue:** #4
**File:** `shell/index.html`, around lines 4043 and 4120

Two places render bookmark/folder names without escaping:

1. Bookmark link: `a.innerHTML = \`<img ...> ${shortName}\`` — escape `shortName`
2. Folder element: `folder.innerHTML = \`...\`` with `item.name` — escape `item.name`

**Fix:** Use `escapeHtml()` on `shortName` and `item.name` in both innerHTML assignments.

---

### 2.3 XSS in bookmarks.html

**Review issue:** #4
**File:** `shell/bookmarks.html`, around line 326

Folder name rendered without escaping:
```js
el.innerHTML = `<span class="icon">&#x1F4C1;</span><span class="name">${item.name}</span>`;
```

**Fix:** `escapeHtml()` must be available in `bookmarks.html` too. Check if it's already defined there. If not, add the same `escapeHtml` function (copy from `index.html`). Then wrap `item.name` with `escapeHtml()`.

---

### 2.4 XSS in download/screenshot filenames

**Review issue:** #4
**File:** `shell/index.html`, around line 2526

Download filenames rendered without escaping:
```js
div.innerHTML = `<div class="ss-label">${data.filename}</div>`;
```

**Fix:** Use `escapeHtml(data.filename)`.

---

### 2.5 XSS in chat message sender name

**Review issue:** #10 (from security review)
**File:** `shell/index.html`, around line 2587

The `name` field in chat messages is not escaped while `text` is:
```js
el.innerHTML = `<div class="msg-from">${name}</div><div class="msg-text">${escapeHtml(text)}</div>...`;
```

Currently safe because `name` is hardcoded ('Robin', 'Claude', etc.), but inconsistent and a trap for future changes.

**Fix:** Use `escapeHtml(name)` for consistency.

---

### 2.6 Add uncaughtException handler

**Review issue:** #10
**File:** `src/main.ts`, at the top (after the EPIPE handlers on lines 2-3)

**Fix:** Add these two handlers right after the existing EPIPE handlers:

```ts
process.on('uncaughtException', (err) => {
  console.error('[FATAL] Uncaught exception:', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('[FATAL] Unhandled rejection:', reason);
});
```

Keep it simple — just log. Don't try to show a dialog or recover. The goal is to prevent silent crashes and leave a trace in the console.

---

## Verification Checklist

- [ ] `npx tsc --noEmit` — 0 errors
- [ ] `escapeHtml()` is used on all dynamic text in innerHTML across both `index.html` and `bookmarks.html`
- [ ] App launches, browse to a page with `<script>` in its title — no XSS
- [ ] Activity feed still shows events correctly (text is readable, not double-escaped)
- [ ] Bookmarks panel still renders correctly
- [ ] Chat messages still display correctly
- [ ] Intentionally throw an error in the console (e.g., add a temporary `throw new Error('test')` in a setTimeout) — verify `[FATAL]` appears in console instead of silent crash
- [ ] All Phase 1 fixes still work

## Commit Message

```bash
git commit -m "$(cat <<'EOF'
fix(review): Phase 2 — XSS fixes + crash handler

- Escape all dynamic text in innerHTML (activity feed, bookmarks, downloads, chat)
- Add escapeHtml() to bookmarks.html
- Add uncaughtException + unhandledRejection handlers to main.ts

Ref: docs/CODE-REVIEW-2026-02-26.md

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
git push origin main
```
