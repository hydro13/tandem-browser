import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Guardian } from '../guardian';
import type { DomainInfo, PendingDecision } from '../types';

function buildDomainInfo(overrides: Partial<DomainInfo>): DomainInfo {
  return {
    domain: 'example.com',
    firstSeen: Date.now(),
    lastSeen: Date.now(),
    visitCount: 1,
    trustLevel: 30,
    guardianMode: 'balanced',
    category: 'general',
    notes: null,
    ...overrides,
  };
}

function createGuardianHarness(domainInfo: DomainInfo | null) {
  const infoRef = { current: domainInfo };
  const events: Array<{ eventType: string; details: string }> = [];
  const db = {
    getDomainInfo: vi.fn((domain: string) => {
      if (!infoRef.current || infoRef.current.domain !== domain) return null;
      return { ...infoRef.current };
    }),
    upsertDomain: vi.fn((domain: string, update: Partial<DomainInfo>) => {
      const existing = infoRef.current?.domain === domain ? infoRef.current : buildDomainInfo({ domain });
      infoRef.current = { ...existing, ...update };
    }),
    logEvent: vi.fn((event: { eventType: string; details: string }) => {
      events.push(event);
    }),
    isWhitelistedPair: vi.fn(() => false),
  };
  const shield = {
    checkUrl: vi.fn(() => ({ blocked: false })),
  };
  const outboundGuard = {
    analyzeWebSocket: vi.fn(() => ({
      action: 'allow',
      reason: 'same-origin-ws',
      severity: 'info',
      explanation: 'Allowed because the WebSocket stays on the same origin.',
    })),
    analyzeOutbound: vi.fn(() => ({
      action: 'allow',
      reason: 'no-threat-detected',
      severity: 'info',
      explanation: 'Allowed because outbound analysis found no containment signal.',
    })),
  };

  return {
    guardian: new Guardian(db as never, shield as never, outboundGuard as never),
    db,
    outboundGuard,
    events,
  };
}

/** Mock agent that never answers: the real WS timeout is emulated by replying with the item's defaultAction after item.timeout. */
function createSilentGatekeeper(guardian: Guardian) {
  const sent: PendingDecision[] = [];
  const gatekeeperWs = {
    getStatus: vi.fn(() => ({
      connected: true,
      pendingDecisions: 0,
      totalDecisions: 0,
      lastAgentSeen: Date.now(),
    })),
    sendDecisionRequest: vi.fn((item: PendingDecision) => {
      sent.push(item);
      setTimeout(() => {
        guardian.submitDecision(item.id, {
          action: item.defaultAction,
          reason: `timeout fallback — agent did not respond within ${item.timeout / 1000}s`,
          confidence: 0,
        });
      }, item.timeout);
    }),
  };
  return { gatekeeperWs, sent };
}

