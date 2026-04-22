import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SecurityManager } from '../security-manager';
import { CloudflarePolicyManager } from '../../cloudflare/policy-manager';

type MockWebContents = {
  getURL: ReturnType<typeof vi.fn>;
};

function createSubject() {
  const sm = Object.create(SecurityManager.prototype) as SecurityManager & Record<string, any>;
  const cloudflarePolicyManager = new CloudflarePolicyManager();
  const wc: MockWebContents = {
    getURL: vi.fn().mockReturnValue('https://example.com/login'),
  };
  const devToolsManager = {
    attachToTab: vi.fn().mockResolvedValue(wc),
    enableSecurityDomains: vi.fn().mockResolvedValue(undefined),
    detachFromTab: vi.fn(),
  };
  const scriptGuard = {
    injectMonitors: vi.fn().mockResolvedValue(undefined),
    hasMonitorsInjected: vi.fn().mockReturnValue(true),
    reset: vi.fn(),
    clearTab: vi.fn(),
  };
  const behaviorMonitor = {
    startResourceMonitoring: vi.fn(),
    isResourceMonitoringActive: vi.fn().mockReturnValue(true),
    stopResourceMonitoring: vi.fn(),
    reset: vi.fn(),
    clearTab: vi.fn(),
  };
  const guardian = {
    getModeForDomain: vi.fn().mockReturnValue('balanced'),
    releaseWebContentsQuarantine: vi.fn(),
  };

  sm.devToolsManager = devToolsManager;
  sm.cloudflarePolicyManager = cloudflarePolicyManager;
  sm.scriptGuard = scriptGuard;
  sm.behaviorMonitor = behaviorMonitor;
  sm.guardian = guardian;
  sm.tabStates = new Map();

  return {
    sm,
    wc,
    devToolsManager,
    cloudflarePolicyManager,
    scriptGuard,
    behaviorMonitor,
    guardian,
  };
}

describe('SecurityManager Cloudflare gating', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('skips monitor injection and resource monitoring on challenge-sensitive tabs', async () => {
    const {
      sm,
      cloudflarePolicyManager,
      devToolsManager,
      scriptGuard,
      behaviorMonitor,
    } = createSubject();

    cloudflarePolicyManager.onMainFrameNavigation(5, 'https://example.com/login');
    cloudflarePolicyManager.markChallengeDetected(
      5,
      'https://challenges.cloudflare.com/turnstile/v0/b/api.js',
      'test',
    );

    await sm['ensureTabCoverage'](5, { fullMonitoring: true, makePrimary: false });

    expect(devToolsManager.attachToTab).toHaveBeenCalledWith(5, { makePrimary: false });
    expect(devToolsManager.enableSecurityDomains).not.toHaveBeenCalled();
    expect(scriptGuard.injectMonitors).not.toHaveBeenCalled();
    expect(behaviorMonitor.startResourceMonitoring).not.toHaveBeenCalled();
    expect(behaviorMonitor.stopResourceMonitoring).toHaveBeenCalledWith(5);
    expect(scriptGuard.reset).toHaveBeenCalledWith(5);
  });

  it('de-escalates an existing tab when Cloudflare policy flips to challenge-sensitive', async () => {
    const {
      sm,
      cloudflarePolicyManager,
      scriptGuard,
      behaviorMonitor,
    } = createSubject();

    sm['tabStates'].set(9, {
      cdpAttached: true,
      monitorsInjected: true,
      resourceMonitoringActive: true,
      strictModePolicy: false,
      lastUrl: 'https://example.com/login',
    });

    cloudflarePolicyManager.onMainFrameNavigation(9, 'https://example.com/login');
    cloudflarePolicyManager.markChallengeDetected(
      9,
      'https://challenges.cloudflare.com/turnstile/v0/b/api.js',
      'headers:url',
    );

    await sm.onCloudflarePolicyChanged(9);

    expect(behaviorMonitor.stopResourceMonitoring).toHaveBeenCalledWith(9);
    expect(behaviorMonitor.reset).toHaveBeenCalledWith(9);
    expect(scriptGuard.reset).toHaveBeenCalledWith(9);
    expect(sm['tabStates'].get(9)).toMatchObject({
      monitorsInjected: false,
      resourceMonitoringActive: false,
    });
  });
});
