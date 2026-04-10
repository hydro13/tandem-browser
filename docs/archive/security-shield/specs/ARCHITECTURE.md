# Security Shield — Technical Architecture

## Tandem Context

Tandem is an Electron browser (TypeScript + Express API on localhost:8765). It has:

- Multi-tab browsing via BrowserView/webContents
- CDP DevTools bridge (attach to any tab, full Chrome DevTools Protocol access)
- Express API server exposing all browser functionality as REST endpoints
- Chat system (sidebar panel, WebSocket)
- Wingman alert system (notifications to AI wingman)
- Network Inspector (logs requests via session.webRequest — refactored to use dispatcher)
- Stealth layer (anti-detection for web scraping — refactored to use dispatcher)
- Site memory (per-domain preferences)

## Key Files to Understand Before Coding

```
src/main.ts                  — Electron main process, BrowserWindow setup, dispatcher init
src/api/server.ts            — Express API server (2300+ lines), ALL endpoints
src/network/dispatcher.ts    — Unified webRequest handler (Phase 0) — ALL hooks go through here
src/network/inspector.ts     — NetworkInspector class, dispatcher consumer (refactored Phase 0)
src/stealth/manager.ts       — Stealth/anti-detection layer, dispatcher consumer (refactored Phase 0)
src/devtools/manager.ts      — CDP bridge implementation + subscriber system (extended Phase 3)
src/memory/site-memory.ts    — Per-site preferences storage
src/config/                  — App configuration
```

## Critical Electron Limitation

