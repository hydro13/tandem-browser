import { EventEmitter } from 'events';
import { getOriginFromUrl, isCloudflareChallengeUrl } from '../utils/cloudflare';

export type CloudflarePolicyMode = 'normal' | 'challenge_detected' | 'human_required' | 'post_clearance';

export interface CloudflareTabPolicy {
  webContentsId: number;
  mode: CloudflarePolicyMode;
  currentUrl: string | null;
  currentOrigin: string | null;
  challengeDetected: boolean;
  clearanceSeen: boolean;
  lastSignal: string | null;
  lastUpdatedAt: number;
}

export interface CloudflareOriginPolicy {
  origin: string;
  challengeSeen: boolean;
  clearanceSeen: boolean;
  conservativeMode: boolean;
  lastSignal: string | null;
  lastUpdatedAt: number;
}

export interface CloudflarePolicyEvent {
  webContentsId: number | null;
  url: string | null;
  origin: string | null;
  signal: string;
  mode: CloudflarePolicyMode | null;
}

function cloneTabPolicy(policy: CloudflareTabPolicy): CloudflareTabPolicy {
  return { ...policy };
}

function cloneOriginPolicy(policy: CloudflareOriginPolicy): CloudflareOriginPolicy {
  return { ...policy };
}

/**
 * CloudflarePolicyManager — tab/origin-scoped Cloudflare challenge state.
 *
 * Phase 1 only records state. Later phases will consume this state to gate
 * stealth, security instrumentation, and human handoff behavior.
 */
export class CloudflarePolicyManager extends EventEmitter {
  private readonly tabPolicies = new Map<number, CloudflareTabPolicy>();
  private readonly originPolicies = new Map<string, CloudflareOriginPolicy>();

  onMainFrameNavigation(webContentsId: number, url: string): CloudflareTabPolicy {
    const now = Date.now();
    const currentOrigin = getOriginFromUrl(url);
    const existing = this.tabPolicies.get(webContentsId);
    const originPolicy = currentOrigin ? this.originPolicies.get(currentOrigin) ?? null : null;
    const mode = existing?.mode === 'human_required'
      ? 'human_required'
      : originPolicy?.challengeSeen
        ? (originPolicy.clearanceSeen ? 'post_clearance' : 'challenge_detected')
        : 'normal';

    const next: CloudflareTabPolicy = {
      webContentsId,
      mode,
      currentUrl: url,
      currentOrigin,
      challengeDetected: originPolicy?.challengeSeen ?? existing?.challengeDetected ?? false,
      clearanceSeen: originPolicy?.clearanceSeen ?? existing?.clearanceSeen ?? false,
      lastSignal: existing?.lastSignal ?? null,
      lastUpdatedAt: now,
    };

    this.tabPolicies.set(webContentsId, next);
    this.emit('tab-policy-changed', cloneTabPolicy(next));
    return cloneTabPolicy(next);
  }

  markChallengeDetected(webContentsId: number | null, url: string | null, signal: string): void {
    const now = Date.now();
    const current = typeof webContentsId === 'number'
      ? this.tabPolicies.get(webContentsId) ?? this.onMainFrameNavigation(webContentsId, url ?? 'about:blank')
      : null;
    const policyOrigin = current?.currentOrigin ?? (url ? getOriginFromUrl(url) : null);
    const targetOrigin = policyOrigin ?? null;

    if (targetOrigin) {
      const nextOrigin: CloudflareOriginPolicy = {
        origin: targetOrigin,
        challengeSeen: true,
        clearanceSeen: this.originPolicies.get(targetOrigin)?.clearanceSeen ?? false,
        conservativeMode: true,
        lastSignal: signal,
        lastUpdatedAt: now,
      };
      this.originPolicies.set(targetOrigin, nextOrigin);
      this.emit('origin-policy-changed', cloneOriginPolicy(nextOrigin));
    }

    if (typeof webContentsId === 'number') {
      const nextTab: CloudflareTabPolicy = {
        webContentsId,
        mode: current?.mode === 'human_required' ? 'human_required' : 'challenge_detected',
        currentUrl: current?.currentUrl ?? url,
        currentOrigin: targetOrigin,
        challengeDetected: true,
        clearanceSeen: current?.clearanceSeen ?? false,
        lastSignal: signal,
        lastUpdatedAt: now,
      };
      this.tabPolicies.set(webContentsId, nextTab);
      this.emit('tab-policy-changed', cloneTabPolicy(nextTab));
      this.emit('challenge-detected', {
        webContentsId,
        url,
        origin: targetOrigin,
        signal,
        mode: nextTab.mode,
      } satisfies CloudflarePolicyEvent);
      return;
    }

    this.emit('challenge-detected', {
      webContentsId: null,
      url,
      origin: targetOrigin,
      signal,
      mode: null,
    } satisfies CloudflarePolicyEvent);
  }

