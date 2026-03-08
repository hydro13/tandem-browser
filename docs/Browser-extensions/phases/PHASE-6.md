# Phase 6: Native Messaging Support

> **Priority:** LOW | **Effort:** ~half day | **Dependencies:** Phase 1

## Goal
Enable extensions that rely on native messaging (communication with desktop apps) by configuring Electron's `session.setNativeMessagingHostDirectory()`. This unlocks 1Password, LastPass, and Postman Interceptor.

## Background

Some Chrome extensions communicate with a local desktop application via Chrome's "native messaging" API. The extension sends JSON messages to a native binary specified in a manifest file. Electron supports this via `session.setNativeMessagingHostDirectory()`.

**How it works:**
1. Desktop app installs a native messaging host manifest in a known directory
2. The manifest points to a native binary and lists allowed extension IDs
3. The browser reads the manifest and sets up a stdio pipe to the binary
4. Extensions use `chrome.runtime.connectNative()` or `chrome.runtime.sendNativeMessage()` to communicate

## Files to Read
- `src/extensions/loader.ts` — understand how sessions are used
- `src/extensions/manager.ts` — ExtensionManager from Phase 1
- Electron docs: `session.setNativeMessagingHostDirectory()`

## Files to Create
- `src/extensions/native-messaging.ts` — native messaging host detection + setup

## Files to Modify
- `src/extensions/manager.ts` — integrate native messaging setup in `init()`

## Tasks

### 6.1 Create native messaging host detection

Create `src/extensions/native-messaging.ts`:

**Platform-specific native messaging host directories:**

```
macOS:
  System:  /Library/Google/Chrome/NativeMessagingHosts/
  User:    ~/Library/Application Support/Google/Chrome/NativeMessagingHosts/

Windows:
  Hosts are registered in the Windows Registry:
  HKCU\Software\Google\Chrome\NativeMessagingHosts\{host-name}
  The registry value points to the manifest JSON file path.

Linux:
  System:  /etc/opt/chrome/native-messaging-hosts/
  User:    ~/.config/google-chrome/NativeMessagingHosts/
```

**Known native messaging hosts to detect:**

| Extension | Host Name | Binary |
|-----------|-----------|--------|
| 1Password | `com.1password.1password` | 1Password 8 desktop app |
| LastPass | `com.lastpass.nplastpass` | LastPass binary component |
| Postman Interceptor | `com.postman.postmanagent` | Postman desktop agent |

**Detection logic:**
1. Check if the native messaging host directory exists for the current platform
2. List `.json` manifest files in the directory
3. For each manifest: read it, verify the native binary path exists
4. Return list or available hosts

**`NativeMessagingSetup` class:**
```typescript
export class NativeMessagingSetup {
  detectHosts(): NativeMessagingHost[]
  configure(session: Session): { configured: string[], missing: string[] }
}

interface NativeMessagingHost {
  name: string;        // e.g. "com.1password.1password"
  description: string;
  binaryPath: string;
  allowedExtensions: string[];
  manifestPath: string;
}
```

### 6.2 Configure `session.setNativeMessagingHostDirectory()`

In `NativeMessagingSetup.configure()`:

```typescript
configure(session: Session) {
  const hostDirs = this.getNativeMessagingDirs();
  for (const dir or hostDirs) {
    if (fs.existsSync(dir)) {
      session.setNativeMessagingHostDirectory(dir);
    }
  }
  return { configured, missing };
}
```

Call this during `ExtensionManager.init()` after loading extensions.

**Important:** `setNativeMessagingHostDirectory()` may need to be called for EACH directory that contains hosts (user + system directories).

### 6.3 Graceful degradation

When a native messaging host is not found:
- Extension loads but shows "desktop app not found" or similar error
- No crash, no unhandled exception
- Log a warning: `"⚠️ Extension {name} requires {host} native app which is not installed"`
- Optionally: expose via `GET /extensions/native-messaging/status` endpoint for the UI to show setup instructions

## Verification
- [ ] `npx tsc --noEmit` — 0 errors
- [ ] `detectHosts()` finds native messaging manifests (if any desktop apps are installed)
- [ ] `configure()` calls `session.setNativeMessagingHostDirectory()` for valid directories
- [ ] 1Password extension connects to desktop app (if 1Password 8 is installed on test machine)
- [ ] LastPass extension works (if LastPass binary component is installed)
- [ ] Missing native hosts logged as warnings (not errors)
- [ ] Extensions that don't need native messaging are completely unaffected
- [ ] App launches, browsing works

## Scope
- ONLY create `native-messaging.ts` and integrate in `manager.ts`
- Do NOT modify extension loading logic
- Do NOT add workarounds for missing native hosts (that's outside our control)
- Do NOT support Brave, Edge, or other Chromium browsers' native messaging paths

## After Completion
1. Update `docs/Browser-extensions/STATUS.md`
2. Update `docs/Browser-extensions/ROADMAP.md` — check off completed tasks
3. **Commit and push** — follow the commit format in CLAUDE.md "After You Finish" section
