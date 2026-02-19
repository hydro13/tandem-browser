# Phase 5: Evolution Engine + Security Agent Fleet

## Goal

Make the system learn and evolve. Build baseline profiles per domain, detect zero-day anomalies, and deploy autonomous security agents that monitor continuously.

## Prerequisites

- **Phase 0-4 MUST be completed and verified** — check `docs/security-shield/STATUS.md`
- Security database populated with real browsing data (use the app for a few days after Phase 4)
- Read Phase 4 STATUS notes — check Gatekeeper WebSocket status and any issues

## Deliverables

### 1. `src/security/evolution.ts` — Baseline Learning

```typescript
class EvolutionEngine {
  private db: SecurityDB;

  constructor(db: SecurityDB) {
    this.db = db;
  }

  // Called after every page load — build/update baseline
  async updateBaseline(domain: string, metrics: PageMetrics): void {
    // Metrics to track per domain:
    // - script_count: how many scripts load
    // - external_domain_count: how many external domains contacted
    // - form_count: how many forms on page
    // - cookie_count: how many cookies set
    // - request_count: total requests per page load
    // - resource_size_total: total bytes loaded

    // Rolling average with tolerance:
    // After N visits (configurable, default 5), baseline is established
    // Tolerance = stddev * 2 (catches 95% of normal variation)
    // New visit: if metric > baseline + tolerance → ANOMALY

    for (const [metric, value] of Object.entries(metrics)) {
      const existing = this.db.getBaseline(domain, metric);

      if (!existing) {
        // First observation — create baseline
        this.db.upsertBaseline(domain, metric, value, value * 0.3, 1);
      } else {
        // Update rolling average
        const newCount = existing.sampleCount + 1;
        const newAvg = existing.expectedValue + (value - existing.expectedValue) / newCount;

        // Calculate running standard deviation
        const variance = ((newCount - 1) * (existing.tolerance / 2) ** 2 + (value - newAvg) ** 2) / newCount;
        const newTolerance = Math.sqrt(variance) * 2; // 2 sigma

        this.db.upsertBaseline(domain, metric, newAvg, Math.max(newTolerance, 1), newCount);
      }
    }
  }

  // Check current page against baseline
  async checkForAnomalies(domain: string, metrics: PageMetrics): Anomaly[] {
    const anomalies: Anomaly[] = [];

    for (const [metric, value] of Object.entries(metrics)) {
      const baseline = this.db.getBaseline(domain, metric);
      if (!baseline || baseline.sampleCount < 5) continue; // Not enough data

      const deviation = Math.abs(value - baseline.expectedValue);
      if (deviation > baseline.tolerance) {
        const severity = this.calculateSeverity(deviation, baseline.tolerance);
        anomalies.push({
          domain,
          metric,
          expected: baseline.expectedValue,
          actual: value,
          deviation,
          tolerance: baseline.tolerance,
          severity,
        });
      }
    }

    // Multiple anomalies on same page = escalate severity
    if (anomalies.length >= 3) {
      this.reportZeroDay(domain, anomalies);
    }

    return anomalies;
  }

  // Zero-day candidate management
  async reportZeroDay(domain: string, anomalies: Anomaly[]): void {
    this.db.insertZeroDayCandidate({
      detectedAt: Date.now(),
      domain,
      anomalyType: anomalies.map(a => a.metric).join(', '),
      baselineDeviation: Math.max(...anomalies.map(a => a.deviation / a.tolerance)),
      details: JSON.stringify(anomalies),
    });

    // High-trust domain (banking) → immediate escalation to Gatekeeper
    const info = this.db.getDomainInfo(domain);
    if (info && info.trustLevel >= 70) {
      // Send to Gatekeeper WebSocket as critical anomaly
    }
  }

  // Trust score evolution
  async evolveTrust(domain: string, event: 'clean_visit' | 'anomaly' | 'blocked' | 'blocklist_hit'): void {
    const info = this.db.getDomainInfo(domain);
    if (!info) return;

    let newTrust = info.trustLevel;

    switch (event) {
      case 'clean_visit':
        // Trust goes UP slowly: +1 per clean visit, max +5 per day
        newTrust = Math.min(90, newTrust + 1); // Never above 90 without explicit user action
        break;
      case 'anomaly':
        // Trust goes DOWN fast: -10 per anomaly
        newTrust = Math.max(0, newTrust - 10);
        break;
      case 'blocked':
        // Trust goes DOWN fast: -15 per blocked request originating from domain
        newTrust = Math.max(0, newTrust - 15);
        break;
      case 'blocklist_hit':
        // Trust goes to ZERO immediately
        newTrust = 0;
        break;
    }

    if (newTrust !== info.trustLevel) {
      this.db.upsertDomain(domain, { trustLevel: newTrust });
      this.db.logEvent({
        timestamp: Date.now(),
        domain,
        tabId: null,
        eventType: 'info',
        severity: 'info',
        category: 'behavior',
        details: JSON.stringify({
          event,
          oldTrust: info.trustLevel,
          newTrust,
        }),
        actionTaken: 'logged',
      });
    }
  }
}
```

