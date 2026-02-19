import https from 'https';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { SecurityDB } from '../security-db';
import { NetworkShield } from '../network-shield';
import { UpdateResult } from '../types';

// Major hosting platforms — skip domain-level blocks for these
// (same list as NetworkShield URL_LIST_SAFE_DOMAINS — Phase 1 fix for false positives)
const URL_LIST_SAFE_DOMAINS = new Set([
  'github.com', 'raw.githubusercontent.com', 'githubusercontent.com',
  'dropbox.com', 'dl.dropboxusercontent.com',
  'drive.google.com', 'docs.google.com', 'storage.googleapis.com',
  'onedrive.live.com', '1drv.ms',
  'cdn.discordapp.com', 'discord.com', 'media.discordapp.net',
  'bitbucket.org', 'gitlab.com',
  'amazonaws.com', 's3.amazonaws.com',
  'blob.core.windows.net', 'azurewebsites.net',
  'pastebin.com', 'transfer.sh', 'anonfiles.com',
  'mediafire.com', 'mega.nz', 'mega.co.nz',
  'archive.org', 'web.archive.org',
]);

/** Download timeout in milliseconds */
const DOWNLOAD_TIMEOUT = 60_000;

/** Blocklist source definitions */
const BLOCKLIST_SOURCES = [
  {
    name: 'urlhaus',
    url: 'https://urlhaus.abuse.ch/downloads/text_online/',
    parser: 'url_list' as const,
    category: 'malware',
  },
  {
    name: 'phishing',
    url: 'https://raw.githubusercontent.com/mitchellkrogza/Phishing.Database/master/phishing-domains-ACTIVE.txt',
    parser: 'domain_list' as const,
    category: 'phishing',
  },
  {
    name: 'stevenblack',
    url: 'https://raw.githubusercontent.com/StevenBlack/hosts/master/hosts',
    parser: 'hosts_file' as const,
    category: 'tracker',
  },
];

/**
 * BlocklistUpdater — Automated blocklist download and refresh.
 *
 * Downloads blocklists from 3 sources (URLhaus, PhishTank, Steven Black),
 * parses them using the same formats as NetworkShield, syncs to DB,
 * and triggers NetworkShield.reload() to refresh in-memory Set.
 *
 * Data is stored in ~/.tandem/security/blocklists/ (NOT in src/).
 */
export class BlocklistUpdater {
  private db: SecurityDB;
  private shield: NetworkShield;
  private dataDir: string;

  constructor(db: SecurityDB, shield: NetworkShield) {
    this.db = db;
    this.shield = shield;
    this.dataDir = path.join(os.homedir(), '.tandem', 'security', 'blocklists');
    fs.mkdirSync(this.dataDir, { recursive: true });
  }

  /**
   * Update all blocklist sources: download, parse, sync to DB, reload shield.
   */
  async update(): Promise<UpdateResult> {
    const results: UpdateResult = { sources: [], totalAdded: 0, totalRemoved: 0, errors: [] };

    for (const source of BLOCKLIST_SOURCES) {
      try {
        console.log(`[BlocklistUpdater] Downloading ${source.name} from ${source.url}...`);
        const content = await this.download(source.url);
        const filePath = path.join(this.dataDir, `${source.name}.txt`);
        fs.writeFileSync(filePath, content);

        let domains: string[];
        switch (source.parser) {
          case 'hosts_file':
            domains = this.parseHostsFile(content);
            break;
          case 'domain_list':
            domains = this.parseDomainList(content);
            break;
          case 'url_list':
            domains = this.parseURLList(content);
            break;
        }

        const added = this.db.syncBlocklistSource(source.name, domains, source.category);
        results.sources.push({ name: source.name, domains: domains.length, added });
        results.totalAdded += added;
        console.log(`[BlocklistUpdater] ${source.name}: ${domains.length} domains parsed, ${added} synced to DB`);
      } catch (err: any) {
        const errMsg = err instanceof Error ? err.message : String(err);
        results.errors.push(`${source.name}: ${errMsg}`);
        console.error(`[BlocklistUpdater] Failed to update ${source.name}:`, errMsg);
      }
    }

    // Reload in-memory blocklist
    this.shield.reload();
    console.log(`[BlocklistUpdater] NetworkShield reloaded. Total added: ${results.totalAdded}, errors: ${results.errors.length}`);

    return results;
  }

  /**
   * Simple HTTPS GET with timeout. Follows redirects (up to 3).
   */
  private download(url: string, redirects = 0): Promise<string> {
    if (redirects > 3) {
      return Promise.reject(new Error('Too many redirects'));
    }

    return new Promise((resolve, reject) => {
      const req = https.get(url, { timeout: DOWNLOAD_TIMEOUT }, (res) => {
        // Follow redirects
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          resolve(this.download(res.headers.location, redirects + 1));
          return;
        }

        if (res.statusCode && res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }

        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
        res.on('error', reject);
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Download timeout'));
      });
      req.on('error', reject);
    });
  }

  /**
   * Parse hosts file format: "0.0.0.0 domain.com" or "127.0.0.1 domain.com"
   * Skip comments (#) and localhost entries.
   */
  private parseHostsFile(content: string): string[] {
    const domains: string[] = [];
    const lines = content.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const parts = trimmed.split(/\s+/);
      if (parts.length >= 2 && (parts[0] === '0.0.0.0' || parts[0] === '127.0.0.1')) {
        const domain = parts[1].toLowerCase();
        if (domain && domain !== 'localhost' && domain.includes('.')) {
          domains.push(domain);
        }
      }
    }
    return domains;
  }

  /**
   * Parse plain domain list: one domain per line, skip empty lines and comments.
   */
  private parseDomainList(content: string): string[] {
    const domains: string[] = [];
    const lines = content.split('\n');
    for (const line of lines) {
      const trimmed = line.trim().toLowerCase();
      if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) continue;
      if (trimmed.includes('.') && !trimmed.includes(' ')) {
        domains.push(trimmed);
      }
    }
    return domains;
  }

  /**
   * Parse URL list: full URLs — extract hostname.
   * Respects URL_LIST_SAFE_DOMAINS to avoid false positives on hosting platforms.
   */
  private parseURLList(content: string): string[] {
    const domains: string[] = [];
    const seen = new Set<string>();
    const lines = content.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) continue;
      try {
        const url = new URL(trimmed);
        const domain = url.hostname.toLowerCase();
        if (!domain || !domain.includes('.') || seen.has(domain)) continue;

        // Skip hosting platforms
        if (URL_LIST_SAFE_DOMAINS.has(domain)) continue;

        // Also check subdomains of safe domains
        const parts = domain.split('.');
        let isSafe = false;
        for (let i = 1; i < parts.length - 1; i++) {
          if (URL_LIST_SAFE_DOMAINS.has(parts.slice(i).join('.'))) {
            isSafe = true;
            break;
          }
        }
        if (isSafe) continue;

        seen.add(domain);
        domains.push(domain);
      } catch {
        // Not a valid URL, skip
      }
    }
    return domains;
  }
}
