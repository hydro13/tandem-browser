import type { Server as HttpServer } from 'http';
import type { Session } from 'electron';
import type { RequestDispatcher } from '../network/dispatcher';
import type { DevToolsManager } from '../devtools/manager';
import { SecurityDB } from './security-db';
import { NetworkShield } from './network-shield';
import { Guardian } from './guardian';
import { OutboundGuard } from './outbound-guard';
import { ScriptGuard, type ScriptCriticalDetection } from './script-guard';
import { ContentAnalyzer, ContentAnalyzerPlugin } from './content-analyzer';
import { BehaviorMonitor, BehaviorMonitorPlugin, type BehaviorCriticalDetection, type ResourceSnapshot } from './behavior-monitor';
import { GatekeeperWebSocket } from './gatekeeper-ws';
import { EvolutionEngine } from './evolution';
import { ThreatIntel } from './threat-intel';
import { BlocklistUpdater } from './blocklists/updater';
import { AnalyzerManager } from './analyzer-manager';
import { EventBurstAnalyzer } from './analyzers/example-analyzer';
import type { PageMetrics} from './types';
import { AnalysisConfidence } from './types';
import { createLogger } from '../utils/logger';

const log = createLogger('SecurityManager');

interface SecurityTabState {
  cdpAttached: boolean;
  monitorsInjected: boolean;
  resourceMonitoringActive: boolean;
  strictModePolicy: boolean;
  lastUrl: string | null;
}

interface ContainmentEvidence {
  scriptsParsed: Array<{ url: string; length: number }>;
  recentResourceSnapshots: ResourceSnapshot[];
  detection: Record<string, unknown>;
}

