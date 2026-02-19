import express from 'express';
import { RequestDispatcher } from '../network/dispatcher';
import { SecurityDB } from './security-db';
import { NetworkShield } from './network-shield';
import { Guardian } from './guardian';
import { GuardianMode } from './types';

export class SecurityManager {
  private db: SecurityDB;
  private shield: NetworkShield;
  private guardian: Guardian;

  constructor() {
    this.db = new SecurityDB();
    this.shield = new NetworkShield(this.db);
    this.guardian = new Guardian(this.db, this.shield);
    console.log('[SecurityManager] Initialized');
  }

  registerWith(dispatcher: RequestDispatcher): void {
    this.guardian.registerWith(dispatcher);
  }

  registerRoutes(app: express.Application): void {
    // 1. GET /security/status — Overall security status + stats
    app.get('/security/status', (_req, res) => {
      try {
        res.json({
          guardian: this.guardian.getStatus(),
          blocklist: this.shield.getStats(),
          database: {
            events: this.db.getEventCount(),
            domains: this.db.getDomainCount(),
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

    // 4. GET /security/events — Recent security events
    app.get('/security/events', (req, res) => {
      try {
        const limit = parseInt(req.query.limit as string) || 50;
        const severity = req.query.severity as string | undefined;
        const events = this.db.getRecentEvents(limit, severity);
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

    console.log('[SecurityManager] 9 API routes registered under /security/*');
  }

  destroy(): void {
    this.db.close();
    console.log('[SecurityManager] Destroyed');
  }
}
