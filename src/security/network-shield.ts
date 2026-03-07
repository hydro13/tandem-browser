import path from 'path';
import fs from 'fs';
import type { SecurityDB } from './security-db';
import { tandemDir } from '../utils/paths';
import { BLOCKLIST_SOURCES, parseBlocklistFile } from './blocklists/updater';
import { createLogger } from '../utils/logger';

const log = createLogger('NetworkShield');
const SNAPSHOT_FILE_NAME = 'startup-snapshot.json';
const SNAPSHOT_VERSION = 1;

interface BlocklistSnapshot {
  version: number;
  generatedAt: string;
  sources: string[];
  blockedDomains: string[];
  blockedIpOrigins: string[];
}

interface HydratedBlocklists {
  generatedAt: string;
  sources: string[];
  blockedDomains: Set<string>;
  blockedIpOrigins: Set<string>;
  skippedEntries: number;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string');
}

function isBlocklistSnapshot(value: unknown): value is BlocklistSnapshot {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const snapshot = value as Partial<BlocklistSnapshot>;
  return snapshot.version === SNAPSHOT_VERSION
    && typeof snapshot.generatedAt === 'string'
    && isStringArray(snapshot.sources)
    && isStringArray(snapshot.blockedDomains)
    && isStringArray(snapshot.blockedIpOrigins);
}

function waitForNextTurn(): Promise<void> {
  return new Promise(resolve => setImmediate(resolve));
}

export class NetworkShield {
  private blockedDomains: Set<string> = new Set();
  private blockedIpOrigins: Set<string> = new Set();
  private readonly db: SecurityDB;
  private readonly blocklistDir: string;
  private readonly snapshotPath: string;
  private hydrationPromise: Promise<void> | null = null;
  private hydrationQueued: boolean = false;

  constructor(db: SecurityDB) {
    this.db = db;
    this.blocklistDir = tandemDir('security', 'blocklists');
    fs.mkdirSync(this.blocklistDir, { recursive: true });
    this.snapshotPath = path.join(this.blocklistDir, SNAPSHOT_FILE_NAME);
    this.loadStartupSnapshot();
    this.logDbBlocklistStats();
  }

  /**
   * Start a cached blocklist hydrate off the critical startup path.
   */
  startBackgroundHydration(): void {
    void this.hydrateBlocklists('startup');
  }

  private loadStartupSnapshot(): void {
    if (!fs.existsSync(this.snapshotPath)) {
      log.info('No blocklist snapshot found; relying on DB blocklist until hydration completes');
      return;
    }

    try {
      const raw = fs.readFileSync(this.snapshotPath, 'utf-8');
      const parsed = JSON.parse(raw) as unknown;
      if (!isBlocklistSnapshot(parsed)) {
        throw new Error('Invalid blocklist snapshot format');
      }

      this.replaceActiveSets(new Set(parsed.blockedDomains), new Set(parsed.blockedIpOrigins));
      log.info(
        `Loaded blocklist snapshot: ${parsed.blockedDomains.length} domains, `
        + `${parsed.blockedIpOrigins.length} IP origins from ${parsed.sources.length} sources`,
      );
    } catch (err) {
      log.warn('Failed to load blocklist snapshot:', err instanceof Error ? err.message : String(err));
    }
  }

