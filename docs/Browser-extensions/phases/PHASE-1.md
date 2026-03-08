# Phase 1: CRX Downloader + Extension Manager

> **Priority:** HIGH | **Effort:** ~1 day | **Dependencies:** None

## Goal
Build the core extension installation pipeline: download CRX files from Chrome Web Store, verify their integrity and signatures, extract them, and provide a central ExtensionManager that wraps the existing ExtensionLoader.

## Files to Read
- `src/extensions/loader.ts` — existing ExtensionLoader (understand `session.loadExtension()` and `listAvailable()`)
- `src/main.ts` — how ExtensionLoader is created (line ~281) and used (line ~343)
- `src/api/server.ts` — how ExtensionLoader is passed to the API server and used in routes

## Files to Create
- `src/extensions/crx-downloader.ts` — CRX download + verification + extraction
- `src/extensions/manager.ts` — central extension management

## Files to Modify
- `src/main.ts` — replace direct ExtensionLoader with ExtensionManager
- `src/api/server.ts` — accept ExtensionManager instead or ExtensionLoader
- `package.json` — add `adm-zip` dependency

## Tasks

### 1.1 Create CRX Downloader

Create `src/extensions/crx-downloader.ts` with the following:

**`CrxDownloader` class:**
- Constructor: ensures `~/.tandem/extensions/` directory exists
- `installFromCws(input: string): Promise<InstallResult>` — main entry point
- Private `extractCrx(crxBuffer: Buffer, extensionId: string): Promise<string>` — parse header, verify signature, extract ZIP
- Private `downloadFile(url: string): Promise<Buffer>` — HTTP GET with redirect following, returns Buffer
- Private `extractExtensionId(input: string): string | null` — parse CWS URL or bare ID
- Private `readManifest(extPath: string)` — read manifest.json
- Private `verifyCrx3Signature(crxBuffer: Buffer): CrxVerificationResult` — verify CRX3 digital signature

**`InstallResult` interface:**
```typescript
export interface InstallResult {
  success: boolean;
  extensionId: string;
  name: string;
  version: string;
  installPath: string;
  signatureVerified: boolean;  // true if CRX3 signature verified OK
  error?: string;
  warning?: string;  // e.g. "manifest.json missing 'key' field — extension ID may not match CWS ID"
}
```

**CRX header parsing:**
Chrome extensions are `.crx` files — ZIP archives with a header:
- Magic bytes: `Cr24` (4 bytes)
- CRX2: `[magic:4][version:4][pubkey_len:4][sig_len:4][pubkey][sig][zip]`
- CRX3: `[magic:4][version:4][header_size:4][header_bytes][zip]`

Strip the header → find ZIP start offset → extract with AdmZip.

### 1.2 CRX3 Format Validation (NOT full signature verification)

**Scope decision:** Full CRX3 RSA/ECDSA signature verification requires parsing protobuf
binary format (CrxFileHeader) without a library — this is error-prone and a source or
subtle bugs (off-by-one in varint decoding reads wrong bytes as public key). Full
cryptographic verification is deferred to a future phase.

**What this phase DOES verify:**

1. Magic bytes: first 4 bytes must be `Cr24` (0x43723234) — reject anything else
2. Version: bytes 5-8 must be 2 or 3 — reject unknown CRX versions
3. Download source: the HTTP request must have stayed on *.google.com or
   *.googleapis.com throughout all redirects — reject if any redirect left Google's
   domains (MITM indicator)
4. ZIP validity: AdmZip must be able to open the extracted payload without errors
5. manifest.json: must be valid JSON with `name`, `version`, and `key` fields

**`CrxVerificationResult` interface:**
```typescript
interface CrxVerificationResult {
  valid: boolean;
  format: 'crx2' | 'crx3';
  downloadedFromGoogle: boolean; // all redirects stayed on *.google.com / *.googleapis.com
  manifestValid: boolean;
  hasKeyField: boolean;
  error?: string;
}
```

Set `signatureVerified: false` on all InstallResults for now. Add a comment in code:
`// TODO: Full CRX3 RSA signature verification via protobuf — future phase`

**Failure behavior:** If any or the 5 checks fail → hard fail, do NOT install.
If `hasKeyField` is false → install but set `warning: "manifest.json missing key field
— extension ID may not match CWS ID, OAuth flows may break"`

### 1.3 CWS Download with Resilience

**CWS download URL:**
```
https://clients2.google.com/service/update2/crx?response=redirect&prodversion={CHROMIUM_VERSION}&x=id%3D{EXTENSION_ID}%26uc
```
No auth required. Follows redirects. Use `process.versions.chrome` for `prodversion` (dynamic Chromium version):

```typescript
const chromiumVersion = process.versions.chrome ?? '130.0.0.0';
```
Use the full version string (e.g. `130.0.6723.91`) — Google's CRX endpoint accepts this.

**Resilience measures (the CWS endpoint is undocumented and can change):**

1. **User-Agent spoofing:** Set the download request's `User-Agent` to match a real Chrome browser:
   ```typescript
   const headers = {
     'User-Agent': `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromiumVersion} Safari/537.36`,
     'Accept': 'application/x-chrome-extension',
   };
   ```
2. **Retry with backoff:** On failure (HTTP 5xx or network error), retry up to 3 times with exponential backoff (1s, 3s, 9s). Do NOT retry on 4xx (client error = wrong ID or endpoint changed).
3. **Response validation:** After download, verify the response starts with `Cr24` magic bytes. If the response is HTML (Google error page) or empty, fail with a descriptive error.
4. **Timeout:** 30-second timeout per download attempt. Extensions can be 50MB+ so this is generous.

