# Phase 4: AI Gatekeeper Agent

## Goal

Build the WebSocket bridge between Guardian and an AI agent that makes real-time security decisions. This is where rule-based security becomes AI-powered security.

## Prerequisites

- **Phase 0-3 MUST be completed and verified** — check `docs/security-shield/STATUS.md`
- Understand OpenClaw agent/cron system (the Gatekeeper runs as an OpenClaw agent)
- Read Phase 3 STATUS notes — check for any DevToolsManager changes that affect this phase

## Concept

Guardian (Phase 1) handles 95% of decisions with rules. The remaining 5% — the ambiguous, novel, or context-dependent threats — go to the Gatekeeper Agent via WebSocket. The agent uses AI to understand context and decide.

```
Guardian (Tandem, real-time rules)
    ↕ WebSocket
Gatekeeper Agent (OpenClaw, AI-powered decisions)
```

**The browser is ALWAYS protected, even without the AI agent. The agent makes it SMARTER, not FUNCTIONAL.**

## Deliverables

### 1. `src/security/gatekeeper-ws.ts` — WebSocket Server

```typescript
import { Server as HttpServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { Guardian } from './guardian';
import { SecurityDB } from './security-db';

class GatekeeperWebSocket {
  private wss: WebSocketServer;
  private client: WebSocket | null = null;
  private pendingQueue: PendingDecision[] = [];
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private authSecret: string;

  constructor(server: HttpServer, guardian: Guardian, db: SecurityDB) {
    // Shared secret for authentication
    this.authSecret = this.getOrCreateSecret();

    // Create WebSocket server on the existing HTTP server
    // Path: /security/gatekeeper
    this.wss = new WebSocketServer({
      server,
      path: '/security/gatekeeper',
      verifyClient: (info, callback) => {
        // Verify auth token in query params or headers
        const url = new URL(info.req.url || '', 'http://localhost');
        const token = url.searchParams.get('token') || info.req.headers['x-gatekeeper-token'];
        callback(token === this.authSecret);
      }
    });

    this.wss.on('connection', (ws) => {
      this.handleConnection(ws);
    });
  }

  private handleConnection(ws: WebSocket): void {
    // Only allow one agent connection at a time
    if (this.client) {
      this.client.close(1000, 'Replaced by new connection');
    }
    this.client = ws;

    console.log('[Gatekeeper] Agent connected');

    // Start heartbeat
    this.heartbeatInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.ping();
      }
    }, 30_000);

    // Replay queued events
    for (const item of this.pendingQueue) {
      this.send({ type: 'decision_needed', ...item });
    }

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        this.handleAgentMessage(msg);
      } catch (e) {
        console.error('[Gatekeeper] Invalid message:', e);
      }
    });

    ws.on('close', () => {
      console.log('[Gatekeeper] Agent disconnected');
      this.client = null;
      if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    });
  }

  // === Send events TO agent ===

  sendEvent(event: SecurityEvent): void {
    this.send({ type: 'event', ...event });
  }

  sendDecisionRequest(item: PendingDecision): void {
    // Cap queue size to prevent unbounded growth when agent is offline
    const MAX_QUEUE = 1000;
    if (this.pendingQueue.length >= MAX_QUEUE) {
      // Evict oldest, use its defaultAction
      const evicted = this.pendingQueue.shift()!;
      this.resolveDecision(evicted.id, {
        action: evicted.defaultAction,
        reason: 'queue-full — evicted oldest pending decision',
        confidence: 0,
      });
    }

    this.pendingQueue.push(item);
    this.send({ type: 'decision_needed', ...item });

    // Timeout: use default action if agent doesn't respond
    setTimeout(() => {
      if (this.pendingQueue.find(p => p.id === item.id)) {
        this.resolveDecision(item.id, {
          action: item.defaultAction,
          reason: 'timeout — agent did not respond',
          confidence: 0,
        });
      }
    }, item.timeout);
  }

  sendAnomaly(anomaly: any): void {
    this.send({ type: 'anomaly', ...anomaly });
  }

  sendStats(stats: any): void {
    this.send({ type: 'stats', ...stats });
  }

  // === Receive decisions FROM agent ===

  private handleAgentMessage(msg: any): void {
    switch (msg.type) {
      case 'decision':
        this.resolveDecision(msg.id, msg);
        break;
      case 'trust_update':
        // Update domain trust level
        this.db.upsertDomain(msg.domain, { trustLevel: msg.trust });
        break;
      case 'mode_change':
        // Change guardian mode for domain
        this.guardian.setMode(msg.domain, msg.mode);
        break;
      case 'escalate':
        // Critical alert — log as critical event
        this.db.logEvent({
          timestamp: Date.now(),
          domain: msg.domain,
          tabId: null,
          eventType: 'anomaly',
          severity: 'critical',
          category: 'behavior',
          details: JSON.stringify(msg),
          actionTaken: 'flagged',
        });
        break;
    }
  }

  private resolveDecision(id: string, decision: any): void {
    this.pendingQueue = this.pendingQueue.filter(p => p.id !== id);
    // Execute the decision via Guardian
    this.guardian.submitDecision(id, decision);
  }

  // === Status ===

  getStatus(): GatekeeperStatus {
    return {
      connected: this.client?.readyState === WebSocket.OPEN,
      pendingDecisions: this.pendingQueue.length,
      queuedEvents: 0,
    };
  }

  // === Helpers ===

  private send(msg: any): void {
    if (this.client?.readyState === WebSocket.OPEN) {
      this.client.send(JSON.stringify(msg));
    }
  }

  private getOrCreateSecret(): string {
    // Read from ~/.tandem/security/gatekeeper.secret
    // If doesn't exist, generate random 32-byte hex string and save
  }

  // Cleanup
  destroy(): void {
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    this.client?.close();
    this.wss.close();
  }
}
```

