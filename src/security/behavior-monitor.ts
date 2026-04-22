import type { Session, WebContents } from 'electron';
import type { SecurityDB } from './security-db';
import type { Guardian } from './guardian';
import type { DevToolsManager } from '../devtools/manager';
import type { ScriptGuard } from './script-guard';
import type { SecurityAnalyzer, AnalyzerContext, SecurityEvent } from './types';
import { AnalysisConfidence } from './types';
import { createLogger } from '../utils/logger';

const log = createLogger('BehaviorMonitor');

/** Permission request record */
export interface PermissionRecord {
  timestamp: number;
  domain: string | null;
  permission: string;
  url: string;
  action: 'allowed' | 'blocked';
}

/** Resource usage snapshot */
export interface ResourceSnapshot {
  timestamp: number;
  metrics: Record<string, number>;
  wasmActivity: number;
  cpuWarning: boolean;
}

export interface BehaviorCriticalDetection {
  wcId: number;
  domain: string | null;
  reason: 'crypto-miner-suspected';
  metrics: {
    cpuUsage: number;
    wasmCount: number;
    taskDuration: number;
    jsHeapUsedSize: number;
  };
}

interface BehaviorTabState {
  cpuCheckInterval: NodeJS.Timeout | null;
  lastMetrics: { taskDuration: number; jsHeapUsedSize: number; timestamp: number } | null;
  resourceSnapshots: ResourceSnapshot[];
}

/**
 * BehaviorMonitor — Monitors runtime behavior for suspicious activity.
 *
 * - Permission request handler (singleton — Electron allows only ONE per session)
 * - CPU monitoring via Performance.getMetrics for crypto miner detection
 * - Correlates WASM instantiation events (from ScriptGuard) with CPU spikes
 *
 * NOTE on setPermissionRequestHandler:
 *   Electron allows only ONE handler per session (same limitation as webRequest).
 *   Currently no other handler exists in the codebase (verified).
 *   If a permission handler is added elsewhere in the future, this must be
 *   refactored into a dispatcher pattern similar to RequestDispatcher.
 */
export class BehaviorMonitor {
  private db: SecurityDB;
  private guardian: Guardian;
  private devToolsManager: DevToolsManager;
  private scriptGuard: ScriptGuard | null = null;
  private shouldMonitorTab: ((wcId: number) => boolean) | null = null;
  private permissionLog: PermissionRecord[] = [];
  private tabStates: Map<number, BehaviorTabState> = new Map();
  onCriticalDetection: ((detection: BehaviorCriticalDetection) => void) | null = null;

  constructor(db: SecurityDB, guardian: Guardian, devToolsManager: DevToolsManager) {
    this.db = db;
    this.guardian = guardian;
    this.devToolsManager = devToolsManager;
  }

  /** Set ScriptGuard reference for WASM event correlation */
  setScriptGuard(scriptGuard: ScriptGuard): void {
    this.scriptGuard = scriptGuard;
  }

  /** Set a runtime gate for whether resource monitoring may run on a tab. */
  setMonitoringGate(shouldMonitorTab: ((wcId: number) => boolean) | null): void {
    this.shouldMonitorTab = shouldMonitorTab;
  }

  /**
   * Setup permission request handler.
   * SINGLETON — Electron allows only ONE setPermissionRequestHandler per session.
   */
  setupPermissionHandler(session: Session): void {
    session.setPermissionRequestHandler((webContents: WebContents, permission: string, callback: (granted: boolean) => void) => {
      const url = webContents.getURL();
      const domain = this.extractDomain(url);
      const mode = this.guardian.getModeForDomain(domain || '');

      // Log the permission request
      this.db.logEvent({
        timestamp: Date.now(),
        domain,
        tabId: null,
        eventType: 'warned',
        severity: 'medium',
        category: 'behavior',
        details: JSON.stringify({ permission, url, mode }),
        actionTaken: 'logged',
        confidence: AnalysisConfidence.BEHAVIORAL,
      });

      // Camera/microphone from strict mode domain = BLOCK
      if (['media', 'camera', 'microphone'].includes(permission) && mode === 'strict') {
        this.permissionLog.push({ timestamp: Date.now(), domain, permission, url, action: 'blocked' });
        callback(false);
        return;
      }

      // Clipboard read = always flag
      if (permission === 'clipboard-read') {
        this.db.logEvent({
          timestamp: Date.now(),
          domain,
          tabId: null,
          eventType: 'warned',
          severity: 'high',
          category: 'behavior',
          details: JSON.stringify({ permission, url, reason: 'clipboard-read-attempt' }),
          actionTaken: 'flagged',
          confidence: AnalysisConfidence.BEHAVIORAL,
        });
      }

      // Notifications from first-visit site = BLOCK
      if (permission === 'notifications') {
        const info = this.db.getDomainInfo(domain || '');
        if (!info || info.visitCount < 3) {
          this.permissionLog.push({ timestamp: Date.now(), domain, permission, url, action: 'blocked' });
          callback(false);
          return;
        }
      }

      // Geolocation in strict mode = BLOCK
      if (permission === 'geolocation' && mode === 'strict') {
        this.permissionLog.push({ timestamp: Date.now(), domain, permission, url, action: 'blocked' });
        callback(false);
        return;
      }

      // Default: allow (don't break functionality)
      this.permissionLog.push({ timestamp: Date.now(), domain, permission, url, action: 'allowed' });
      callback(true);
    });

    log.info('Permission handler installed');
  }