export interface SecurityContainmentIncident {
  id: string;
  createdAt: number;
  wcId: number | null;
  domain: string | null;
  url: string | null;
  severity: 'high' | 'critical';
  trigger: 'script-critical' | 'behavior-critical';
  reason: string;
  actionSummary: string;
  reviewMessage: string;
  automationPaused: boolean;
  evidence: ContainmentEvidence;
}

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
  private containmentIncidents: SecurityContainmentIncident[] = [];

  // Phase 0-B: Auto-correlation trigger
  private eventCounter: number = 0;
  private correlationRunning: boolean = false;
  private correlationInterval: ReturnType<typeof setInterval> | null = null;
  private lastCorrelationTime: number = 0;
  private static readonly MIN_CORRELATION_INTERVAL = 60_000; // throttle: max once per 60s

  // Phase 0-B: Blocklist update scheduling
  private blocklistInterval: ReturnType<typeof setInterval> | null = null;
  private tabStates: Map<number, SecurityTabState> = new Map();
  onContainmentIncident: ((incident: SecurityContainmentIncident) => void) | null = null;

  constructor() {
    this.db = new SecurityDB();
    this.shield = new NetworkShield(this.db);
    this.outboundGuard = new OutboundGuard(this.db);
    this.guardian = new Guardian(this.db, this.shield, this.outboundGuard);
    this.evolution = new EvolutionEngine(this.db);
    this.threatIntel = new ThreatIntel(this.db, this.evolution);
    this.blocklistUpdater = new BlocklistUpdater(this.db, this.shield);
    this.shield.startBackgroundHydration();

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
      log.warn('Failed to register EventBurstAnalyzer:', e.message);
    });

    // Phase 0-B: Auto-trigger correlateEvents() every 100 events or every hour
    // Phase 7-A: Also route events to analyzer plugins
    this.db.onEventLogged = (event) => {
      this.eventCounter++;
      if (this.eventCounter >= 100) {
        this.eventCounter = 0;
        // Defer correlation off the hot path — correlateEvents() is CPU-heavy and can take
        // 2-3 seconds, which blocks onBeforeRequest callbacks and stalls network requests.
        setImmediate(() => this.runCorrelation());
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
        log.warn('Analyzer routing error:', e.message);
      });
    };
    this.correlationInterval = setInterval(() => this.runCorrelation(), 3_600_000); // 1 hour

    // Phase 0-B: Blocklist update scheduling (24-hour cycle)
    this.scheduleBlocklistUpdate();

    log.info('Initialized (Phase 1-7)');
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
    this.scriptGuard.onCriticalDetection = (detection) => {
      void this.handleScriptCriticalDetection(detection);
    };
    // Phase 3-A: Wire blocklist check for cross-domain script correlation
    this.scriptGuard.isDomainBlocked = (domain: string) => this.shield.checkDomain(domain).blocked;
    this.contentAnalyzer = new ContentAnalyzer(this.db, devToolsManager);
    // Phase 4: Wire blocklist check for deep page source scanning
    this.contentAnalyzer.isDomainBlocked = (domain: string) => this.shield.checkDomain(domain).blocked;
    // Phase 7-B: Register ContentAnalyzer as plugin
    this.analyzerManager.register(new ContentAnalyzerPlugin(this.contentAnalyzer)).catch(e => {
      log.warn('Failed to register ContentAnalyzerPlugin:', e.message);
    });
    this.behaviorMonitor = new BehaviorMonitor(this.db, this.guardian, devToolsManager);
    this.behaviorMonitor.setScriptGuard(this.scriptGuard);
    this.behaviorMonitor.onCriticalDetection = (detection) => {
      void this.handleBehaviorCriticalDetection(detection);
    };
    // Phase 7-C: Register BehaviorMonitor as plugin
    this.analyzerManager.register(new BehaviorMonitorPlugin(this.behaviorMonitor)).catch(e => {
      log.warn('Failed to register BehaviorMonitorPlugin:', e.message);
    });
    log.info('Phase 3 modules initialized (ScriptGuard, ContentAnalyzer, BehaviorMonitor)');
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
  async onTabAttached(wcId: number): Promise<void> {
    this.resetTabRuntime(wcId);
    await this.ensureTabCoverage(wcId, { fullMonitoring: true, makePrimary: true });
  }

  /**
   * Called when a live browsing tab exists but has not necessarily been focused yet.
   * Attaches baseline security coverage without switching the active CDP target.
   */
  async onTabCreated(wcId: number): Promise<void> {
    await this.ensureTabCoverage(wcId, { makePrimary: false });
  }

  /**
   * Called after a main-frame navigation completes so per-tab runtime state can
   * be reset without affecting other attached tabs.
   */
  async onTabNavigated(wcId: number): Promise<void> {
    const state = this.getOrCreateTabState(wcId);
    this.resetTabRuntime(wcId);
    await this.ensureTabCoverage(wcId, {
      fullMonitoring: state.resourceMonitoringActive,
      makePrimary: false,
    });
  }

  /** Clean up all tab-scoped security state when a tab is destroyed. */
  onTabClosed(wcId: number): void {
    this.behaviorMonitor?.clearTab(wcId);
    this.scriptGuard?.clearTab(wcId);
    this.devToolsManager?.detachFromTab(wcId);
    this.guardian.releaseWebContentsQuarantine(wcId);
    this.tabStates.delete(wcId);
  }

  /**
   * Initialize the Gatekeeper WebSocket server on the existing HTTP server.
   * Must be called after the Express server has started listening.
   */
  initGatekeeper(httpServer: HttpServer): void {
    this.gatekeeperWs = new GatekeeperWebSocket(httpServer, this.guardian, this.db);
    this.guardian.setGatekeeper(this.gatekeeperWs);

    log.info('Phase 4: GatekeeperWebSocket initialized');
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
      log.warn('onPageLoaded error:', e instanceof Error ? e.message : String(e));
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
        log.info(`Correlation found ${threats.length} threat(s)`);
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
      log.warn('Correlation error:', e instanceof Error ? e.message : String(e));
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
      void this.runBlocklistUpdate();
    }

    // Schedule recurring updates every 24 hours
    this.blocklistInterval = setInterval(() => this.runBlocklistUpdate(), TWENTY_FOUR_HOURS);
  }

  /**
   * Run blocklist update and persist lastUpdated timestamp on success.
   */
  private async runBlocklistUpdate(): Promise<void> {
    try {
      log.info('Running scheduled blocklist update...');
      const result = await this.blocklistUpdater.update();
      this.db.setBlocklistMeta('lastUpdated', new Date().toISOString());
      log.info(`Blocklist update complete: ${result.totalAdded} entries, ${result.errors.length} errors`);
    } catch (e) {
      log.warn('Blocklist update failed:', e instanceof Error ? e.message : String(e));
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
  getContainmentIncidents(): SecurityContainmentIncident[] { return [...this.containmentIncidents]; }

  destroy(): void {
    if (this.correlationInterval) clearInterval(this.correlationInterval);
    if (this.blocklistInterval) clearInterval(this.blocklistInterval);
    this.analyzerManager.destroy().catch(e => log.warn('analyzerManager.destroy failed:', e instanceof Error ? e.message : e));
    this.gatekeeperWs?.destroy();
    this.scriptGuard?.destroy();
    this.behaviorMonitor?.destroy();
    this.containmentIncidents = [];
    this.tabStates.clear();
    this.db.close();
    log.info('Destroyed');
  }

  private async handleScriptCriticalDetection(detection: ScriptCriticalDetection): Promise<void> {
    this.gatekeeperWs?.sendAnomaly({
      domain: detection.domain,
      metric: 'script_threat_score',
      expected: 0,
      actual: detection.analysis.totalScore,
      severity: detection.analysis.severity,
    });

    await this.activateContainment({
      wcId: detection.wcId,
      domain: detection.domain,
      severity: detection.analysis.severity === 'critical' ? 'critical' : 'high',
      trigger: 'script-critical',
      reason: `Critical script detection (${detection.source})`,
      actionSummary: 'The tab was quarantined, future network requests are blocked, and the site was forced into strict mode.',
      reviewMessage: 'Tandem quarantined this tab after a critical script signal. Review the page, close the tab if it is unexpected, and only reopen the site manually if you trust it.',
      detection: {
        source: detection.source,
        totalScore: detection.analysis.totalScore,
        scriptUrl: detection.url,
        matchCount: detection.analysis.matches.length,
        entropy: detection.analysis.entropy,
      },
      terminateExecution: false,
    });
  }

  private async handleBehaviorCriticalDetection(detection: BehaviorCriticalDetection): Promise<void> {
    await this.activateContainment({
      wcId: detection.wcId,
      domain: detection.domain,
      severity: 'critical',
      trigger: 'behavior-critical',
      reason: 'Crypto-miner style runtime behavior detected',
      actionSummary: 'JavaScript execution was terminated for the tab, future network requests are quarantined, and the site was forced into strict mode.',
      reviewMessage: 'Tandem detected sustained CPU usage with WebAssembly activity and stopped page execution. Review the tab before interacting with it again.',
      detection: {
        reason: detection.reason,
        cpuUsage: Math.round(detection.metrics.cpuUsage * 100),
        wasmCount: detection.metrics.wasmCount,
        taskDuration: detection.metrics.taskDuration,
        jsHeapMB: Math.round(detection.metrics.jsHeapUsedSize / 1048576),
      },
      terminateExecution: true,
    });
  }

  private async activateContainment(input: {
    wcId: number | null;
    domain: string | null;
    severity: 'high' | 'critical';
    trigger: 'script-critical' | 'behavior-critical';
    reason: string;
    actionSummary: string;
    reviewMessage: string;
    detection: Record<string, unknown>;
    terminateExecution: boolean;
  }): Promise<void> {
    if (input.wcId !== null && this.guardian.isWebContentsQuarantined(input.wcId)) {
      return;
    }

    const incidentId = `${Date.now()}-${input.wcId ?? 'no-tab'}-${input.trigger}`;
    const wc = input.wcId !== null ? this.devToolsManager?.getAttachedWebContents(input.wcId) ?? null : null;
    const url = wc?.getURL() ?? null;
    const domain = input.domain ?? this.extractDomain(url);
    const domainInfo = domain ? this.db.getDomainInfo(domain) : null;
    const previousMode = domain ? this.guardian.getModeForDomain(domain) : null;
    const nextTrustLevel = domainInfo ? Math.min(domainInfo.trustLevel, 10) : 10;

    if (domain) {
      this.guardian.setMode(domain, 'strict');
      this.db.upsertDomain(domain, {
        trustLevel: nextTrustLevel,
        lastSeen: Date.now(),
      });
    }

    if (input.wcId !== null) {
      this.guardian.quarantineWebContents(input.wcId, {
        incidentId,
        domain,
        reason: input.reason,
        reviewMessage: input.reviewMessage,
      });
    }

    if (wc && !wc.isDestroyed()) {
      wc.stop();
    }

    if (input.terminateExecution && this.behaviorMonitor && input.wcId !== null) {
      await this.behaviorMonitor.killScript(`containment:${input.trigger}`, input.wcId);
    }

    const incident: SecurityContainmentIncident = {
      id: incidentId,
      createdAt: Date.now(),
      wcId: input.wcId,
      domain,
      url,
      severity: input.severity,
      trigger: input.trigger,
      reason: input.reason,
      actionSummary: input.actionSummary,
      reviewMessage: input.reviewMessage,
      automationPaused: true,
      evidence: {
        scriptsParsed: input.wcId !== null
          ? Array.from(this.scriptGuard?.getScriptsParsed(input.wcId).values() ?? []).slice(0, 25)
          : [],
        recentResourceSnapshots: input.wcId !== null
          ? this.behaviorMonitor?.getResourceSnapshots(input.wcId).slice(-10) ?? []
          : [],
        detection: {
          ...input.detection,
          previousMode,
          newMode: domain ? this.guardian.getModeForDomain(domain) : null,
          previousTrustLevel: domainInfo?.trustLevel ?? null,
          newTrustLevel: domain ? this.db.getDomainInfo(domain)?.trustLevel ?? nextTrustLevel : null,
        },
      },
    };

    this.containmentIncidents.unshift(incident);
    if (this.containmentIncidents.length > 50) {
      this.containmentIncidents.length = 50;
    }

    this.db.logEvent({
      timestamp: incident.createdAt,
      domain,
      tabId: null,
      eventType: 'containment_activated',
      severity: input.severity,
      category: 'behavior',
      details: JSON.stringify({
        incidentId: incident.id,
        trigger: incident.trigger,
        reason: incident.reason,
        actionSummary: incident.actionSummary,
        reviewMessage: incident.reviewMessage,
        url: url?.substring(0, 500) ?? null,
        evidence: incident.evidence,
      }),
      actionTaken: 'auto_block',
      confidence: AnalysisConfidence.BEHAVIORAL,
    });

    this.onContainmentIncident?.(incident);
  }

  private extractDomain(url: string | null): string | null {
    if (!url) return null;
    try {
      return new URL(url).hostname.toLowerCase();
    } catch {
      return null;
    }
  }

  private async ensureTabCoverage(wcId: number, opts?: { fullMonitoring?: boolean; makePrimary?: boolean }): Promise<void> {
    if (!this.devToolsManager) return;

    const state = this.getOrCreateTabState(wcId);

    try {
      const wc = await this.devToolsManager.attachToTab(wcId, { makePrimary: opts?.makePrimary ?? false });
      if (!wc) {
        this.tabStates.delete(wcId);
        return;
      }

      state.cdpAttached = true;
      state.lastUrl = wc.getURL();
      state.strictModePolicy = this.getStrictModeForUrl(state.lastUrl);

      await this.devToolsManager.enableSecurityDomains(wcId);

      await this.scriptGuard?.injectMonitors(wcId);
      state.monitorsInjected = this.scriptGuard?.hasMonitorsInjected(wcId) ?? false;

      const shouldRunFullMonitoring = Boolean(opts?.fullMonitoring || state.strictModePolicy);
      if (shouldRunFullMonitoring) {
        this.behaviorMonitor?.startResourceMonitoring(wcId);
        state.resourceMonitoringActive = this.behaviorMonitor?.isResourceMonitoringActive(wcId) ?? false;
      } else {
        this.behaviorMonitor?.stopResourceMonitoring(wcId);
        state.resourceMonitoringActive = false;
      }
    } catch (e) {
      log.warn('ensureTabCoverage error:', e instanceof Error ? e.message : String(e));
    }
  }

  private resetTabRuntime(wcId: number): void {
    this.scriptGuard?.reset(wcId);
    this.behaviorMonitor?.reset(wcId);

    const state = this.getOrCreateTabState(wcId);
    state.monitorsInjected = false;
  }

  private getOrCreateTabState(wcId: number): SecurityTabState {
    let state = this.tabStates.get(wcId);
    if (!state) {
      state = {
        cdpAttached: false,
        monitorsInjected: false,
        resourceMonitoringActive: false,
        strictModePolicy: false,
        lastUrl: null,
      };
      this.tabStates.set(wcId, state);
    }
    return state;
  }

  private getStrictModeForUrl(url: string): boolean {
    try {
      const domain = new URL(url).hostname.toLowerCase();
      return this.guardian.getModeForDomain(domain) === 'strict';
    } catch {
      return false;
    }
  }
}
