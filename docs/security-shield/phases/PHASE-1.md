# Phase 1: Security Core

## Goal

Build the security database, blocklist engine, Guardian interceptor, and API routes. After this phase, Tandem can block known threats in real-time via the RequestDispatcher built in Phase 0.

## Prerequisites

- **Phase 0 MUST be completed and verified** — check `docs/security-shield/STATUS.md`
- Read `src/network/dispatcher.ts` — Guardian registers here
- Read `src/api/server.ts` — understand route registration pattern (lines 222+)
- Read `src/main.ts` — understand initialization order (Guardian registers before `dispatcher.attach()`)

## Deliverables

### 1. `src/security/types.ts` — Shared Types

```typescript
// All types used across the security module

export type GuardianMode = 'strict' | 'balanced' | 'permissive';
export type EventSeverity = 'info' | 'low' | 'medium' | 'high' | 'critical';
export type EventCategory = 'network' | 'script' | 'form' | 'outbound' | 'behavior';
export type EventAction = 'auto_block' | 'agent_block' | 'user_allowed' | 'logged' | 'flagged';

export interface SecurityEvent {
  id?: number;
  timestamp: number;
  domain: string | null;
  tabId: string | null;
  eventType: string;       // 'blocked', 'warned', 'anomaly', 'zero_day', 'exfiltration_attempt'
  severity: EventSeverity;
  category: EventCategory;
  details: string;         // JSON string with full event details
  actionTaken: EventAction;
  falsePositive?: boolean;
}

export interface DomainInfo {
  id?: number;
  domain: string;
  firstSeen: number;
  lastSeen: number;
  visitCount: number;
  trustLevel: number;       // 0-100
  guardianMode: GuardianMode;
  category: string;
  notes: string | null;
}

export interface GuardianDecision {
  id: string;
  action: 'block' | 'allow' | 'hold' | 'monitor';
  reason: string;
  consumer: string;        // Which consumer made the decision
  elapsedMs: number;       // How long the decision took
}

export interface BlocklistEntry {
  domain: string;
  source: string;          // 'phishtank', 'urlhaus', 'stevenblack', 'manual', 'gatekeeper'
  category: string;        // 'phishing', 'malware', 'tracker', 'crypto_miner'
}

export interface GuardianStatus {
  active: boolean;
  defaultMode: GuardianMode;
  stats: {
    totalRequests: number;
    blockedRequests: number;
    allowedRequests: number;
    avgDecisionMs: number;
  };
  consumers: string[];     // From dispatcher status
}

// Banking/login domain patterns for auto-strict mode
export const BANKING_PATTERNS = [
  /bank/i, /paypal/i, /stripe\.com/, /wise\.com/,
  /\.gov\.[a-z]{2}$/, /login\./i, /signin\./i, /auth\./i,
  /accounts\.google/, /id\.apple\.com/,
];

// Known trusted CDN domains (don't flag as suspicious third-party)
export const TRUSTED_CDNS = new Set([
  'cdnjs.cloudflare.com', 'cdn.jsdelivr.net', 'unpkg.com',
  'ajax.googleapis.com', 'fonts.googleapis.com', 'fonts.gstatic.com',
  'cdn.cloudflare.com', 'stackpath.bootstrapcdn.com',
]);
```

### 2. `src/security/security-db.ts` — SQLite Database

```typescript
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { SecurityEvent, DomainInfo, BlocklistEntry, GuardianMode } from './types';

class SecurityDB {
  private db: Database.Database;

  constructor() {
    const dbDir = path.join(process.env.HOME || '~', '.tandem', 'security');
    fs.mkdirSync(dbDir, { recursive: true });
    this.db = new Database(path.join(dbDir, 'shield.db'));
    this.db.pragma('journal_mode = WAL');    // Better concurrent read performance
    this.db.pragma('synchronous = NORMAL');  // Good balance or safety + speed
    this.initialize();
  }

  private initialize(): void {
    // Create all tables from ARCHITECTURE.md schema
    // Create all indexes
    // Use IF NOT EXISTS for idempotency
  }

  // === Fast lookups (used in request handler — MUST be fast) ===

  isDomainBlocked(domain: string): { blocked: boolean; source?: string; category?: string } {
    // Prepared statement for O(1) lookup
    // Also check parent domain: if blocked "evil.com", block "sub.evil.com"
  }

  getDomainInfo(domain: string): DomainInfo | null { ... }

  // === Write operations ===

  upsertDomain(domain: string, data: Partial<DomainInfo>): void { ... }
  logEvent(event: SecurityEvent): number { ... }
  addToBlocklist(entry: BlocklistEntry): void { ... }

  // === Query operations ===

  getRecentEvents(limit: number, severity?: string): SecurityEvent[] { ... }
  getDomains(limit?: number): DomainInfo[] { ... }
  getBlocklistStats(): { total: number; bySource: Record<string, number>; lastUpdate: string } { ... }

  // === Cleanup ===

  close(): void {
    this.db.close();
  }
}
```

