import { Server as HttpServer } from 'http';
import { Session } from 'electron';
import { RequestDispatcher } from '../network/dispatcher';
import { DevToolsManager } from '../devtools/manager';
import { SecurityDB } from './security-db';
import { NetworkShield } from './network-shield';
import { Guardian } from './guardian';
import { OutboundGuard } from './outbound-guard';
import { ScriptGuard } from './script-guard';
import { ContentAnalyzer, ContentAnalyzerPlugin } from './content-analyzer';
import { BehaviorMonitor, BehaviorMonitorPlugin } from './behavior-monitor';
import { GatekeeperWebSocket } from './gatekeeper-ws';
import { EvolutionEngine } from './evolution';
import { ThreatIntel } from './threat-intel';
import { BlocklistUpdater } from './blocklists/updater';
import { AnalyzerManager } from './analyzer-manager';
import { EventBurstAnalyzer } from './analyzers/example-analyzer';
import { PageMetrics, AnalysisConfidence } from './types';

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

  // Phase 7-A: Analyzer plugin manager
  private analyzerManager: AnalyzerManager;
  private analyzerCascadeLogging: boolean = false;

  // Phase 0-B: Auto-correlation trigger
  private eventCounter: number = 0;
  private correlationRunning: boolean = false;
  private correlationInterval: ReturnType<typeof setInterval> | null = null;
  private lastCorrelationTime: number = 0;
  private static readonly MIN_CORRELATION_INTERVAL = 60_000; // throttle: max once per 60s

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

    // Phase 7-A: Create AnalyzerManager with controlled context
    this.analyzerManager = new AnalyzerManager({
      logEvent: (event) => {
        this.db.logEvent({
          ...event,
          timestamp: Date.now(),
        });
      },
      isDomainBlocked: (domain) => this.shield.checkDomain(domain).blocked,
      getTrustScore: (domain) => {
        const info = this.db.getDomainInfo(domain);
        return info ? info.trustLevel : undefined;
      },
      db: {
        getEventsForDomain: (domain, limit) => this.db.getEventsForDomain(domain, limit),
      },
    });

    // Register built-in analyzers
    this.analyzerManager.register(new EventBurstAnalyzer()).catch(e => {
      console.warn('[SecurityManager] Failed to register EventBurstAnalyzer:', e.message);
    });

    // Phase 0-B: Auto-trigger correlateEvents() every 100 events or every hour
    // Phase 7-A: Also route events to analyzer plugins
    this.db.onEventLogged = (event) => {
      this.eventCounter++;
      if (this.eventCounter >= 100) {
        this.eventCounter = 0;
        this.runCorrelation();
      }

      // Phase 5-C: Confidence-based Gatekeeper routing
      // sendEvent() handles the confidence check internally:
      // <=300 returns early, 301-600 medium priority, >600 high priority
      this.gatekeeperWs?.sendEvent(event);

      // Skip routing for cascade events (prevents analyzer loops)
      if (this.analyzerCascadeLogging) return;

      // Route to analyzer plugins (async, fire-and-forget)
      this.analyzerManager.routeEvent(event).then(newEvents => {
        // Log cascade events with guard to prevent re-routing
        this.analyzerCascadeLogging = true;
        for (const newEvent of newEvents) {
          this.db.logEvent({
            ...newEvent,
            timestamp: newEvent.timestamp || Date.now(),
          });
        }
        this.analyzerCascadeLogging = false;
      }).catch(e => {
        console.warn('[SecurityManager] Analyzer routing error:', e.message);
      });
    };
    this.correlationInterval = setInterval(() => this.runCorrelation(), 3_600_000); // 1 hour

    // Phase 0-B: Blocklist update scheduling (24-hour cycle)
    this.scheduleBlocklistUpdate();

    console.log('[SecurityManager] Initialized (Phase 1-7)');
  }

  /**
   * Initialize SecurityManager with all external dependencies.
   * Consolidates the previously scattered init steps into one call.
   *
   * Call sequence:
   *   1. new SecurityManager()           — internal modules
   *   2. init({ dispatcher, devTools, session })  — wire external deps
   *   3. initGatekeeper(httpServer)       — after API server starts
   */
  init(deps: {
    dispatcher?: RequestDispatcher;
    devToolsManager: DevToolsManager;
    session: Session;
  }): void {
    if (deps.dispatcher) {
      this.registerWith(deps.dispatcher);
    }
    this.setDevToolsManager(deps.devToolsManager);
    this.setupPermissionHandler(deps.session);
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
    // Phase 7-B: Register ContentAnalyzer as plugin
    this.analyzerManager.register(new ContentAnalyzerPlugin(this.contentAnalyzer)).catch(e => {
      console.warn('[SecurityManager] Failed to register ContentAnalyzerPlugin:', e.message);
    });
    this.behaviorMonitor = new BehaviorMonitor(this.db, this.guardian, devToolsManager);
    this.behaviorMonitor.setScriptGuard(this.scriptGuard);
    // Phase 7-C: Register BehaviorMonitor as plugin
    this.analyzerManager.register(new BehaviorMonitorPlugin(this.behaviorMonitor)).catch(e => {
      console.warn('[SecurityManager] Failed to register BehaviorMonitorPlugin:', e.message);
    });
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
    } catch (e) {
      console.warn('[SecurityManager] onTabAttached error:', e instanceof Error ? e.message : String(e));
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
      // 1. Run content analysis via plugin pipeline (Phase 7-B)
      await this.analyzerManager.routeEvent({
        timestamp: Date.now(),
        domain,
        tabId: null,
        eventType: 'page-loaded',
        severity: 'low',
        category: 'network',
        details: JSON.stringify({ domain }),
        actionTaken: 'logged',
      });
      const analysis = this.contentAnalyzer.getLastAnalysis();
      if (!analysis) return;

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
    } catch (e) {
      console.warn('[SecurityManager] onPageLoaded error:', e instanceof Error ? e.message : String(e));
    }
  }

  /**
   * Run event correlation and log any detected threats.
   */
  private runCorrelation(): void {
    if (this.correlationRunning) return;
    const now = Date.now();
    if (now - this.lastCorrelationTime < SecurityManager.MIN_CORRELATION_INTERVAL) return;
    this.lastCorrelationTime = now;
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
    } catch (e) {
      console.warn('[SecurityManager] Correlation error:', e instanceof Error ? e.message : String(e));
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
    } catch (e) {
      console.warn('[SecurityManager] Blocklist update failed:', e instanceof Error ? e.message : String(e));
    }
  }

  // --- Public accessors for route handlers (src/security/routes.ts) ---

  getDb(): SecurityDB { return this.db; }
  getShield(): NetworkShield { return this.shield; }
  getGuardian(): Guardian { return this.guardian; }
  getOutboundGuard(): OutboundGuard { return this.outboundGuard; }
  getScriptGuard(): ScriptGuard | null { return this.scriptGuard; }
  getContentAnalyzer(): ContentAnalyzer | null { return this.contentAnalyzer; }
  getBehaviorMonitor(): BehaviorMonitor | null { return this.behaviorMonitor; }
  getDevToolsManager(): DevToolsManager | null { return this.devToolsManager; }
  getGatekeeperWs(): GatekeeperWebSocket | null { return this.gatekeeperWs; }
  getThreatIntel(): ThreatIntel { return this.threatIntel; }
  getBlocklistUpdater(): BlocklistUpdater { return this.blocklistUpdater; }
  getAnalyzerManager(): AnalyzerManager { return this.analyzerManager; }

  destroy(): void {
    if (this.correlationInterval) clearInterval(this.correlationInterval);
    if (this.blocklistInterval) clearInterval(this.blocklistInterval);
    this.analyzerManager.destroy().catch(e => console.warn('[SecurityManager] analyzerManager.destroy failed:', e instanceof Error ? e.message : e));
    this.gatekeeperWs?.destroy();
    this.scriptGuard?.destroy();
    this.behaviorMonitor?.destroy();
    this.db.close();
    console.log('[SecurityManager] Destroyed');
  }
}
