import https from 'https';
import fs from 'fs';
import path from 'path';
import { tandemDir } from '../../utils/paths';
import type { SecurityDB } from '../security-db';
import type { NetworkShield } from '../network-shield';
import type {
  BlocklistSourceDefinition,
  BlocklistValueType,
  CsvBlocklistParser,
  JsonBlocklistParser,
  ParsedBlocklistSource,
  UpdateResult,
} from '../types';
import { URL_LIST_SAFE_DOMAINS } from '../types';
import { createLogger } from '../../utils/logger';

const log = createLogger('BlocklistUpdater');

/** Download timeout in milliseconds */
const DOWNLOAD_TIMEOUT = 60_000;
const DEFAULT_CSV_DELIMITER = ',';

/** Blocklist source definitions */
export const BLOCKLIST_SOURCES: BlocklistSourceDefinition[] = [
  {
    name: 'urlhaus',
    url: 'https://urlhaus.abuse.ch/downloads/text_online/',
    parser: { type: 'url_list' },
    category: 'malware',
    cacheFileName: 'urlhaus.txt',
  },
  {
    name: 'phishing',
    url: 'https://raw.githubusercontent.com/mitchellkrogza/Phishing.Database/master/phishing-domains-ACTIVE.txt',
    parser: { type: 'domain_list' },
    category: 'phishing',
    cacheFileName: 'phishing.txt',
  },
  {
    name: 'stevenblack',
    url: 'https://raw.githubusercontent.com/StevenBlack/hosts/master/hosts',
    parser: { type: 'hosts_file' },
    category: 'tracker',
    cacheFileName: 'hosts.txt',
  },
];

/**
 * Parse a downloaded or cached source using the parser configuration declared
 * on the source manifest.
 */
export function parseBlocklistContent(
  source: BlocklistSourceDefinition,
  content: string,
): ParsedBlocklistSource {
  switch (source.parser.type) {
    case 'hosts_file':
      return parseHostsFile(content);
    case 'domain_list':
      return parseDomainList(content);
    case 'url_list':
      return parseUrlList(content);
    case 'json':
      return parseJsonFeed(content, source.parser);
    case 'csv':
      return parseCsvFeed(content, source.parser);
  }
}

/**
 * Read and parse a cached source file with the same source manifest used by the
 * updater.
 */
export function parseBlocklistFile(
  source: BlocklistSourceDefinition,
  filePath: string,
): ParsedBlocklistSource {
  return parseBlocklistContent(source, fs.readFileSync(filePath, 'utf-8'));
}

/**
 * BlocklistUpdater — Automated blocklist download and refresh.
 *
 * Downloads blocklists from the configured sources, parses them through the
 * shared parser layer, syncs to DB, and triggers NetworkShield.reload() to
 * refresh the in-memory Set.
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
    this.dataDir = tandemDir('security', 'blocklists');
    fs.mkdirSync(this.dataDir, { recursive: true });
  }

  /**
   * Update all blocklist sources: download, parse, sync to DB, reload shield.
   */
  async update(): Promise<UpdateResult> {
    const results: UpdateResult = { sources: [], totalAdded: 0, totalRemoved: 0, errors: [] };

    for (const source of BLOCKLIST_SOURCES) {
      try {
        log.info(`Downloading ${source.name} from ${source.url}...`);
        const content = await this.download(source.url);
        const filePath = path.join(this.dataDir, source.cacheFileName);
        fs.writeFileSync(filePath, content);

        const parsed = parseBlocklistContent(source, content);
        const added = this.db.syncBlocklistSource(source.name, parsed.domains, source.category);
        results.sources.push({ name: source.name, domains: parsed.domains.length, added });
        results.totalAdded += added;
        log.info(`${source.name}: ${parsed.domains.length} domains parsed, ${added} synced to DB`);
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        results.errors.push(`${source.name}: ${errMsg}`);
        log.error(`Failed to update ${source.name}:`, errMsg);
      }
    }

    this.shield.reload();
    log.info(`NetworkShield reloaded. Total added: ${results.totalAdded}, errors: ${results.errors.length}`);

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
}

function createParsedBlocklistSource(): ParsedBlocklistSource {
  return { domains: [], blockedIpOrigins: [], skipped: 0 };
}

function parseHostsFile(content: string): ParsedBlocklistSource {
  const result = createParsedBlocklistSource();
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const parts = trimmed.split(/\s+/);
    if (parts.length >= 2 && (parts[0] === '0.0.0.0' || parts[0] === '127.0.0.1')) {
      const domain = normalizeDomainCandidate(parts[1]);
      if (domain && domain !== 'localhost') {
        result.domains.push(domain);
      }
    }
  }
  return result;
}

function parseDomainList(content: string): ParsedBlocklistSource {
  const result = createParsedBlocklistSource();
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    const domain = normalizeDomainCandidate(line);
    if (domain && !line.trim().startsWith('#') && !line.trim().startsWith('//')) {
      result.domains.push(domain);
    }
  }
  return result;
}

function parseUrlList(content: string): ParsedBlocklistSource {
  const result = createParsedBlocklistSource();
  const seenDomains = new Set<string>();
  const seenIpOrigins = new Set<string>();
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) continue;
    addUrlValue(result, trimmed, seenDomains, seenIpOrigins);
  }
  return result;
}

