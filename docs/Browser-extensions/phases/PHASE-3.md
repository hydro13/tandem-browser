# Phase 3: Chrome Profile Importer

> **Priority:** MEDIUM | **Effort:** ~half day | **Dependencies:** Phase 1

## Goal
Allow users to import their existing Chrome extensions into Tandem with zero effort. Detect Chrome's extension directory, list what's installed, and copy extensions into `~/.tandem/extensions/`.

## Files to Read
- `src/extensions/loader.ts` — understand how extensions are loaded from `~/.tandem/extensions/`
- `src/extensions/manager.ts` — ExtensionManager from Phase 1
- `src/api/server.ts` — existing route pattern

## Files to Create
- `src/extensions/chrome-importer.ts` — Chrome profile detection + import

## Files to Modify
- `src/api/server.ts` — add Chrome import routes
- `src/extensions/manager.ts` — optionally add `importFromChrome()` convenience method

## Tasks

### 3.1 Create Chrome Profile Importer

Create `src/extensions/chrome-importer.ts`:

**`ChromeExtensionImporter` class:**

```typescript
constructor(profile?: string)  // default: 'Default'
listChromeExtensions(): ChromeExtensionInfo[]
importExtension(extensionId: string): ImportResult
importAll(): BulkImportResult
```

**Chrome extensions path per platform:**
```
macOS:   ~/Library/Application Support/Google/Chrome/{Profile}/Extensions/
Windows: %LOCALAPPDATA%\Google\Chrome\User Data\{Profile}\Extensions\
Linux:   ~/.config/google-chrome/{Profile}/Extensions/
```

**Chrome extension directory structure:**
```
Extensions/
  {extension-id}/           ← 32-char ID
    {version}_0/            ← version folder (take the latest)
      manifest.json
      background.js
      ...
```

**Listing logic:**
1. Read all subdirectories in the Chrome Extensions folder
2. For each: find the latest version subfolder (sort versions, take last)
3. Read `manifest.json` from the version folder
4. Filter out Chrome internal extensions (name starts with `__MSG_` or name is missing)
5. Return list with id, name, version, chromePath

**Import logic:**
1. Find the extension in the Chrome listing
2. Copy the version folder contents to `~/.tandem/extensions/{id}/`
3. Skip if already exists in Tandem's extensions dir
4. Use `fs.cpSync()` for recursive copy (available in Node 16.7+)

**ChromeExtensionInfo interface:**
```typescript
interface ChromeExtensionInfo {
  id: string;
  name: string;
  version: string;
  chromePath: string;
}
```

### 3.2 Add `GET /extensions/chrome/list` endpoint

```typescript
// GET /extensions/chrome/list
// Query: ?profile=Default (optional, defaults to 'Default')
// Returns: {
//   chromeDir: string,
//   extensions: Array<{
//     id: string,
//     name: string,
//     version: string,
//     alreadyImported: boolean
//   }>
// }
```

Check `alreadyImported` by looking for `~/.tandem/extensions/{id}/`.

### 3.3 Add `POST /extensions/chrome/import` endpoint

```typescript
// POST /extensions/chrome/import
// Body: { extensionId: string } or { all: true }
// Optional: { profile: string }
// Returns: {
//   imported: number,
//   skipped: number,
//   failed: number,
//   details: Array<{ id, name, success }>
// }
```

After import, optionally load the newly imported extensions into the session (call `extensionManager.init(session)` or load individually).

## Verification
- [ ] `npx tsc --noEmit` — 0 errors
- [ ] Chrome extensions directory detected correctly on macOS
- [ ] `listChromeExtensions()` returns Chrome extensions with correct names and IDs
- [ ] Chrome internal extensions (`__MSG_` names) are filtered out
- [ ] `importExtension()` copies extension to `~/.tandem/extensions/{id}/`
- [ ] Imported extension has valid `manifest.json`
- [ ] `importAll()` imports all Chrome extensions, skips already-imported
- [ ] `GET /extensions/chrome/list` returns extensions with `alreadyImported` flag
- [ ] `POST /extensions/chrome/import` with `{ extensionId: "..." }` imports one extension
- [ ] `POST /extensions/chrome/import` with `{ all: true }` imports all
- [ ] Graceful handling when Chrome is not installed (empty list, no crash)
- [ ] App launches, browsing works

## Scope
- ONLY create `chrome-importer.ts` and add routes to `api/server.ts`
- Do NOT load imported extensions into the session automatically — user may want to restart
- Do NOT modify the existing ExtensionLoader behavior
- Do NOT handle Edge, Brave, or other Chromium browsers — Chrome only for now

## After Completion
1. Update `docs/Browser-extensions/STATUS.md`
2. Update `docs/Browser-extensions/ROADMAP.md` — check off completed tasks