### 2. Guardian Enhancement — Decision Queue

Extend Guardian to queue uncertain decisions for the AI agent:

```typescript
// In guardian.ts — new properties
private gatekeeperWs: GatekeeperWebSocket | null = null;
private decisionCallbacks: Map<string, (decision: any) => void> = new Map();

// New method: set the gatekeeper reference
setGatekeeper(ws: GatekeeperWebSocket): void {
  this.gatekeeperWs = ws;
}

// New method: handle decisions from the agent
submitDecision(id: string, decision: any): void {
  const callback = this.decisionCallbacks.get(id);
  if (callback) {
    callback(decision);
    this.decisionCallbacks.delete(id);
  }
  // Log to DB regardless
  this.db.logEvent({ /* decision details */ });
}

// Enhanced checkRequest: for uncertain cases, queue for AI
private checkRequest(details): { cancel: boolean } | null {
  // ... existing Phase 1-2 checks ...

  // If uncertain and gatekeeper connected:
  if (isUncertain && this.gatekeeperWs?.getStatus().connected) {
    const id = crypto.randomUUID();
    this.gatekeeperWs.sendDecisionRequest({
      id,
      type: 'request',
      details: { url: details.url, domain, method: details.method },
      defaultAction: 'allow',  // Allow with monitoring if timeout
      timeout: 30_000,
    });
    // Allow immediately but monitor — retroactive blocking is complex
    // and the request may already be processed by the renderer.
    // Instead: allow, log, and let the agent adjust trust/mode for FUTURE requests.
    return null;
  }

  return null; // Allow by default
}
```

> **Design note:** The original plan suggested "retroactively block/kill" after timeout. This is technically difficult — a response may already be rendered. Instead, the AI agent adjusts trust scores and modes, affecting FUTURE requests from that domain. This is more reliable and less error-prone.

### 3. Gatekeeper Agent Definition (OpenClaw)

The agent runs as an OpenClaw session. Provide the agent prompt as documentation:

```
Agent: Tandem Gatekeeper
Model: Sonnet (fast + smart enough for real-time)
Type: Long-running session with WebSocket connection

Connection:
  ws://127.0.0.1:8765/security/gatekeeper?token=<secret>
  Secret from: ~/.tandem/security/gatekeeper.secret

Responsibilities:
1. Connect to WebSocket and read event stream
2. For each decision_needed:
   - Read context (domain trust, baseline, what's happening)
   - Decide: block / allow / investigate
   - Send decision back via WebSocket
3. For anomalies:
   - Investigate using Tandem API endpoints
   - Deep dive: GET /security/page/analysis, GET /devtools/network
   - Determine if real threat or false positive
4. For critical threats:
   - Alert Robin immediately
   - Take protective action (trust score → 0, mode → strict)
5. Periodically:
   - GET /security/events?severity=high to review flagged items
   - Adjust trust scores based on accumulated evidence
```

### 4. New API Endpoints

```typescript
// GET  /security/gatekeeper/status   — WebSocket connection status + queue
// GET  /security/gatekeeper/queue    — Pending decisions
// POST /security/gatekeeper/decide   — Submit a decision via REST (fallback)
// GET  /security/gatekeeper/history  — Decision history from DB
// GET  /security/gatekeeper/secret   — Get the auth secret (for agent setup)
```