### 2. `src/security/threat-intel.ts` — Intelligence Layer

```typescript
class ThreatIntel {
  private db: SecurityDB;
  private evolution: EvolutionEngine;

  constructor(db: SecurityDB, evolution: EvolutionEngine) {
    this.db = db;
    this.evolution = evolution;
  }

  // Generate security report
  async generateReport(period: 'day' | 'week' | 'month'): Promise<SecurityReport> {
    const since = this.getPeriodStart(period);

    return {
      period,
      generatedAt: Date.now(),
      totalRequests: this.db.countEvents(since),
      blockedRequests: this.db.countEvents(since, 'blocked'),
      flaggedRequests: this.db.countEvents(since, 'flagged'),
      anomaliesDetected: this.db.countEvents(since, 'anomaly'),
      zeroDayCandidates: this.db.getZeroDayCandidates(since),
      trustChanges: this.db.getTrustChanges(since),
      topBlockedDomains: this.db.getTopBlockedDomains(since, 10),
      newDomainsVisited: this.db.getNewDomains(since),
      recommendations: this.generateRecommendations(since),
    };
  }

  // Correlation engine — look for patterns across events
  correlateEvents(timeWindowMs: number): CorrelatedThreat[] {
    const recentEvents = this.db.getRecentEvents(500, 'medium');
    const threats: CorrelatedThreat[] = [];

    // Group by source domain — multiple blocks from same source = campaign
    // Group by time — events clustering in short windows = coordinated
    // Check for supply chain patterns — same CDN script changing across multiple sites

    return threats;
  }

  private generateRecommendations(since: number): string[] {
    const recommendations: string[] = [];

    // Check for domains with dropping trust
    // Check for unresolved zero-day candidates
    // Check for frequently flagged but not blocked domains
    // Suggest mode changes based on activity

    return recommendations;
  }
}
```

### 3. `src/security/blocklists/updater.ts` — Auto-Update

```typescript
import https from 'https';
import fs from 'fs';
import path from 'path';

class BlocklistUpdater {
  private db: SecurityDB;
  private shield: NetworkShield;
  private dataDir: string;

  constructor(db: SecurityDB, shield: NetworkShield) {
    this.db = db;
    this.shield = shield;
    this.dataDir = path.join(os.homedir(), '.tandem', 'security', 'blocklists');
  }

  async update(): Promise<UpdateResult> {
    const results: UpdateResult = { sources: [], totalAdded: 0, totalRemoved: 0, errors: [] };

    // Download each source
    const sources = [
      {
        name: 'urlhaus',
        url: 'https://urlhaus.abuse.ch/downloads/text_online/',
        parser: this.parseURLList,
        category: 'malware',
      },
      {
        name: 'phishing',
        url: 'https://raw.githubusercontent.com/mitchellkrogza/Phishing.Database/master/phishing-domains-ACTIVE.txt',
        parser: this.parseDomainList,
        category: 'phishing',
      },
      {
        name: 'stevenblack',
        url: 'https://raw.githubusercontent.com/StevenBlack/hosts/master/hosts',
        parser: this.parseHostsFile,
        category: 'tracker',
      },
    ];

    for (const source of sources) {
      try {
        const content = await this.download(source.url);
        const filePath = path.join(this.dataDir, `${source.name}.txt`);
        fs.writeFileSync(filePath, content);

        const domains = source.parser(content);
        // Update DB: add new, mark expired
        const added = this.db.syncBlocklistSource(source.name, domains, source.category);
        results.sources.push({ name: source.name, domains: domains.length, added });
        results.totalAdded += added;
      } catch (err) {
        results.errors.push(`${source.name}: ${err.message}`);
      }
    }

    // Reload in-memory blocklist
    this.shield.reload();

    return results;
  }

  private download(url: string): Promise<string> {
    // Simple HTTPS GET with timeout
    // Return response body as string
  }

  private parseHostsFile(content: string): string[] {
    // Parse "0.0.0.0 domain.com" format
    // Skip comments (#) and localhost entries
  }

  private parseDomainList(content: string): string[] {
    // One domain per line, skip empty lines and comments
  }

  private parseURLList(content: string): string[] {
    // Full URLs — extract hostname
    // Skip comments
  }
}
```

