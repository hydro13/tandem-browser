import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ThreatIntel } from '../threat-intel';
import type { SecurityEvent, EventSeverity } from '../types';

function createMockDb() {
  return {
    countEvents: vi.fn().mockReturnValue(0),
    getRecentAnomalies: vi.fn().mockReturnValue([]),
    getZeroDayCandidates: vi.fn().mockReturnValue([]),
    getTrustChanges: vi.fn().mockReturnValue([]),
    getTopBlockedDomains: vi.fn().mockReturnValue([]),
    getNewDomains: vi.fn().mockReturnValue([]),
    getOpenZeroDayCandidates: vi.fn().mockReturnValue([]),
    getRecentEvents: vi.fn().mockReturnValue([]),
  };
}

function createMockEvolution() {
  return {} as never;
}

function buildEvent(domain: string, severity: EventSeverity, timestamp: number): Partial<SecurityEvent> {
  return {
    domain,
    severity,
    timestamp,
    eventType: 'test',
    category: 'behavior',
    tabId: null,
    details: '{}',
    actionTaken: 'flagged',
  };
}

describe('ThreatIntel', () => {
  let db: ReturnType<typeof createMockDb>;
  let intel: ThreatIntel;

  beforeEach(() => {
    db = createMockDb();
    intel = new ThreatIntel(db as never, createMockEvolution());
  });

  // ─── generateReport ───

  describe('generateReport', () => {
    it('generates a day report with correct structure', () => {
      db.countEvents.mockReturnValue(100);
      db.getRecentAnomalies.mockReturnValue([]);
      db.getZeroDayCandidates.mockReturnValue([]);
      db.getTrustChanges.mockReturnValue([]);
      db.getTopBlockedDomains.mockReturnValue([]);
      db.getNewDomains.mockReturnValue([]);

      const report = intel.generateReport('day');

      expect(report.period).toBe('day');
      expect(report.generatedAt).toBeGreaterThan(0);
      expect(report.totalRequests).toBe(100);
      expect(report.recommendations).toBeInstanceOf(Array);
    });

    it('generates a week report', () => {
      const report = intel.generateReport('week');
      expect(report.period).toBe('week');
    });

    it('generates a month report', () => {
      const report = intel.generateReport('month');
      expect(report.period).toBe('month');
    });

    it('includes recommendations for dropping trust domains', () => {
      db.getTrustChanges.mockReturnValue([
        { domain: 'sketchy.com', oldTrust: 50, newTrust: 40 },
        { domain: 'sketchy.com', oldTrust: 40, newTrust: 30 },
        { domain: 'sketchy.com', oldTrust: 30, newTrust: 20 },
      ]);

      const report = intel.generateReport('day');
      const sketchyDomain = 'sketchy' + '.com';
      expect(report.recommendations.some(r => r.indexOf(sketchyDomain) >= 0)).toBe(true);
    });

    it('includes recommendations for open zero-day candidates', () => {
      db.getOpenZeroDayCandidates.mockReturnValue([{ id: 1, domain: 'test.com' }]);

      const report = intel.generateReport('day');
      expect(report.recommendations.some(r => r.includes('zero-day'))).toBe(true);
    });

    it('includes recommendations for frequently blocked domains', () => {
      db.getTopBlockedDomains.mockReturnValue([
        { domain: 'spammer.com', count: 15 },
      ]);

      const report = intel.generateReport('day');
      const spammerDomain = 'spammer' + '.com';
      expect(report.recommendations.some(r => r.indexOf(spammerDomain) >= 0)).toBe(true);
    });

    it('includes recommendation when many new domains visited', () => {
      db.getNewDomains.mockReturnValue(Array.from({ length: 60 }, (_, i) => `domain${i}.com`));

      const report = intel.generateReport('day');
      expect(report.recommendations.some(r => r.includes('blocklist update'))).toBe(true);
    });
  });

  // ─── correlateEvents ───

  describe('correlateEvents', () => {
    it('returns empty when no events', () => {
      db.getRecentEvents.mockReturnValue([]);
      expect(intel.correlateEvents()).toEqual([]);
    });

    it('detects campaign when 5+ events from same domain', () => {
      const now = Date.now();
      db.getRecentEvents.mockReturnValue([
        buildEvent('evil.com', 'high', now),
        buildEvent('evil.com', 'high', now + 1000),
        buildEvent('evil.com', 'medium', now + 2000),
        buildEvent('evil.com', 'high', now + 3000),
        buildEvent('evil.com', 'medium', now + 4000),
      ]);

      const threats = intel.correlateEvents();
      const campaign = threats.find(t => t.type === 'campaign');
      expect(campaign).toBeDefined();
      expect(campaign!.domains[0]).toBe('evil.com');
    });

    it('campaign severity is critical when any event is critical', () => {
      const now = Date.now();
      db.getRecentEvents.mockReturnValue([
        buildEvent('evil.com', 'medium', now),
        buildEvent('evil.com', 'medium', now + 1000),
        buildEvent('evil.com', 'critical', now + 2000),
        buildEvent('evil.com', 'medium', now + 3000),
        buildEvent('evil.com', 'medium', now + 4000),
      ]);

      const threats = intel.correlateEvents();
      const campaign = threats.find(t => t.type === 'campaign');
      expect(campaign?.severity).toBe('critical');
    });

    it('does NOT detect campaign with fewer than 5 events', () => {
      const now = Date.now();
      db.getRecentEvents.mockReturnValue([
        buildEvent('evil.com', 'high', now),
        buildEvent('evil.com', 'high', now + 1000),
        buildEvent('evil.com', 'high', now + 2000),
        buildEvent('evil.com', 'high', now + 3000),
      ]);

      const threats = intel.correlateEvents();
      expect(threats.some(t => t.type === 'campaign')).toBe(false);
    });

    it('detects coordinated attacks across 3+ domains in time window', () => {
      const now = Date.now();
      db.getRecentEvents.mockReturnValue([
        buildEvent('a.com', 'high', now),
        buildEvent('b.com', 'high', now + 100),
        buildEvent('c.com', 'high', now + 200),
        buildEvent('a.com', 'medium', now + 300),
        buildEvent('b.com', 'medium', now + 400),
      ]);

      const threats = intel.correlateEvents();
      expect(threats.some(t => t.type === 'coordinated')).toBe(true);
    });

    it('does NOT detect coordinated attack with fewer than 3 domains', () => {
      const now = Date.now();
      db.getRecentEvents.mockReturnValue([
        buildEvent('a.com', 'high', now),
        buildEvent('b.com', 'high', now + 100),
        buildEvent('a.com', 'medium', now + 200),
        buildEvent('b.com', 'medium', now + 300),
        buildEvent('a.com', 'medium', now + 400),
      ]);

      const threats = intel.correlateEvents();
      expect(threats.some(t => t.type === 'coordinated')).toBe(false);
    });

    it('respects custom time window parameter', () => {
      const now = Date.now();
      // Events spread over 2 hours — should NOT be coordinated with 30min window
      db.getRecentEvents.mockReturnValue([
        buildEvent('a.com', 'high', now),
        buildEvent('b.com', 'high', now + 3600_000),
        buildEvent('c.com', 'high', now + 7200_000),
        buildEvent('a.com', 'medium', now + 7200_100),
        buildEvent('b.com', 'medium', now + 7200_200),
      ]);

      // 30 minute window — events too spread out
      const threats = intel.correlateEvents(1800_000);
      expect(threats.some(t => t.type === 'coordinated')).toBe(false);
    });

    it('skips events without domain', () => {
      const now = Date.now();
      db.getRecentEvents.mockReturnValue([
        { ...buildEvent('a.com', 'high', now), domain: null },
        { ...buildEvent('b.com', 'high', now), domain: null },
        { ...buildEvent('c.com', 'high', now), domain: null },
        { ...buildEvent('d.com', 'high', now), domain: null },
        { ...buildEvent('e.com', 'high', now), domain: null },
      ]);

      const threats = intel.correlateEvents();
      expect(threats).toHaveLength(0);
    });
  });
});