describe('Gatekeeper fallback policy (fail-closed per decision type)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('fails closed when a connected agent times out on a strict first-visit navigation', async () => {
    const { guardian, events } = createGuardianHarness(buildDomainInfo({
      domain: 'fresh-strict.example',
      guardianMode: 'strict',
      visitCount: 1,
      trustLevel: 30,
    }));
    const { gatekeeperWs, sent } = createSilentGatekeeper(guardian);
    guardian.setGatekeeper(gatekeeperWs as never);

    const resultPromise = (guardian as any).checkRequest({
      url: 'https://fresh-strict.example/welcome',
      method: 'GET',
      referrer: '',
      resourceType: 'mainFrame',
    });

    await vi.advanceTimersByTimeAsync(4_000);

    await expect(resultPromise).resolves.toEqual({ cancel: true });
    expect(sent[0]).toMatchObject({
      decisionClass: 'hold_for_decision',
      defaultAction: 'block',
    });
    expect(events.map(event => event.eventType)).toContain('gatekeeper_timed_out');
  });

  it('fails closed when a connected agent times out on a trusted-to-untrusted outbound mutation', async () => {
    const { guardian, outboundGuard, events } = createGuardianHarness(buildDomainInfo({
      domain: 'collector.example',
      trustLevel: 20,
      guardianMode: 'balanced',
      visitCount: 1,
    }));

    outboundGuard.analyzeOutbound.mockReturnValue({
      action: 'flag',
      reason: 'cross-origin-trusted-to-untrusted',
      severity: 'medium',
      explanation: 'Flagged because a trusted page is mutating a lower-trust destination.',
      gatekeeperDecisionClass: 'hold_for_decision',
      context: {
        originDomain: 'dashboard.example',
        destinationDomain: 'collector.example',
      },
    });

    const { gatekeeperWs, sent } = createSilentGatekeeper(guardian);
    guardian.setGatekeeper(gatekeeperWs as never);

    const resultPromise = (guardian as any).checkRequest({
      url: 'https://collector.example/ingest',
      method: 'POST',
      referrer: 'https://dashboard.example/app',
      resourceType: 'xhr',
      uploadData: [{ bytes: Buffer.from('payload=secret') }],
    });

    await vi.advanceTimersByTimeAsync(4_000);

    await expect(resultPromise).resolves.toEqual({ cancel: true });
    expect(sent[0]).toMatchObject({
      decisionClass: 'hold_for_decision',
      defaultAction: 'block',
    });
    expect(events.map(event => event.eventType)).toContain('gatekeeper_timed_out');
  });

  it('still fails open when a connected agent times out on an advisory risky first visit', async () => {
    const { guardian } = createGuardianHarness(null);
    const { gatekeeperWs, sent } = createSilentGatekeeper(guardian);
    guardian.setGatekeeper(gatekeeperWs as never);

    // http:// gives a mild risk score (no-tls) → first_visit_navigation_risky.
    const resultPromise = (guardian as any).checkRequest({
      url: 'http://fresh.example/welcome',
      method: 'GET',
      referrer: '',
      resourceType: 'mainFrame',
    });

    await vi.advanceTimersByTimeAsync(4_000);

    await expect(resultPromise).resolves.toBeNull();
    expect(sent[0]).toMatchObject({
      decisionClass: 'hold_for_decision',
      defaultAction: 'allow',
    });
  });

  it('fails open for strict first-visit navigations when no agent is connected', async () => {
    const { guardian, events } = createGuardianHarness(buildDomainInfo({
      domain: 'fresh-strict.example',
      guardianMode: 'strict',
      visitCount: 1,
      trustLevel: 30,
    }));
    // No gatekeeper attached at all.

    const result = await (guardian as any).checkRequest({
      url: 'https://fresh-strict.example/welcome',
      method: 'GET',
      referrer: '',
      resourceType: 'mainFrame',
    });

    expect(result).toBeNull();
    expect(events.map(event => event.eventType)).toContain('gatekeeper_allowed');
  });

  it('keeps failing closed for strict low-trust scripts when no agent is connected', async () => {
    const { guardian, events } = createGuardianHarness(buildDomainInfo({
      domain: 'scripts.example',
      trustLevel: 12,
      guardianMode: 'strict',
    }));

    const result = await (guardian as any).checkRequest({
      url: 'https://scripts.example/app.js',
      method: 'GET',
      referrer: 'https://bank.example/dashboard',
      resourceType: 'script',
    });

    expect(result).toEqual({ cancel: true });
    expect(events.map(event => event.eventType)).toContain('gatekeeper_blocked');
  });

  it('uses the stricter timeout column when the agent queue is saturated', async () => {
    const { guardian, events } = createGuardianHarness(buildDomainInfo({
      domain: 'fresh-strict.example',
      guardianMode: 'strict',
      visitCount: 1,
      trustLevel: 30,
    }));

    const gatekeeperWs = {
      getStatus: vi.fn()
        // applyGatekeeperPolicy availability check: connected…
        .mockReturnValueOnce({ connected: true, pendingDecisions: 0, totalDecisions: 0, lastAgentSeen: Date.now() })
        // …but queueForGatekeeper sees a saturated queue.
        .mockReturnValue({ connected: true, pendingDecisions: 100, totalDecisions: 0, lastAgentSeen: Date.now() }),
      sendDecisionRequest: vi.fn(),
    };
    guardian.setGatekeeper(gatekeeperWs as never);

    const result = await (guardian as any).checkRequest({
      url: 'https://fresh-strict.example/welcome',
      method: 'GET',
      referrer: '',
      resourceType: 'mainFrame',
    });

    expect(result).toEqual({ cancel: true });
    expect(gatekeeperWs.sendDecisionRequest).not.toHaveBeenCalled();
    expect(events.map(event => event.eventType)).toContain('gatekeeper_blocked');
  });
});
