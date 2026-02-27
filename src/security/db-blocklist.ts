import type Database from 'better-sqlite3';
import type { BlocklistEntry } from './types';

/**
 * Blocklist database operations.
 * Extracted from SecurityDB for separation of concerns.
 */
export class SecurityBlocklistDB {
  private db: Database.Database;
  private stmtAddBlocklist: Database.Statement;
  private stmtBlocklistCount: Database.Statement;
  private stmtBlocklistBySource: Database.Statement;
  private stmtDeleteBlocklistBySource: Database.Statement;
  private stmtGetBlocklistMeta: Database.Statement;
  private stmtUpsertBlocklistMeta: Database.Statement;

  constructor(db: Database.Database) {
    this.db = db;
    this.stmtAddBlocklist = db.prepare(`
      INSERT OR IGNORE INTO blocklist (domain, source, category)
      VALUES (@domain, @source, @category)
    `);
    this.stmtBlocklistCount = db.prepare(
      'SELECT COUNT(*) as total FROM blocklist'
    );
    this.stmtBlocklistBySource = db.prepare(
      'SELECT source, COUNT(*) as count FROM blocklist GROUP BY source'
    );
    this.stmtDeleteBlocklistBySource = db.prepare(
      'DELETE FROM blocklist WHERE source = ?'
    );
    this.stmtGetBlocklistMeta = db.prepare(
      'SELECT value FROM blocklist_metadata WHERE key = ?'
    );
    this.stmtUpsertBlocklistMeta = db.prepare(
      'INSERT INTO blocklist_metadata (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
    );
  }

  addToBlocklist(entry: BlocklistEntry): void {
    this.stmtAddBlocklist.run({
      domain: entry.domain,
      source: entry.source,
      category: entry.category,
    });
  }

  getBlocklistStats(): { total: number; bySource: Record<string, number>; lastUpdate: string } {
    const totalRow = this.stmtBlocklistCount.get() as { total: number };
    const sourceRows = this.stmtBlocklistBySource.all() as { source: string; count: number }[];
    const bySource: Record<string, number> = {};
    for (const row of sourceRows) {
      bySource[row.source] = row.count;
    }
    return {
      total: totalRow.total,
      bySource,
      lastUpdate: new Date().toISOString(),
    };
  }

  syncBlocklistSource(sourceName: string, domains: string[], category: string): number {
    this.stmtDeleteBlocklistBySource.run(sourceName);
    let added = 0;
    const insertMany = this.db.transaction((items: string[]) => {
      for (const domain of items) {
        this.stmtAddBlocklist.run({ domain, source: sourceName, category });
        added++;
      }
    });
    insertMany(domains);
    return added;
  }

  getBlocklistMeta(key: string): string | null {
    const row = this.stmtGetBlocklistMeta.get(key) as { value: string } | undefined;
    return row?.value ?? null;
  }

  setBlocklistMeta(key: string, value: string): void {
    this.stmtUpsertBlocklistMeta.run(key, value);
  }
}
