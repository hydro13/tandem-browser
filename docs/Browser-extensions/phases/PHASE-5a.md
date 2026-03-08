# Phase 5a: Settings Panel UI — Extensions

> **Priority:** MEDIUM | **Effort:** ~1 day | **Dependencies:** Phase 2, 3, 4

## Goal
Add an "Extensions" section to Tandem's settings panel with three tabs: Installed, From Chrome, and Gallery. Users can manage, import, and discover extensions without using the API directly.

## Files to Read
- `src/api/server.ts` — all extension API endpoints (from Phase 1-4)
- Tandem's existing settings/panel UI files — understand the UI pattern and framework used
- `src/extensions/gallery.ts` — GalleryExtension type and categories

## Files to Modify
- Settings panel HTML/JS/CSS files (identify by reading the existing settings panel code)

## Tasks

### 5a.1 Add "Extensions" section to settings panel

- Add a new tab/section "Extensions" in the settings panel navigation
- Tab navigation within Extensions: **Installed** | **From Chrome** | **Gallery**
- Match the existing settings panel design and layout conventions

### 5a.2 Implement "Installed" tab

Shows all extensions currently in `~/.tandem/extensions/`.

**Data source:** `GET /extensions/list`

**Per extension card:**
- Extension name + version
- Extension ID (small, muted)
- Status indicator:
  - Loaded (active in session)
  - Not loaded (on disk but not active — needs restart)
  - Error (manifest missing or load failed)
- "Remove" button → calls `DELETE /extensions/uninstall/:id`
- Conflict warnings (if any) — from `GET /extensions/list` conflicts array (Phase 10a)

### 5a.3 Implement "From Chrome" tab

Shows extensions available to import from the user's Chrome installation.

**Data source:** `GET /extensions/chrome/list`

**Layout:**
- Message at top: "Import extensions from your Chrome browser"
- "Import All" button at top → calls `POST /extensions/chrome/import` with `{ all: true }`
- Per extension row: name, version, Import button
- Already-imported extensions show "Imported" badge instead or Import button
- Empty state: "Chrome not found" or "No extensions found in Chrome"

### 5a.4 Implement "Gallery" tab

Curated gallery or recommended extensions.

**Data source:** `GET /extensions/gallery`

**Layout:**
- Category filter row (badges/pills): All | Privacy | Password | Productivity | Appearance | Developer | Media | Web3
- Extension cards in grid or list:
  - Name + description
  - Category badge
  - Compatibility badge: "Works" (green), "Partial" (yellow), "Needs Setup" (orange)
  - Security conflict badge if applicable: "DNR Overlap" (amber), "Native Messaging" (blue)
  - "Install" button → calls `POST /extensions/install` with `{ input: extension.id }`
  - Already-installed extensions show "Installed" badge instead or Install button
- Featured extensions highlighted or shown first

### 5a.5 Wire up install/uninstall actions

- Install button: show loading spinner during download + extraction
- Success: update card to show "Installed" badge, refresh Installed tab
- Error: show error message inline on the card
- Remove button: confirm dialog → remove → refresh list
- All actions are non-blocking (async fetch calls)

## Verification
- [ ] `npx tsc --noEmit` — 0 errors
- [ ] "Extensions" section appears in settings panel
- [ ] Tab navigation works: Installed / From Chrome / Gallery
- [ ] Installed tab shows loaded extensions with correct status
- [ ] From Chrome tab lists Chrome extensions (or shows empty state)
- [ ] Gallery tab shows curated extensions with category filters
- [ ] Install button downloads and installs an extension
- [ ] Remove button uninstalls an extension
- [ ] Loading states shown during install
- [ ] Error states shown on failure
- [ ] App launches, browsing works

## Scope
- ONLY modify settings panel UI files
- Do NOT change API endpoints — use them as-is from Phase 1-4
- Do NOT add new functionality — this is purely UI
- Do NOT build the extension toolbar — that's Phase 5b
- Match existing design patterns — don't introduce new CSS frameworks or patterns

## After Completion
1. Update `docs/Browser-extensions/STATUS.md`
2. Update `docs/Browser-extensions/ROADMAP.md` — check off completed tasks
3. **Commit and push** — follow the commit format in CLAUDE.md "After You Finish" section
