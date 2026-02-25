# Phase 2: Extension API Routes

> **Priority:** HIGH | **Effort:** ~half day | **Dependencies:** Phase 1

## Goal
Expose the extension install/uninstall/list functionality via REST API endpoints. After this phase, any HTTP client (or the AI agent) can manage extensions programmatically.

## Files to Read
- `src/extensions/manager.ts` — ExtensionManager from Phase 1
- `src/extensions/crx-downloader.ts` — InstallResult type
- `src/api/server.ts` — existing route pattern and ExtensionManager integration

## Files to Modify
- `src/api/server.ts` — add new routes

## Tasks

### 2.1 Add `POST /extensions/install` endpoint

```typescript
// POST /extensions/install
// Body: { input: string }  — CWS URL or extension ID
// Returns: InstallResult
```

- Parse `input` from request body
- Validate: must be non-empty string
- Call `extensionManager.install(input, session)`
- Return the `InstallResult` object
- On error: return `{ success: false, error: "message" }` with appropriate HTTP status

### 2.2 Add `DELETE /extensions/uninstall/:id` endpoint

```typescript
// DELETE /extensions/uninstall/:id
// Returns: { success: boolean, error?: string }
```

- Extract `:id` from URL params
- Validate: must be a valid extension ID format (32 chars a-p)
- Call `extensionManager.uninstall(id)`
- Return success/failure

**Note:** Uninstalling removes from disk but does NOT unload from the current session (Electron limitation — `session.removeExtension()` doesn't exist in all versions). Document that a restart may be needed.

### 2.3 Update `GET /extensions/list` endpoint

Enhance the existing endpoint to return richer data:

```typescript
// GET /extensions/list
// Returns: {
//   loaded: Array<{ id, name, version, path, loadedAt }>,
//   available: Array<{ name, path, hasManifest, loaded }>,
//   count: { loaded: number, available: number }
// }
```

Merge the loaded and available lists from `extensionManager.list()`.

### 2.4 Add error handling

All extension endpoints should:
- Return proper HTTP status codes (400 for bad input, 500 for server errors)
- Include descriptive error messages
- Not crash the server on unexpected input
- Log errors to console for debugging

## Verification
- [ ] `npx tsc --noEmit` — 0 errors
- [ ] `POST /extensions/install` with valid extension ID returns success + extension info
- [ ] `POST /extensions/install` with CWS URL returns success + extension info
- [ ] `POST /extensions/install` with invalid input returns 400 error
- [ ] `POST /extensions/install` with already-installed ID returns success (idempotent)
- [ ] `DELETE /extensions/uninstall/:id` removes extension directory
- [ ] `DELETE /extensions/uninstall/:id` with non-existent ID returns error
- [ ] `GET /extensions/list` returns loaded and available arrays
- [ ] App launches, browsing works

## Scope
- ONLY add/modify routes in `api/server.ts`
- Do NOT add Chrome import routes — that's Phase 3
- Do NOT add gallery route — that's Phase 4
- Do NOT modify ExtensionManager — it should be complete from Phase 1

## After Completion
1. Update `docs/Browser-extensions/STATUS.md`
2. Update `docs/Browser-extensions/ROADMAP.md` — check off completed tasks
