import { Session } from 'electron';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { ExtensionLoader } from './loader';
import { CrxDownloader, InstallResult } from './crx-downloader';
import { NativeMessagingSetup, NativeMessagingStatus } from './native-messaging';
import { IdentityPolyfill } from './identity-polyfill';
import { UpdateChecker, UpdateCheckResult, UpdateResult, UpdateState, InstalledExtension } from './update-checker';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ExtensionMetadata {
  id: string;
  name: string;
  version: string;
  manifestVersion: number;
  permissions: string[];
  contentScriptPatterns: string[];
  hasDeclarativeNetRequest: boolean;
  hasNativeMessaging: boolean;
  hasIdentity: boolean;
}

/**
 * ExtensionManager — Central extension management layer.
 *
 * Wraps ExtensionLoader (load/list) and CrxDownloader (download/verify/extract)
 * into a single interface for install, uninstall, and metadata access.
 */
export class ExtensionManager {
  private loader: ExtensionLoader;
  private downloader: CrxDownloader;
  private nativeMessaging: NativeMessagingSetup;
  private identityPolyfill: IdentityPolyfill;
  private updateChecker: UpdateChecker;

  constructor(apiPort: number = 8765) {
    this.loader = new ExtensionLoader();
    this.downloader = new CrxDownloader();
    this.nativeMessaging = new NativeMessagingSetup();
    this.identityPolyfill = new IdentityPolyfill(apiPort);
    this.updateChecker = new UpdateChecker(this.downloader, this.loader);
  }

  /**
   * Initialize: load all existing extensions from ~/.tandem/extensions/.
   * Called once at app startup.
   */
  async init(session: Session): Promise<void> {
    // Inject chrome.identity polyfill into extensions that need it (before loading)
    const patchedExtensions = this.identityPolyfill.injectPolyfills();
    if (patchedExtensions.length > 0) {
      console.log(`🔑 Identity polyfill injected into ${patchedExtensions.length} extension(s)`);
    }

    // Register chromiumapp.org protocol handler for OAuth redirects
    this.identityPolyfill.registerChromiumAppHandler(session);

    const loaded = await this.loader.loadAllExtensions(session);
    if (loaded.length > 0) {
      console.log(`🧩 ExtensionManager initialized with ${loaded.length} extension(s)`);
    }

    // Detect and configure native messaging hosts
    this.nativeMessaging.detectHosts();
    this.nativeMessaging.configure(session);

    // Clean up stale temp/old directories from previous update cycles
    this.updateChecker.cleanupTempDirs();

    // Start scheduled update checks (first check after 5 min, then every 24h)
    this.updateChecker.startScheduledChecks(session);
  }

  /**
   * Install an extension from Chrome Web Store.
   * Downloads CRX, verifies format, extracts, then loads into the session.
   *
   * @param input - CWS URL or bare extension ID (32 a-p chars)
   * @param session - Electron session to load the extension into
   */
  async install(input: string, session: Session): Promise<InstallResult> {
    // Download, verify, and extract
    const result = await this.downloader.installFromCws(input);

    if (!result.success) {
      return result;
    }

    // Load into session
    try {
      const loaded = await this.loader.loadExtension(session, result.installPath);
      if (loaded) {
        // ID matching: compare assigned Electron ID with expected CWS ID
        console.log(`🧩 Extension loaded — CWS ID: ${result.extensionId}, Electron ID: ${loaded.id}`);
        if (loaded.id !== result.extensionId) {
          console.warn(`⚠️ Extension ID mismatch! CWS: ${result.extensionId}, Electron: ${loaded.id}`);
          result.warning = (result.warning ? result.warning + '; ' : '') +
            `Extension ID mismatch: CWS=${result.extensionId}, Electron=${loaded.id}`;
        }
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        ...result,
        success: false,
        error: `Extension extracted but failed to load: ${message}`,
      };
    }

    return result;
  }

  /**
   * List all extensions — both loaded and available on disk.
   */
  list(): { loaded: ReturnType<ExtensionLoader['listLoaded']>; available: ReturnType<ExtensionLoader['listAvailable']> } {
    return {
      loaded: this.loader.listLoaded(),
      available: this.loader.listAvailable(),
    };
  }

