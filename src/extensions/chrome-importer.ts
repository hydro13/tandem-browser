import path from 'path';
import fs from 'fs';
import os from 'os';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ChromeExtensionInfo {
  id: string;
  name: string;
  version: string;
  chromePath: string;
}

export interface ImportResult {
  id: string;
  name: string;
  success: boolean;
  skipped?: boolean;
  error?: string;
}

export interface BulkImportResult {
  imported: number;
  skipped: number;
  failed: number;
  details: ImportResult[];
}

interface TandemMeta {
  source: 'chrome-import';
  importedAt: string;
  cwsId: string;
  importedVersion: string;
}

// ─── Chrome Extension Importer ───────────────────────────────────────────────

/**
 * ChromeExtensionImporter — Detects Chrome's extension directory
 * and imports extensions into ~/.tandem/extensions/.
 *
 * Chrome stores extensions in:
 *   macOS:   ~/Library/Application Support/Google/Chrome/{Profile}/Extensions/
 *   Windows: %LOCALAPPDATA%\Google\Chrome\User Data\{Profile}\Extensions\
 *   Linux:   ~/.config/google-chrome/{Profile}/Extensions/
 *
 * Each extension folder contains version subfolders (e.g. "1.57.0_0").
 * We find the latest version and copy from there.
 */
export class ChromeExtensionImporter {
  private profile: string;
  private tandemExtensionsDir: string;

  constructor(profile: string = 'Default') {
    this.profile = profile;
    this.tandemExtensionsDir = path.join(os.homedir(), '.tandem', 'extensions');
  }

  /**
   * Get the Chrome extensions directory path for the current platform.
   * Returns null if Chrome is not installed.
   */
  getChromeExtensionsDir(): string | null {
    const platform = process.platform;
    let chromeDir: string;

    if (platform === 'darwin') {
      chromeDir = path.join(
        os.homedir(),
        'Library', 'Application Support', 'Google', 'Chrome',
        this.profile, 'Extensions'
      );
    } else if (platform === 'win32') {
      const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
      chromeDir = path.join(
        localAppData,
        'Google', 'Chrome', 'User Data',
        this.profile, 'Extensions'
      );
    } else {
      // Linux
      chromeDir = path.join(
        os.homedir(),
        '.config', 'google-chrome',
        this.profile, 'Extensions'
      );
    }

    if (!fs.existsSync(chromeDir)) {
      return null;
    }

    return chromeDir;
  }

  /**
   * List all Chrome extensions that can be imported.
   * Filters out internal Chrome extensions (names starting with __MSG_ or missing).
   */
  listChromeExtensions(): ChromeExtensionInfo[] {
    const chromeDir = this.getChromeExtensionsDir();
    if (!chromeDir) {
      return [];
    }

    const results: ChromeExtensionInfo[] = [];

    try {
      const extDirs = fs.readdirSync(chromeDir, { withFileTypes: true })
        .filter(d => d.isDirectory());

      for (const dir of extDirs) {
        // Extension IDs are 32 lowercase a-p characters
        if (!/^[a-p]{32}$/.test(dir.name)) {
          continue;
        }

        const extPath = path.join(chromeDir, dir.name);
        const versionDir = this.findLatestVersionDir(extPath);
        if (!versionDir) {
          continue;
        }

        const manifestPath = path.join(versionDir, 'manifest.json');
        if (!fs.existsSync(manifestPath)) {
          continue;
        }

        try {
          const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
          const name = manifest.name;

          // Filter out Chrome internal extensions
          if (!name || typeof name !== 'string' || name.startsWith('__MSG_')) {
            continue;
          }

          results.push({
            id: dir.name,
            name,
            version: manifest.version || '0.0.0',
            chromePath: versionDir,
          });
        } catch {
          // Skip extensions with unreadable manifests
          continue;
        }
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`⚠️ Could not read Chrome extensions directory: ${message}`);
    }

    return results;
  }

