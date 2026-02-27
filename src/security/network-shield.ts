import path from 'path';
import fs from 'fs';
import { SecurityDB } from './security-db';
import { tandemDir } from '../utils/paths';
import { URL_LIST_SAFE_DOMAINS } from './types';

export class NetworkShield {
  private blockedDomains: Set<string> = new Set();
  private blockedIpOrigins: Set<string> = new Set();
  private db: SecurityDB;
  private blocklistDir: string;

  constructor(db: SecurityDB) {
    this.db = db;
    this.blocklistDir = tandemDir('security', 'blocklists');
    fs.mkdirSync(this.blocklistDir, { recursive: true });
    this.loadBlocklists();
  }

  private loadBlocklists(): void {
    let totalLoaded = 0;

    // 1. Load URLhaus (URL list — extract hostnames)
    const urlhausPath = path.join(this.blocklistDir, 'urlhaus.txt');
    if (fs.existsSync(urlhausPath)) {
      const count = this.parseUrlList(urlhausPath);
      totalLoaded += count;
      console.log(`[NetworkShield] URLhaus: ${count} domains loaded`);
    }

    // 2. Load PhishTank (plain domain list, one per line)
    const phishingPath = path.join(this.blocklistDir, 'phishing.txt');
    if (fs.existsSync(phishingPath)) {
      const count = this.parseDomainList(phishingPath);
      totalLoaded += count;
      console.log(`[NetworkShield] PhishTank: ${count} domains loaded`);
    }

    // 3. Load Steven Black hosts file (0.0.0.0 domain format)
    const hostsPath = path.join(this.blocklistDir, 'hosts.txt');
    if (fs.existsSync(hostsPath)) {
      const count = this.parseHostsFile(hostsPath);
      totalLoaded += count;
      console.log(`[NetworkShield] Steven Black: ${count} domains loaded`);
    }

    // 4. Load dynamic entries from DB blocklist table
    const dbStats = this.db.getBlocklistStats();
    if (dbStats.total > 0) {
      console.log(`[NetworkShield] DB blocklist: ${dbStats.total} entries (already checked via DB lookup)`);
    }

    if (totalLoaded === 0) {
      console.warn('[NetworkShield] No blocklist files found in', this.blocklistDir);
      console.warn('[NetworkShield] Download blocklists to enable threat detection');
    } else {
      console.log(`[NetworkShield] Total: ${this.blockedDomains.size} unique domains in memory`);
    }
  }

  private parseHostsFile(filePath: string): number {
    let count = 0;
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        // Format: 0.0.0.0 domain.com or 127.0.0.1 domain.com
        const parts = trimmed.split(/\s+/);
        if (parts.length >= 2 && (parts[0] === '0.0.0.0' || parts[0] === '127.0.0.1')) {
          const domain = parts[1].toLowerCase();
          if (domain && domain !== 'localhost' && domain.includes('.')) {
            this.blockedDomains.add(domain);
            count++;
          }
        }
      }
    } catch (err) {
      console.error('[NetworkShield] Error parsing hosts file:', err);
    }
    return count;
  }

  private parseDomainList(filePath: string): number {
    let count = 0;
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');
      for (const line of lines) {
        const trimmed = line.trim().toLowerCase();
        if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) continue;
        // Plain domain, one per line
        if (trimmed.includes('.') && !trimmed.includes(' ')) {
          this.blockedDomains.add(trimmed);
          count++;
        }
      }
    } catch (err) {
      console.error('[NetworkShield] Error parsing domain list:', err);
    }
    return count;
  }

  private parseUrlList(filePath: string): number {
    let count = 0;
    let skipped = 0;
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) continue;
        // Full URL — extract hostname
        try {
          const url = new URL(trimmed);
          const domain = url.hostname.toLowerCase();
          if (domain && domain.includes('.')) {
            // Skip hosting platforms — the threat is the specific URL, not the entire domain
            if (URL_LIST_SAFE_DOMAINS.has(domain)) {
              skipped++;
              continue;
            }
            // Also check if it's a subdomain of a safe domain
            const parts = domain.split('.');
            let isSafe = false;
            for (let i = 1; i < parts.length - 1; i++) {
              if (URL_LIST_SAFE_DOMAINS.has(parts.slice(i).join('.'))) {
                isSafe = true;
                break;
              }
            }
            if (isSafe) {
              skipped++;
              continue;
            }
            this.blockedDomains.add(domain);
            // Store host:port for IP-based entries (O(1) lookup in checkUrl)
            const isRawIP = /^(\d{1,3}\.){3}\d{1,3}$/.test(domain) || /^\[[\da-fA-F:]+\]$/.test(domain);
            if (isRawIP) {
              this.blockedIpOrigins.add(url.host.toLowerCase());
            }
            count++;
          }
        } catch {
          // Not a valid URL, skip
        }
      }
    } catch (err) {
      console.error('[NetworkShield] Error parsing URL list:', err);
    }
    if (skipped > 0) {
      console.log(`[NetworkShield] URLhaus: skipped ${skipped} entries from hosting platforms`);
    }
    return count;
  }

  checkDomain(domain: string): { blocked: boolean; reason?: string; source?: string } {
    const lower = domain.toLowerCase();

    // 1. Direct match in memory Set
    if (this.blockedDomains.has(lower)) {
      return { blocked: true, reason: 'Domain in blocklist', source: 'blocklist_file' };
    }

    // 2. Parent domain match (strip subdomains progressively)
    const parts = lower.split('.');
    for (let i = 1; i < parts.length - 1; i++) {
      const parent = parts.slice(i).join('.');
      if (this.blockedDomains.has(parent)) {
        return { blocked: true, reason: `Parent domain ${parent} in blocklist`, source: 'blocklist_file' };
      }
    }

    // 3. Check DB blocklist table (for dynamic entries from gatekeeper/manual)
    const dbResult = this.db.isDomainBlocked(lower);
    if (dbResult.blocked) {
      return { blocked: true, reason: 'Domain in DB blocklist', source: dbResult.source };
    }

    return { blocked: false };
  }

  checkUrl(url: string): { blocked: boolean; reason?: string; source?: string } {
    try {
      const parsed = new URL(url);
      const domain = parsed.hostname;

      // Check IP-based origin (host:port) — O(1) Set lookup
      const parsedHost = parsed.host.toLowerCase();
      if (this.blockedIpOrigins.has(parsedHost)) {
        return { blocked: true, reason: `IP origin in blocklist: ${parsedHost}`, source: 'blocklist_file' };
      }

      return this.checkDomain(domain);
    } catch {
      return { blocked: false };
    }
  }

  getStats(): { memoryEntries: number; dbEntries: number } {
    const dbStats = this.db.getBlocklistStats();
    return {
      memoryEntries: this.blockedDomains.size,
      dbEntries: dbStats.total,
    };
  }

  reload(): void {
    this.blockedDomains.clear();
    this.blockedIpOrigins.clear();
    this.loadBlocklists();
  }
}
