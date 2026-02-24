import express from 'express';
import { Server as HttpServer } from 'http';
import { Session } from 'electron';
import { RequestDispatcher } from '../network/dispatcher';
import { DevToolsManager } from '../devtools/manager';
import { SecurityDB } from './security-db';
import { NetworkShield } from './network-shield';
import { Guardian } from './guardian';
import { OutboundGuard } from './outbound-guard';
import { ScriptGuard } from './script-guard';
import { ContentAnalyzer } from './content-analyzer';
import { BehaviorMonitor } from './behavior-monitor';
import { GatekeeperWebSocket } from './gatekeeper-ws';
import { EvolutionEngine } from './evolution';
import { ThreatIntel } from './threat-intel';
import { BlocklistUpdater } from './blocklists/updater';
import { GuardianMode, GatekeeperAction, PageMetrics, AnalysisConfidence } from './types';

export class SecurityManager {
  private db: SecurityDB;
  private shield: NetworkShield;
  private guardian: Guardian;
  private outboundGuard: OutboundGuard;

  // Phase 3: Script & Content Guard (initialized lazily via setDevToolsManager)
  private scriptGuard: ScriptGuard | null = null;
  private contentAnalyzer: ContentAnalyzer | null = null;
  private behaviorMonitor: BehaviorMonitor | null = null;
  private devToolsManager: DevToolsManager | null = null;

  // Phase 4: AI Gatekeeper Agent (initialized lazily via initGatekeeper)
  private gatekeeperWs: GatekeeperWebSocket | null = null;

  // Phase 5: Evolution Engine + Agent Fleet
  private evolution: EvolutionEngine;
  private threatIntel: ThreatIntel;
  private blocklistUpdater: BlocklistUpdater;

  // Phase 0-B: Auto-correlation trigger
  private eventCounter: number = 0;
  private correlationRunning: boolean = false;
  private correlationInterval: ReturnType<typeof setInterval> | null = null;

  // Phase 0-B: Blocklist update scheduling
  private blocklistInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.db = new SecurityDB();
    this.shield = new NetworkShield(this.db);
    this.outboundGuard = new OutboundGuard(this.db);
    this.guardian = new Guardian(this.db, this.shield, this.outboundGuard);
    this.evolution = new EvolutionEngine(this.db);
    this.threatIntel = new ThreatIntel(this.db, this.evolution);
    this.blocklistUpdater = new BlocklistUpdater(this.db, this.shield);

    // Phase 0-B: Auto-trigger correlateEvents() every 100 events or every hour
    this.db.onEventLogged = () => {
      this.eventCounter++;
      if (this.eventCounter >= 100) {
        this.eventCounter = 0;
        this.runCorrelation();
      }
    };
    this.correlationInterval = setInterval(() => this.runCorrelation(), 3_600_000); // 1 hour

    // Phase 0-B: Blocklist update scheduling (24-hour cycle)
    this.scheduleBlocklistUpdate();