function parseJsonFeed(content: string, parser: JsonBlocklistParser): ParsedBlocklistSource {
  const parsed = JSON.parse(content) as unknown;
  const result = createParsedBlocklistSource();
  const seenDomains = new Set<string>();
  const seenIpOrigins = new Set<string>();
  const valueType = parser.valueType ?? 'domain';
  const records = resolveJsonRecords(parsed, parser.recordPath);

  for (const record of records) {
    const values = parser.fieldPaths && parser.fieldPaths.length > 0
      ? parser.fieldPaths.flatMap((fieldPath) => resolveJsonPathValues(record, fieldPath))
      : [record];
    for (const value of values) {
      addConfiguredValue(result, value, valueType, seenDomains, seenIpOrigins);
    }
  }

  return result;
}

function parseCsvFeed(content: string, parser: CsvBlocklistParser): ParsedBlocklistSource {
  if ((parser.hasHeader ?? typeof parser.column === 'string') === false && typeof parser.column === 'string') {
    throw new Error(`CSV parser for string column "${parser.column}" requires a header row`);
  }

  const result = createParsedBlocklistSource();
  const seenDomains = new Set<string>();
  const seenIpOrigins = new Set<string>();
  const delimiter = parser.delimiter ?? DEFAULT_CSV_DELIMITER;
  const hasHeader = parser.hasHeader ?? typeof parser.column === 'string';
  const valueType = parser.valueType ?? 'domain';
  const lines = content.split(/\r?\n/);
  let columnIndex = typeof parser.column === 'number' ? parser.column : null;
  let headerProcessed = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) continue;

    const cells = parseCsvLine(line, delimiter);
    if (!headerProcessed && hasHeader) {
      columnIndex = resolveCsvColumnIndex(cells, parser.column);
      headerProcessed = true;
      continue;
    }

    headerProcessed = true;
    if (columnIndex === null || columnIndex < 0 || columnIndex >= cells.length) continue;
    addConfiguredValue(result, cells[columnIndex], valueType, seenDomains, seenIpOrigins);
  }

  return result;
}

function addConfiguredValue(
  result: ParsedBlocklistSource,
  value: unknown,
  valueType: BlocklistValueType,
  seenDomains: Set<string>,
  seenIpOrigins: Set<string>,
): void {
  if (typeof value !== 'string') return;

  if (valueType === 'url') {
    addUrlValue(result, value, seenDomains, seenIpOrigins);
    return;
  }

  const domain = normalizeDomainCandidate(value);
  if (!domain || seenDomains.has(domain)) return;
  seenDomains.add(domain);
  result.domains.push(domain);
}

function addUrlValue(
  result: ParsedBlocklistSource,
  value: string,
  seenDomains: Set<string>,
  seenIpOrigins: Set<string>,
): void {
  try {
    const url = new URL(value.trim());
    const domain = normalizeDomainCandidate(url.hostname);
    if (!domain || seenDomains.has(domain)) return;
    if (isSafeUrlListDomain(domain)) {
      result.skipped++;
      return;
    }

    seenDomains.add(domain);
    result.domains.push(domain);

    if (isRawIpHost(domain)) {
      const origin = url.host.toLowerCase();
      if (!seenIpOrigins.has(origin)) {
        seenIpOrigins.add(origin);
        result.blockedIpOrigins.push(origin);
      }
    }
  } catch {
    // Not a valid URL, skip
  }
}

function normalizeDomainCandidate(value: string): string | null {
  const normalized = value.trim().toLowerCase();
  if (!normalized || normalized.includes(' ') || !normalized.includes('.')) {
    return null;
  }
  return normalized;
}

function isSafeUrlListDomain(domain: string): boolean {
  if (URL_LIST_SAFE_DOMAINS.has(domain)) {
    return true;
  }

  const parts = domain.split('.');
  for (let i = 1; i < parts.length - 1; i++) {
    if (URL_LIST_SAFE_DOMAINS.has(parts.slice(i).join('.'))) {
      return true;
    }
  }

  return false;
}

function isRawIpHost(domain: string): boolean {
  return /^(\d{1,3}\.){3}\d{1,3}$/.test(domain) || /^\[[\da-fA-F:]+\]$/.test(domain);
}

function resolveJsonRecords(value: unknown, recordPath?: string): unknown[] {
  if (!recordPath) {
    return Array.isArray(value) ? value : [value];
  }
  return resolveJsonPathValues(value, recordPath).flatMap(flattenJsonValues);
}

function resolveJsonPathValues(value: unknown, pathExpression: string): unknown[] {
  const segments = pathExpression.split('.').filter(Boolean);
  return getJsonPathValues(value, segments);
}

function getJsonPathValues(value: unknown, segments: string[]): unknown[] {
  if (segments.length === 0) {
    return flattenJsonValues(value);
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => getJsonPathValues(item, segments));
  }

  if (!value || typeof value !== 'object') {
    return [];
  }

  const [current, ...rest] = segments;
  return getJsonPathValues((value as Record<string, unknown>)[current], rest);
}

function flattenJsonValues(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => flattenJsonValues(item));
  }
  return [value];
}

function resolveCsvColumnIndex(header: string[], column: string | number): number {
  if (typeof column === 'number') return column;
  const index = header.findIndex((cell) => cell.trim() === column);
  if (index === -1) {
    throw new Error(`CSV column "${column}" not found`);
  }
  return index;
}

function parseCsvLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let index = 0; index < line.length; index++) {
    const char = line[index];
    if (char === '"') {
      const nextChar = line[index + 1];
      if (inQuotes && nextChar === '"') {
        current += '"';
        index++;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }

    if (char === delimiter && !inQuotes) {
      cells.push(current.trim());
      current = '';
      continue;
    }

    current += char;
  }

  cells.push(current.trim());
  return cells;
}
