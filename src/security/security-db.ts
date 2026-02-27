import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { tandemDir } from '../utils/paths';
import type { SecurityEvent, DomainInfo, BlocklistEntry, GuardianMode, WhitelistEntry, BaselineEntry, ZeroDayCandidate, TrustChange } from './types';
import { SecurityEventsDB } from './db-events';
import { SecurityBaselinesDB } from './db-baselines';
import { SecurityBlocklistDB } from './db-blocklist';

export class SecurityDB {
  private db: Database.Database;

  // Sub-modules (composition)
  private eventsDB: SecurityEventsDB;
  private baselinesDB: SecurityBaselinesDB;
  private blocklistDB: SecurityBlocklistDB;

  // Prepared statements — domains, scripts, whitelist, counts
  private stmtIsDomainBlocked!: Database.Statement;
  private stmtGetDomainInfo!: Database.Statement;
  private stmtUpsertDomain!: Database.Statement;
  private stmtUpdateDomainSeen!: Database.Statement;
  private stmtGetDomains!: Database.Statement;
  private stmtEventCount!: Database.Statement;
  private stmtDomainCount!: Database.Statement;
  private stmtSetDomainTrust!: Database.Statement;
  private stmtSetDomainMode!: Database.Statement;
  // Outbound whitelist
  private stmtIsWhitelistedPair!: Database.Statement;
  private stmtAddWhitelistPair!: Database.Statement;
  private stmtGetWhitelistEntries!: Database.Statement;
  // Script fingerprints
  private stmtGetScriptFingerprint!: Database.Statement;
  private stmtUpsertScriptFingerprint!: Database.Statement;
  private stmtGetScriptsByDomain!: Database.Statement;
  private stmtGetScriptFingerprintCount!: Database.Statement;
  // Cross-domain script correlation
  private stmtGetDomainsForHash!: Database.Statement;
  private stmtGetDomainCountForHash!: Database.Statement;
  // Normalized hashing
  private stmtUpdateNormalizedHash!: Database.Statement;
  private stmtGetDomainsForNormalizedHash!: Database.Statement;
  private stmtGetWidespreadScripts!: Database.Statement;
  private stmtGetCrossDomainScriptCount!: Database.Statement;
  // Reliable script_hash
  private stmtUpdateScriptHash!: Database.Statement;
  // AST hash
  private stmtUpdateAstHash!: Database.Statement;
  // AST-based correlation + similarity
  private stmtGetDomainsForAstHash!: Database.Statement;
  private stmtGetAstMatches!: Database.Statement;
  private stmtGetWidespreadAstScripts!: Database.Statement;
  private stmtUpdateAstFeatures!: Database.Statement;
  private stmtGetAstFeaturesForBlockedCheck!: Database.Statement;

  constructor() {
    const dbDir = tandemDir('security');
    fs.mkdirSync(dbDir, { recursive: true });
    this.db = new Database(path.join(dbDir, 'shield.db'));
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.initialize();
    this.prepareStatements();

    // Initialize sub-modules (share same DB connection)
    this.eventsDB = new SecurityEventsDB(this.db);
    this.baselinesDB = new SecurityBaselinesDB(this.db);
    this.blocklistDB = new SecurityBlocklistDB(this.db);
  }

  // === onEventLogged callback — delegates to eventsDB ===

  get onEventLogged(): ((event: SecurityEvent) => void) | null {
    return this.eventsDB.onEventLogged;
  }

  set onEventLogged(callback: ((event: SecurityEvent) => void) | null) {
    this.eventsDB.onEventLogged = callback;
  }

