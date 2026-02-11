import path from 'path';
import fs from 'fs';
import os from 'os';
import { ConfigManager } from '../config/manager';

/**
 * ChromeImporter — Import and sync bookmarks, history, and cookies from Google Chrome.
 *
 * Chrome data paths (macOS):
 *   ~/Library/Application Support/Google/Chrome/{Profile}/Bookmarks (JSON)
 *   ~/Library/Application Support/Google/Chrome/{Profile}/History (SQLite)
 *   ~/Library/Application Support/Google/Chrome/{Profile}/Cookies (SQLite)
 *
 * Sync mode: watches Chrome's Bookmarks file for changes and auto-imports.
 * Supports multiple Chrome profiles (Default, Profile 1, Profile 2, etc.)
 */

export interface ChromeBookmark {
  id: string;
  name: string;
  url?: string;
  type: 'folder' | 'url';
  children?: ChromeBookmark[];
  dateAdded?: number;
}

export interface ChromeHistoryEntry {
  url: string;
  title: string;
  visitCount: number;
  lastVisitTime: string;
}

export interface ChromeImportStatus {
  chromeFound: boolean;
  bookmarksFound: boolean;
  historyFound: boolean;
  cookiesFound: boolean;
  profilePath: string;
}

export class ChromeImporter {
  private chromeBasePath: string;
  private chromeProfilePath: string;
  private tandemDir: string;
  private watcher: fs.FSWatcher | null = null;
  private syncDebounce: ReturnType<typeof setTimeout> | null = null;
  private configManager: ConfigManager | null = null;
  private lastSyncHash: string = '';

  constructor(configManager?: ConfigManager) {
    this.configManager = configManager ?? null;
    this.chromeBasePath = path.join(
      os.homedir(),
      'Library',
      'Application Support',
      'Google',
      'Chrome'
    );
    const profile = this.configManager?.getConfig().sync.chromeProfile ?? 'Default';
    this.chromeProfilePath = path.join(this.chromeBasePath, profile);
    this.tandemDir = path.join(os.homedir(), '.tandem');
    if (!fs.existsSync(this.tandemDir)) {
      fs.mkdirSync(this.tandemDir, { recursive: true });
    }
  }

  /** List available Chrome profiles */
  listProfiles(): { name: string; path: string; hasBookmarks: boolean }[] {
    const results: { name: string; path: string; hasBookmarks: boolean }[] = [];
    if (!fs.existsSync(this.chromeBasePath)) return results;

    try {
      const entries = fs.readdirSync(this.chromeBasePath, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        // Chrome profiles are 'Default', 'Profile 1', 'Profile 2', etc.
        if (entry.name === 'Default' || entry.name.startsWith('Profile ')) {
          const profilePath = path.join(this.chromeBasePath, entry.name);
          const hasBookmarks = fs.existsSync(path.join(profilePath, 'Bookmarks'));

          // Try to read profile name from Preferences
          let displayName = entry.name;
          try {
            const prefs = JSON.parse(fs.readFileSync(path.join(profilePath, 'Preferences'), 'utf-8'));
            if (prefs.profile?.name) displayName = `${prefs.profile.name} (${entry.name})`;
          } catch { /* use folder name */ }

          results.push({ name: displayName, path: entry.name, hasBookmarks });
        }
      }
    } catch (e: any) {
      console.warn('Could not list Chrome profiles:', e.message);
    }

    return results;
  }

  /** Switch to a different Chrome profile */
  setProfile(profileDir: string): void {
    this.chromeProfilePath = path.join(this.chromeBasePath, profileDir);
    // Restart sync if active
    if (this.watcher) {
      this.stopSync();
      this.startSync();
    }
  }

  /** Start watching Chrome Bookmarks file for changes */
  startSync(): boolean {
    if (this.watcher) return true; // Already watching

    const bookmarksPath = path.join(this.chromeProfilePath, 'Bookmarks');
    if (!fs.existsSync(bookmarksPath)) {
      console.warn('📚 Chrome Bookmarks not found at:', bookmarksPath);
      return false;
    }

    // Do initial import
    const initial = this.importBookmarks();
    if (initial.ok) {
      console.log(`📚 Chrome bookmark sync started — ${initial.count} bookmarks imported from ${path.basename(this.chromeProfilePath)}`);
      // Store hash to detect real changes
      try {
        this.lastSyncHash = fs.readFileSync(bookmarksPath, 'utf-8').length.toString();
      } catch { /* ignore */ }
    }

    // Watch for changes
    try {
      this.watcher = fs.watch(bookmarksPath, (eventType) => {
        if (eventType !== 'change') return;

        // Debounce — Chrome writes the file multiple times per save
        if (this.syncDebounce) clearTimeout(this.syncDebounce);
        this.syncDebounce = setTimeout(() => {
          try {
            // Check if file actually changed (Chrome touches it often)
            const content = fs.readFileSync(bookmarksPath, 'utf-8');
            const hash = content.length.toString();
            if (hash === this.lastSyncHash) return;
            this.lastSyncHash = hash;

            const result = this.importBookmarks();
            if (result.ok) {
              console.log(`📚 Chrome bookmarks synced — ${result.count} bookmarks`);
            }
          } catch (e: any) {
            console.warn('📚 Chrome bookmark sync failed:', e.message);
          }
        }, 2000); // 2 second debounce
      });

      return true;
    } catch (e: any) {
      console.warn('📚 Could not start Chrome bookmark sync:', e.message);
      return false;
    }
  }