**Performance requirements:**
- `isDomainBlocked()` — prepared statement, < 0.5ms
- `getDomainInfo()` — prepared statement, < 0.5ms
- `logEvent()` — write, < 2ms (WAL mode helps)
- Use `this.db.prepare(sql)` for all queries and cache the prepared statements as class properties

### 3. `src/security/network-shield.ts` — Blocklist Engine

**Blocklist files are stored in `~/.tandem/security/blocklists/`** (NOT in `src/`). These files are 5-70MB and must NOT be in the source tree or git. They are downloaded on first run or via the updater.

```typescript
class NetworkShield {
  private blockedDomains: Set<string> = new Set();
  private db: SecurityDB;
  private blocklistDir: string;

  constructor(db: SecurityDB) {
    this.db = db;
    this.blocklistDir = path.join(os.homedir(), '.tandem', 'security', 'blocklists');
    fs.mkdirSync(this.blocklistDir, { recursive: true });
    this.loadBlocklists();
  }

  private loadBlocklists(): void {
    // 1. Load from files in ~/.tandem/security/blocklists/
    // 2. Parse each format (hosts file, plain domain list, URL list)
    // 3. Extract domains, add to Set
    // 4. Also load from blocklist table in DB (manual + gatekeeper additions)
    // 5. If no blocklist files found, log warning (user should run initial download)
    // Log total count
  }

  checkDomain(domain: string): { blocked: boolean; reason?: string; source?: string } {
    // 1. Direct match in Set
    // 2. Parent domain match (strip subdomains progressively)
    // 3. Check DB blocklist table (for dynamic entries)
    // Must be synchronous and fast
  }

  checkUrl(url: string): { blocked: boolean; reason?: string; source?: string } {
    // Extract domain from URL, call checkDomain
    try {
      const domain = new URL(url).hostname;
      return this.checkDomain(domain);
    } catch {
      return { blocked: false };
    }
  }

  getStats(): { memoryEntries: number; dbEntries: number } { ... }
  reload(): void { /* Re-read blocklist files + DB */ }
}
```

**Blocklist file formats to parse:**
- **Hosts file** (Steven Black): `0.0.0.0 domain.com` — extract second column
- **Plain domain list** (PhishTank): one domain per line
- **URL list** (URLhaus): full URLs — extract hostname

### 4. `src/security/guardian.ts` — The Active Interceptor

**Guardian does NOT hook webRequest directly.** It registers as a consumer or the RequestDispatcher from Phase 0.