  /**
   * Start resource monitoring for crypto miner detection.
   * Polls CPU metrics every 10 seconds via Performance.getMetrics.
   */
  startResourceMonitoring(wcId?: number): void {
    const resolvedWcId = wcId ?? this.resolveCurrentWcId();
    if (!resolvedWcId) return;

    const state = this.getOrCreateTabState(resolvedWcId);

    if (this.shouldMonitorTab && !this.shouldMonitorTab(resolvedWcId)) {
      if (state.cpuCheckInterval) {
        this.stopResourceMonitoring(resolvedWcId);
      }
      return;
    }

    // Guard: if already running, don't restart (prevents double-start on repeated lifecycle calls)
    if (state.cpuCheckInterval) return;

    state.cpuCheckInterval = setInterval(async () => {
      try {
        const result = await this.devToolsManager.sendCommandToTab(resolvedWcId, 'Performance.getMetrics');
        const metricsMap: Record<string, number> = {};
        for (const m of result.metrics || []) {
          metricsMap[m.name] = m.value;
        }

        const taskDuration = metricsMap['TaskDuration'] || 0;
        const jsHeapUsedSize = metricsMap['JSHeapUsedSize'] || 0;
        const wasmCount = this.scriptGuard?.getRecentWasmCount(resolvedWcId) || 0;

        // Check for CPU spike patterns
        let cpuWarning = false;
        if (state.lastMetrics) {
          const timeDelta = (Date.now() - state.lastMetrics.timestamp) / 1000; // seconds
          const taskDelta = taskDuration - state.lastMetrics.taskDuration;
          const cpuUsage = timeDelta > 0 ? taskDelta / timeDelta : 0;

          // CPU usage > 80% of poll interval + WASM activity = likely crypto miner
          if (cpuUsage > 0.8 && wasmCount > 0) {
            cpuWarning = true;
            const wc = this.devToolsManager.getAttachedWebContents(resolvedWcId);
            const domain = wc ? this.extractDomain(wc.getURL()) : null;
            const taskDurationMs = Math.round(taskDelta * 1000);
            const jsHeapMb = Math.round(jsHeapUsedSize / 1048576);

            this.db.logEvent({
              timestamp: Date.now(),
              domain,
              tabId: null,
              eventType: 'warned',
              severity: 'critical',
              category: 'behavior',
              details: JSON.stringify({
                reason: 'crypto-miner-suspected',
                cpuUsage: Math.round(cpuUsage * 100),
                wasmCount,
                taskDuration: taskDurationMs,
                jsHeapMB: jsHeapMb,
              }),
              actionTaken: 'flagged',
              confidence: AnalysisConfidence.ANOMALY,
            });

            this.onCriticalDetection?.({
              wcId: resolvedWcId,
              domain,
              reason: 'crypto-miner-suspected',
              metrics: {
                cpuUsage,
                wasmCount,
                taskDuration: taskDurationMs,
                jsHeapUsedSize,
              },
            });
          }

          // Memory growing rapidly without interaction = suspicious
          const heapDelta = jsHeapUsedSize - state.lastMetrics.jsHeapUsedSize;
          if (heapDelta > 50_000_000) { // 50MB growth in 10 seconds
            const wc = this.devToolsManager.getAttachedWebContents(resolvedWcId);
            const domain = wc ? this.extractDomain(wc.getURL()) : null;

            this.db.logEvent({
              timestamp: Date.now(),
              domain,
              tabId: null,
              eventType: 'warned',
              severity: 'medium',
              category: 'behavior',
              details: JSON.stringify({
                reason: 'rapid-memory-growth',
                heapDeltaMB: Math.round(heapDelta / 1048576),
                jsHeapMB: Math.round(jsHeapUsedSize / 1048576),
              }),
              actionTaken: 'flagged',
              confidence: AnalysisConfidence.ANOMALY,
            });
          }
        }

        state.lastMetrics = { taskDuration, jsHeapUsedSize, timestamp: Date.now() };

        // Store snapshot (keep last 30)
        state.resourceSnapshots.push({
          timestamp: Date.now(),
          metrics: metricsMap,
          wasmActivity: wasmCount,
          cpuWarning,
        });
        if (state.resourceSnapshots.length > 30) {
          state.resourceSnapshots.shift();
        }
      } catch {
        // Tab may have been closed or CDP disconnected — ignore
      }
    }, 10_000);

    log.info(`Resource monitoring started for wc ${resolvedWcId} (10s interval)`);
  }

