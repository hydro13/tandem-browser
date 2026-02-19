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
import { GuardianMode, GatekeeperAction } from './types';

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

  constructor() {
    this.db = new SecurityDB();
    this.shield = new NetworkShield(this.db);
    this.outboundGuard = new OutboundGuard(this.db);
    this.guardian = new Guardian(this.db, this.shield, this.outboundGuard);
    console.log('[SecurityManager] Initialized');
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
    this.contentAnalyzer = new ContentAnalyzer(this.db, devToolsManager);
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
    console.log('[SecurityManager] Phase 4: GatekeeperWebSocket initialized');
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

    console.log('[SecurityManager] 24 API routes registered under /security/*');
  }

  destroy(): void {
    this.gatekeeperWs?.destroy();
    this.scriptGuard?.destroy();
    this.behaviorMonitor?.destroy();
    this.db.close();
    console.log('[SecurityManager] Destroyed');
  }
}