**`session.webRequest` allows only ONE listener per event type.** The last registered listener silently replaces all previous ones. This is a hard Electron limitation ([GitHub Issue #18301](https://github.com/electron/electron/issues/18301)).

**Solution:** The `RequestDispatcher` (Phase 0) registers ONE handler per hook type and multiplexes all consumers through it. ALL webRequest hooks MUST go through the dispatcher.

## Integration Points

### 1. RequestDispatcher — Central webRequest Handler (Phase 0)

```
┌─────────────────────────────────────────────────────┐
│                  RequestDispatcher                    │
│                                                       │
│  onBeforeRequest:                                     │
│    ├── Guardian (priority 1)        → can CANCEL      │
│    ├── OutboundGuard (priority 5)   → can CANCEL      │
│    └── NetworkInspector (priority 100) → logs only    │
│                                                       │
│  onBeforeSendHeaders:                                 │
│    ├── StealthManager (priority 10)  → modifies       │
│    ├── Guardian (priority 20)        → strips/adds    │
│    └── WebSocketOriginFix (priority 50) → modifies    │
│                                                       │
│  onHeadersReceived (response headers chain):           │
│    ├── CookieFix (priority 10)      → modifies        │
│    └── Guardian (priority 20)        → analyzes        │
│                                                       │
│  onCompleted:                                         │
│    └── NetworkInspector              → logs            │
│                                                       │
│  onErrorOccurred:                                     │
│    └── NetworkInspector              → cleanup         │
└─────────────────────────────────────────────────────┘
```

**Rules:**
- Lower priority number = runs first
- `onBeforeRequest`: first consumer returning `{ cancel: true }` blocks the request
- `onBeforeSendHeaders`: request headers chain through all consumers sequentially
- `onHeadersReceived`: response headers chain through all consumers (same pattern — required for cookie fix)
- ALL handlers MUST be synchronous — no async, no await, no setTimeout

### 2. DevToolsManager — CDP Hub (Extended Phase 3)

```
┌─────────────────────────────────────────────────────┐
│                  DevToolsManager                      │
│                                                       │
│  debugger.attach('1.3')  ← ONE connection per tab     │
│                                                       │
│  Built-in consumers:                                  │
│    ├── ConsoleCapture                                 │
│    ├── NetworkCapture                                 │
│    └── WingmanVision (Runtime.addBinding)             │
│                                                       │
│  Subscriber system (Phase 3+):                        │
│    ├── ScriptGuard → Debugger.scriptParsed            │
│    ├── BehaviorMonitor → Performance.getMetrics       │
│    └── ContentAnalyzer → Runtime.evaluate             │
│                                                       │
│  Public API:                                          │
│    ├── subscribe(subscriber)                          │
│    ├── unsubscribe(name)                              │
│    ├── sendCommand(method, params)                    │
│    └── enableSecurityDomains()                        │
└─────────────────────────────────────────────────────┘
```

**Rules:**
- NEVER call `webContents.debugger.attach()` outside DevToolsManager
- Security modules use `subscribe()` to receive CDP events
- Security modules use `sendCommand()` to send CDP commands
- Security injections use `Runtime.addBinding` (invisible to page)

### 3. SecurityManager — Orchestrator

```
┌─────────────────────────────────────────────────────┐
│                  SecurityManager                      │
│                                                       │
│  Creates:                                             │
│    ├── SecurityDB (SQLite)                            │
│    ├── NetworkShield (blocklists)                     │
│    ├── Guardian (request interceptor)                 │
│    ├── OutboundGuard (Phase 2)                        │
│    ├── ScriptGuard (Phase 3)                          │
│    ├── ContentAnalyzer (Phase 3)                      │
│    ├── BehaviorMonitor (Phase 3)                      │
│    ├── GatekeeperWebSocket (Phase 4)                  │
│    ├── EvolutionEngine (Phase 5)                      │
│    └── ThreatIntel (Phase 5)                          │
│                                                       │
│  Registers:                                           │
│    ├── Guardian → RequestDispatcher                   │
│    ├── API routes → Express app (/security/*)         │
│    └── CDP subscribers → DevToolsManager              │
│                                                       │
│  Lifecycle:                                           │
│    ├── constructor() → create DB, shield, guardian     │
│    ├── registerWith(dispatcher) → hook Guardian        │
│    ├── registerRoutes(app) → add API endpoints         │
│    └── destroy() → close DB, stop WS, clear intervals │
└─────────────────────────────────────────────────────┘
```

### 4. API Routes (all under /security/)

```
Phase 1:
  GET  /security/status              — Overall security status + stats
  GET  /security/guardian/status     — Guardian mode, blocks, passes
  POST /security/guardian/mode       — Set guardian mode per domain
  GET  /security/events              — Recent security events
  GET  /security/domains             — All tracked domains with trust levels
  GET  /security/domains/:domain     — Domain reputation + baseline
  POST /security/domains/:domain/trust — Manual trust adjustment
  GET  /security/blocklist/stats     — Blocklist size + last update
  POST /security/blocklist/check     — Manual URL check

Phase 2:
  GET  /security/outbound/stats      — Outbound blocked/allowed/flagged
  GET  /security/outbound/recent     — Recent outbound events
  POST /security/outbound/whitelist  — Whitelist domain pair

Phase 3:
  GET  /security/page/analysis       — Full page security analysis
  GET  /security/page/scripts        — Loaded scripts + risk scores
  GET  /security/page/forms          — Forms + credential risk
  GET  /security/page/trackers       — Tracker inventory
  GET  /security/monitor/resources   — Resource usage per tab
  GET  /security/monitor/permissions — Permission requests + status
  POST /security/monitor/kill        — Kill a specific script/worker

Phase 4:
  GET  /security/gatekeeper/status   — WebSocket connection status
  GET  /security/gatekeeper/queue    — Pending decisions
  POST /security/gatekeeper/decide   — Submit decision (REST fallback)
  GET  /security/gatekeeper/history  — Decision history
  GET  /security/gatekeeper/secret   — Auth secret for agent setup

Phase 5:
  GET  /security/baselines/:domain   — Baseline metrics
  GET  /security/anomalies           — Recent anomalies
  GET  /security/zero-days           — Open zero-day candidates
  POST /security/zero-days/:id/resolve — Mark resolved
  GET  /security/report              — Security report (day/week/month)
  POST /security/blocklist/update    — Trigger blocklist update
  GET  /security/trust/changes       — Recent trust score changes
  POST /security/maintenance/prune   — Prune old events
```

### 5. WebSocket for Gatekeeper Agent (Phase 4)

Endpoint: `ws://127.0.0.1:8765/security/gatekeeper?token=<secret>`

Server → Agent stream:

```jsonl
{"type":"decision_needed","id":"d_001","category":"request","domain":"cdn-xyz.com","context":{"page":"bank.com","resourceType":"script","trust":20,"mode":"strict"},"timeout":30000}
{"type":"anomaly","domain":"example.com","metric":"script_count","expected":12,"actual":28}
{"type":"event","severity":"high","category":"outbound","domain":"shop.com","details":"Cross-origin POST to unknown domain"}
{"type":"stats","interval":300,"requests":1247,"blocked":8,"flagged":3}
```

Agent → Server decisions:

```jsonl
{"type":"decision","id":"d_001","action":"block","reason":"Untrusted script source with high entropy","confidence":0.92}
{"type":"trust_update","domain":"cdn-xyz.com","trust":10,"reason":"Served suspicious script"}
{"type":"escalate","severity":"critical","message":"Possible supply chain attack on bank.com"}
```

### 6. Security Database

SQLite database at `~/.tandem/security/shield.db`:

```sql
-- Domain tracking and trust
CREATE TABLE IF NOT EXISTS domains (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  domain TEXT UNIQUE NOT NULL,
  first_seen INTEGER NOT NULL,
  last_seen INTEGER NOT NULL,
  visit_count INTEGER DEFAULT 1,
  trust_level INTEGER DEFAULT 30,     -- 30 = "unknown, slightly distrustful"
  guardian_mode TEXT DEFAULT 'balanced',
  category TEXT DEFAULT 'unknown',
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Behavior baselines per domain
CREATE TABLE IF NOT EXISTS baselines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  domain TEXT NOT NULL,
  metric TEXT NOT NULL,
  expected_value REAL NOT NULL,
  tolerance REAL NOT NULL,
  sample_count INTEGER DEFAULT 1,
  last_updated TEXT DEFAULT (datetime('now')),
  UNIQUE(domain, metric)
);

-- All security events
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp INTEGER NOT NULL,
  domain TEXT,
  tab_id TEXT,
  event_type TEXT NOT NULL,
  severity TEXT NOT NULL,
  category TEXT,
  details TEXT,
  action_taken TEXT,
  false_positive INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Script fingerprints (track known scripts per domain)
CREATE TABLE IF NOT EXISTS script_fingerprints (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  domain TEXT NOT NULL,
  script_url TEXT NOT NULL,
  script_hash TEXT,
  first_seen INTEGER NOT NULL,
  last_seen INTEGER NOT NULL,
  trusted INTEGER DEFAULT 0,
  UNIQUE(domain, script_url)
);

-- Zero-day candidates
CREATE TABLE IF NOT EXISTS zero_day_candidates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  detected_at INTEGER NOT NULL,
  domain TEXT NOT NULL,
  anomaly_type TEXT NOT NULL,
  baseline_deviation REAL,
  details TEXT,
  resolved INTEGER DEFAULT 0,
  resolution TEXT,
  resolved_at INTEGER
);

-- Blocklist entries (local cache)
CREATE TABLE IF NOT EXISTS blocklist (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  domain TEXT UNIQUE NOT NULL,
  source TEXT NOT NULL,
  category TEXT,
  added_at TEXT DEFAULT (datetime('now')),
  expires_at TEXT
);

-- Outbound whitelist (domain pairs)
CREATE TABLE IF NOT EXISTS outbound_whitelist (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  origin_domain TEXT NOT NULL,
  destination_domain TEXT NOT NULL,
  added_at TEXT DEFAULT (datetime('now')),
  UNIQUE(origin_domain, destination_domain)
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_events_domain ON events(domain);
CREATE INDEX IF NOT EXISTS idx_events_severity ON events(severity);
CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp);
CREATE INDEX IF NOT EXISTS idx_events_category ON events(category);
CREATE INDEX IF NOT EXISTS idx_baselines_domain ON baselines(domain);
CREATE INDEX IF NOT EXISTS idx_blocklist_domain ON blocklist(domain);
CREATE INDEX IF NOT EXISTS idx_script_fp_domain ON script_fingerprints(domain);
CREATE INDEX IF NOT EXISTS idx_zeroday_domain ON zero_day_candidates(domain);
CREATE INDEX IF NOT EXISTS idx_zeroday_resolved ON zero_day_candidates(resolved);
```

## Initialization Order

The dispatcher supports **late registration** — consumers added after `attach()` trigger a re-attach (safe because Electron replaces previous handler).

```
app.whenReady()
  └─> createWindow()
      ├─> Create session (persist:tandem)
      ├─> Create RequestDispatcher(session)          ← Phase 0
      ├─> StealthManager.apply() + registerWith(dispatcher)  (priority 10)
      ├─> Register CookieFix with dispatcher         (priority 10, response headers)
      ├─> Register WebSocketOriginFix with dispatcher (priority 50)
      ├─> dispatcher.attach()                        ← Activates hooks with initial consumers
      ├─> Create BrowserWindow
      └─> startAPI(win)
          ├─> Initialize managers
          ├─> NetworkInspector.registerWith(dispatcher)   ← Late registration (priority 100)
          ├─> SecurityManager.registerWith(dispatcher)    ← Phase 1+ (priority 1)
          ├─> SecurityManager.registerRoutes(app)
          ├─> Start Express server
          └─> Register IPC handlers
```

## Coding Standards

- TypeScript strict mode
- All security modules export a class with clear interface
- Every block/allow decision must be logged to events table
- No external API calls for lookups (privacy first — local blocklists only by default)
- Guardian must NEVER break normal browsing — false positives = trust erosion
- All new security code in `src/security/` — don't scatter across the codebase
- Register routes via SecurityManager, don't modify server.ts directly (except the import + init)
- All webRequest hooks go through RequestDispatcher — never `session.webRequest.onX()` directly
- All CDP access goes through DevToolsManager — never `webContents.debugger.attach()` directly
- Handlers must be synchronous (no async in webRequest callbacks)
- Prepared SQLite statements for all hot-path queries
