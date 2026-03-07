import path from 'path';
import fs from 'fs';
import type { SecurityDB } from './security-db';
import { tandemDir } from '../utils/paths';
import { BLOCKLIST_SOURCES, parseBlocklistFile } from './blocklists/updater';
import { createLogger } from '../utils/logger';

const log = createLogger('NetworkShield');

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

    for (const source of BLOCKLIST_SOURCES) {
      const filePath = path.join(this.blocklistDir, source.cacheFileName);
      if (!fs.existsSync(filePath)) {
        continue;
      }

      try {
        const parsed = parseBlocklistFile(source, filePath);
        for (const domain of parsed.domains) {
          this.blockedDomains.add(domain);
        }
        for (const origin of parsed.blockedIpOrigins) {
          this.blockedIpOrigins.add(origin);
        }
        totalLoaded += parsed.domains.length;
        log.info(`${source.name}: ${parsed.domains.length} domains loaded`);
        if (parsed.skipped > 0) {
          log.info(`${source.name}: skipped ${parsed.skipped} entries from hosting platforms`);
        }
      } catch (err) {
        log.error(`Error parsing ${source.name}:`, err);
      }
    }

    const dbStats = this.db.getBlocklistStats();
    if (dbStats.total > 0) {
      log.info(`DB blocklist: ${dbStats.total} entries (already checked via DB lookup)`);
    }

    if (totalLoaded === 0) {
      log.warn('No blocklist files found in', this.blocklistDir);
      log.warn('Download blocklists to enable threat detection');
    } else {
      log.info(`Total: ${this.blockedDomains.size} unique domains in memory`);
    }
  }

  checkDomain(domain: string): { blocked: boolean; reason?: string; source?: string } {
    const lower = domain.toLowerCase();

    if (this.blockedDomains.has(lower)) {
      return { blocked: true, reason: 'Domain in blocklist', source: 'blocklist_file' };
    }

    const parts = lower.split('.');
    for (let i = 1; i < parts.length - 1; i++) {
      const parent = parts.slice(i).join('.');
      if (this.blockedDomains.has(parent)) {
        return { blocked: true, reason: `Parent domain ${parent} in blocklist`, source: 'blocklist_file' };
      }
    }

    const dbResult = this.db.isDomainBlocked(lower);
    if (dbResult.blocked) {
      return { blocked: true, reason: 'Domain in DB blocklist', source: dbResult.source };
    }

    return { blocked: false };
  }

  checkUrl(url: string): { blocked: boolean; reason?: string; source?: string } {
    try {
      const parsed = new URL(url);
      const parsedHost = parsed.host.toLowerCase();
      if (this.blockedIpOrigins.has(parsedHost)) {
        return { blocked: true, reason: `IP origin in blocklist: ${parsedHost}`, source: 'blocklist_file' };
      }

      return this.checkDomain(parsed.hostname);
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