  /** Stop resource monitoring */
  stopResourceMonitoring(wcId?: number): void {
    if (wcId === undefined) {
      for (const tabWcId of this.tabStates.keys()) {
        this.stopResourceMonitoring(tabWcId);
      }
      return;
    }

    const state = this.tabStates.get(wcId);
    if (state?.cpuCheckInterval) {
      clearInterval(state.cpuCheckInterval);
      state.cpuCheckInterval = null;
    }
    if (state) {
      state.lastMetrics = null;
    }
  }

  /** Get permission log */
  getPermissionLog(): PermissionRecord[] {
    return this.permissionLog;
  }

  /** Get resource snapshots */
  getResourceSnapshots(wcId?: number): ResourceSnapshot[] {
    const resolvedWcId = wcId ?? this.resolveCurrentWcId();
    if (!resolvedWcId) return [];
    return this.getOrCreateTabState(resolvedWcId).resourceSnapshots;
  }

  /** Kill a script/worker via CDP (for emergency crypto miner termination) */
  async killScript(scriptId: string, wcId?: number): Promise<boolean> {
    try {
      // Use Runtime.terminateExecution to stop the current page execution
      if (wcId !== undefined) {
        await this.devToolsManager.sendCommandToTab(wcId, 'Runtime.terminateExecution');
      } else {
        await this.devToolsManager.sendCommand('Runtime.terminateExecution');
      }
      const wc = this.devToolsManager.getAttachedWebContents(wcId);
      const domain = wc ? this.extractDomain(wc.getURL()) : null;

      this.db.logEvent({
        timestamp: Date.now(),
        domain,
        tabId: null,
        eventType: 'blocked',
        severity: 'critical',
        category: 'behavior',
        details: JSON.stringify({ reason: 'script-killed', scriptId }),
        actionTaken: 'auto_block',
        confidence: AnalysisConfidence.BEHAVIORAL,
      });
      return true;
    } catch (e) {
      log.warn('Kill script failed:', e instanceof Error ? e.message : String(e));
      return false;
    }
  }

  /** Reset state (call on tab switch) */
  reset(wcId?: number): void {
    if (wcId === undefined) {
      for (const tabWcId of this.tabStates.keys()) {
        this.reset(tabWcId);
      }
      return;
    }

    const state = this.getOrCreateTabState(wcId);
    state.lastMetrics = null;
    state.resourceSnapshots = [];
  }

  isResourceMonitoringActive(wcId: number): boolean {
    return !!this.getOrCreateTabState(wcId).cpuCheckInterval;
  }

  clearTab(wcId: number): void {
    this.stopResourceMonitoring(wcId);
    this.tabStates.delete(wcId);
  }

  private extractDomain(url: string): string | null {
    try {
      return new URL(url).hostname.toLowerCase();
    } catch {
      return null;
    }
  }

  destroy(): void {
    this.stopResourceMonitoring();
    this.tabStates.clear();
  }

  private getOrCreateTabState(wcId: number): BehaviorTabState {
    let state = this.tabStates.get(wcId);
    if (!state) {
      state = {
        cpuCheckInterval: null,
        lastMetrics: null,
        resourceSnapshots: [],
      };
      this.tabStates.set(wcId, state);
    }
    return state;
  }

  private resolveCurrentWcId(): number | null {
    const wc = this.devToolsManager.getDispatchWebContents() ?? this.devToolsManager.getAttachedWebContents();
    return wc?.id ?? null;
  }
}

/**
 * BehaviorMonitorPlugin — SecurityAnalyzer wrapper for BehaviorMonitor.
 *
 * Wraps the existing BehaviorMonitor in the SecurityAnalyzer plugin interface
 * so it can be managed by AnalyzerManager alongside other analyzers.
 *
 * BehaviorMonitor is primarily timer-based (CPU polling) and handler-based
 * (Electron permission handler). The plugin subscribes to 'page-loaded' events
 * to restart resource monitoring when a new page loads. Permission handling and
 * tab-lifecycle calls (reset, initial monitoring start) remain direct.
 */
export class BehaviorMonitorPlugin implements SecurityAnalyzer {
  readonly name = 'behavior-monitor';
  readonly version = '1.0.0';
  readonly eventTypes = ['page-loaded'];
  readonly priority = 500; // BEHAVIORAL confidence level — after ContentAnalyzer (400)
  readonly description = 'Runtime behavior monitoring: permissions, CPU usage, crypto miner detection';

  private monitor: BehaviorMonitor;

  constructor(monitor: BehaviorMonitor) {
    this.monitor = monitor;
  }

  async initialize(_context: AnalyzerContext): Promise<void> {
    // BehaviorMonitor is already initialized via SecurityManager — no additional setup needed
  }

  canAnalyze(event: SecurityEvent): boolean {
    return event.eventType === 'page-loaded' && !!event.domain;
  }

  async analyze(event: SecurityEvent): Promise<SecurityEvent[]> {
    // Restart resource monitoring for the new page context.
    // BehaviorMonitor handles its own event logging internally — we return empty.
    if (event.eventType === 'page-loaded' && event.domain) {
      this.monitor.startResourceMonitoring();
    }
    return [];
  }

  async destroy(): Promise<void> {
    // BehaviorMonitor lifecycle is managed by SecurityManager
  }
}
