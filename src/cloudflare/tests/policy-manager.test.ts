import { describe, expect, it } from 'vitest';
import { CloudflarePolicyManager } from '../policy-manager';

describe('CloudflarePolicyManager', () => {
  it('tracks a main-frame navigation as normal by default', () => {
    const manager = new CloudflarePolicyManager();
    const policy = manager.onMainFrameNavigation(11, 'https://example.com/login');

    expect(policy.mode).toBe('normal');
    expect(policy.currentOrigin).toBe('https://example.com');
    expect(manager.isChallengeSensitiveTab(11)).toBe(false);
  });

  it('marks the site origin when a Cloudflare subframe challenge is detected', () => {
    const manager = new CloudflarePolicyManager();
    manager.onMainFrameNavigation(11, 'https://example.com/login');
    manager.markChallengeDetected(11, 'https://challenges.cloudflare.com/turnstile/v0/b/api.js', 'frame:url');

    const tabPolicy = manager.getTabPolicy(11);
    const originPolicy = manager.getOriginPolicy('https://example.com');

    expect(tabPolicy?.mode).toBe('challenge_detected');
    expect(tabPolicy?.currentOrigin).toBe('https://example.com');
    expect(originPolicy?.challengeSeen).toBe(true);
    expect(originPolicy?.conservativeMode).toBe(true);
    expect(manager.isChallengeSensitiveTab(11)).toBe(true);
  });

  it('marks clearance and carries post-clearance state forward on navigation', () => {
    const manager = new CloudflarePolicyManager();
    manager.onMainFrameNavigation(11, 'https://example.com/login');
    manager.markChallengeDetected(11, 'https://challenges.cloudflare.com/turnstile/v0/b/api.js', 'frame:url');
    manager.markClearanceSeen(11, 'https://example.com/login', 'set-cookie');

    expect(manager.getTabPolicy(11)?.mode).toBe('post_clearance');
    expect(manager.getOriginPolicy('https://example.com')?.clearanceSeen).toBe(true);

    const laterPolicy = manager.onMainFrameNavigation(11, 'https://example.com/account');
    expect(laterPolicy.mode).toBe('post_clearance');
    expect(manager.isChallengeSensitiveTab(11)).toBe(true);
  });

  it('recordUrlSignal classifies known challenge URLs', () => {
    const manager = new CloudflarePolicyManager();
    manager.recordUrlSignal(22, 'https://example.com/cdn-cgi/challenge-platform/h/b/orchestrate/managed/v1', 'headers:url');

    expect(manager.getTabPolicy(22)?.mode).toBe('challenge_detected');
  });

  it('returns early stealth disposition for conservative origins', () => {
    const manager = new CloudflarePolicyManager();
    manager.onMainFrameNavigation(11, 'https://example.com/login');
    manager.markChallengeDetected(11, 'https://challenges.cloudflare.com/turnstile/v0/b/api.js', 'frame:url');

    expect(manager.getStealthDispositionForUrl('https://example.com/account')).toBe('early');
    expect(manager.getStealthDispositionForUrl('https://another.example/account')).toBe('full');
  });

  it('drops tab state on close without losing origin memory', () => {
    const manager = new CloudflarePolicyManager();
    manager.onMainFrameNavigation(11, 'https://example.com/login');
    manager.markChallengeDetected(11, 'https://challenges.cloudflare.com/turnstile/v0/b/api.js', 'frame:url');

    manager.onTabClosed(11);

    expect(manager.getTabPolicy(11)).toBeNull();
    expect(manager.getOriginPolicy('https://example.com')?.challengeSeen).toBe(true);
  });
});