  /**
   * Import a single Chrome extension into ~/.tandem/extensions/.
   * Skips if already imported. Writes .tandem-meta.json with CWS ID.
   */
  importExtension(extensionId: string): ImportResult {
    // Validate extension ID format
    if (!/^[a-p]{32}$/.test(extensionId)) {
      return { id: extensionId, name: extensionId, success: false, error: 'Invalid extension ID format' };
    }

    // Find the extension in Chrome
    const extensions = this.listChromeExtensions();
    const ext = extensions.find(e => e.id === extensionId);
    if (!ext) {
      return { id: extensionId, name: extensionId, success: false, error: 'Extension not found in Chrome profile' };
    }

    return this.importExtensionFromInfo(ext);
  }

  /**
   * Import all Chrome extensions into ~/.tandem/extensions/.
   * Skips already-imported extensions.
   */
  importAll(): BulkImportResult {
    const extensions = this.listChromeExtensions();
    const result: BulkImportResult = {
      imported: 0,
      skipped: 0,
      failed: 0,
      details: [],
    };

    for (const ext of extensions) {
      const importResult = this.importExtensionFromInfo(ext);
      result.details.push(importResult);

      if (importResult.skipped) {
        result.skipped++;
      } else if (importResult.success) {
        result.imported++;
      } else {
        result.failed++;
      }
    }

    return result;
  }

  /**
   * Check if an extension is already imported in Tandem.
   */
  isAlreadyImported(extensionId: string): boolean {
    const destPath = path.join(this.tandemExtensionsDir, extensionId);
    return fs.existsSync(destPath) && fs.existsSync(path.join(destPath, 'manifest.json'));
  }

  // ─── Private helpers ─────────────────────────────────────────────────────

  /**
   * Import a single extension from its ChromeExtensionInfo.
   */
  private importExtensionFromInfo(ext: ChromeExtensionInfo): ImportResult {
    // Check if already imported
    if (this.isAlreadyImported(ext.id)) {
      return { id: ext.id, name: ext.name, success: true, skipped: true };
    }

    const destPath = path.join(this.tandemExtensionsDir, ext.id);

    try {
      // Ensure Tandem extensions directory exists
      if (!fs.existsSync(this.tandemExtensionsDir)) {
        fs.mkdirSync(this.tandemExtensionsDir, { recursive: true });
      }

      // Copy the Chrome extension version folder to Tandem
      fs.cpSync(ext.chromePath, destPath, { recursive: true });

      // Verify manifest.json exists after copy
      const manifestPath = path.join(destPath, 'manifest.json');
      if (!fs.existsSync(manifestPath)) {
        // Clean up failed copy
        fs.rmSync(destPath, { recursive: true, force: true });
        return { id: ext.id, name: ext.name, success: false, error: 'manifest.json missing after copy' };
      }

      // Check for key field in manifest
      try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
        if (!manifest.key) {
          console.warn(`⚠️ Chrome import: ${ext.name} (${ext.id}) manifest lacks "key" field — Electron may assign a different ID`);
        }
      } catch {
        // Non-fatal: manifest already verified during listing
      }

      // Write .tandem-meta.json with import metadata
      const meta: TandemMeta = {
        source: 'chrome-import',
        importedAt: new Date().toISOString(),
        cwsId: ext.id,
        importedVersion: ext.version,
      };
      fs.writeFileSync(
        path.join(destPath, '.tandem-meta.json'),
        JSON.stringify(meta, null, 2),
        'utf-8'
      );

      console.log(`🧩 Chrome import: ${ext.name} (${ext.id}) v${ext.version} → ${destPath}`);
      return { id: ext.id, name: ext.name, success: true };

    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      // Clean up partial copy on failure
      if (fs.existsSync(destPath)) {
        try { fs.rmSync(destPath, { recursive: true, force: true }); } catch { /* ignore cleanup errors */ }
      }
      return { id: ext.id, name: ext.name, success: false, error: message };
    }
  }

  /**
   * Find the latest version subdirectory in a Chrome extension folder.
   * Chrome stores versions as folders like "1.57.0_0", "1.58.1_0".
   * We sort them and return the last one.
   */
  private findLatestVersionDir(extPath: string): string | null {
    try {
      const dirs = fs.readdirSync(extPath, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => d.name)
        .sort();

      if (dirs.length === 0) return null;

      // Take the last (highest version) directory
      const latest = dirs[dirs.length - 1];
      return path.join(extPath, latest);
    } catch {
      return null;
    }
  }
}
