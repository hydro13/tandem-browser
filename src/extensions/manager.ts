import { Session } from 'electron';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { ExtensionLoader } from './loader';
import { CrxDownloader, InstallResult } from './crx-downloader';

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

  constructor() {
    this.loader = new ExtensionLoader();
    this.downloader = new CrxDownloader();
  }

  /**
   * Initialize: load all existing extensions from ~/.tandem/extensions/.
   * Called once at app startup.
   */
  async init(session: Session): Promise<void> {
    const loaded = await this.loader.loadAllExtensions(session);
    if (loaded.length > 0) {
      console.log(`🧩 ExtensionManager initialized with ${loaded.length} extension(s)`);
    }
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
}
