import type express from 'express';
import type { SecurityManager } from './security-manager';
import type { GuardianMode, GatekeeperAction } from './types';
import { createLogger } from '../utils/logger';

const log = createLogger('SecurityRoutes');

/**
 * Register all 34 security API routes on the Express app.
 * Extracted from SecurityManager.registerRoutes() so the manager
 * class doesn't depend on Express directly.
 */
export function registerSecurityRoutes(
  app: express.Application,
  sm: SecurityManager,
): void {
  // === Phase 1 routes (1-9) ===

  // 1. GET /security/status — Overall security status + stats
  app.get('/security/status', (_req, res) => {
    try {
      res.json({
        guardian: sm.getGuardian().getStatus(),
        blocklist: sm.getShield().getStats(),
        outbound: sm.getOutboundGuard().getStats(),
        database: {
          events: sm.getDb().getEventCount(),
          domains: sm.getDb().getDomainCount(),
          scriptFingerprints: sm.getDb().getScriptFingerprintCount(),
        },
        phase3: {
          scriptGuard: !!sm.getScriptGuard(),
          contentAnalyzer: !!sm.getContentAnalyzer(),
          behaviorMonitor: !!sm.getBehaviorMonitor(),
        },
      });
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  // 2. GET /security/guardian/status — Guardian mode, blocks, passes
  app.get('/security/guardian/status', (_req, res) => {
    try {
      res.json(sm.getGuardian().getStatus());
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
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
      sm.getGuardian().setMode(domain, mode);
      res.json({ ok: true, domain, mode });
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  // 4. GET /security/events — Recent security events (supports ?severity= and ?category=)
  app.get('/security/events', (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const severity = req.query.severity as string | undefined;
      const category = req.query.category as string | undefined;
      const events = sm.getDb().getRecentEvents(limit, severity, category);
      res.json({ events, total: events.length });
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  // 5. GET /security/domains — All tracked domains with trust levels
  app.get('/security/domains', (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 100;
      const domains = sm.getDb().getDomains(limit);
      res.json({ domains, total: domains.length });
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  // 6. GET /security/domains/:domain — Domain reputation + details
  app.get('/security/domains/:domain', (req, res) => {
    try {
      const domain = req.params.domain;
      const info = sm.getDb().getDomainInfo(domain);
      if (!info) {
        res.status(404).json({ error: 'Domain not found' });
        return;
      }
      const blockStatus = sm.getShield().checkDomain(domain);
      res.json({ ...info, blocked: blockStatus.blocked, blockReason: blockStatus.reason });
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
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
      sm.getDb().upsertDomain(domain, { trustLevel: trust });
      res.json({ ok: true, domain, trust });
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  // 8. GET /security/blocklist/stats — Blocklist size + last update
  app.get('/security/blocklist/stats', (_req, res) => {
    try {
      const memoryStats = sm.getShield().getStats();
      const dbStats = sm.getDb().getBlocklistStats();
      res.json({
        memory: memoryStats,
        database: dbStats,
      });
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
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
      const result = sm.getShield().checkUrl(url);
      res.json({ url, ...result });
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  // === Phase 2: Outbound Data Guard routes (10-12) ===

  // 10. GET /security/outbound/stats — Outbound requests blocked/allowed/flagged
  app.get('/security/outbound/stats', (_req, res) => {
    try {
      res.json(sm.getOutboundGuard().getStats());
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  // 11. GET /security/outbound/recent — Recent outbound events
  app.get('/security/outbound/recent', (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const events = sm.getDb().getRecentEvents(limit, undefined, 'outbound');
      res.json({ events, total: events.length });
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
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
      sm.getDb().addWhitelistPair(origin.toLowerCase(), destination.toLowerCase());
      res.json({ ok: true, origin: origin.toLowerCase(), destination: destination.toLowerCase() });
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  // === Phase 3: Script & Content Guard routes (13-19) ===

  // 13. GET /security/page/analysis — Full page security analysis (async)
  app.get('/security/page/analysis', async (_req, res) => {
    try {
      const contentAnalyzer = sm.getContentAnalyzer();
      if (!contentAnalyzer) {
        res.status(503).json({ error: 'ContentAnalyzer not initialized (DevToolsManager not connected)' });
        return;
      }
      const analysis = await contentAnalyzer.analyzePage();
      res.json(analysis);
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  // 14. GET /security/page/scripts — All loaded scripts + risk info
  app.get('/security/page/scripts', (_req, res) => {
    try {
      const scriptGuard = sm.getScriptGuard();
      if (!scriptGuard) {
        res.status(503).json({ error: 'ScriptGuard not initialized' });
        return;
      }
      const scripts = Array.from(scriptGuard.getScriptsParsed().entries()).map(([id, info]) => ({
        scriptId: id,
        ...info,
      }));

      // Also get fingerprinted scripts from DB for current domain
      const devToolsManager = sm.getDevToolsManager();
      const wc = devToolsManager?.getAttachedWebContents();
      const currentUrl = wc ? wc.getURL() : '';
      let domain: string | null = null;
      try { domain = new URL(currentUrl).hostname.toLowerCase(); } catch {}

      const fingerprinted = domain ? sm.getDb().getScriptsByDomain(domain) : [];

      res.json({
        sessionScripts: scripts,
        fingerprintedScripts: fingerprinted,
        totalFingerprints: sm.getDb().getScriptFingerprintCount(),
      });
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  // 15. GET /security/page/forms — All forms + credential risk assessment
  app.get('/security/page/forms', async (_req, res) => {
    try {
      const contentAnalyzer = sm.getContentAnalyzer();
      if (!contentAnalyzer) {
        res.status(503).json({ error: 'ContentAnalyzer not initialized' });
        return;
      }
      const analysis = await contentAnalyzer.analyzePage();
      res.json({
        forms: analysis.forms,
        hasPasswordOnHttp: analysis.security.hasPasswordOnHttp,
        riskScore: analysis.riskScore,
      });
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  // 16. GET /security/page/trackers — Tracker inventory
  app.get('/security/page/trackers', async (_req, res) => {
    try {
      const contentAnalyzer = sm.getContentAnalyzer();
      if (!contentAnalyzer) {
        res.status(503).json({ error: 'ContentAnalyzer not initialized' });
        return;
      }
      const analysis = await contentAnalyzer.analyzePage();
      res.json({
        trackers: analysis.trackers,
        total: analysis.trackers.length,
      });
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  // 17. GET /security/monitor/resources — Resource usage per tab
  app.get('/security/monitor/resources', (_req, res) => {
    try {
      const behaviorMonitor = sm.getBehaviorMonitor();
      if (!behaviorMonitor) {
        res.status(503).json({ error: 'BehaviorMonitor not initialized' });
        return;
      }
      const snapshots = behaviorMonitor.getResourceSnapshots();
      const wasmCount = sm.getScriptGuard()?.getRecentWasmCount() || 0;
      res.json({
        snapshots,
        currentWasmActivity: wasmCount,
        snapshotCount: snapshots.length,
      });
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  // 18. GET /security/monitor/permissions — All permission requests + status
  app.get('/security/monitor/permissions', (_req, res) => {
    try {
      const behaviorMonitor = sm.getBehaviorMonitor();
      if (!behaviorMonitor) {
        res.status(503).json({ error: 'BehaviorMonitor not initialized' });
        return;
      }
      const log = behaviorMonitor.getPermissionLog();
      res.json({
        permissions: log,
        total: log.length,
        blocked: log.filter(p => p.action === 'blocked').length,
        allowed: log.filter(p => p.action === 'allowed').length,
      });
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  // 19. POST /security/monitor/kill — Kill a specific script/worker via CDP
  app.post('/security/monitor/kill', async (req, res) => {
    try {
      const behaviorMonitor = sm.getBehaviorMonitor();
      if (!behaviorMonitor) {
        res.status(503).json({ error: 'BehaviorMonitor not initialized' });
        return;
      }
      const { scriptId } = req.body;
      const success = await behaviorMonitor.killScript(scriptId || 'current');
      res.json({ ok: success, scriptId: scriptId || 'current' });
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  // === Phase 4: AI Gatekeeper Agent routes (20-24) ===

  // 20. GET /security/gatekeeper/status — WebSocket connection status + queue
  app.get('/security/gatekeeper/status', (_req, res) => {
    try {
      const gatekeeperWs = sm.getGatekeeperWs();
      if (!gatekeeperWs) {
        res.json({ connected: false, pendingDecisions: 0, totalDecisions: 0, lastAgentSeen: null, note: 'Gatekeeper not initialized' });
        return;
      }
      res.json(gatekeeperWs.getStatus());
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  // 21. GET /security/gatekeeper/queue — Pending decisions
  app.get('/security/gatekeeper/queue', (_req, res) => {
    try {
      const gatekeeperWs = sm.getGatekeeperWs();
      if (!gatekeeperWs) {
        res.json({ queue: [], total: 0 });
        return;
      }
      const queue = gatekeeperWs.getQueue();
      res.json({ queue, total: queue.length });
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  // 22. POST /security/gatekeeper/decide — Submit a decision via REST (fallback)
  app.post('/security/gatekeeper/decide', (req, res) => {
    try {
      const gatekeeperWs = sm.getGatekeeperWs();
      if (!gatekeeperWs) {
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
      const found = gatekeeperWs.submitRestDecision(id, action, reason || '', confidence || 0);
      if (!found) {
        res.status(404).json({ error: 'Decision not found in pending queue' });
        return;
      }
      res.json({ ok: true, id, action });
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  // 23. GET /security/gatekeeper/history — Decision history
  app.get('/security/gatekeeper/history', (req, res) => {
    try {
      const gatekeeperWs = sm.getGatekeeperWs();
      if (!gatekeeperWs) {
        res.json({ history: [], total: 0 });
        return;
      }
      const limit = parseInt(req.query.limit as string) || 50;
      const history = gatekeeperWs.getHistory(limit);
      res.json({ history, total: history.length });
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  // 24. GET /security/gatekeeper/secret — Auth secret for agent setup
  app.get('/security/gatekeeper/secret', (_req, res) => {
    try {
      const gatekeeperWs = sm.getGatekeeperWs();
      if (!gatekeeperWs) {
        res.status(503).json({ error: 'Gatekeeper not initialized' });
        return;
      }
      res.json({ secret: gatekeeperWs.getSecret(), path: '~/.tandem/security/gatekeeper.secret' });
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  // === Phase 5: Evolution Engine + Agent Fleet routes (25-32) ===

  // 25. GET /security/baselines/:domain — Baseline metrics for a domain
  app.get('/security/baselines/:domain', (req, res) => {
    try {
      const domain = req.params.domain;
      const baselines = sm.getDb().getBaselinesByDomain(domain);
      res.json({ domain, baselines, total: baselines.length });
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  // 26. GET /security/anomalies — Recent anomalies
  app.get('/security/anomalies', (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const anomalies = sm.getDb().getRecentAnomalies(limit);
      res.json({ anomalies, total: anomalies.length });
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  // 27. GET /security/zero-days — Open zero-day candidates
  app.get('/security/zero-days', (_req, res) => {
    try {
      const candidates = sm.getDb().getOpenZeroDayCandidates();
      res.json({ candidates, total: candidates.length });
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
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
      const success = sm.getDb().resolveZeroDayCandidate(id, resolution || 'Resolved');
      if (!success) {
        res.status(404).json({ error: 'Zero-day candidate not found' });
        return;
      }
      res.json({ ok: true, id });
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
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
      const report = sm.getThreatIntel().generateReport(period as 'day' | 'week' | 'month');
      res.json(report);
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  // 30. POST /security/blocklist/update — Trigger blocklist update
  app.post('/security/blocklist/update', async (_req, res) => {
    try {
      const result = await sm.getBlocklistUpdater().update();
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
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
      const changes = sm.getDb().getTrustChanges(since);
      res.json({ changes, total: changes.length, period });
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  // 32. POST /security/maintenance/prune — Prune old events (>90 days)
  app.post('/security/maintenance/prune', (_req, res) => {
    try {
      const ninetyDaysMs = 90 * 86400_000;
      const pruned = sm.getDb().pruneOldEvents(ninetyDaysMs);
      res.json({ ok: true, pruned, cutoffDays: 90 });
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  // === Phase 3-B: Script correlation routes (33) ===

  // 33. GET /security/scripts/correlations — Cross-domain script correlation data (extended Phase 6-B: AST matches)
  app.get('/security/scripts/correlations', (_req, res) => {
    try {
      const db = sm.getDb();
      const shield = sm.getShield();

      // Hash-based widespread scripts (Phase 3-B)
      const widespread = db.getWidespreadScripts();
      const hashResults = widespread.map(script => {
        const domains = db.getDomainsForHash(script.scriptHash);
        const blockedDomains = domains.filter(d => shield.checkDomain(d).blocked);
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
      const widespreadAst = db.getWidespreadAstScripts();
      const astResults = widespreadAst.map(entry => {
        const matches = db.getAstMatches(entry.astHash);
        const variants = matches.map(m => ({
          domain: m.domain,
          hash: m.scriptHash,
          url: m.scriptUrl,
        }));
        const distinctHashes = new Set(matches.map(m => m.scriptHash).filter(Boolean));
        const blockedVariants = matches.filter(m => shield.checkDomain(m.domain).blocked);
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
        totalTrackedScripts: db.getScriptFingerprintCount(),
        crossDomainScripts: db.getCrossDomainScriptCount(),
        astCorrelations: astResults.length,
      });
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  // === Phase 7-A: Analyzer plugin routes (34) ===

  // 34. GET /security/analyzers/status — Loaded analyzer plugins
  app.get('/security/analyzers/status', (_req, res) => {
    try {
      const analyzers = sm.getAnalyzerManager().getStatus();
      res.json({
        analyzers,
        total: analyzers.length,
      });
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  log.info('34 API routes registered under /security/*');
}