```typescript
import { RequestDispatcher } from '../network/dispatcher';
import { SecurityDB } from './security-db';
import { NetworkShield } from './network-shield';
import { GuardianMode, GuardianDecision, BANKING_PATTERNS } from './types';

class Guardian {
  private db: SecurityDB;
  private shield: NetworkShield;
  private defaultMode: GuardianMode = 'balanced';
  private stats = { total: 0, blocked: 0, allowed: 0, totalMs: 0 };

  constructor(db: SecurityDB, shield: NetworkShield) {
    this.db = db;
    this.shield = shield;
  }

  // Register with the dispatcher — called during initialization
  registerWith(dispatcher: RequestDispatcher): void {

    dispatcher.registerBeforeRequest({
      name: 'Guardian',
      priority: 1,  // Runs FIRST — before NetworkInspector (100)
      handler: (details) => {
        return this.checkRequest(details);
      }
    });

    dispatcher.registerBeforeSendHeaders({
      name: 'Guardian',
      priority: 20,  // After StealthManager (10), before NetworkInspector
      handler: (details, headers) => {
        return this.checkHeaders(details, headers);
      }
    });

    dispatcher.registerHeadersReceived({
      name: 'Guardian',
      priority: 20,  // After CookieFix (10)
      handler: (details, responseHeaders) => {
        this.analyzeResponseHeaders(details, responseHeaders);
        return responseHeaders; // Passthrough — Guardian analyzes but doesn't modify
      }
    });
  }

  // === Request checking (synchronous, <5ms target) ===

  private checkRequest(details: Electron.OnBeforeRequestListenerDetails): { cancel: boolean } | null {
    this.stats.total++;
    const start = performance.now();

    try {
      const url = details.url;

      // Skip internal URLs
      if (url.startsWith('devtools://') || url.startsWith('chrome://') || url.startsWith('file://')) {
        return null;
      }

      // 1. Blocklist check (instant — Set lookup)
      const blockResult = this.shield.checkUrl(url);
      if (blockResult.blocked) {
        this.stats.blocked++;
        this.db.logEvent({
          timestamp: Date.now(),
          domain: this.extractDomain(url),
          tabId: null,
          eventType: 'blocked',
          severity: 'high',
          category: 'network',
          details: JSON.stringify({ url, reason: blockResult.reason, source: blockResult.source }),
          actionTaken: 'auto_block',
        });
        return { cancel: true };
      }

      // 2. Domain trust + mode check
      const domain = this.extractDomain(url);
      if (domain) {
        const info = this.db.getDomainInfo(domain);
        const mode = info?.guardianMode || this.getModeForDomain(domain);

        // Auto-detect banking/login domains → strict mode
        if (!info && this.isBankingDomain(domain)) {
          this.db.upsertDomain(domain, { guardianMode: 'strict' });
        }

        // Track domain visit
        this.db.upsertDomain(domain, { lastSeen: Date.now() });
      }

      // 3. Download safety check
      if (details.resourceType === 'download') {
        // Check file extension against dangerous list
        // .exe, .scr, .bat, .cmd, .ps1, .vbs, .js (as download)
        // In strict mode: block. In balanced: warn. In permissive: allow.
      }

      this.stats.allowed++;
      return null; // Allow

    } finally {
      this.stats.totalMs += performance.now() - start;
    }
  }

  // === Header analysis ===

  private checkHeaders(details: Electron.OnBeforeSendHeadersListenerDetails, headers: Record<string, string>): Record<string, string> {
    const mode = this.getModeForDomain(this.extractDomain(details.url) || '');

    if (mode === 'strict') {
      // Strip tracking headers
      delete headers['X-Requested-With'];
      // Strip referer to different domains (prevent referer leak)
      // Keep referer for same-origin requests
    }

    return headers;
  }

  private analyzeResponseHeaders(details: Electron.OnHeadersReceivedListenerDetails, responseHeaders: Record<string, string[]>): void {
    // Log missing security headers on important pages
    // Check: X-Frame-Options, Content-Security-Policy, Strict-Transport-Security
    // Flag third-party Set-Cookie in strict mode
  }

  // === Public API ===

  getStatus(): GuardianStatus { ... }
  setMode(domain: string, mode: GuardianMode): void { ... }
  getRecentDecisions(limit: number): GuardianDecision[] { ... }

  // === Helpers ===

  private extractDomain(url: string): string | null { ... }
  private isBankingDomain(domain: string): boolean {
    return BANKING_PATTERNS.some(p => p.test(domain));
  }
  private getModeForDomain(domain: string): GuardianMode {
    const info = this.db.getDomainInfo(domain);
    return info?.guardianMode || this.defaultMode;
  }
}
```

### 5. `src/security/security-manager.ts` — Orchestrator

```typescript
class SecurityManager {
  private db: SecurityDB;
  private shield: NetworkShield;
  private guardian: Guardian;

  constructor() {
    this.db = new SecurityDB();
    this.shield = new NetworkShield(this.db);
    this.guardian = new Guardian(this.db, this.shield);
  }

  // Register Guardian with the request dispatcher
  registerWith(dispatcher: RequestDispatcher): void {
    this.guardian.registerWith(dispatcher);
  }

  // Register API routes on Express server
  registerRoutes(app: express.Application): void {
    // GET  /security/status
    app.get('/security/status', (req, res) => {
      res.json({
        guardian: this.guardian.getStatus(),
        blocklist: this.shield.getStats(),
        database: { /* event counts, domain counts */ }
      });
    });

    // GET  /security/guardian/status
    // POST /security/guardian/mode   — body: { domain, mode }
    // GET  /security/events          — query: ?limit=50&severity=high
    // GET  /security/domains         — query: ?limit=50
    // GET  /security/domains/:domain
    // POST /security/domains/:domain/trust — body: { trust: 80 }
    // GET  /security/blocklist/stats
    // POST /security/blocklist/check — body: { url: "https://..." }
  }

  // Cleanup
  destroy(): void {
    this.db.close();
  }
}
```

