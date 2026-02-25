# Phase 1: CRX Downloader + Extension Manager

> **Priority:** HIGH | **Effort:** ~1 day | **Dependencies:** None

## Goal
Build the core extension installation pipeline: download CRX files from Chrome Web Store, extract them, and provide a central ExtensionManager that wraps the existing ExtensionLoader.

## Files to Read
- `src/extensions/loader.ts` — existing ExtensionLoader (understand `session.loadExtension()` and `listAvailable()`)
- `src/main.ts` — how ExtensionLoader is created (line ~281) and used (line ~343)
- `src/api/server.ts` — how ExtensionLoader is passed to the API server and used in routes

## Files to Create
- `src/extensions/crx-downloader.ts` — CRX download + extraction
- `src/extensions/manager.ts` — central extension management

## Files to Modify
- `src/main.ts` — replace direct ExtensionLoader with ExtensionManager
- `src/api/server.ts` — accept ExtensionManager instead of ExtensionLoader
- `package.json` — add `adm-zip` dependency

## Tasks

### 1.1 Create CRX Downloader

Create `src/extensions/crx-downloader.ts` with the following:

**`CrxDownloader` class:**
- Constructor: ensures `~/.tandem/extensions/` directory exists
- `installFromCws(input: string): Promise<InstallResult>` — main entry point
- Private `extractCrx(crxPath: string, extensionId: string): Promise<string>` — parse header, extract ZIP
- Private `downloadFile(url: string, dest: string): Promise<void>` — HTTP GET with redirect following
- Private `extractExtensionId(input: string): string | null` — parse CWS URL or bare ID
- Private `readManifest(extPath: string)` — read manifest.json

**`InstallResult` interface:**
```typescript
export interface InstallResult {
  success: boolean;
  extensionId: string;
  name: string;
  version: string;
  installPath: string;
  error?: string;
}
```

**CRX header parsing:**
Chrome extensions are `.crx` files — ZIP archives with a header:
- Magic bytes: `Cr24` (4 bytes)
- CRX2: `[magic:4][version:4][pubkey_len:4][sig_len:4][pubkey][sig][zip]`
- CRX3: `[magic:4][version:4][header_size:4][header_bytes][zip]`

Strip the header → find ZIP start offset → extract with AdmZip.

**CWS download URL:**
```
https://clients2.google.com/service/update2/crx?response=redirect&prodversion=130.0.0.0&x=id%3D{EXTENSION_ID}%26uc
```
No auth required. Follows redirects. Use `prodversion=130.0.0.0` to match Tandem's Chromium version.

**Extension ID format:** 32 lowercase a-p characters. Extract from CWS URLs via regex: `/\/([a-p]{32})(?:[/?]|$)/`

**Already-installed check:** If `~/.tandem/extensions/{id}/` already exists, return success immediately with manifest info.

### 1.2 Add adm-zip dependency

```bash
npm install adm-zip @types/adm-zip
```

`adm-zip` is used to extract the ZIP payload from CRX files. It works with `Buffer` input (no temp file needed for the ZIP portion).

### 1.3 Create Extension Manager

Create `src/extensions/manager.ts`:

**`ExtensionManager` class:**
```typescript
export class ExtensionManager {
  private loader: ExtensionLoader;
  private downloader: CrxDownloader;

  constructor()
  async init(session: Session): Promise<void>  // calls loader.loadAllExtensions()
  async install(input: string, session: Session): Promise<InstallResult>  // download + load
  list(): { loaded: LoadedExtension[], available: AvailableExtension[] }
  uninstall(extensionId: string): boolean  // rm -rf from disk
}
```

- `install()`: calls `downloader.installFromCws()`, then `loader.loadExtension()` on success
- `uninstall()`: removes `~/.tandem/extensions/{id}/` directory recursively
- `list()`: returns both `loader.listLoaded()` and `loader.listAvailable()`

### 1.4 Wire ExtensionManager into main.ts

Replace the direct `ExtensionLoader` usage:
- Import `ExtensionManager` instead of (or alongside) `ExtensionLoader`
- Create `ExtensionManager` where `ExtensionLoader` is currently created (~line 281)
- Call `extensionManager.init(session)` where `extensionLoader.loadAllExtensions()` is currently called (~line 343)
- Pass `extensionManager` to the API server

### 1.5 Wire ExtensionManager into api/server.ts

- Update the server options interface to accept `ExtensionManager`
- Update existing `/extensions/list` and `/extensions/load` routes to use ExtensionManager
- Keep backward compatibility — the routes should return the same format

## Verification
- [ ] `npx tsc --noEmit` — 0 errors
- [ ] `adm-zip` and `@types/adm-zip` in package.json
- [ ] CRX2 header parsing works (version field = 2)
- [ ] CRX3 header parsing works (version field = 3)
- [ ] Non-CRX files rejected (wrong magic bytes)
- [ ] Extension ID extracted from bare ID: `cjpalhdlnbpafiamejdnhcphjbkeiagm`
- [ ] Extension ID extracted from CWS URL: `https://chromewebstore.google.com/detail/ublock-origin/cjpalhdlnbpafiamejdnhcphjbkeiagm`
- [ ] Downloaded extension appears in `~/.tandem/extensions/{id}/` with `manifest.json`
- [ ] ExtensionManager.init() loads existing extensions on startup
- [ ] ExtensionManager.install() downloads + extracts + loads a new extension
- [ ] App launches with `npm start`, existing extensions still load
- [ ] `GET /extensions/list` still works

## Scope
- ONLY create `crx-downloader.ts` and `manager.ts`, modify `main.ts` and `api/server.ts`
- Do NOT create API routes for install/uninstall — that's Phase 2
- Do NOT add Chrome import — that's Phase 3
- Do NOT add gallery — that's Phase 4
- The `install()` method exists on ExtensionManager but is not yet exposed via API

## After Completion
1. Update `docs/Browser-extensions/STATUS.md`
2. Update `docs/Browser-extensions/ROADMAP.md` — check off completed tasks