  private initialize(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS domains (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        domain TEXT UNIQUE NOT NULL,
        first_seen INTEGER NOT NULL,
        last_seen INTEGER NOT NULL,
        visit_count INTEGER DEFAULT 1,
        trust_level INTEGER DEFAULT 30,
        guardian_mode TEXT DEFAULT 'balanced',
        category TEXT DEFAULT 'unknown',
        notes TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS baselines (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        domain TEXT NOT NULL,
        metric TEXT NOT NULL,
        expected_value REAL NOT NULL,
        tolerance REAL NOT NULL,
        sample_count INTEGER DEFAULT 1,
        last_updated TEXT DEFAULT (datetime('now')),
        UNIQUE(domain, metric)
      );

      CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp INTEGER NOT NULL,
        domain TEXT,
        tab_id TEXT,
        event_type TEXT NOT NULL,
        severity TEXT NOT NULL,
        category TEXT,
        details TEXT,
        action_taken TEXT,
        false_positive INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS script_fingerprints (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        domain TEXT NOT NULL,
        script_url TEXT NOT NULL,
        script_hash TEXT,
        first_seen INTEGER NOT NULL,
        last_seen INTEGER NOT NULL,
        trusted INTEGER DEFAULT 0,
        UNIQUE(domain, script_url)
      );

      CREATE TABLE IF NOT EXISTS zero_day_candidates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        detected_at INTEGER NOT NULL,
        domain TEXT NOT NULL,
        anomaly_type TEXT NOT NULL,
        baseline_deviation REAL,
        details TEXT,
        resolved INTEGER DEFAULT 0,
        resolution TEXT,
        resolved_at INTEGER
      );

      CREATE TABLE IF NOT EXISTS blocklist (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        domain TEXT UNIQUE NOT NULL,
        source TEXT NOT NULL,
        category TEXT,
        added_at TEXT DEFAULT (datetime('now')),
        expires_at TEXT
      );

      CREATE TABLE IF NOT EXISTS outbound_whitelist (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        origin_domain TEXT NOT NULL,
        destination_domain TEXT NOT NULL,
        added_at TEXT DEFAULT (datetime('now')),
        UNIQUE(origin_domain, destination_domain)
      );

      CREATE TABLE IF NOT EXISTS blocklist_metadata (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_events_domain ON events(domain);
      CREATE INDEX IF NOT EXISTS idx_events_severity ON events(severity);
      CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp);
      CREATE INDEX IF NOT EXISTS idx_events_category ON events(category);
      CREATE INDEX IF NOT EXISTS idx_baselines_domain ON baselines(domain);
      CREATE INDEX IF NOT EXISTS idx_blocklist_domain ON blocklist(domain);
      CREATE INDEX IF NOT EXISTS idx_script_fp_domain ON script_fingerprints(domain);
      CREATE INDEX IF NOT EXISTS idx_script_fp_hash ON script_fingerprints(script_hash);
      CREATE INDEX IF NOT EXISTS idx_zeroday_domain ON zero_day_candidates(domain);
      CREATE INDEX IF NOT EXISTS idx_zeroday_resolved ON zero_day_candidates(resolved);
    `);

    // Phase 3-B: Add normalized_hash column to script_fingerprints (backward-compatible)
    try {
      this.db.exec('ALTER TABLE script_fingerprints ADD COLUMN normalized_hash TEXT');
    } catch {
      // Column already exists — ignore
    }
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_script_fp_normalized_hash ON script_fingerprints(normalized_hash)');

    // Phase 5-A: Add confidence column to events (backward-compatible, default 500 = BEHAVIORAL)
    try {
      this.db.exec('ALTER TABLE events ADD COLUMN confidence INTEGER DEFAULT 500');
    } catch {
      // Column already exists — ignore
    }

    // Phase 6-A: Add ast_hash column to script_fingerprints (backward-compatible)
    try {
      this.db.exec('ALTER TABLE script_fingerprints ADD COLUMN ast_hash TEXT');
    } catch {
      // Column already exists — ignore
    }
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_script_fp_ast_hash ON script_fingerprints(ast_hash)');

    // Phase 6-B: Add ast_features column for similarity scoring (stores serialized feature vector)
    try {
      this.db.exec('ALTER TABLE script_fingerprints ADD COLUMN ast_features TEXT');
    } catch {
      // Column already exists — ignore
    }
  }

  private prepareStatements(): void {
    // Domains
    this.stmtIsDomainBlocked = this.db.prepare(
      'SELECT domain, source, category FROM blocklist WHERE domain = ?'
    );
    this.stmtGetDomainInfo = this.db.prepare(
      'SELECT id, domain, first_seen, last_seen, visit_count, trust_level, guardian_mode, category, notes FROM domains WHERE domain = ?'
    );
    this.stmtUpsertDomain = this.db.prepare(`
      INSERT INTO domains (domain, first_seen, last_seen, visit_count, trust_level, guardian_mode, category, notes)
      VALUES (@domain, @firstSeen, @lastSeen, @visitCount, @trustLevel, @guardianMode, @category, @notes)
      ON CONFLICT(domain) DO UPDATE SET
        last_seen = @lastSeen,
        visit_count = visit_count + 1,
        guardian_mode = COALESCE(@guardianMode, guardian_mode),
        category = COALESCE(@category, category),
        notes = COALESCE(@notes, notes),
        updated_at = datetime('now')
    `);
    this.stmtUpdateDomainSeen = this.db.prepare(
      'UPDATE domains SET last_seen = ?, visit_count = visit_count + 1, updated_at = datetime(\'now\') WHERE domain = ?'
    );
    this.stmtGetDomains = this.db.prepare(
      'SELECT id, domain, first_seen, last_seen, visit_count, trust_level, guardian_mode, category, notes FROM domains ORDER BY last_seen DESC LIMIT ?'
    );
    this.stmtEventCount = this.db.prepare(
      'SELECT COUNT(*) as total FROM events'
    );
    this.stmtDomainCount = this.db.prepare(
      'SELECT COUNT(*) as total FROM domains'
    );
    this.stmtSetDomainTrust = this.db.prepare(
      'UPDATE domains SET trust_level = ?, updated_at = datetime(\'now\') WHERE domain = ?'
    );
    this.stmtSetDomainMode = this.db.prepare(
      'UPDATE domains SET guardian_mode = ?, updated_at = datetime(\'now\') WHERE domain = ?'
    );
    // Outbound whitelist
    this.stmtIsWhitelistedPair = this.db.prepare(
      'SELECT id FROM outbound_whitelist WHERE origin_domain = ? AND destination_domain = ?'
    );
    this.stmtAddWhitelistPair = this.db.prepare(
      'INSERT OR IGNORE INTO outbound_whitelist (origin_domain, destination_domain) VALUES (?, ?)'
    );
    this.stmtGetWhitelistEntries = this.db.prepare(
      'SELECT id, origin_domain, destination_domain, added_at FROM outbound_whitelist ORDER BY added_at DESC'
    );
    // Script fingerprints
    this.stmtGetScriptFingerprint = this.db.prepare(
      'SELECT id, domain, script_url, script_hash, first_seen, last_seen, trusted FROM script_fingerprints WHERE domain = ? AND script_url = ?'
    );
    this.stmtUpsertScriptFingerprint = this.db.prepare(`
      INSERT INTO script_fingerprints (domain, script_url, script_hash, first_seen, last_seen, trusted)
      VALUES (@domain, @scriptUrl, @scriptHash, @firstSeen, @lastSeen, 0)
      ON CONFLICT(domain, script_url) DO UPDATE SET
        last_seen = @lastSeen,
        script_hash = COALESCE(@scriptHash, script_hash)
    `);
    this.stmtGetScriptsByDomain = this.db.prepare(
      'SELECT id, domain, script_url, script_hash, first_seen, last_seen, trusted FROM script_fingerprints WHERE domain = ? ORDER BY last_seen DESC LIMIT ?'
    );
    this.stmtGetScriptFingerprintCount = this.db.prepare(
      'SELECT COUNT(*) as total FROM script_fingerprints'
    );
    // Cross-domain script correlation
    this.stmtGetDomainsForHash = this.db.prepare(
      'SELECT DISTINCT domain FROM script_fingerprints WHERE script_hash = ?'
    );
    this.stmtGetDomainCountForHash = this.db.prepare(
      'SELECT COUNT(DISTINCT domain) as count FROM script_fingerprints WHERE script_hash = ?'
    );
    // Normalized hashing
    this.stmtUpdateNormalizedHash = this.db.prepare(
      'UPDATE script_fingerprints SET normalized_hash = ? WHERE domain = ? AND script_url = ?'
    );
    this.stmtGetDomainsForNormalizedHash = this.db.prepare(
      'SELECT DISTINCT domain FROM script_fingerprints WHERE normalized_hash = ?'
    );
    this.stmtGetWidespreadScripts = this.db.prepare(`
      SELECT script_hash, MAX(normalized_hash) as normalized_hash,
             COUNT(DISTINCT domain) as domain_count,
             MIN(first_seen) as first_seen
      FROM script_fingerprints
      WHERE script_hash IS NOT NULL
      GROUP BY script_hash
      HAVING domain_count >= 2
      ORDER BY domain_count DESC
      LIMIT 50
    `);
    this.stmtGetCrossDomainScriptCount = this.db.prepare(`
      SELECT COUNT(*) as total FROM (
        SELECT script_hash FROM script_fingerprints
        WHERE script_hash IS NOT NULL
        GROUP BY script_hash
        HAVING COUNT(DISTINCT domain) >= 2
      )
    `);
    // Reliable script_hash
    this.stmtUpdateScriptHash = this.db.prepare(
      'UPDATE script_fingerprints SET script_hash = ? WHERE domain = ? AND script_url = ? AND script_hash IS NULL'
    );
    // AST hash
    this.stmtUpdateAstHash = this.db.prepare(
      'UPDATE script_fingerprints SET ast_hash = ? WHERE domain = ? AND script_url = ?'
    );
    // AST-based correlation
    this.stmtGetDomainsForAstHash = this.db.prepare(
      'SELECT DISTINCT domain FROM script_fingerprints WHERE ast_hash = ? AND ast_hash IS NOT NULL'
    );
    this.stmtGetAstMatches = this.db.prepare(`
      SELECT script_hash, normalized_hash, ast_hash, domain, script_url, first_seen
      FROM script_fingerprints
      WHERE ast_hash = ? AND ast_hash IS NOT NULL
      ORDER BY first_seen ASC
    `);
    this.stmtGetWidespreadAstScripts = this.db.prepare(`
      SELECT ast_hash, COUNT(DISTINCT domain) as domain_count,
             COUNT(DISTINCT script_hash) as hash_variant_count,
             MIN(first_seen) as first_seen
      FROM script_fingerprints
      WHERE ast_hash IS NOT NULL
      GROUP BY ast_hash
      HAVING domain_count >= 2
      ORDER BY domain_count DESC
      LIMIT 50
    `);
    this.stmtUpdateAstFeatures = this.db.prepare(
      'UPDATE script_fingerprints SET ast_features = ? WHERE domain = ? AND script_url = ?'
    );
    this.stmtGetAstFeaturesForBlockedCheck = this.db.prepare(`
      SELECT domain, script_url, ast_hash, ast_features
      FROM script_fingerprints
      WHERE ast_features IS NOT NULL
      ORDER BY last_seen DESC
      LIMIT 200
    `);
  }

  // === Domains — fast lookups ===

  isDomainBlocked(domain: string): { blocked: boolean; source?: string; category?: string } {
    const row = this.stmtIsDomainBlocked.get(domain) as { domain: string; source: string; category: string } | undefined;
    if (row) {
      return { blocked: true, source: row.source, category: row.category };
    }
    // Check parent domain: if "evil.com" is blocked, block "sub.evil.com"
    const parts = domain.split('.');
    for (let i = 1; i < parts.length - 1; i++) {
      const parent = parts.slice(i).join('.');
      const parentRow = this.stmtIsDomainBlocked.get(parent) as { domain: string; source: string; category: string } | undefined;
      if (parentRow) {
        return { blocked: true, source: parentRow.source, category: parentRow.category };
      }
    }
    return { blocked: false };
  }

  getDomainInfo(domain: string): DomainInfo | null {
    const row = this.stmtGetDomainInfo.get(domain) as any;
    if (!row) return null;
    return {
      id: row.id,
      domain: row.domain,
      firstSeen: row.first_seen,
      lastSeen: row.last_seen,
      visitCount: row.visit_count,
      trustLevel: row.trust_level,
      guardianMode: row.guardian_mode as GuardianMode,
      category: row.category,
      notes: row.notes,
    };
  }

  upsertDomain(domain: string, data: Partial<DomainInfo>): void {
    const existing = this.getDomainInfo(domain);
    if (existing) {
      if (data.guardianMode !== undefined) {
        this.stmtSetDomainMode.run(data.guardianMode, domain);
      }
      if (data.trustLevel !== undefined) {
        this.stmtSetDomainTrust.run(data.trustLevel, domain);
      }
      if (data.lastSeen !== undefined) {
        this.stmtUpdateDomainSeen.run(data.lastSeen, domain);
      }
    } else {
      const now = Date.now();
      this.stmtUpsertDomain.run({
        domain,
        firstSeen: data.firstSeen ?? now,
        lastSeen: data.lastSeen ?? now,
        visitCount: data.visitCount ?? 1,
        trustLevel: data.trustLevel ?? 30,
        guardianMode: data.guardianMode ?? 'balanced',
        category: data.category ?? 'unknown',
        notes: data.notes ?? null,
      });
    }
  }

  getDomains(limit = 100): DomainInfo[] {
    const rows = this.stmtGetDomains.all(limit) as any[];
    return rows.map(row => ({
      id: row.id,
      domain: row.domain,
      firstSeen: row.first_seen,
      lastSeen: row.last_seen,
      visitCount: row.visit_count,
      trustLevel: row.trust_level,
      guardianMode: row.guardian_mode as GuardianMode,
      category: row.category,
      notes: row.notes,
    }));
  }

  getEventCount(): number {
    return (this.stmtEventCount.get() as { total: number }).total;
  }

  getDomainCount(): number {
    return (this.stmtDomainCount.get() as { total: number }).total;
  }

  // === Outbound whitelist ===

  isWhitelistedPair(origin: string, destination: string): boolean {
    return !!this.stmtIsWhitelistedPair.get(origin, destination);
  }

  addWhitelistPair(origin: string, destination: string): void {
    this.stmtAddWhitelistPair.run(origin, destination);
  }

  getWhitelistEntries(): WhitelistEntry[] {
    const rows = this.stmtGetWhitelistEntries.all() as any[];
    return rows.map(row => ({
      id: row.id,
      originDomain: row.origin_domain,
      destinationDomain: row.destination_domain,
      addedAt: row.added_at,
    }));
  }

  // === Script fingerprints ===

  getScriptFingerprint(domain: string, scriptUrl: string): { id: number; domain: string; scriptUrl: string; scriptHash: string | null; firstSeen: number; lastSeen: number; trusted: boolean } | null {
    const row = this.stmtGetScriptFingerprint.get(domain, scriptUrl) as any;
    if (!row) return null;
    return {
      id: row.id,
      domain: row.domain,
      scriptUrl: row.script_url,
      scriptHash: row.script_hash,
      firstSeen: row.first_seen,
      lastSeen: row.last_seen,
      trusted: !!row.trusted,
    };
  }

  upsertScriptFingerprint(domain: string, scriptUrl: string, scriptHash?: string): void {
    const now = Date.now();
    this.stmtUpsertScriptFingerprint.run({
      domain,
      scriptUrl,
      scriptHash: scriptHash || null,
      firstSeen: now,
      lastSeen: now,
    });
  }

  getScriptsByDomain(domain: string, limit = 100): { id: number; scriptUrl: string; scriptHash: string | null; firstSeen: number; lastSeen: number; trusted: boolean }[] {
    const rows = this.stmtGetScriptsByDomain.all(domain, limit) as any[];
    return rows.map(row => ({
      id: row.id,
      scriptUrl: row.script_url,
      scriptHash: row.script_hash,
      firstSeen: row.first_seen,
      lastSeen: row.last_seen,
      trusted: !!row.trusted,
    }));
  }

  getScriptFingerprintCount(): number {
    return (this.stmtGetScriptFingerprintCount.get() as { total: number }).total;
  }

  getDomainsForHash(scriptHash: string): string[] {
    const rows = this.stmtGetDomainsForHash.all(scriptHash) as { domain: string }[];
    return rows.map(row => row.domain);
  }

  getDomainCountForHash(scriptHash: string): number {
    return (this.stmtGetDomainCountForHash.get(scriptHash) as { count: number }).count;
  }

  updateNormalizedHash(domain: string, scriptUrl: string, normalizedHash: string): void {
    this.stmtUpdateNormalizedHash.run(normalizedHash, domain, scriptUrl);
  }

  updateScriptHash(domain: string, scriptUrl: string, hash: string): void {
    this.stmtUpdateScriptHash.run(hash, domain, scriptUrl);
  }

  updateAstHash(domain: string, scriptUrl: string, astHash: string): void {
    this.stmtUpdateAstHash.run(astHash, domain, scriptUrl);
  }

  getDomainsForAstHash(astHash: string): string[] {
    const rows = this.stmtGetDomainsForAstHash.all(astHash) as { domain: string }[];
    return rows.map(row => row.domain);
  }

  getAstMatches(astHash: string): { scriptHash: string | null; normalizedHash: string | null; astHash: string; domain: string; scriptUrl: string; firstSeen: number }[] {
    const rows = this.stmtGetAstMatches.all(astHash) as any[];
    return rows.map(row => ({
      scriptHash: row.script_hash,
      normalizedHash: row.normalized_hash,
      astHash: row.ast_hash,
      domain: row.domain,
      scriptUrl: row.script_url,
      firstSeen: row.first_seen,
    }));
  }

  getWidespreadAstScripts(): { astHash: string; domainCount: number; hashVariantCount: number; firstSeen: number }[] {
    const rows = this.stmtGetWidespreadAstScripts.all() as any[];
    return rows.map(row => ({
      astHash: row.ast_hash,
      domainCount: row.domain_count,
      hashVariantCount: row.hash_variant_count,
      firstSeen: row.first_seen,
    }));
  }

  updateAstFeatures(domain: string, scriptUrl: string, features: string): void {
    this.stmtUpdateAstFeatures.run(features, domain, scriptUrl);
  }

  getScriptsWithAstFeatures(): { domain: string; scriptUrl: string; astHash: string | null; astFeatures: string }[] {
    const rows = this.stmtGetAstFeaturesForBlockedCheck.all() as any[];
    return rows.map(row => ({
      domain: row.domain,
      scriptUrl: row.script_url,
      astHash: row.ast_hash,
      astFeatures: row.ast_features,
    }));
  }

  getDomainsForNormalizedHash(normalizedHash: string): string[] {
    const rows = this.stmtGetDomainsForNormalizedHash.all(normalizedHash) as { domain: string }[];
    return rows.map(row => row.domain);
  }

  getWidespreadScripts(): { scriptHash: string; normalizedHash: string | null; domainCount: number; firstSeen: number }[] {
    const rows = this.stmtGetWidespreadScripts.all() as { script_hash: string; normalized_hash: string | null; domain_count: number; first_seen: number }[];
    return rows.map(row => ({
      scriptHash: row.script_hash,
      normalizedHash: row.normalized_hash,
      domainCount: row.domain_count,
      firstSeen: row.first_seen,
    }));
  }

  getCrossDomainScriptCount(): number {
    return (this.stmtGetCrossDomainScriptCount.get() as { total: number }).total;
  }

  // === Delegated: Events (→ SecurityEventsDB) ===

  logEvent(event: SecurityEvent): number {
    return this.eventsDB.logEvent(event);
  }

  getRecentEvents(limit: number, severity?: string, category?: string): SecurityEvent[] {
    return this.eventsDB.getRecentEvents(limit, severity, category);
  }

  getEventsForDomain(domain: string, limit: number): SecurityEvent[] {
    return this.eventsDB.getEventsForDomain(domain, limit);
  }

  countEvents(since: number, actionFilter?: string): number {
    return this.eventsDB.countEvents(since, actionFilter);
  }

  getTopBlockedDomains(since: number, limit: number): { domain: string; count: number }[] {
    return this.eventsDB.getTopBlockedDomains(since, limit);
  }

  getNewDomains(since: number): { domain: string; firstSeen: number }[] {
    return this.eventsDB.getNewDomains(since);
  }

  getTrustChanges(since: number): TrustChange[] {
    return this.eventsDB.getTrustChanges(since);
  }

  getRecentAnomalies(limit: number): SecurityEvent[] {
    return this.eventsDB.getRecentAnomalies(limit);
  }

  pruneOldEvents(olderThanMs: number): number {
    return this.eventsDB.pruneOldEvents(olderThanMs);
  }

  // === Delegated: Baselines (→ SecurityBaselinesDB) ===

  getBaseline(domain: string, metric: string): BaselineEntry | null {
    return this.baselinesDB.getBaseline(domain, metric);
  }

  getBaselinesByDomain(domain: string): BaselineEntry[] {
    return this.baselinesDB.getBaselinesByDomain(domain);
  }

  upsertBaseline(domain: string, metric: string, expectedValue: number, tolerance: number, sampleCount: number): void {
    this.baselinesDB.upsertBaseline(domain, metric, expectedValue, tolerance, sampleCount);
  }

  insertZeroDayCandidate(candidate: Omit<ZeroDayCandidate, 'id' | 'resolved' | 'resolution' | 'resolvedAt'>): number {
    return this.baselinesDB.insertZeroDayCandidate(candidate);
  }

  getZeroDayCandidates(since: number): ZeroDayCandidate[] {
    return this.baselinesDB.getZeroDayCandidates(since);
  }

  getOpenZeroDayCandidates(): ZeroDayCandidate[] {
    return this.baselinesDB.getOpenZeroDayCandidates();
  }

  resolveZeroDayCandidate(id: number, resolution: string): boolean {
    return this.baselinesDB.resolveZeroDayCandidate(id, resolution);
  }

  // === Delegated: Blocklist (→ SecurityBlocklistDB) ===

  addToBlocklist(entry: BlocklistEntry): void {
    this.blocklistDB.addToBlocklist(entry);
  }

  getBlocklistStats(): { total: number; bySource: Record<string, number>; lastUpdate: string } {
    return this.blocklistDB.getBlocklistStats();
  }

  syncBlocklistSource(sourceName: string, domains: string[], category: string): number {
    return this.blocklistDB.syncBlocklistSource(sourceName, domains, category);
  }

  getBlocklistMeta(key: string): string | null {
    return this.blocklistDB.getBlocklistMeta(key);
  }

  setBlocklistMeta(key: string, value: string): void {
    this.blocklistDB.setBlocklistMeta(key, value);
  }

  // === Cleanup ===

  close(): void {
    this.db.close();
  }
}