### 4. Integrate Evolution with Existing Modules

Wire EvolutionEngine into the existing flow.

**Integration point:** In `src/main.ts` there is an IPC handler for `'activity-webview-event'` that processes `did-finish-load` events (~line 432). This is where site memory and history are updated. SecurityManager's `onPageLoaded()` must be hooked into this same handler:

```typescript
// In main.ts, inside the 'activity-webview-event' IPC handler:
// case 'did-finish-load':
//   ... existing site memory + history logic ...
//   securityManager?.onPageLoaded(domain, webContents);
```

```typescript
// In SecurityManager:

// After page load (triggered by did-finish-load via IPC):
async onPageLoaded(domain: string, webContents: Electron.WebContents): Promise<void> {
  // 1. Run content analysis (Phase 3)
  const analysis = await this.contentAnalyzer.analyzePage();

  // 2. Extract metrics for baseline
  const metrics: PageMetrics = {
    script_count: analysis.scripts.length,
    external_domain_count: analysis.externalDomains.length,
    form_count: analysis.forms.length,
    // ... etc
  };

  // 3. Check for anomalies against baseline
  const anomalies = await this.evolution.checkForAnomalies(domain, metrics);
  if (anomalies.length > 0) {
    // Send to Gatekeeper if connected
    for (const anomaly of anomalies) {
      this.gatekeeperWs?.sendAnomaly(anomaly);
    }
    // Evolve trust down
    await this.evolution.evolveTrust(domain, 'anomaly');
  } else {
    // Clean visit — evolve trust up
    await this.evolution.evolveTrust(domain, 'clean_visit');
  }

  // 4. Update baseline with new data
  await this.evolution.updateBaseline(domain, metrics);
}
```

### 5. Security Agent Fleet (OpenClaw Cron Jobs)

#### Sentinel Agent (every 5 minutes)

> **Note:** This agent uses REST endpoints, not WebSocket. It complements the Gatekeeper (which uses WebSocket for real-time). The Sentinel handles periodic patrol tasks that don't need real-time response.

```json
{
  "name": "Tandem Sentinel",
  "schedule": {"kind": "every", "everyMs": 300000},
  "sessionTarget": "isolated",
  "payload": {
    "kind": "agentTurn",
    "message": "Security patrol: GET http://127.0.0.1:8765/security/status and /security/gatekeeper/queue. If there are pending decisions, analyze and submit via POST /security/gatekeeper/decide. Check /security/events?severity=high for recent high-severity events. If critical issues found, alert immediately.",
    "model": "sonnet"
  },
  "delivery": {"mode": "announce"}
}
```

#### Scanner Agent (every 2 hours)

```json
{
  "name": "Tandem Scanner",
  "schedule": {"kind": "every", "everyMs": 7200000},
  "sessionTarget": "isolated",
  "payload": {
    "kind": "agentTurn",
    "message": "Deep security scan: GET http://127.0.0.1:8765/tabs/list for open tabs. For each tab, GET /security/page/analysis. Check for anomalies vs baselines via GET /security/baselines/:domain. Report any zero-day candidates or suspicious changes.",
    "model": "sonnet"
  },
  "delivery": {"mode": "announce"}
}
```

#### Updater Agent (daily at 06:00)

