import { SecurityDB } from './security-db';
import { EvolutionEngine } from './evolution';
import { SecurityReport, CorrelatedThreat, EventSeverity } from './types';

/**
 * ThreatIntel — Intelligence layer for security reporting and event correlation.
 *
 * Generates periodic security reports (day/week/month) with stats, zero-day candidates,
 * trust changes, and recommendations. Correlates events by domain grouping and time
 * clustering to detect coordinated attacks or campaigns.
 */
export class ThreatIntel {
  private db: SecurityDB;
  private evolution: EvolutionEngine;

  constructor(db: SecurityDB, evolution: EvolutionEngine) {
    this.db = db;
    this.evolution = evolution;
  }

  /**
   * Generate a comprehensive security report for the given period.
   */
  generateReport(period: 'day' | 'week' | 'month'): SecurityReport {
    const since = this.getPeriodStart(period);

    return {
      period,
      generatedAt: Date.now(),
      totalRequests: this.db.countEvents(since),
      blockedRequests: this.db.countEvents(since, 'auto_block') + this.db.countEvents(since, 'agent_block'),
      flaggedRequests: this.db.countEvents(since, 'flagged'),
      anomaliesDetected: this.db.getRecentAnomalies(1000).filter(e => e.timestamp >= since).length,
      zeroDayCandidates: this.db.getZeroDayCandidates(since),
      trustChanges: this.db.getTrustChanges(since),
      topBlockedDomains: this.db.getTopBlockedDomains(since, 10),
      newDomainsVisited: this.db.getNewDomains(since),
      recommendations: this.generateRecommendations(since),
    };
  }

  /**
   * Correlate recent events to detect patterns:
   * - Campaign: multiple blocks from same domain
   * - Coordinated: events clustering in short time windows
   * - Supply chain: same external resource causing issues across multiple sites
   */
  correlateEvents(timeWindowMs: number = 3600_000): CorrelatedThreat[] {
    const recentEvents = this.db.getRecentEvents(500, 'medium');
    const threats: CorrelatedThreat[] = [];

    // Group by source domain — multiple blocks from same source = campaign
    const domainGroups = new Map<string, { count: number; timestamps: number[]; severities: EventSeverity[] }>();
    for (const event of recentEvents) {
      if (!event.domain) continue;
      const group = domainGroups.get(event.domain) || { count: 0, timestamps: [], severities: [] };
      group.count++;
      group.timestamps.push(event.timestamp);
      group.severities.push(event.severity as EventSeverity);
      domainGroups.set(event.domain, group);
    }

    for (const [domain, group] of domainGroups) {
      if (group.count >= 5) {
        const timeSpan = Math.max(...group.timestamps) - Math.min(...group.timestamps);
        threats.push({
          type: 'campaign',
          domains: [domain],
          eventCount: group.count,
          timeSpanMs: timeSpan,
          description: `${group.count} security events from ${domain} in ${Math.round(timeSpan / 60000)}min`,
          severity: group.severities.includes('critical') ? 'critical' :
            group.severities.includes('high') ? 'high' : 'medium',
        });
      }
    }

    // Time clustering — events within short windows across different domains
    const sortedEvents = recentEvents
      .filter(e => e.domain)
      .sort((a, b) => a.timestamp - b.timestamp);

    for (let i = 0; i < sortedEvents.length; i++) {
      const windowEnd = sortedEvents[i].timestamp + timeWindowMs;
      const windowEvents = [];
      const windowDomains = new Set<string>();

      for (let j = i; j < sortedEvents.length && sortedEvents[j].timestamp <= windowEnd; j++) {
        windowEvents.push(sortedEvents[j]);
        if (sortedEvents[j].domain) windowDomains.add(sortedEvents[j].domain!);
      }

      // 3+ domains with events in the same time window = coordinated
      if (windowDomains.size >= 3 && windowEvents.length >= 5) {
        const domains = Array.from(windowDomains);
        // Avoid duplicate reports for overlapping windows
        const key = domains.sort().join(',');
        if (!threats.some(t => t.type === 'coordinated' && t.domains.sort().join(',') === key)) {
          threats.push({
            type: 'coordinated',
            domains,
            eventCount: windowEvents.length,
            timeSpanMs: windowEvents[windowEvents.length - 1].timestamp - windowEvents[0].timestamp,
            description: `${windowEvents.length} events across ${domains.length} domains within ${Math.round(timeWindowMs / 60000)}min window`,
            severity: 'high',
          });
        }
      }
    }

    return threats;
  }

  /**
   * Generate actionable recommendations based on recent activity.
   */
  private generateRecommendations(since: number): string[] {
    const recommendations: string[] = [];

    // Check for domains with dropping trust
    const trustChanges = this.db.getTrustChanges(since);
    const droppingDomains = new Map<string, number>();
    for (const change of trustChanges) {
      if (change.newTrust < change.oldTrust) {
        droppingDomains.set(change.domain, (droppingDomains.get(change.domain) || 0) + 1);
      }
    }
    for (const [domain, drops] of droppingDomains) {
      if (drops >= 3) {
        recommendations.push(`Consider blocking ${domain} — trust dropped ${drops} times recently`);
      }
    }

    // Check for unresolved zero-day candidates
    const openZeroDays = this.db.getOpenZeroDayCandidates();
    if (openZeroDays.length > 0) {
      recommendations.push(`${openZeroDays.length} unresolved zero-day candidate(s) need review`);
    }

    // Check for frequently flagged domains
    const topBlocked = this.db.getTopBlockedDomains(since, 5);
    for (const entry of topBlocked) {
      if (entry.count >= 10) {
        recommendations.push(`${entry.domain} has been blocked ${entry.count} times — consider adding to permanent blocklist`);
      }
    }

    // Check if blocklist update is overdue (rough check via new domains)
    const newDomains = this.db.getNewDomains(since);
    if (newDomains.length > 50) {
      recommendations.push(`${newDomains.length} new domains visited — consider running blocklist update`);
    }

    return recommendations;
  }

  /**
   * Convert period name to epoch timestamp.
   */
  private getPeriodStart(period: 'day' | 'week' | 'month'): number {
    const now = Date.now();
    switch (period) {
      case 'day': return now - 86400_000;
      case 'week': return now - 604800_000;
      case 'month': return now - 2592000_000;
    }
  }
}
