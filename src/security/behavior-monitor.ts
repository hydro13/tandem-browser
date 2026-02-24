import { Session, WebContents } from 'electron';
import { SecurityDB } from './security-db';
import { Guardian } from './guardian';
import { DevToolsManager } from '../devtools/manager';
import { ScriptGuard } from './script-guard';
import { AnalysisConfidence } from './types';

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
  private cpuCheckInterval: NodeJS.Timeout | null = null;
  private permissionLog: PermissionRecord[] = [];
  private lastMetrics: { taskDuration: number; jsHeapUsedSize: number; timestamp: number } | null = null;
  private resourceSnapshots: ResourceSnapshot[] = [];

  constructor(db: SecurityDB, guardian: Guardian, devToolsManager: DevToolsManager) {
    this.db = db;
    this.guardian = guardian;
    this.devToolsManager = devToolsManager;
  }

  /** Set ScriptGuard reference for WASM event correlation */
  setScriptGuard(scriptGuard: ScriptGuard): void {
    this.scriptGuard = scriptGuard;
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

    console.log('[BehaviorMonitor] Permission handler installed');
  }

  /**
   * Start resource monitoring for crypto miner detection.
   * Polls CPU metrics every 10 seconds via Performance.getMetrics.
   */
  startResourceMonitoring(): void {
    // Clear existing interval if any
    if (this.cpuCheckInterval) {
      clearInterval(this.cpuCheckInterval);
    }

    this.cpuCheckInterval = setInterval(async () => {
      try {
        const result = await this.devToolsManager.sendCommand('Performance.getMetrics');
        const metricsMap: Record<string, number> = {};
        for (const m of result.metrics || []) {
          metricsMap[m.name] = m.value;
        }

        const taskDuration = metricsMap['TaskDuration'] || 0;
        const jsHeapUsedSize = metricsMap['JSHeapUsedSize'] || 0;
        const wasmCount = this.scriptGuard?.getRecentWasmCount() || 0;

        // Check for CPU spike patterns
        let cpuWarning = false;
        if (this.lastMetrics) {
          const timeDelta = (Date.now() - this.lastMetrics.timestamp) / 1000; // seconds
          const taskDelta = taskDuration - this.lastMetrics.taskDuration;
          const cpuUsage = timeDelta > 0 ? taskDelta / timeDelta : 0;

          // CPU usage > 80% of poll interval + WASM activity = likely crypto miner
          if (cpuUsage > 0.8 && wasmCount > 0) {
            cpuWarning = true;
            const wc = this.devToolsManager.getAttachedWebContents();
            const domain = wc ? this.extractDomain(wc.getURL()) : null;

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
                taskDuration: Math.round(taskDelta * 1000),
                jsHeapMB: Math.round(jsHeapUsedSize / 1048576),
              }),
              actionTaken: 'flagged',
              confidence: AnalysisConfidence.ANOMALY,
            });
          }

          // Memory growing rapidly without interaction = suspicious
          const heapDelta = jsHeapUsedSize - this.lastMetrics.jsHeapUsedSize;
          if (heapDelta > 50_000_000) { // 50MB growth in 10 seconds
            const wc = this.devToolsManager.getAttachedWebContents();
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

        this.lastMetrics = { taskDuration, jsHeapUsedSize, timestamp: Date.now() };

        // Store snapshot (keep last 30)
        this.resourceSnapshots.push({
          timestamp: Date.now(),
          metrics: metricsMap,
          wasmActivity: wasmCount,
          cpuWarning,
        });
        if (this.resourceSnapshots.length > 30) {
          this.resourceSnapshots.shift();
        }
      } catch {
        // Tab may have been closed or CDP disconnected — ignore
      }
    }, 10_000);

    console.log('[BehaviorMonitor] Resource monitoring started (10s interval)');
  }

  /** Stop resource monitoring */
  stopResourceMonitoring(): void {
    if (this.cpuCheckInterval) {
      clearInterval(this.cpuCheckInterval);
      this.cpuCheckInterval = null;
    }
    this.lastMetrics = null;
  }

  /** Get permission log */
  getPermissionLog(): PermissionRecord[] {
    return this.permissionLog;
  }

  /** Get resource snapshots */
  getResourceSnapshots(): ResourceSnapshot[] {
    return this.resourceSnapshots;
  }

  /** Kill a script/worker via CDP (for emergency crypto miner termination) */
  async killScript(scriptId: string): Promise<boolean> {
    try {
      // Use Runtime.terminateExecution to stop the current page execution
      await this.devToolsManager.sendCommand('Runtime.terminateExecution');
      const wc = this.devToolsManager.getAttachedWebContents();
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
    } catch (e: any) {
      console.warn('[BehaviorMonitor] Kill script failed:', e.message);
      return false;
    }
  }

  /** Reset state (call on tab switch) */
  reset(): void {
    this.lastMetrics = null;
    this.resourceSnapshots = [];
  }

  private extractDomain(url: string): string | null {
    try {
      return new URL(url).hostname.toLowerCase();
    } catch {
      return null;
    }
  }

  destroy(): void {
    if (this.cpuCheckInterval) {
      clearInterval(this.cpuCheckInterval);
      this.cpuCheckInterval = null;
    }
  }
}