  /**
   * Uninstall an extension.
   * Calls session.removeExtension() to unload immediately (no restart needed),
   * then removes files from disk.
   */
  uninstall(extensionId: string, session: Session): boolean {
    try {
      // Unload from session (no restart needed)
      session.removeExtension(extensionId);
      console.log(`🧩 Extension ${extensionId} removed from session`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`⚠️ Failed to remove extension ${extensionId} from session: ${message}`);
      // Continue to remove from disk even if session removal fails
    }

    // Remove from disk
    const extensionsDir = path.join(os.homedir(), '.tandem', 'extensions');
    const extPath = path.join(extensionsDir, extensionId);
    if (fs.existsSync(extPath)) {
      try {
        fs.rmSync(extPath, { recursive: true, force: true });
        console.log(`🧩 Extension ${extensionId} removed from disk: ${extPath}`);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.warn(`⚠️ Failed to remove extension files at ${extPath}: ${message}`);
        return false;
      }
    }

    return true;
  }

  /**
   * Get metadata for an installed extension by ID.
   * Reads manifest.json and extracts permissions, content scripts, API usage.
   */
  getExtensionMetadata(extensionId: string): ExtensionMetadata | null {
    const extensionsDir = path.join(os.homedir(), '.tandem', 'extensions');
    const manifestPath = path.join(extensionsDir, extensionId, 'manifest.json');

    if (!fs.existsSync(manifestPath)) {
      return null;
    }

    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

      // Extract permissions from both MV2 and MV3 formats
      const permissions: string[] = [
        ...(Array.isArray(manifest.permissions) ? manifest.permissions : []),
        ...(Array.isArray(manifest.optional_permissions) ? manifest.optional_permissions : []),
      ].filter((p): p is string => typeof p === 'string');

      // Extract content script patterns
      const contentScriptPatterns: string[] = [];
      if (Array.isArray(manifest.content_scripts)) {
        for (const cs of manifest.content_scripts) {
          if (cs && typeof cs === 'object' && Array.isArray(cs.matches)) {
            for (const pattern of cs.matches) {
              if (typeof pattern === 'string' && !contentScriptPatterns.includes(pattern)) {
                contentScriptPatterns.push(pattern);
              }
            }
          }
        }
      }

      return {
        id: extensionId,
        name: manifest.name || extensionId,
        version: manifest.version || '0.0.0',
        manifestVersion: manifest.manifest_version || 2,
        permissions,
        contentScriptPatterns,
        hasDeclarativeNetRequest: permissions.includes('declarativeNetRequest') ||
          permissions.includes('declarativeNetRequestWithHostAccess'),
        hasNativeMessaging: permissions.includes('nativeMessaging'),
        hasIdentity: permissions.includes('identity'),
      };
    } catch {
      return null;
    }
  }

  /** Expose the underlying loader for backward compatibility */
  getLoader(): ExtensionLoader {
    return this.loader;
  }

  /** Get native messaging status for API endpoint */
  getNativeMessagingStatus(): NativeMessagingStatus {
    return this.nativeMessaging.getStatus();
  }

  /** Check if a native messaging host is available for an extension */
  isNativeHostAvailable(extensionId: string): boolean {
    return this.nativeMessaging.isHostAvailable(extensionId);
  }

  /** Get identity polyfill for API endpoint registration */
  getIdentityPolyfill(): IdentityPolyfill {
    return this.identityPolyfill;
  }

  // ─── Update Methods (Phase 9) ──────────────────────────────────────────

  /** Get the update checker instance */
  getUpdateChecker(): UpdateChecker {
    return this.updateChecker;
  }

  /** Check all installed extensions for updates (batch protocol) */
  async checkForUpdates(): Promise<UpdateCheckResult[]> {
    const installed = this.updateChecker.getInstalledExtensions();
    return this.updateChecker.checkAll(installed);
  }

  /** Apply update for a single extension */
  async applyUpdate(extensionId: string, session: Session): Promise<UpdateResult> {
    return this.updateChecker.updateOne(extensionId, session);
  }

  /** Apply all available updates */
  async applyAllUpdates(session: Session): Promise<UpdateResult[]> {
    return this.updateChecker.updateAll(session);
  }

  /** Get current update state */
  getUpdateState(): UpdateState {
    return this.updateChecker.getState();
  }

  /** Get next scheduled check time */
  getNextScheduledCheck(): string | null {
    return this.updateChecker.getNextScheduledCheck();
  }

  /** Get installed extensions list (for update checking) */
  getInstalledExtensions(): InstalledExtension[] {
    return this.updateChecker.getInstalledExtensions();
  }

  /** Get disk usage for all extensions */
  getDiskUsage(): { totalBytes: number; extensions: Array<{ id: string; name: string; sizeBytes: number }> } {
    return this.updateChecker.getDiskUsage();
  }

  /** Stop update checker and clean up */
  destroyUpdateChecker(): void {
    this.updateChecker.destroy();
  }
}