```json
{
  "name": "Tandem Security Updater",
  "schedule": {"kind": "cron", "expr": "0 6 * * *", "tz": "Europe/Brussels"},
  "sessionTarget": "isolated",
  "payload": {
    "kind": "agentTurn",
    "message": "Daily security maintenance: 1) Update blocklists via POST /security/blocklist/update. 2) GET /security/report?period=day for yesterday's report. 3) Review zero-day candidates via GET /security/zero-days. 4) Prune events older than 90 days via POST /security/maintenance/prune. Report summary.",
    "model": "sonnet"
  },
  "delivery": {"mode": "announce"}
}
```

#### Incident Agent (spawned on-demand)

Not a cron job — spawned by Sentinel or Gatekeeper when critical event occurs.
Uses Opus model for deep analysis and forensic investigation.

### 6. New API Endpoints

```typescript
// GET  /security/baselines/:domain    — Baseline metrics for a domain
// GET  /security/anomalies            — Recent anomalies
// GET  /security/zero-days            — Open zero-day candidates
// POST /security/zero-days/:id/resolve — Mark resolved (with notes)
// GET  /security/report               — Security report (query: ?period=day|week|month)
// POST /security/blocklist/update     — Trigger blocklist update
// GET  /security/trust/changes        — Recent trust score changes
// POST /security/maintenance/prune    — Prune old events (>90 days)
```

## Verification Checklist

- [ ] Baselines build after 5+ visits to a site (check via `/security/baselines/:domain`)
- [ ] Anomaly detected when site loads significantly more scripts than baseline
- [ ] Trust scores evolve correctly (up by +1 per clean visit, down by -10/-15 per anomaly/block)
- [ ] Trust never exceeds 90 without explicit user action
- [ ] Zero-day candidates logged when 3+ anomalies on single site
- [ ] `GET /security/report?period=day` generates with accurate stats
- [ ] `POST /security/blocklist/update` downloads and parses all sources
- [ ] NetworkShield reloads after blocklist update (new entries active)
- [ ] Event correlation detects patterns (same domain, time clustering)
- [ ] `POST /security/maintenance/prune` removes old events
- [ ] Sentinel agent can connect and process pending decisions (test manually)
- [ ] Phase 0-4 regression check: all previous features still work

## What NOT to Change

- Do NOT modify the RequestDispatcher
- Do NOT modify DevToolsManager (Phase 3 subscriber system is stable)
- Do NOT modify the Gatekeeper WebSocket protocol — extend it if needed

## Commit Convention

```bash
git add src/security/evolution.ts src/security/threat-intel.ts src/security/blocklists/updater.ts src/security/security-manager.ts src/security/types.ts
git commit -m "feat(security): Phase 5 — Evolution Engine + Agent Fleet

- Add EvolutionEngine with rolling baseline learning per domain
- Add anomaly detection with 2-sigma tolerance
- Add asymmetric trust evolution (up slow, down fast)
- Add zero-day candidate tracking and escalation
- Add ThreatIntel with report generation and event correlation
- Add BlocklistUpdater for automated blocklist refresh
- Add /security/baselines/*, /security/anomalies, /security/report endpoints
- Define Sentinel, Scanner, Updater agent cron specs for OpenClaw

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
git push origin main
```

## Scope (1 Claude Code session)

- EvolutionEngine (baseline learning, anomaly detection, trust evolution)
- ThreatIntel (report generation, event correlation)
- BlocklistUpdater (auto-update from 3 sources)
- Integration with existing modules (SecurityManager.onPageLoaded, main.ts hook)
- Agent definitions (Sentinel, Scanner, Updater cron specs)
- 8 API endpoints + verification

## Status Update Template

After completing this phase, update `docs/security-shield/STATUS.md`:

```markdown
## Phase 5: Evolution Engine + Agent Fleet
- **Status:** COMPLETED
- **Date:** YYYY-MM-DD
- **Commit:** <hash>
- **Verification:**
  - [x] Baselines build correctly
  - [x] Anomaly detection works
  - [x] Trust evolution correct (asymmetric)
  - [x] Zero-day candidate logging
  - [x] Report generation works
  - [x] Blocklist auto-update works
  - [x] Event pruning works
  - [x] Phase 0-4 regression OK
- **Issues encountered:** (none / describe)
- **Agent fleet status:**
  - Sentinel: (configured / not yet)
  - Scanner: (configured / not yet)
  - Updater: (configured / not yet)
- **Post-implementation notes:** (observations, recommended improvements)
```
