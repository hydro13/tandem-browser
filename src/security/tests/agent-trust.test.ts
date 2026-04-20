import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  AgentTrustStore,
  GRANT_REQUEST_COOLDOWN_MS,
  domainKeyFromUrl,
} from '../agent-trust';

function tmpStorePath(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tandem-agent-trust-'));
  return path.join(dir, 'agent-trust.json');
}

describe('domainKeyFromUrl', () => {
  it('extracts hostname from full URLs', () => {
    expect(domainKeyFromUrl('https://www.funda.nl/zoeken')).toBe('www.funda.nl');
    expect(domainKeyFromUrl('http://example.com/path?x=1')).toBe('example.com');
  });

  it('accepts bare hostnames', () => {
    expect(domainKeyFromUrl('funda.nl')).toBe('funda.nl');
    expect(domainKeyFromUrl('LinkedIn.com')).toBe('linkedin.com');
  });

  it('rejects non-http schemes', () => {
    expect(domainKeyFromUrl('file:///etc/passwd')).toBe('');
    expect(domainKeyFromUrl('javascript:alert(1)')).toBe('');
    expect(domainKeyFromUrl('data:text/html,x')).toBe('');
  });

  it('rejects weird/invalid input', () => {
    expect(domainKeyFromUrl('')).toBe('');
    expect(domainKeyFromUrl('   ')).toBe('');
    expect(domainKeyFromUrl('not a url')).toBe('');
    expect(domainKeyFromUrl('has:colon')).toBe('');
  });
});