### 6. Integration in `src/main.ts`

Add SecurityManager initialization to the existing flow:

```typescript
// In startAPI() or createWindow(), BEFORE dispatcher.attach():

import { SecurityManager } from '../security/security-manager';

const securityManager = new SecurityManager();
securityManager.registerWith(dispatcher);

// dispatcher.attach() now includes Guardian consumers

// Pass to TandemAPI for route registration:
const api = new TandemAPI({
  // ... existing options
  securityManager,
});

// In TandemAPI constructor or setupRoutes():
securityManager.registerRoutes(this.app);

// In app.on('will-quit'):
securityManager.destroy();
```

### 7. Download Initial Blocklists

Blocklist files go in `~/.tandem/security/blocklists/` — NOT in the source tree.

```bash
mkdir -p ~/.tandem/security/blocklists

# URLhaus (malware URLs — extract domains)
curl -o ~/.tandem/security/blocklists/urlhaus.txt \
  "https://urlhaus.abuse.ch/downloads/text_online/"

# Phishing domains (community maintained, no API key needed)
curl -o ~/.tandem/security/blocklists/phishing.txt \
  "https://raw.githubusercontent.com/mitchellkrogza/Phishing.Database/master/phishing-domains-ACTIVE.txt"

# Steven Black hosts (ads + malware + fakenews)
curl -o ~/.tandem/security/blocklists/hosts.txt \
  "https://raw.githubusercontent.com/StevenBlack/hosts/master/hosts"
```

> **Note:** These files can be large (Steven Black = ~70K entries, ~10MB). The in-memory Set will use ~10-20MB. This is fine for a desktop app. These files are NOT committed to git — they live in the user data directory and are refreshed by the updater (Phase 5).

**Add `blocklists/data/` to `.gitignore`** (in case anyone accidentally puts them in src):
```
src/security/blocklists/data/
```

## Verification Checklist

After Phase 1 is complete, verify:

- [ ] `~/.tandem/security/shield.db` exists with correct schema (check with `sqlite3` CLI)
- [ ] `GET /security/status` returns guardian status + blocklist stats
- [ ] `POST /security/blocklist/check` with `{"url":"http://malware.testing.google.test/testing/malware/"}` returns blocked info
- [ ] Navigate to a blocklisted domain → request is blocked (page doesn't load or shows error)
- [ ] Navigate to google.com, github.com, reddit.com → works perfectly (no breakage)
- [ ] `GET /security/events` shows blocked requests with timestamps and details
- [ ] `GET /security/domains` shows visited domains with trust levels
- [ ] `POST /security/guardian/mode` with `{"domain":"example.com","mode":"strict"}` works
- [ ] Banking domains (paypal.com, bank.com) auto-elevated to strict mode
- [ ] NetworkInspector still works (`GET /network/log` returns entries)
- [ ] Stealth headers still applied (no Electron fingerprints)
- [ ] Guardian decision time < 5ms (check dispatcher performance warnings in console)
- [ ] No performance degradation on normal browsing
- [ ] `npm start` twice → no issues (DB handles concurrent access via WAL mode)

## What NOT to Change

- Do NOT modify `src/network/dispatcher.ts` (Phase 0 deliverable — it's stable)
- Do NOT modify DevToolsManager — that's Phase 3
- Do NOT add outbound POST checking — that's Phase 2
- Keep all security code in `src/security/`

## Commit Convention

```
git add src/security/ src/main.ts src/api/server.ts
git commit -m "feat(security): Phase 1 — Security Core

- Add SecurityDB (SQLite) with domains, events, blocklist tables
- Add NetworkShield blocklist engine (URLhaus, PhishTank, Steven Black)
- Add Guardian interceptor via RequestDispatcher (priority 1)
- Add SecurityManager with 9 REST API endpoints under /security/*
- Auto-detect banking/login domains for strict mode
- Log all block decisions to events table

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
git push origin main
```

## Scope (1 Claude Code session)

- Types + interfaces
- SecurityDB (SQLite schema, CRUD, prepared statements)
- NetworkShield (blocklist parsing, in-memory Set)
- Guardian (dispatcher consumer, request checking)
- SecurityManager (orchestrator, 9 API routes)
- Integration in main.ts + blocklist download + verification