**Extension ID format:** 32 lowercase a-p characters. Extract from CWS URLs via regex: `/\/([a-p]{32})(?:[/?]|$)/`

**Already-installed check:** If `~/.tandem/extensions/{id}/` already exists, return success immediately with manifest info.

### 1.4 Post-extraction Verification

After extracting the CRX:

1. **Manifest key field:** Verify that `manifest.json` contains a `key` field. If `key` is missing, set a `warning` field on the `InstallResult` — the extension may work but OAuth and some APIs will fail because Electron will assign a random ID instead or the deterministic CWS ID.
2. **ID matching:** After `session.loadExtension()`, compare the assigned Electron extension ID with the expected CWS extension ID. Log both IDs. If they don't match, log a warning.
3. **Content script inventory:** Read the `content_scripts` array from `manifest.json` and log which URL patterns the extension will inject into. This creates a paper trail for security auditing. Store this metadata in the `InstallResult`:
   ```typescript
   contentScriptPatterns?: string[];  // e.g. ["<all_urls>", "https://github.com/*"]
   ```

### 1.5 Add adm-zip dependency

```bash
npm install adm-zip @types/adm-zip
```

`adm-zip` is used to extract the ZIP payload from CRX files. It works with `Buffer` input (no temp file needed for the ZIP portion).

### 1.6 Create Extension Manager

Create `src/extensions/manager.ts`:

**`ExtensionManager` class:**
```typescript
export class ExtensionManager {
  private loader: ExtensionLoader;
  private downloader: CrxDownloader;

  constructor()
  async init(session: Session): Promise<void>  // calls loader.loadAllExtensions()
  async install(input: string, session: Session): Promise<InstallResult>  // download + verify + load
  list(): { loaded: LoadedExtension[], available: AvailableExtension[] }
  uninstall(extensionId: string, session: Session): boolean  // session.removeExtension() + rm -rf from disk
  getExtensionMetadata(extensionId: string): ExtensionMetadata | null  // manifest info, content scripts, permissions
}
```

- `install()`: calls `downloader.installFromCws()` (which includes signature verification), then `loader.loadExtension()` on success
- `uninstall()`: calls `session.removeExtension(id)` to unload immediately (no restart needed), then removes `~/.tandem/extensions/{id}/` directory recursively
- `list()`: returns both `loader.listLoaded()` and `loader.listAvailable()`
- `getExtensionMetadata()`: reads `manifest.json` for a given extension ID, returns parsed permissions, content scripts, API usage

### 1.7 Wire ExtensionManager into main.ts

Replace the direct `ExtensionLoader` usage:
- Import `ExtensionManager` instead or (or alongside) `ExtensionLoader`
- Create `ExtensionManager` where `ExtensionLoader` is currently created (~line 281)
- Call `extensionManager.init(session)` where `extensionLoader.loadAllExtensions()` is currently called (~line 343)
- Pass `extensionManager` to the API server

### 1.8 Wire ExtensionManager into api/server.ts

- Update the server options interface to accept `ExtensionManager`
- Update existing `/extensions/list` and `/extensions/load` routes to use ExtensionManager
- Keep backward compatibility — the routes should return the same format

## Verification

- [ ] `npx tsc --noEmit` — 0 errors
- [ ] `adm-zip` and `@types/adm-zip` in package.json
- [ ] CRX2 header parsing works (version field = 2)
- [ ] CRX3 header parsing works (version field = 3)
- [ ] Download stayed on `*.google.com` / `*.googleapis.com` — verified in logs
- [ ] Magic bytes Cr24 verified before extraction
- [ ] ZIP validity verified by AdmZip
- [ ] Non-CRX files rejected (wrong magic bytes)
- [ ] InstallResult.signatureVerified is false (documented placeholder)
- [ ] Extension ID extracted from bare ID: `cjpalhdlnbpafiamejdnhcphjbkeiagm`
- [ ] Extension ID extracted from CWS URL: `https://chromewebstore.google.com/detail/ublock-origin/cjpalhdlnbpafiamejdnhcphjbkeiagm`
- [ ] `prodversion` in CWS download URL uses `process.versions.chrome` (not hardcoded)
- [ ] CWS download uses spoofed Chrome User-Agent header
- [ ] Retry logic works: simulate a failure, verify 3 retries with backoff
- [ ] Downloaded extension appears in `~/.tandem/extensions/{id}/` with `manifest.json`
- [ ] Extracted `manifest.json` contains `key` field (log warning if missing)
- [ ] Content script patterns logged for installed extension
- [ ] Extension ID assigned by Electron matches the CWS extension ID (log both)
- [ ] ExtensionManager.init() loads existing extensions on startup
- [ ] ExtensionManager.install() downloads + verifies + extracts + loads a new extension
- [ ] ExtensionManager.uninstall() calls `session.removeExtension()` + removes files (no restart needed)
- [ ] Extension network requests are visible in RequestDispatcher logs (Guardian sees them)
- [ ] Test interaction with DNR-based extensions: install uBlock Origin, load a page with known trackers, verify Guardian's `onBeforeRequest` still fires. Document result in STATUS.md.
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
3. **Commit and push** — follow the commit format in CLAUDE.md "After You Finish" section
