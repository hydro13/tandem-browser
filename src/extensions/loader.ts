import type { Session } from 'electron';
import path from 'path';
import fs from 'fs';
import { tandemDir, ensureDir } from '../utils/paths';
import { createLogger } from '../utils/logger';
import { assertChromeExtensionId, assertPathWithinRoot, resolvePathWithinRoot } from '../utils/security';

const log = createLogger('ExtensionLoader');

// ─── Types ──────────────────────────────────────────────────────────

interface LoadedExtension {
  id: string;
  name: string;
  version: string;
  path: string;
  loadedAt: number;
}

interface TandemExtensionMeta {
  runtimeId?: string;
  lastLoadedAt?: string;
  [key: string]: unknown;
}

// ─── Manager ────────────────────────────────────────────────────────

/**
 * ExtensionLoader — Loads unpacked Chrome extensions into the browser session.
 *
 * Extensions are stored in ~/.tandem/extensions/
 * Each subfolder is an unpacked extension with a manifest.json.
 *
 * Uses Electron's session.extensions.loadExtension() API.
 * Only supports manually-loaded local extensions — no extension store.
 */
export class ExtensionLoader {

  // === 1. Private state ===

  private extensionsDir: string;
  private loaded: LoadedExtension[] = [];

  // === 2. Constructor ===

  constructor() {
    this.extensionsDir = ensureDir(tandemDir('extensions'));
  }

  // === 4. Public methods ===

  /**
   * Load all extensions from ~/.tandem/extensions/ into the given session.
   */
  async loadAllExtensions(ses: Session): Promise<LoadedExtension[]> {
    const results: LoadedExtension[] = [];

    try {
      const dirs = fs.readdirSync(this.extensionsDir, { withFileTypes: true })
        .filter(d => d.isDirectory());

      for (const dir of dirs) {
        let extPath: string;
        try {
          extPath = resolvePathWithinRoot(this.extensionsDir, assertChromeExtensionId(dir.name));
        } catch {
          log.warn(`⚠️ Extension ${dir.name}: invalid directory name, skipping`);
          continue;
        }
        const manifestPath = resolvePathWithinRoot(extPath, 'manifest.json');

        if (!fs.existsSync(manifestPath)) {
          log.warn(`⚠️ Extension ${dir.name}: no manifest.json, skipping`);
          continue;
        }

        try {
          const result = await this.loadExtension(ses, extPath);
          if (result) results.push(result);
        } catch (err) {
          log.warn(`⚠️ Failed to load extension ${dir.name}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    } catch (err) {
      log.warn(`⚠️ Could not read extensions directory: ${err instanceof Error ? err.message : String(err)}`);
    }

    if (results.length > 0) {
      log.info(`🧩 Loaded ${results.length} extension(s): ${results.map(e => e.name).join(', ')}`);
    }

    return results;
  }

  /**
   * Load a single unpacked extension from the given path.
   */
  async loadExtension(ses: Session, extPath: string): Promise<LoadedExtension | null> {
    const safeExtPath = assertPathWithinRoot(this.extensionsDir, extPath);
    const manifestPath = resolvePathWithinRoot(safeExtPath, 'manifest.json');
    if (!fs.existsSync(manifestPath)) {
      throw new Error(`No manifest.json found at ${safeExtPath}`);
    }

    let manifest: { name?: string; version?: string };
    try {
      manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    } catch {
      throw new Error(`Invalid manifest.json at ${safeExtPath}`);
    }

    // Check if already loaded
    const existing = this.loaded.find(e => e.path === safeExtPath);
    if (existing) {
      return existing;
    }

    // Patch manifest CSP to allow connections to Tandem API (http+ws on port 8765).
    // This is required for the native messaging proxy polyfill (chrome.runtime.connectNative
    // / sendNativeMessage) to reach http://127.0.0.1:8765 from the extension service worker.
    try {
      const { nmProxy } = await import('./nm-proxy');
      nmProxy.patchManifestCSP(manifestPath);
    } catch {
      // Non-fatal — extension will still load, but native messaging proxy won't work
    }

    const ext = await ses.extensions.loadExtension(safeExtPath, { allowFileAccess: true });
    this.writeRuntimeMetadata(safeExtPath, ext.id);

    const loaded: LoadedExtension = {
      id: ext.id,
      name: manifest.name || path.basename(safeExtPath),
      version: manifest.version || '0.0.0',
      path: safeExtPath,
      loadedAt: Date.now(),
    };

    this.loaded.push(loaded);
    return loaded;
  }

  /** List all loaded extensions */
  listLoaded(): LoadedExtension[] {
    return [...this.loaded];
  }

  /** List available extensions in ~/.tandem/extensions/ (loaded or not) */
  listAvailable(): Array<{ name: string; path: string; hasManifest: boolean; loaded: boolean }> {
    const results: Array<{ name: string; path: string; hasManifest: boolean; loaded: boolean }> = [];

    try {
      const dirs = fs.readdirSync(this.extensionsDir, { withFileTypes: true })
        .filter(d => d.isDirectory());

      for (const dir of dirs) {
        let extPath: string;
        try {
          extPath = resolvePathWithinRoot(this.extensionsDir, assertChromeExtensionId(dir.name));
        } catch {
          continue;
        }
        const hasManifest = fs.existsSync(resolvePathWithinRoot(extPath, 'manifest.json'));
        const isLoaded = this.loaded.some(e => e.path === extPath);

        let name = dir.name;
        if (hasManifest) {
          try {
            const manifest = JSON.parse(fs.readFileSync(resolvePathWithinRoot(extPath, 'manifest.json'), 'utf-8'));
            name = manifest.name || dir.name;
          } catch (e) { log.warn('Extension manifest parse failed for', dir.name + ':', e instanceof Error ? e.message : String(e)); }
        }

        results.push({ name, path: extPath, hasManifest, loaded: isLoaded });
      }
    } catch (e) { log.warn('Extensions directory listing failed:', e instanceof Error ? e.message : String(e)); }

    return results;
  }

  // === 7. Private helpers ===

  private getMetaPath(extPath: string): string {
    return resolvePathWithinRoot(extPath, '.tandem-meta.json');
  }

  private writeRuntimeMetadata(extPath: string, runtimeId: string): void {
    const metaPath = this.getMetaPath(extPath);
    let meta: TandemExtensionMeta = {};

    if (fs.existsSync(metaPath)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          meta = parsed as TandemExtensionMeta;
        }
      } catch {
        meta = {};
      }
    }

    meta.runtimeId = runtimeId;
    meta.lastLoadedAt = new Date().toISOString();
    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf-8');
  }
}