## Communication Protocol

### Server → Agent

```jsonl
{"type":"decision_needed","id":"d_001","category":"request","domain":"cdn-xyz.com","context":{"page":"bank.com","resourceType":"script","trust":20,"mode":"strict"},"timeout":30000}
{"type":"anomaly","domain":"example.com","metric":"script_count","expected":8,"actual":23,"severity":"medium"}
{"type":"event","severity":"high","category":"outbound","domain":"shop.com","details":"Cross-origin POST to analytics-unknown.xyz with 2.4KB body"}
{"type":"stats","interval":300,"requests":1247,"blocked":8,"flagged":3,"anomalies":1}
```

### Agent → Server

```jsonl
{"type":"decision","id":"d_001","action":"block","reason":"Untrusted CDN loading script on banking site in strict mode","confidence":0.92}
{"type":"trust_update","domain":"cdn-xyz.com","trust":10,"reason":"Served suspicious script on trusted banking page"}
{"type":"escalate","severity":"critical","message":"Possible supply chain attack: new script on bank.com from compromised CDN","notify":"robin"}
```

## Fallback Behavior

If the Gatekeeper Agent is not connected:
- Guardian operates on rules only (Phase 1-3)
- Pending decisions use their `defaultAction` after timeout
- Events are queued and replayed when agent reconnects
- Critical rule-based blocks still work (blocklists, known patterns)

## Dependencies to Add

```bash
npm install ws
npm install -D @types/ws
```

```json
{
  "dependencies": {
    "ws": "^8.16.0"
  },
  "devDependencies": {
    "@types/ws": "^8.5.0"
  }
}
```

> **Verified:** `ws` is NOT bundled with Electron 28 — `require('ws')` fails. This is a required new dependency.

## Verification Checklist

- [ ] WebSocket server starts on `/security/gatekeeper`
- [ ] Agent can connect with valid token and receive event stream
- [ ] Invalid token → connection rejected
- [ ] Agent can submit decisions that Guardian processes
- [ ] Decision timeout works (default action after 30s)
- [ ] Queue persists if agent disconnects briefly
- [ ] Agent reconnect replays queued events
- [ ] Browser works normally when no agent is connected
- [ ] `GET /security/gatekeeper/status` shows connection status
- [ ] `POST /security/gatekeeper/decide` works as REST fallback
- [ ] Decision history logged and queryable via API
- [ ] Phase 0-3 regression check: all previous features still work

## What NOT to Change

- Do NOT modify the RequestDispatcher
- Do NOT modify DevToolsManager subscriber system
- Do NOT add evolution/learning features — that's Phase 5

## Commit Convention

```bash
git add src/security/gatekeeper-ws.ts src/security/guardian.ts src/security/security-manager.ts src/security/types.ts package.json
git commit -m "feat(security): Phase 4 — AI Gatekeeper Agent

- Add GatekeeperWebSocket server for real-time AI agent communication
- Add decision queue system with timeout + default actions
- Add auth via shared secret for WebSocket connections
- Add REST fallback endpoints for agent decisions
- Guardian queues uncertain decisions for AI analysis
- Browser remains fully protected without agent connected

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
git push origin main
```

## Scope (1 Claude Code session)

- GatekeeperWebSocket server (auth, heartbeat, queue, reconnect)
- Guardian enhancement (decision queue, timeout, submitDecision)
- Gatekeeper agent definition (OpenClaw prompt)
- 5 API endpoints + verification

## Status Update Template

After completing this phase, update `docs/security-shield/STATUS.md`:

```markdown
## Phase 4: AI Gatekeeper Agent
- **Status:** COMPLETED
- **Date:** YYYY-MM-DD
- **Commit:** <hash>
- **Gatekeeper secret location:** ~/.tandem/security/gatekeeper.secret
- **Verification:**
  - [x] WebSocket server active
  - [x] Auth works (reject invalid tokens)
  - [x] Agent can connect + receive events
  - [x] Decisions processed correctly
  - [x] Timeout fallback works
  - [x] Queue replay on reconnect
  - [x] Browser works without agent
  - [x] REST fallback works
  - [x] Phase 0-3 regression OK
- **Issues encountered:** (none / describe)
- **Notes for next phase:** (anything Phase 5 session needs to know)
- **Agent setup instructions:** (how to configure OpenClaw agent)
```
