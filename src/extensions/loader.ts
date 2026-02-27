import { Session } from 'electron';
import path from 'path';
import fs from 'fs';
import { tandemDir, ensureDir } from '../utils/paths';

interface LoadedExtension {
  id: string;
  name: string;
  version: string;
  path: string;
  loadedAt: number;
}

/**
 * ExtensionLoader — Loads unpacked Chrome extensions into the browser session.
 * 
 * Extensions are stored in ~/.tandem/extensions/
 * Each subfolder is an unpacked extension with a manifest.json.
 * 
 * Uses Electron's session.loadExtension() API.
 * Only supports manually-loaded local extensions — no extension store.
 */
export class ExtensionLoader {
  private extensionsDir: string;
  private loaded: LoadedExtension[] = [];

  constructor() {
    this.extensionsDir = ensureDir(tandemDir('extensions'));
  }

  /**
   * Load all extensions from ~/.tandem/extensions/ into the given session.
   */
  async loadAllExtensions(ses: Session): Promise<LoadedExtension[]> {
    const results: LoadedExtension[] = [];

    try {
      const dirs = fs.readdirSync(this.extensionsDir, { withFileTypes: true })
        .filter(d => d.isDirectory());

      for (const dir of dirs) {
        const extPath = path.join(this.extensionsDir, dir.name);
        const manifestPath = path.join(extPath, 'manifest.json');

        if (!fs.existsSync(manifestPath)) {
          console.warn(`⚠️ Extension ${dir.name}: no manifest.json, skipping`);
          continue;
        }

        try {
          const result = await this.loadExtension(ses, extPath);
          if (result) results.push(result);
        } catch (err) {
          console.warn(`⚠️ Failed to load extension ${dir.name}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    } catch (err) {
      console.warn(`⚠️ Could not read extensions directory: ${err instanceof Error ? err.message : String(err)}`);
    }

    if (results.length > 0) {
      console.log(`🧩 Loaded ${results.length} extension(s): ${results.map(e => e.name).join(', ')}`);
    }

    return results;
  }

  /**
   * Load a single unpacked extension from the given path.
   */
  async loadExtension(ses: Session, extPath: string): Promise<LoadedExtension | null> {
    const manifestPath = path.join(extPath, 'manifest.json');
    if (!fs.existsSync(manifestPath)) {
      throw new Error(`No manifest.json found at ${extPath}`);
    }

    let manifest: { name?: string; version?: string };
    try {
      manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    } catch {
      throw new Error(`Invalid manifest.json at ${extPath}`);
    }

    // Check if already loaded
    const existing = this.loaded.find(e => e.path === extPath);
    if (existing) {
      return existing;
    }

    const ext = await ses.loadExtension(extPath, { allowFileAccess: true });

    const loaded: LoadedExtension = {
      id: ext.id,
      name: manifest.name || path.basename(extPath),
      version: manifest.version || '0.0.0',
      path: extPath,
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
        const extPath = path.join(this.extensionsDir, dir.name);
        const hasManifest = fs.existsSync(path.join(extPath, 'manifest.json'));
        const isLoaded = this.loaded.some(e => e.path === extPath);

        let name = dir.name;
        if (hasManifest) {
          try {
            const manifest = JSON.parse(fs.readFileSync(path.join(extPath, 'manifest.json'), 'utf-8'));
            name = manifest.name || dir.name;
          } catch (e) { console.warn('Extension manifest parse failed for', dir.name + ':', e instanceof Error ? e.message : String(e)); }
        }

        results.push({ name, path: extPath, hasManifest, loaded: isLoaded });
      }
    } catch (e) { console.warn('Extensions directory listing failed:', e instanceof Error ? e.message : String(e)); }

    return results;
  }
}