  /** Stop watching */
  stopSync(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
    if (this.syncDebounce) {
      clearTimeout(this.syncDebounce);
      this.syncDebounce = null;
    }
    console.log('📚 Chrome bookmark sync stopped');
  }

  /** Is sync currently active? */
  isSyncing(): boolean {
    return this.watcher !== null;
  }

  /** Cleanup */
  destroy(): void {
    this.stopSync();
  }

  /** Check what Chrome data is available */
  getStatus(): ChromeImportStatus {
    return {
      chromeFound: fs.existsSync(this.chromeProfilePath),
      bookmarksFound: fs.existsSync(path.join(this.chromeProfilePath, 'Bookmarks')),
      historyFound: fs.existsSync(path.join(this.chromeProfilePath, 'History')),
      cookiesFound: fs.existsSync(path.join(this.chromeProfilePath, 'Cookies')),
      profilePath: this.chromeProfilePath,
    };
  }

  /** Import Chrome bookmarks → ~/.tandem/bookmarks.json */
  importBookmarks(): { ok: boolean; count: number; error?: string } {
    try {
      const bookmarksPath = path.join(this.chromeProfilePath, 'Bookmarks');
      if (!fs.existsSync(bookmarksPath)) {
        return { ok: false, count: 0, error: 'Chrome Bookmarks file not found' };
      }

      const raw = JSON.parse(fs.readFileSync(bookmarksPath, 'utf-8'));
      const roots = raw.roots || {};
      const bookmarks: ChromeBookmark[] = [];

      // Parse bookmark_bar, other, synced
      for (const key of ['bookmark_bar', 'other', 'synced']) {
        if (roots[key]) {
          const parsed = this.parseBookmarkNode(roots[key]);
          if (parsed) bookmarks.push(parsed);
        }
      }

      // Count total bookmarks
      let count = 0;
      const countBookmarks = (nodes: ChromeBookmark[]) => {
        for (const node of nodes) {
          if (node.type === 'url') count++;
          if (node.children) countBookmarks(node.children);
        }
      };
      countBookmarks(bookmarks);

      // Load existing bookmarks.json and merge
      const outputPath = path.join(this.tandemDir, 'bookmarks.json');
      let existing: { bookmarks: ChromeBookmark[]; importedFrom?: string } = { bookmarks: [] };
      if (fs.existsSync(outputPath)) {
        try {
          existing = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));
        } catch { /* overwrite */ }
      }

      existing.bookmarks = bookmarks;
      existing.importedFrom = 'chrome';
      fs.writeFileSync(outputPath, JSON.stringify(existing, null, 2));