  private logDbBlocklistStats(): void {
    const dbStats = this.db.getBlocklistStats();
    if (dbStats.total > 0) {
      log.info(`DB blocklist: ${dbStats.total} entries (already checked via DB lookup)`);
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
    void this.hydrateBlocklists('reload');
  }

  private async hydrateBlocklists(reason: string): Promise<void> {
    if (this.hydrationPromise) {
      this.hydrationQueued = true;
      log.info(`Blocklist hydrate already running; queued ${reason}`);
      await this.hydrationPromise;
      return;
    }

    this.hydrationPromise = this.runHydration(reason);

    try {
      await this.hydrationPromise;
    } finally {
      this.hydrationPromise = null;

      if (this.hydrationQueued) {
        this.hydrationQueued = false;
        await this.hydrateBlocklists(`${reason}:queued`);
      }
    }
  }

  private async runHydration(reason: string): Promise<void> {
    const hydrated = await this.buildHydratedBlocklists();
    if (!hydrated) {
      return;
    }

    this.replaceActiveSets(hydrated.blockedDomains, hydrated.blockedIpOrigins);
    this.db.setBlocklistMeta('snapshotGeneratedAt', hydrated.generatedAt);
    this.db.setBlocklistMeta('snapshotSourceCount', String(hydrated.sources.length));
    this.db.setBlocklistMeta('snapshotDomainCount', String(hydrated.blockedDomains.size));
    this.db.setBlocklistMeta('snapshotIpOriginCount', String(hydrated.blockedIpOrigins.size));

    try {
      await this.writeSnapshot(hydrated);
    } catch (err) {
      log.warn('Failed to persist blocklist snapshot:', err instanceof Error ? err.message : String(err));
    }

    log.info(
      `Blocklist hydrate (${reason}) complete: ${hydrated.blockedDomains.size} domains, `
      + `${hydrated.blockedIpOrigins.size} IP origins across ${hydrated.sources.length} sources`,
    );
    if (hydrated.skippedEntries > 0) {
      log.info(`Blocklist hydrate (${reason}) skipped ${hydrated.skippedEntries} safe-host entries`);
    }
  }

  private async buildHydratedBlocklists(): Promise<HydratedBlocklists | null> {
    const nextBlockedDomains = new Set<string>();
    const nextBlockedIpOrigins = new Set<string>();
    const loadedSources: string[] = [];
    let skippedEntries = 0;

    for (const source of BLOCKLIST_SOURCES) {
      const filePath = path.join(this.blocklistDir, source.cacheFileName);
      if (!fs.existsSync(filePath)) {
        continue;
      }

      // Yield between sources so startup and navigation can stay responsive while hydration progresses.
      await waitForNextTurn();

      try {
        const parsed = parseBlocklistFile(source, filePath);
        for (const domain of parsed.domains) {
          nextBlockedDomains.add(domain);
        }
        for (const origin of parsed.blockedIpOrigins) {
          nextBlockedIpOrigins.add(origin);
        }
        loadedSources.push(source.name);
        skippedEntries += parsed.skipped;
        log.info(`${source.name}: ${parsed.domains.length} domains hydrated`);
      } catch (err) {
        log.error(`Error hydrating ${source.name}:`, err);
      }
    }

    if (loadedSources.length === 0) {
      if (this.blockedDomains.size === 0 && this.blockedIpOrigins.size === 0) {
        log.warn('No blocklist files found in', this.blocklistDir);
        log.warn('Download blocklists to enable threat detection');
      } else {
        log.warn('No cached blocklist files found during hydration; keeping active snapshot');
      }
      return null;
    }

    if (nextBlockedDomains.size === 0 && nextBlockedIpOrigins.size === 0) {
      log.warn('Hydration produced an empty blocklist snapshot; keeping active blocklist state');
      return null;
    }

    return {
      generatedAt: new Date().toISOString(),
      sources: loadedSources,
      blockedDomains: nextBlockedDomains,
      blockedIpOrigins: nextBlockedIpOrigins,
      skippedEntries,
    };
  }

  private replaceActiveSets(blockedDomains: Set<string>, blockedIpOrigins: Set<string>): void {
    this.blockedDomains = blockedDomains;
    this.blockedIpOrigins = blockedIpOrigins;
  }

  private async writeSnapshot(hydrated: HydratedBlocklists): Promise<void> {
    const snapshot: BlocklistSnapshot = {
      version: SNAPSHOT_VERSION,
      generatedAt: hydrated.generatedAt,
      sources: hydrated.sources,
      blockedDomains: Array.from(hydrated.blockedDomains),
      blockedIpOrigins: Array.from(hydrated.blockedIpOrigins),
    };
    const tempPath = `${this.snapshotPath}.tmp`;
    await fs.promises.mkdir(this.blocklistDir, { recursive: true });
    await fs.promises.writeFile(tempPath, JSON.stringify(snapshot), 'utf-8');
    await fs.promises.rename(tempPath, this.snapshotPath);
  }
}