describe('AgentTrustStore', () => {
  let storePath: string;
  let store: AgentTrustStore;

  beforeEach(() => {
    storePath = tmpStorePath();
    store = new AgentTrustStore(storePath);
  });

  afterEach(() => {
    vi.useRealTimers();
    try { fs.rmSync(path.dirname(storePath), { recursive: true, force: true }); } catch { /* ignore */ }
  });

  describe('initial state', () => {
    it('returns false for any isApproved query', () => {
      expect(store.isApproved('claude', 'funda.nl')).toBe(false);
      expect(store.isApproved('claude', '')).toBe(false);
      expect(store.isApproved('', 'funda.nl')).toBe(false);
    });

    it('snapshot of unknown agent returns empty', () => {
      const snap = store.snapshot('claude');
      expect(snap).toEqual({
        agentId: 'claude',
        trustedDomains: [],
        perDomainWindows: [],
        globalWindow: null,
      });
    });

    it('listAgentIds is empty', () => {
      expect(store.listAgentIds()).toEqual([]);
    });
  });

  describe('T2 — per-domain windows', () => {
    it('grant makes isApproved return true within the window', () => {
      store.grantDomainWindow('claude', 'funda.nl', '15min');
      expect(store.isApproved('claude', 'funda.nl')).toBe(true);
    });

    it('does not leak to other domains', () => {
      store.grantDomainWindow('claude', 'funda.nl', '15min');
      expect(store.isApproved('claude', 'coolblue.nl')).toBe(false);
    });

    it('does not leak to other agents', () => {
      store.grantDomainWindow('claude', 'funda.nl', '15min');
      expect(store.isApproved('kees', 'funda.nl')).toBe(false);
    });

    it('expires after duration', () => {
      vi.useFakeTimers();
      store.grantDomainWindow('claude', 'funda.nl', '15min');
      expect(store.isApproved('claude', 'funda.nl')).toBe(true);
      vi.advanceTimersByTime(15 * 60 * 1000 + 1);
      expect(store.isApproved('claude', 'funda.nl')).toBe(false);
    });

    it('revoke makes it immediately false', () => {
      store.grantDomainWindow('claude', 'funda.nl', '1hour');
      store.revokeDomainWindow('claude', 'funda.nl');
      expect(store.isApproved('claude', 'funda.nl')).toBe(false);
    });

    it('expired windows are filtered from snapshot', () => {
      vi.useFakeTimers();
      store.grantDomainWindow('claude', 'funda.nl', '15min');
      vi.advanceTimersByTime(16 * 60 * 1000);
      const snap = store.snapshot('claude');
      expect(snap.perDomainWindows).toHaveLength(0);
    });
  });

  describe('T3 — trusted domains (persistent)', () => {
    it('grant makes isApproved true indefinitely', () => {
      store.grantTrustedDomain('claude', 'linkedin.com');
      expect(store.isApproved('claude', 'linkedin.com')).toBe(true);
    });

    it('is per-agent', () => {
      store.grantTrustedDomain('claude', 'linkedin.com');
      expect(store.isApproved('kees', 'linkedin.com')).toBe(false);
    });

    it('revoke removes it', () => {
      store.grantTrustedDomain('claude', 'linkedin.com');
      store.revokeTrustedDomain('claude', 'linkedin.com');
      expect(store.isApproved('claude', 'linkedin.com')).toBe(false);
    });

    it('persists across load cycle', async () => {
      store.grantTrustedDomain('claude', 'linkedin.com');
      store.grantTrustedDomain('claude', 'funda.nl');
      await store.persist();

      const fresh = new AgentTrustStore(storePath);
      await fresh.load();
      expect(fresh.isApproved('claude', 'linkedin.com')).toBe(true);
      expect(fresh.isApproved('claude', 'funda.nl')).toBe(true);
      expect(fresh.snapshot('claude').trustedDomains).toEqual(['funda.nl', 'linkedin.com']);
    });

    it('persists revocation', async () => {
      store.grantTrustedDomain('claude', 'linkedin.com');
      await store.persist();
      store.revokeTrustedDomain('claude', 'linkedin.com');
      await store.persist();

      const fresh = new AgentTrustStore(storePath);
      await fresh.load();
      expect(fresh.isApproved('claude', 'linkedin.com')).toBe(false);
    });

    it('writes persist file with mode 0o600', async () => {
      store.grantTrustedDomain('claude', 'linkedin.com');
      await store.persist();
      const stat = fs.statSync(storePath);
      // mask off upper bits — on darwin stat may include other flags
      expect(stat.mode & 0o777).toBe(0o600);
    });

    it('does not persist agents with empty trusted lists', async () => {
      store.grantTrustedDomain('claude', 'linkedin.com');
      store.grantTrustedDomain('kees', 'github.com');
      await store.persist();
      store.revokeTrustedDomain('kees', 'github.com');
      await store.persist();

      const raw = fs.readFileSync(storePath, 'utf8');
      const parsed = JSON.parse(raw);
      expect(Object.keys(parsed.agents)).toEqual(['claude']);
    });
  });

  describe('T4 — global window', () => {
    it('covers any domain while active', () => {
      store.grantGlobalWindow('claude', 30);
      expect(store.isApproved('claude', 'funda.nl')).toBe(true);
      expect(store.isApproved('claude', 'literally-anything.example')).toBe(true);
    });

    it('is per-agent', () => {
      store.grantGlobalWindow('claude', 30);
      expect(store.isApproved('kees', 'funda.nl')).toBe(false);
    });

    it('only accepts 30 or 60 minutes', () => {
      // @ts-expect-error -- testing runtime rejection of invalid input (15 not in allowed set)
      store.grantGlobalWindow('claude', 15);
      // @ts-expect-error -- testing runtime rejection of invalid input (120 not in allowed set)
      store.grantGlobalWindow('claude', 120);
      expect(store.isApproved('claude', 'funda.nl')).toBe(false);

      store.grantGlobalWindow('claude', 60);
      expect(store.isApproved('claude', 'funda.nl')).toBe(true);
    });

    it('expires after duration', () => {
      vi.useFakeTimers();
      store.grantGlobalWindow('claude', 30);
      expect(store.isApproved('claude', 'any.com')).toBe(true);
      vi.advanceTimersByTime(30 * 60 * 1000 + 1);
      expect(store.isApproved('claude', 'any.com')).toBe(false);
    });

    it('revoke kills it', () => {
      store.grantGlobalWindow('claude', 60);
      store.revokeGlobalWindow('claude');
      expect(store.isApproved('claude', 'any.com')).toBe(false);
    });

    it('expired global window is filtered from snapshot', () => {
      vi.useFakeTimers();
      store.grantGlobalWindow('claude', 30);
      vi.advanceTimersByTime(31 * 60 * 1000);
      expect(store.snapshot('claude').globalWindow).toBeNull();
    });
  });

  describe('revokeAll', () => {
    it('clears T2, T3, and T4 for the agent', async () => {
      store.grantDomainWindow('claude', 'funda.nl', '15min');
      store.grantTrustedDomain('claude', 'linkedin.com');
      store.grantGlobalWindow('claude', 30);

      store.revokeAll('claude');

      expect(store.isApproved('claude', 'funda.nl')).toBe(false);
      expect(store.isApproved('claude', 'linkedin.com')).toBe(false);
      expect(store.isApproved('claude', 'any.com')).toBe(false);
    });

    it('does not affect other agents', () => {
      store.grantTrustedDomain('claude', 'linkedin.com');
      store.grantTrustedDomain('kees', 'github.com');

      store.revokeAll('claude');

      expect(store.isApproved('kees', 'github.com')).toBe(true);
    });
  });

  describe('rate limiting (canRequestGrant)', () => {
    it('first request succeeds', () => {
      expect(store.canRequestGrant('claude')).toEqual({ ok: true });
    });

    it('second request within cooldown fails with retryAfterMs', () => {
      store.canRequestGrant('claude');
      const second = store.canRequestGrant('claude');
      expect(second.ok).toBe(false);
      if (!second.ok) {
        expect(second.retryAfterMs).toBeGreaterThan(0);
        expect(second.retryAfterMs).toBeLessThanOrEqual(GRANT_REQUEST_COOLDOWN_MS);
      }
    });

    it('request after cooldown succeeds again', () => {
      vi.useFakeTimers();
      store.canRequestGrant('claude');
      vi.advanceTimersByTime(GRANT_REQUEST_COOLDOWN_MS + 1);
      expect(store.canRequestGrant('claude')).toEqual({ ok: true });
    });

    it('rate limit is per-agent', () => {
      store.canRequestGrant('claude');
      expect(store.canRequestGrant('kees')).toEqual({ ok: true });
    });
  });

  describe('tier precedence', () => {
    it('T4 covers a domain even without T3 or T2', () => {
      store.grantGlobalWindow('claude', 30);
      expect(store.isApproved('claude', 'somewhere.new')).toBe(true);
    });

    it('T3 covers a domain even without T2 or T4', () => {
      store.grantTrustedDomain('claude', 'linkedin.com');
      expect(store.isApproved('claude', 'linkedin.com')).toBe(true);
    });

    it('T2 works independent of T3/T4', () => {
      store.grantDomainWindow('claude', 'funda.nl', '15min');
      expect(store.isApproved('claude', 'funda.nl')).toBe(true);
    });

    it('revoking T3 does not remove T2 window for same domain', () => {
      store.grantDomainWindow('claude', 'funda.nl', '15min');
      store.grantTrustedDomain('claude', 'funda.nl');
      store.revokeTrustedDomain('claude', 'funda.nl');
      expect(store.isApproved('claude', 'funda.nl')).toBe(true); // T2 still active
    });
  });

  describe('load — robustness', () => {
    it('missing file leaves empty state without crashing', async () => {
      const missingPath = path.join(os.tmpdir(), 'tandem-agent-trust-missing', 'no.json');
      const fresh = new AgentTrustStore(missingPath);
      await expect(fresh.load()).resolves.toBeUndefined();
      expect(fresh.listAgentIds()).toEqual([]);
    });

    it('malformed JSON leaves empty state without crashing', async () => {
      fs.mkdirSync(path.dirname(storePath), { recursive: true });
      fs.writeFileSync(storePath, 'not valid json');
      const fresh = new AgentTrustStore(storePath);
      await expect(fresh.load()).resolves.toBeUndefined();
      expect(fresh.listAgentIds()).toEqual([]);
    });

    it('wrong version leaves empty state', async () => {
      fs.mkdirSync(path.dirname(storePath), { recursive: true });
      fs.writeFileSync(storePath, JSON.stringify({ version: 99, agents: { claude: { trustedDomains: ['x.com'] } } }));
      const fresh = new AgentTrustStore(storePath);
      await fresh.load();
      expect(fresh.isApproved('claude', 'x.com')).toBe(false);
    });

    it('strips non-string trustedDomains entries', async () => {
      fs.mkdirSync(path.dirname(storePath), { recursive: true });
      fs.writeFileSync(storePath, JSON.stringify({
        version: 1,
        agents: { claude: { trustedDomains: ['good.com', 42, null, 'other.com'] } },
      }));
      const fresh = new AgentTrustStore(storePath);
      await fresh.load();
      expect(fresh.snapshot('claude').trustedDomains).toEqual(['good.com', 'other.com']);
    });
  });

  describe('snapshot shape', () => {
    it('returns a sorted, non-expired view', () => {
      vi.useFakeTimers();
      store.grantTrustedDomain('claude', 'zeta.com');
      store.grantTrustedDomain('claude', 'alpha.com');
      store.grantDomainWindow('claude', 'beta.com', '15min');
      store.grantGlobalWindow('claude', 30);

      vi.advanceTimersByTime(1000);

      const snap = store.snapshot('claude');
      expect(snap.trustedDomains).toEqual(['alpha.com', 'zeta.com']);
      expect(snap.perDomainWindows).toHaveLength(1);
      expect(snap.perDomainWindows[0].domain).toBe('beta.com');
      expect(snap.perDomainWindows[0].remainingMs).toBeGreaterThan(0);
      expect(snap.globalWindow).not.toBeNull();
      expect(snap.globalWindow?.minutes).toBe(30);
    });
  });
});