      return { ok: true, count };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false, count: 0, error: msg };
    }
  }

  /** Parse a Chrome bookmark node recursively */
  private parseBookmarkNode(node: Record<string, unknown>): ChromeBookmark | null {
    if (!node || !node.name) return null;

    const type = node.type === 'folder' ? 'folder' : 'url';
    const bookmark: ChromeBookmark = {
      id: String(node.id || ''),
      name: String(node.name || ''),
      type,
      dateAdded: node.date_added ? Number(node.date_added) : undefined,
    };

    if (type === 'url' && node.url) {
      bookmark.url = String(node.url);
    }

    if (node.children && Array.isArray(node.children)) {
      bookmark.children = [];
      for (const child of node.children) {
        const parsed = this.parseBookmarkNode(child as Record<string, unknown>);
        if (parsed) bookmark.children.push(parsed);
      }
    }

    return bookmark;
  }

  /** Import Chrome history → ~/.tandem/history.json (last 1000 entries) */
  importHistory(): { ok: boolean; count: number; error?: string } {
    try {
      const historyPath = path.join(this.chromeProfilePath, 'History');
      if (!fs.existsSync(historyPath)) {
        return { ok: false, count: 0, error: 'Chrome History file not found' };
      }

      // Chrome locks the History file while running — copy it first
      const tmpPath = path.join(this.tandemDir, '.chrome-history-tmp');
      fs.copyFileSync(historyPath, tmpPath);

      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const Database = require('better-sqlite3');
      const db = new Database(tmpPath, { readonly: true });

      const rows = db.prepare(`
        SELECT url, title, visit_count, last_visit_time
        FROM urls
        ORDER BY last_visit_time DESC
        LIMIT 1000
      `).all() as Array<{ url: string; title: string; visit_count: number; last_visit_time: number }>;

      db.close();

      // Clean up tmp file
      try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }

      // Convert Chrome timestamp (microseconds since 1601-01-01) to ISO string
      const entries: ChromeHistoryEntry[] = rows.map(row => ({
        url: row.url,
        title: row.title || '',
        visitCount: row.visit_count,
        lastVisitTime: this.chromeTimeToISO(row.last_visit_time),
      }));

      // Save
      const outputPath = path.join(this.tandemDir, 'history.json');
      let existing: { entries: ChromeHistoryEntry[]; importedFrom?: string } = { entries: [] };
      if (fs.existsSync(outputPath)) {
        try {
          existing = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));
        } catch { /* overwrite */ }
      }

      // Merge: imported entries go at the end, deduped by url
      const seenUrls = new Set(existing.entries.map(e => e.url));
      for (const entry of entries) {
        if (!seenUrls.has(entry.url)) {
          existing.entries.push(entry);
          seenUrls.add(entry.url);
        }
      }

      // Cap at 10000
      if (existing.entries.length > 10000) {
        existing.entries = existing.entries.slice(-10000);
      }

      existing.importedFrom = 'chrome';
      fs.writeFileSync(outputPath, JSON.stringify(existing, null, 2));

      return { ok: true, count: entries.length };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false, count: 0, error: msg };
    }
  }

  /** Import Chrome cookies into Electron session */
  async importCookies(electronSession: Electron.Session): Promise<{ ok: boolean; count: number; error?: string }> {
    try {
      const cookiesPath = path.join(this.chromeProfilePath, 'Cookies');
      if (!fs.existsSync(cookiesPath)) {
        return { ok: false, count: 0, error: 'Chrome Cookies file not found' };
      }

      // Copy to avoid lock
      const tmpPath = path.join(this.tandemDir, '.chrome-cookies-tmp');
      fs.copyFileSync(cookiesPath, tmpPath);

      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const Database = require('better-sqlite3');
      const db = new Database(tmpPath, { readonly: true });

      // Chrome encrypts cookie values on macOS with Keychain
      // We can only import unencrypted metadata — the encrypted_value column is useless without decryption
      // Try to read what we can
      let rows: Array<{
        host_key: string;
        name: string;
        path: string;
        expires_utc: number;
        is_secure: number;
        is_httponly: number;
        samesite: number;
      }>;

      try {
        rows = db.prepare(`
          SELECT host_key, name, path, expires_utc, is_secure, is_httponly, samesite
          FROM cookies
          LIMIT 5000
        `).all() as typeof rows;
      } catch {
        db.close();
        try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
        return { ok: false, count: 0, error: 'Chrome cookies are encrypted (macOS Keychain). Cannot import cookie values.' };
      }

      db.close();
      try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }

      // Note: Without decrypted values, we can't actually set the cookies
      // Log a warning and return the count of cookies found
      console.warn('⚠️ Chrome cookies are encrypted on macOS. Cookie values cannot be imported without Keychain access.');
      console.warn(`   Found ${rows.length} cookies (metadata only).`);

      return {
        ok: false,
        count: rows.length,
        error: 'Chrome encrypts cookies on macOS with Keychain. Cookie values cannot be imported. Metadata found for ' + rows.length + ' cookies.',
      };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false, count: 0, error: msg };
    }
  }

  /** Convert Chrome timestamp (microseconds since 1601-01-01) to ISO string */
  private chromeTimeToISO(chromeTime: number): string {
    if (!chromeTime) return new Date(0).toISOString();
    // Chrome epoch: 1601-01-01 00:00:00 UTC
    // Unix epoch: 1970-01-01 00:00:00 UTC
    // Difference: 11644473600 seconds = 11644473600000000 microseconds
    const unixMicroseconds = chromeTime - 11644473600000000;
    const unixMilliseconds = Math.floor(unixMicroseconds / 1000);
    return new Date(unixMilliseconds).toISOString();
  }
}
