import { Server as HttpServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { Guardian } from './guardian';
import { SecurityDB } from './security-db';
import {
  PendingDecision,
  GatekeeperDecision,
  GatekeeperStatus,
  GatekeeperHistoryEntry,
  GatekeeperAction,
  SecurityEvent,
  GuardianMode,
  AnalysisConfidence,
} from './types';

const MAX_QUEUE = 1000;
const DEFAULT_TIMEOUT = 30_000;
const HEARTBEAT_INTERVAL = 30_000;
const MAX_HISTORY = 500;

export class GatekeeperWebSocket {
  private wss: WebSocketServer;
  private client: WebSocket | null = null;
  private guardian: Guardian;
  private db: SecurityDB;
  private pendingQueue: PendingDecision[] = [];
  private pendingTimeouts: Map<string, NodeJS.Timeout> = new Map();
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private authSecret: string;
  private totalDecisions = 0;
  private lastAgentSeen: number | null = null;
  private history: GatekeeperHistoryEntry[] = [];

  constructor(server: HttpServer, guardian: Guardian, db: SecurityDB) {
    this.guardian = guardian;
    this.db = db;
    this.authSecret = this.getOrCreateSecret();

    this.wss = new WebSocketServer({
      server,
      path: '/security/gatekeeper',
      verifyClient: (info: { req: IncomingMessage }, callback: (result: boolean, code?: number, message?: string) => void) => {
        const url = new URL(info.req.url || '', 'http://localhost');
        const token = url.searchParams.get('token') ||
          (info.req.headers['x-gatekeeper-token'] as string | undefined);
        if (token === this.authSecret) {
          callback(true);
        } else {
          console.log('[Gatekeeper] Auth rejected — invalid token');
          callback(false, 401, 'Invalid token');
        }
      },
    });

    this.wss.on('connection', (ws: WebSocket) => {
      this.handleConnection(ws);
    });

    console.log('[Gatekeeper] WebSocket server ready on /security/gatekeeper');
  }

  // === Connection handling ===

  private handleConnection(ws: WebSocket): void {
    // Only one agent at a time — close previous
    if (this.client && this.client.readyState === WebSocket.OPEN) {
      this.client.close(1000, 'Replaced by new connection');
    }
    this.client = ws;
    this.lastAgentSeen = Date.now();

    console.log('[Gatekeeper] Agent connected');

    // Start heartbeat
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    this.heartbeatInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.ping();
      }
    }, HEARTBEAT_INTERVAL);

    // Replay queued decisions on reconnect
    for (const item of this.pendingQueue) {
      this.send({ type: 'decision_needed', ...item });
    }

    ws.on('pong', () => {
      this.lastAgentSeen = Date.now();
    });

    ws.on('message', (data: Buffer | ArrayBuffer | Buffer[]) => {
      this.lastAgentSeen = Date.now();
      try {
        const msg = JSON.parse(data.toString());
        this.handleAgentMessage(msg);
      } catch (e: unknown) {
        const errMsg = e instanceof Error ? e.message : String(e);
        console.error('[Gatekeeper] Invalid message:', errMsg);
      }
    });

    ws.on('close', () => {
      console.log('[Gatekeeper] Agent disconnected');
      this.client = null;
      if (this.heartbeatInterval) {
        clearInterval(this.heartbeatInterval);
        this.heartbeatInterval = null;
      }
    });

    ws.on('error', (err: Error) => {
      console.error('[Gatekeeper] WebSocket error:', err.message);
    });
  }

  // === Send events TO agent ===

  /**
   * Send a security event to the connected AI agent.
   * Confidence-based routing:
   * - confidence <= 300 (BLOCKLIST, CREDENTIAL_EXFIL, KNOWN_MALWARE_HASH): resolve locally, don't send
   * - confidence 301-600 (BEHAVIORAL): send with medium priority
   * - confidence > 600 (HEURISTIC, ANOMALY, SPECULATIVE): send with high priority (needs AI judgment)
   */
  sendEvent(event: SecurityEvent): void {
    const confidence = event.confidence ?? AnalysisConfidence.BEHAVIORAL;

    // High-confidence events (<=300): resolve locally, don't waste AI agent time
    if (confidence <= 300) {
      return;
    }

    // Determine priority based on confidence
    const priority = confidence > 600 ? 'high' : 'medium';

    this.send({
      type: 'event',
      severity: event.severity,
      category: event.category,
      domain: event.domain,
      eventType: event.eventType,
      details: event.details,
      confidence,
      priority,
    });
  }

  sendDecisionRequest(item: PendingDecision): void {
    // Cap queue size — evict oldest with defaultAction
    if (this.pendingQueue.length >= MAX_QUEUE) {
      const evicted = this.pendingQueue.shift()!;
      this.resolveDecision(evicted.id, {
        action: evicted.defaultAction,
        reason: 'queue-full — evicted oldest pending decision',
        confidence: 0,
      }, 'queue-full');
    }

    this.pendingQueue.push(item);
    this.send({ type: 'decision_needed', ...item });

    // Timeout: use default action if agent doesn't respond
    const timeout = setTimeout(() => {
      const idx = this.pendingQueue.findIndex(p => p.id === item.id);
      if (idx !== -1) {
        this.resolveDecision(item.id, {
          action: item.defaultAction,
          reason: 'timeout — agent did not respond within ' + (item.timeout / 1000) + 's',
          confidence: 0,
        }, 'timeout');
      }
    }, item.timeout);
    this.pendingTimeouts.set(item.id, timeout);
  }

  sendAnomaly(anomaly: { domain: string; metric: string; expected: number; actual: number; severity: string }): void {
    this.send({ type: 'anomaly', ...anomaly });
  }

  sendStats(stats: { interval: number; requests: number; blocked: number; flagged: number; anomalies?: number }): void {
    this.send({ type: 'stats', ...stats });
  }

  // === Receive decisions FROM agent ===

  private handleAgentMessage(msg: Record<string, unknown>): void {
    switch (msg.type) {
      case 'decision':
        this.resolveDecision(msg.id as string, {
          action: msg.action as GatekeeperAction,
          reason: msg.reason as string || '',
          confidence: (msg.confidence as number) || 0,
        }, 'agent');
        break;

      case 'trust_update':
        if (typeof msg.domain === 'string' && typeof msg.trust === 'number') {
          this.db.upsertDomain(msg.domain, { trustLevel: msg.trust as number });
          this.db.logEvent({
            timestamp: Date.now(),
            domain: msg.domain,
            tabId: null,
            eventType: 'trust_update',
            severity: 'info',
            category: 'behavior',
            details: JSON.stringify({ trust: msg.trust, reason: msg.reason, source: 'gatekeeper-agent' }),
            actionTaken: 'logged',
            confidence: AnalysisConfidence.BEHAVIORAL,
          });
          console.log(`[Gatekeeper] Trust update: ${msg.domain} → ${msg.trust}`);
        }
        break;

      case 'mode_change':
        if (typeof msg.domain === 'string' && typeof msg.mode === 'string') {
          const validModes = ['strict', 'balanced', 'permissive'];
          if (validModes.includes(msg.mode)) {
            this.guardian.setMode(msg.domain, msg.mode as GuardianMode);
            console.log(`[Gatekeeper] Mode change: ${msg.domain} → ${msg.mode}`);
          }
        }
        break;

      case 'escalate':
        this.db.logEvent({
          timestamp: Date.now(),
          domain: (msg.domain as string) || 'unknown',
          tabId: null,
          eventType: 'anomaly',
          severity: 'critical',
          category: 'behavior',
          details: JSON.stringify(msg),
          actionTaken: 'flagged',
          confidence: AnalysisConfidence.BEHAVIORAL,
        });
        console.warn(`[Gatekeeper] ESCALATION: ${msg.message || 'Critical alert from agent'}`);
        break;

      default:
        console.warn(`[Gatekeeper] Unknown message type: ${msg.type}`);
    }
  }

  // === Decision resolution ===

  resolveDecision(id: string, decision: GatekeeperDecision, source: 'agent' | 'timeout' | 'queue-full' | 'rest'): void {
    // Remove from pending queue
    const idx = this.pendingQueue.findIndex(p => p.id === id);
    let pending: PendingDecision | undefined;
    if (idx !== -1) {
      pending = this.pendingQueue[idx];
      this.pendingQueue.splice(idx, 1);
    }

    // Clear timeout
    const timeout = this.pendingTimeouts.get(id);
    if (timeout) {
      clearTimeout(timeout);
      this.pendingTimeouts.delete(id);
    }

    // Execute the decision via Guardian
    this.guardian.submitDecision(id, decision);

    // Track
    this.totalDecisions++;

    // Add to history
    const entry: GatekeeperHistoryEntry = {
      id,
      domain: pending?.domain || 'unknown',
      category: pending?.category || 'request',
      action: decision.action,
      reason: decision.reason,
      confidence: decision.confidence,
      source,
      timestamp: Date.now(),
    };
    this.history.push(entry);
    if (this.history.length > MAX_HISTORY) {
      this.history.shift();
    }

    // Log to DB
    this.db.logEvent({
      timestamp: Date.now(),
      domain: pending?.domain || 'unknown',
      tabId: null,
      eventType: 'gatekeeper_decision',
      severity: decision.action === 'block' ? 'high' : 'info',
      category: 'behavior',
      details: JSON.stringify({ decisionId: id, ...decision, source }),
      actionTaken: decision.action === 'block' ? 'agent_block' : 'logged',
      confidence: AnalysisConfidence.BEHAVIORAL,
    });
  }

  // === REST fallback ===

  submitRestDecision(id: string, action: GatekeeperAction, reason: string, confidence: number): boolean {
    const idx = this.pendingQueue.findIndex(p => p.id === id);
    if (idx === -1) return false;

    this.resolveDecision(id, { action, reason, confidence }, 'rest');
    return true;
  }

  // === Status & queries ===

  getStatus(): GatekeeperStatus {
    return {
      connected: this.client?.readyState === WebSocket.OPEN,
      pendingDecisions: this.pendingQueue.length,
      totalDecisions: this.totalDecisions,
      lastAgentSeen: this.lastAgentSeen,
    };
  }

  getQueue(): PendingDecision[] {
    return [...this.pendingQueue];
  }

  getHistory(limit = 50): GatekeeperHistoryEntry[] {
    return this.history.slice(-limit);
  }

  getSecret(): string {
    return this.authSecret;
  }

  // === Helpers ===

  private send(msg: Record<string, unknown>): void {
    if (this.client?.readyState === WebSocket.OPEN) {
      this.client.send(JSON.stringify(msg));
    }
  }

  private getOrCreateSecret(): string {
    const secretDir = path.join(os.homedir(), '.tandem', 'security');
    const secretPath = path.join(secretDir, 'gatekeeper.secret');

    try {
      if (fs.existsSync(secretPath)) {
        const existing = fs.readFileSync(secretPath, 'utf-8').trim();
        if (existing.length >= 32) {
          return existing;
        }
      }
    } catch {
      // Fall through to generate
    }

    // Generate new secret
    const secret = crypto.randomBytes(32).toString('hex');
    try {
      fs.mkdirSync(secretDir, { recursive: true });
      fs.writeFileSync(secretPath, secret, { mode: 0o600 });
      console.log(`[Gatekeeper] Secret created at ${secretPath}`);
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : String(e);
      console.error(`[Gatekeeper] Failed to write secret: ${errMsg}`);
    }
    return secret;
  }

  // === Cleanup ===

  destroy(): void {
    // Clear all pending timeouts
    for (const timeout of this.pendingTimeouts.values()) {
      clearTimeout(timeout);
    }
    this.pendingTimeouts.clear();

    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    if (this.client) {
      this.client.close(1000, 'Server shutting down');
      this.client = null;
    }

    this.wss.close();
    console.log('[Gatekeeper] WebSocket server closed');
  }
}