    console.log('[SecurityManager] Initialized (Phase 1-5)');
  }

  registerWith(dispatcher: RequestDispatcher): void {
    this.guardian.registerWith(dispatcher);
  }

  /**
   * Set the DevToolsManager reference and initialize Phase 3 modules.
   * Called after DevToolsManager is created (it's created after SecurityManager in main.ts).
   */
  setDevToolsManager(devToolsManager: DevToolsManager): void {
    this.devToolsManager = devToolsManager;
    this.scriptGuard = new ScriptGuard(this.db, this.guardian, devToolsManager);
    // Phase 3-A: Wire blocklist check for cross-domain script correlation
    this.scriptGuard.isDomainBlocked = (domain: string) => this.shield.checkDomain(domain).blocked;
    this.contentAnalyzer = new ContentAnalyzer(this.db, devToolsManager);
    // Phase 4: Wire blocklist check for deep page source scanning
    this.contentAnalyzer.isDomainBlocked = (domain: string) => this.shield.checkDomain(domain).blocked;
    this.behaviorMonitor = new BehaviorMonitor(this.db, this.guardian, devToolsManager);
    this.behaviorMonitor.setScriptGuard(this.scriptGuard);
    console.log('[SecurityManager] Phase 3 modules initialized (ScriptGuard, ContentAnalyzer, BehaviorMonitor)');
  }

  /**
   * Setup permission handler on the session.
   * Must be called after setDevToolsManager and before pages load.
   */
  setupPermissionHandler(session: Session): void {
    if (this.behaviorMonitor) {
      this.behaviorMonitor.setupPermissionHandler(session);
    }
  }

  /**
   * Called when a tab is attached/focused in DevToolsManager.
   * Enables security CDP domains, injects monitors, starts resource monitoring.
   */
  async onTabAttached(): Promise<void> {
    if (!this.devToolsManager) return;

    // Reset per-tab state
    this.scriptGuard?.reset();
    this.behaviorMonitor?.reset();

    try {
      // Enable Debugger domain for scriptParsed events
      await this.devToolsManager.enableSecurityDomains();

      // Inject security monitors (keylogger, crypto miner, clipboard, form hijack)
      await this.scriptGuard?.injectMonitors();

      // Start CPU/memory monitoring
      this.behaviorMonitor?.startResourceMonitoring();
    } catch (e: any) {
      console.warn('[SecurityManager] onTabAttached error:', e.message);
    }
  }

  /**
   * Initialize the Gatekeeper WebSocket server on the existing HTTP server.
   * Must be called after the Express server has started listening.
   */
  initGatekeeper(httpServer: HttpServer): void {
    this.gatekeeperWs = new GatekeeperWebSocket(httpServer, this.guardian, this.db);
    this.guardian.setGatekeeper(this.gatekeeperWs);

    // Wire ScriptGuard critical detections to Gatekeeper (Phase 2-B)
    if (this.scriptGuard) {
      this.scriptGuard.onCriticalDetection = (domain, analysis) => {
        this.gatekeeperWs?.sendAnomaly({
          domain,
          metric: 'script_threat_score',
          expected: 0,
          actual: analysis.totalScore,
          severity: analysis.severity,
        });
      };
    }

    console.log('[SecurityManager] Phase 4: GatekeeperWebSocket initialized');
  }

  /**
   * Called after page load (triggered by did-finish-load via IPC in main.ts).
   * Runs content analysis → metrics extraction → anomaly detection → trust evolution → baseline update.
   */
  async onPageLoaded(domain: string): Promise<void> {
    if (!domain || !this.contentAnalyzer) return;

    try {
      // 1. Run content analysis (Phase 3)
      const analysis = await this.contentAnalyzer.analyzePage();

      // 2. Extract metrics for baseline
      const cookieCount = this.guardian.getCookieCount(domain);
      const metrics: PageMetrics = {
        script_count: analysis.scripts.length,
        external_domain_count: new Set(analysis.scripts.filter(s => s.isExternal).map(s => s.domain).filter(Boolean)).size,
        form_count: analysis.forms.length,
        cookie_count: cookieCount,
        request_count: analysis.scripts.length + analysis.trackers.length,
        resource_size_total: analysis.scripts.reduce((sum, s) => sum + (s.size || 0), 0),
      };
      // Reset accumulator after reading
      this.guardian.resetCookieCount(domain);

      // 3. Check for anomalies against baseline
      const anomalies = this.evolution.checkForAnomalies(domain, metrics);
      if (anomalies.length > 0) {
        // Send to Gatekeeper if connected
        for (const anomaly of anomalies) {
          this.gatekeeperWs?.sendAnomaly({
            domain: anomaly.domain,
            metric: anomaly.metric,
            expected: anomaly.expected,
            actual: anomaly.actual,
            severity: anomaly.severity,
          });
        }

        // Log anomaly events
        this.db.logEvent({
          timestamp: Date.now(),
          domain,
          tabId: null,
          eventType: 'anomaly',
          severity: anomalies.some(a => a.severity === 'critical' || a.severity === 'high') ? 'high' : 'medium',
          category: 'behavior',
          details: JSON.stringify({
            anomalyCount: anomalies.length,
            metrics: anomalies.map(a => ({
              metric: a.metric,
              expected: a.expected,
              actual: a.actual,
              deviation: a.deviation,
            })),
          }),
          actionTaken: 'flagged',
          confidence: AnalysisConfidence.ANOMALY,
        });

        // Evolve trust down (weighted by anomaly confidence)
        this.evolution.evolveTrust(domain, 'anomaly', AnalysisConfidence.ANOMALY);
      } else {
        // Clean visit — evolve trust up
        this.evolution.evolveTrust(domain, 'clean_visit');
      }

      // 4. Update baseline with new data
      this.evolution.updateBaseline(domain, metrics);
    } catch (e: any) {
      console.warn('[SecurityManager] onPageLoaded error:', e.message);
    }
  }

  /**
   * Run event correlation and log any detected threats.
   */
  private runCorrelation(): void {
    if (this.correlationRunning) return;
    this.correlationRunning = true;
    try {
      const threats = this.threatIntel.correlateEvents();
      if (threats.length > 0) {
        console.log(`[SecurityManager] Correlation found ${threats.length} threat(s)`);
        for (const threat of threats) {
          this.db.logEvent({
            timestamp: Date.now(),
            domain: threat.domains[0] || null,
            tabId: null,
            eventType: 'correlation',
            severity: threat.severity,
            category: 'behavior',
            details: JSON.stringify({
              type: threat.type,
              domains: threat.domains,
              eventCount: threat.eventCount,
              description: threat.description,
            }),
            actionTaken: 'logged',
            confidence: AnalysisConfidence.HEURISTIC,
          });
        }
      }
    } catch (e: any) {
      console.warn('[SecurityManager] Correlation error:', e.message);
    } finally {
      this.correlationRunning = false;
    }
  }

  /**
   * Check if blocklist update is overdue (>24h) and schedule recurring updates.
   */
  private scheduleBlocklistUpdate(): void {
    const TWENTY_FOUR_HOURS = 86_400_000;

    // Check if update is overdue
    const lastUpdated = this.db.getBlocklistMeta('lastUpdated');
    if (!lastUpdated || (Date.now() - new Date(lastUpdated).getTime()) > TWENTY_FOUR_HOURS) {
      // Run asynchronously — don't block constructor
      this.runBlocklistUpdate();
    }

    // Schedule recurring updates every 24 hours
    this.blocklistInterval = setInterval(() => this.runBlocklistUpdate(), TWENTY_FOUR_HOURS);
  }

  /**
   * Run blocklist update and persist lastUpdated timestamp on success.
   */
  private async runBlocklistUpdate(): Promise<void> {
    try {
      console.log('[SecurityManager] Running scheduled blocklist update...');
      const result = await this.blocklistUpdater.update();
      this.db.setBlocklistMeta('lastUpdated', new Date().toISOString());
      console.log(`[SecurityManager] Blocklist update complete: ${result.totalAdded} entries, ${result.errors.length} errors`);
    } catch (e: any) {
      console.warn('[SecurityManager] Blocklist update failed:', e.message);
    }
  }

  registerRoutes(app: express.Application): void {
    // === Phase 1 routes (1-9) ===

    // 1. GET /security/status — Overall security status + stats
    app.get('/security/status', (_req, res) => {
      try {
        res.json({
          guardian: this.guardian.getStatus(),
          blocklist: this.shield.getStats(),
          outbound: this.outboundGuard.getStats(),
          database: {
            events: this.db.getEventCount(),
            domains: this.db.getDomainCount(),
            scriptFingerprints: this.db.getScriptFingerprintCount(),
          },
          phase3: {
            scriptGuard: !!this.scriptGuard,
            contentAnalyzer: !!this.contentAnalyzer,
            behaviorMonitor: !!this.behaviorMonitor,
          },
        });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    // 2. GET /security/guardian/status — Guardian mode, blocks, passes
    app.get('/security/guardian/status', (_req, res) => {
      try {
        res.json(this.guardian.getStatus());
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    // 3. POST /security/guardian/mode — Set guardian mode per domain
    app.post('/security/guardian/mode', (req, res) => {
      try {
        const { domain, mode } = req.body;
        if (!domain || !mode) {
          res.status(400).json({ error: 'domain and mode required' });
          return;
        }
        const validModes: GuardianMode[] = ['strict', 'balanced', 'permissive'];
        if (!validModes.includes(mode)) {
          res.status(400).json({ error: `Invalid mode. Use: ${validModes.join(', ')}` });
          return;
        }
        this.guardian.setMode(domain, mode);
        res.json({ ok: true, domain, mode });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    // 4. GET /security/events — Recent security events (supports ?severity= and ?category=)
    app.get('/security/events', (req, res) => {
      try {
        const limit = parseInt(req.query.limit as string) || 50;
        const severity = req.query.severity as string | undefined;
        const category = req.query.category as string | undefined;
        const events = this.db.getRecentEvents(limit, severity, category);
        res.json({ events, total: events.length });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    // 5. GET /security/domains — All tracked domains with trust levels
    app.get('/security/domains', (req, res) => {
      try {
        const limit = parseInt(req.query.limit as string) || 100;
        const domains = this.db.getDomains(limit);
        res.json({ domains, total: domains.length });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    // 6. GET /security/domains/:domain — Domain reputation + details
    app.get('/security/domains/:domain', (req, res) => {
      try {
        const domain = req.params.domain;
        const info = this.db.getDomainInfo(domain);
        if (!info) {
          res.status(404).json({ error: 'Domain not found' });
          return;
        }
        const blockStatus = this.shield.checkDomain(domain);
        res.json({ ...info, blocked: blockStatus.blocked, blockReason: blockStatus.reason });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    // 7. POST /security/domains/:domain/trust — Manual trust adjustment
    app.post('/security/domains/:domain/trust', (req, res) => {
      try {
        const domain = req.params.domain;
        const { trust } = req.body;
        if (trust === undefined || typeof trust !== 'number' || trust < 0 || trust > 100) {
          res.status(400).json({ error: 'trust must be a number between 0 and 100' });
          return;
        }
        this.db.upsertDomain(domain, { trustLevel: trust });
        res.json({ ok: true, domain, trust });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    // 8. GET /security/blocklist/stats — Blocklist size + last update
    app.get('/security/blocklist/stats', (_req, res) => {
      try {
        const memoryStats = this.shield.getStats();
        const dbStats = this.db.getBlocklistStats();
        res.json({
          memory: memoryStats,
          database: dbStats,
        });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    // 9. POST /security/blocklist/check — Manual URL check
    app.post('/security/blocklist/check', (req, res) => {
      try {
        const { url } = req.body;
        if (!url) {
          res.status(400).json({ error: 'url required' });
          return;
        }
        const result = this.shield.checkUrl(url);
        res.json({ url, ...result });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    // === Phase 2: Outbound Data Guard routes (10-12) ===

    // 10. GET /security/outbound/stats — Outbound requests blocked/allowed/flagged
    app.get('/security/outbound/stats', (_req, res) => {
      try {
        res.json(this.outboundGuard.getStats());
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    // 11. GET /security/outbound/recent — Recent outbound events
    app.get('/security/outbound/recent', (req, res) => {
      try {
        const limit = parseInt(req.query.limit as string) || 50;
        const events = this.db.getRecentEvents(limit, undefined, 'outbound');
        res.json({ events, total: events.length });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    // 12. POST /security/outbound/whitelist — Whitelist a domain pair
    app.post('/security/outbound/whitelist', (req, res) => {
      try {
        const { origin, destination } = req.body;
        if (!origin || !destination) {
          res.status(400).json({ error: 'origin and destination domains required' });
          return;
        }
        this.db.addWhitelistPair(origin.toLowerCase(), destination.toLowerCase());
        res.json({ ok: true, origin: origin.toLowerCase(), destination: destination.toLowerCase() });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    // === Phase 3: Script & Content Guard routes (13-19) ===

    // 13. GET /security/page/analysis — Full page security analysis (async)
    app.get('/security/page/analysis', async (_req, res) => {
      try {
        if (!this.contentAnalyzer) {
          res.status(503).json({ error: 'ContentAnalyzer not initialized (DevToolsManager not connected)' });
          return;
        }
        const analysis = await this.contentAnalyzer.analyzePage();
        res.json(analysis);
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    // 14. GET /security/page/scripts — All loaded scripts + risk info
    app.get('/security/page/scripts', (_req, res) => {
      try {
        if (!this.scriptGuard) {
          res.status(503).json({ error: 'ScriptGuard not initialized' });
          return;
        }
        const scripts = Array.from(this.scriptGuard.getScriptsParsed().entries()).map(([id, info]) => ({
          scriptId: id,
          ...info,
        }));

        // Also get fingerprinted scripts from DB for current domain
        const wc = this.devToolsManager?.getAttachedWebContents();
        const currentUrl = wc ? wc.getURL() : '';
        let domain: string | null = null;
        try { domain = new URL(currentUrl).hostname.toLowerCase(); } catch {}

        const fingerprinted = domain ? this.db.getScriptsByDomain(domain) : [];

        res.json({
          sessionScripts: scripts,
          fingerprintedScripts: fingerprinted,
          totalFingerprints: this.db.getScriptFingerprintCount(),
        });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    // 15. GET /security/page/forms — All forms + credential risk assessment
    app.get('/security/page/forms', async (_req, res) => {
      try {
        if (!this.contentAnalyzer) {
          res.status(503).json({ error: 'ContentAnalyzer not initialized' });
          return;
        }
        const analysis = await this.contentAnalyzer.analyzePage();
        res.json({
          forms: analysis.forms,
          hasPasswordOnHttp: analysis.security.hasPasswordOnHttp,
          riskScore: analysis.riskScore,
        });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    // 16. GET /security/page/trackers — Tracker inventory
    app.get('/security/page/trackers', async (_req, res) => {
      try {
        if (!this.contentAnalyzer) {
          res.status(503).json({ error: 'ContentAnalyzer not initialized' });
          return;
        }
        const analysis = await this.contentAnalyzer.analyzePage();
        res.json({
          trackers: analysis.trackers,
          total: analysis.trackers.length,
        });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    // 17. GET /security/monitor/resources — Resource usage per tab
    app.get('/security/monitor/resources', (_req, res) => {
      try {
        if (!this.behaviorMonitor) {
          res.status(503).json({ error: 'BehaviorMonitor not initialized' });
          return;
        }
        const snapshots = this.behaviorMonitor.getResourceSnapshots();
        const wasmCount = this.scriptGuard?.getRecentWasmCount() || 0;
        res.json({
          snapshots,
          currentWasmActivity: wasmCount,
          snapshotCount: snapshots.length,
        });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    // 18. GET /security/monitor/permissions — All permission requests + status
    app.get('/security/monitor/permissions', (_req, res) => {
      try {
        if (!this.behaviorMonitor) {
          res.status(503).json({ error: 'BehaviorMonitor not initialized' });
          return;
        }
        const log = this.behaviorMonitor.getPermissionLog();
        res.json({
          permissions: log,
          total: log.length,
          blocked: log.filter(p => p.action === 'blocked').length,
          allowed: log.filter(p => p.action === 'allowed').length,
        });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    // 19. POST /security/monitor/kill — Kill a specific script/worker via CDP
    app.post('/security/monitor/kill', async (req, res) => {
      try {
        if (!this.behaviorMonitor) {
          res.status(503).json({ error: 'BehaviorMonitor not initialized' });
          return;
        }
        const { scriptId } = req.body;
        const success = await this.behaviorMonitor.killScript(scriptId || 'current');
        res.json({ ok: success, scriptId: scriptId || 'current' });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    // === Phase 4: AI Gatekeeper Agent routes (20-24) ===

    // 20. GET /security/gatekeeper/status — WebSocket connection status + queue
    app.get('/security/gatekeeper/status', (_req, res) => {
      try {
        if (!this.gatekeeperWs) {
          res.json({ connected: false, pendingDecisions: 0, totalDecisions: 0, lastAgentSeen: null, note: 'Gatekeeper not initialized' });
          return;
        }
        res.json(this.gatekeeperWs.getStatus());
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    // 21. GET /security/gatekeeper/queue — Pending decisions
    app.get('/security/gatekeeper/queue', (_req, res) => {
      try {
        if (!this.gatekeeperWs) {
          res.json({ queue: [], total: 0 });
          return;
        }
        const queue = this.gatekeeperWs.getQueue();
        res.json({ queue, total: queue.length });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    // 22. POST /security/gatekeeper/decide — Submit a decision via REST (fallback)
    app.post('/security/gatekeeper/decide', (req, res) => {
      try {
        if (!this.gatekeeperWs) {
          res.status(503).json({ error: 'Gatekeeper not initialized' });
          return;
        }
        const { id, action, reason, confidence } = req.body;
        if (!id || !action) {
          res.status(400).json({ error: 'id and action required' });
          return;
        }
        const validActions: GatekeeperAction[] = ['block', 'allow', 'monitor'];
        if (!validActions.includes(action)) {
          res.status(400).json({ error: `Invalid action. Use: ${validActions.join(', ')}` });
          return;
        }
        const found = this.gatekeeperWs.submitRestDecision(id, action, reason || '', confidence || 0);
        if (!found) {
          res.status(404).json({ error: 'Decision not found in pending queue' });
          return;
        }
        res.json({ ok: true, id, action });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    // 23. GET /security/gatekeeper/history — Decision history
    app.get('/security/gatekeeper/history', (req, res) => {
      try {
        if (!this.gatekeeperWs) {
          res.json({ history: [], total: 0 });
          return;
        }
        const limit = parseInt(req.query.limit as string) || 50;
        const history = this.gatekeeperWs.getHistory(limit);
        res.json({ history, total: history.length });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    // 24. GET /security/gatekeeper/secret — Auth secret for agent setup
    app.get('/security/gatekeeper/secret', (_req, res) => {
      try {
        if (!this.gatekeeperWs) {
          res.status(503).json({ error: 'Gatekeeper not initialized' });
          return;
        }
        res.json({ secret: this.gatekeeperWs.getSecret(), path: '~/.tandem/security/gatekeeper.secret' });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    // === Phase 5: Evolution Engine + Agent Fleet routes (25-32) ===

    // 25. GET /security/baselines/:domain — Baseline metrics for a domain
    app.get('/security/baselines/:domain', (req, res) => {
      try {
        const domain = req.params.domain;
        const baselines = this.db.getBaselinesByDomain(domain);
        res.json({ domain, baselines, total: baselines.length });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    // 26. GET /security/anomalies — Recent anomalies
    app.get('/security/anomalies', (req, res) => {
      try {
        const limit = parseInt(req.query.limit as string) || 50;
        const anomalies = this.db.getRecentAnomalies(limit);
        res.json({ anomalies, total: anomalies.length });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    // 27. GET /security/zero-days — Open zero-day candidates
    app.get('/security/zero-days', (_req, res) => {
      try {
        const candidates = this.db.getOpenZeroDayCandidates();
        res.json({ candidates, total: candidates.length });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    // 28. POST /security/zero-days/:id/resolve — Mark zero-day candidate as resolved
    app.post('/security/zero-days/:id/resolve', (req, res) => {
      try {
        const id = parseInt(req.params.id);
        if (isNaN(id)) {
          res.status(400).json({ error: 'Invalid id' });
          return;
        }
        const { resolution } = req.body;
        const success = this.db.resolveZeroDayCandidate(id, resolution || 'Resolved');
        if (!success) {
          res.status(404).json({ error: 'Zero-day candidate not found' });
          return;
        }
        res.json({ ok: true, id });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    // 29. GET /security/report — Security report (query: ?period=day|week|month)
    app.get('/security/report', (req, res) => {
      try {
        const period = (req.query.period as string) || 'day';
        const validPeriods = ['day', 'week', 'month'];
        if (!validPeriods.includes(period)) {
          res.status(400).json({ error: `Invalid period. Use: ${validPeriods.join(', ')}` });
          return;
        }
        const report = this.threatIntel.generateReport(period as 'day' | 'week' | 'month');
        res.json(report);
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    // 30. POST /security/blocklist/update — Trigger blocklist update
    app.post('/security/blocklist/update', async (_req, res) => {
      try {
        const result = await this.blocklistUpdater.update();
        res.json(result);
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    // 31. GET /security/trust/changes — Recent trust score changes
    app.get('/security/trust/changes', (req, res) => {
      try {
        const period = (req.query.period as string) || 'day';
        const validPeriods = ['day', 'week', 'month'];
        if (!validPeriods.includes(period)) {
          res.status(400).json({ error: `Invalid period. Use: ${validPeriods.join(', ')}` });
          return;
        }
        const since = period === 'day' ? Date.now() - 86400_000
          : period === 'week' ? Date.now() - 604800_000
          : Date.now() - 2592000_000;
        const changes = this.db.getTrustChanges(since);
        res.json({ changes, total: changes.length, period });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    // 32. POST /security/maintenance/prune — Prune old events (>90 days)
    app.post('/security/maintenance/prune', (_req, res) => {
      try {
        const ninetyDaysMs = 90 * 86400_000;
        const pruned = this.db.pruneOldEvents(ninetyDaysMs);
        res.json({ ok: true, pruned, cutoffDays: 90 });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    // === Phase 3-B: Script correlation routes (33) ===

    // 33. GET /security/scripts/correlations — Cross-domain script correlation data (extended Phase 6-B: AST matches)
    app.get('/security/scripts/correlations', (_req, res) => {
      try {
        // Hash-based widespread scripts (Phase 3-B)
        const widespread = this.db.getWidespreadScripts();
        const hashResults = widespread.map(script => {
          const domains = this.db.getDomainsForHash(script.scriptHash);
          const blockedDomains = domains.filter(d => this.shield.checkDomain(d).blocked);
          return {
            hash: script.scriptHash,
            normalizedHash: script.normalizedHash,
            domains,
            domainCount: script.domainCount,
            firstSeen: new Date(script.firstSeen).toISOString(),
            blockedDomains,
          };
        });

        // AST-based correlations (Phase 6-B)
        const widespreadAst = this.db.getWidespreadAstScripts();
        const astResults = widespreadAst.map(entry => {
          const matches = this.db.getAstMatches(entry.astHash);
          const variants = matches.map(m => ({
            domain: m.domain,
            hash: m.scriptHash,
            url: m.scriptUrl,
          }));
          const distinctHashes = new Set(matches.map(m => m.scriptHash).filter(Boolean));
          const blockedVariants = matches.filter(m => this.shield.checkDomain(m.domain).blocked);
          return {
            astHash: entry.astHash,
            variants,
            isObfuscationVariant: distinctHashes.size >= 2,
            hasBlockedDomain: blockedVariants.length > 0,
            domainCount: entry.domainCount,
            hashVariantCount: entry.hashVariantCount,
            firstSeen: new Date(entry.firstSeen).toISOString(),
          };
        });

        res.json({
          widespread: hashResults,
          astMatches: astResults,
          totalTrackedScripts: this.db.getScriptFingerprintCount(),
          crossDomainScripts: this.db.getCrossDomainScriptCount(),
          astCorrelations: astResults.length,
        });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    console.log('[SecurityManager] 33 API routes registered under /security/*');
  }

  destroy(): void {
    if (this.correlationInterval) clearInterval(this.correlationInterval);
    if (this.blocklistInterval) clearInterval(this.blocklistInterval);
    this.gatekeeperWs?.destroy();
    this.scriptGuard?.destroy();
    this.behaviorMonitor?.destroy();
    this.db.close();
    console.log('[SecurityManager] Destroyed');
  }
}