  markClearanceSeen(webContentsId: number | null, url: string | null, signal: string): void {
    const now = Date.now();
    const current = typeof webContentsId === 'number' ? this.tabPolicies.get(webContentsId) ?? null : null;
    const targetOrigin = current?.currentOrigin ?? (url ? getOriginFromUrl(url) : null);

    if (targetOrigin) {
      const existingOrigin = this.originPolicies.get(targetOrigin);
      const nextOrigin: CloudflareOriginPolicy = {
        origin: targetOrigin,
        challengeSeen: existingOrigin?.challengeSeen ?? true,
        clearanceSeen: true,
        conservativeMode: true,
        lastSignal: signal,
        lastUpdatedAt: now,
      };
      this.originPolicies.set(targetOrigin, nextOrigin);
      this.emit('origin-policy-changed', cloneOriginPolicy(nextOrigin));
    }

    if (typeof webContentsId === 'number' && current) {
      const nextMode: CloudflarePolicyMode = current.mode === 'human_required' ? 'human_required' : 'post_clearance';
      const nextTab: CloudflareTabPolicy = {
        ...current,
        mode: nextMode,
        clearanceSeen: true,
        lastSignal: signal,
        lastUpdatedAt: now,
      };
      this.tabPolicies.set(webContentsId, nextTab);
      this.emit('tab-policy-changed', cloneTabPolicy(nextTab));
      this.emit('clearance-seen', {
        webContentsId,
        url: current.currentUrl ?? url,
        origin: targetOrigin,
        signal,
        mode: nextTab.mode,
      } satisfies CloudflarePolicyEvent);
      return;
    }

    this.emit('clearance-seen', {
      webContentsId,
      url,
      origin: targetOrigin,
      signal,
      mode: null,
    } satisfies CloudflarePolicyEvent);
  }

  noteHumanRequired(webContentsId: number, signal: string): void {
    const current = this.tabPolicies.get(webContentsId);
    if (!current) return;
    const nextTab: CloudflareTabPolicy = {
      ...current,
      mode: 'human_required',
      lastSignal: signal,
      lastUpdatedAt: Date.now(),
    };
    this.tabPolicies.set(webContentsId, nextTab);
    this.emit('tab-policy-changed', cloneTabPolicy(nextTab));
  }

  noteResumed(webContentsId: number, signal: string): void {
    const current = this.tabPolicies.get(webContentsId);
    if (!current) return;
    const nextTab: CloudflareTabPolicy = {
      ...current,
      mode: current.clearanceSeen ? 'post_clearance' : 'challenge_detected',
      lastSignal: signal,
      lastUpdatedAt: Date.now(),
    };
    this.tabPolicies.set(webContentsId, nextTab);
    this.emit('tab-policy-changed', cloneTabPolicy(nextTab));
  }

  isChallengeSensitiveTab(webContentsId: number): boolean {
    const policy = this.tabPolicies.get(webContentsId);
    if (!policy) {
      return false;
    }

    if (policy.mode !== 'normal' || policy.challengeDetected || policy.clearanceSeen) {
      return true;
    }

    return policy.currentOrigin
      ? this.originPolicies.get(policy.currentOrigin)?.conservativeMode ?? false
      : false;
  }

  getStealthDispositionForUrl(rawValue: string): 'full' | 'early' {
    if (isCloudflareChallengeUrl(rawValue)) {
      return 'early';
    }

    const origin = getOriginFromUrl(rawValue);
    if (!origin) {
      return 'full';
    }

    return this.originPolicies.get(origin)?.conservativeMode ? 'early' : 'full';
  }

  getTabPolicy(webContentsId: number): CloudflareTabPolicy | null {
    const policy = this.tabPolicies.get(webContentsId);
    return policy ? cloneTabPolicy(policy) : null;
  }

  getOriginPolicy(origin: string): CloudflareOriginPolicy | null {
    const policy = this.originPolicies.get(origin);
    return policy ? cloneOriginPolicy(policy) : null;
  }

  onTabClosed(webContentsId: number): void {
    this.tabPolicies.delete(webContentsId);
  }

  /**
   * Phase 1 convenience: consume a raw URL signal and classify it when it is a
   * known Cloudflare challenge URL.
   */
  recordUrlSignal(webContentsId: number | null, url: string | null, signal: string): void {
    if (!url || !isCloudflareChallengeUrl(url)) {
      return;
    }
    this.markChallengeDetected(webContentsId, url, signal);
  }
}
