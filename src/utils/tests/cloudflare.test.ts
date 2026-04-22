import { describe, expect, it } from 'vitest';
import {
  CLOUDFLARE_CHALLENGE_SELECTORS,
  CLOUDFLARE_NO_TOUCH_PARTITION_PREFIX,
  getCloudflareNoTouchPartition,
  getCloudflareNoTouchPartitionForOrigin,
  getOriginFromUrl,
  isCloudflareChallengePath,
  isCloudflareChallengeUrl,
  isCloudflareNoTouchPartition,
  responseHeadersContainCfClearance,
} from '../cloudflare';

describe('cloudflare utils', () => {
  it('detects challenge host URLs', () => {
    expect(isCloudflareChallengeUrl('https://challenges.cloudflare.com/turnstile/v0/api.js')).toBe(true);
  });

  it('detects challenge platform paths on site origins', () => {
    expect(isCloudflareChallengePath('/cdn-cgi/challenge-platform/h/b/orchestrate/managed/v1')).toBe(true);
    expect(isCloudflareChallengeUrl('https://example.com/cdn-cgi/challenge-platform/h/b/orchestrate/managed/v1')).toBe(true);
  });

  it('ignores unrelated URLs', () => {
    expect(isCloudflareChallengeUrl('https://example.com/login')).toBe(false);
  });

  it('extracts origins from absolute URLs', () => {
    expect(getOriginFromUrl('https://example.com/path?q=1')).toBe('https://example.com');
  });

  it('derives a stable Cloudflare no-touch partition from an origin', () => {
    const direct = getCloudflareNoTouchPartitionForOrigin('https://example.com');
    const fromUrl = getCloudflareNoTouchPartition('https://example.com/login?x=1');

    expect(direct).toBeTruthy();
    expect(direct).toBe(fromUrl);
    expect(direct).toMatch(new RegExp(`^${CLOUDFLARE_NO_TOUCH_PARTITION_PREFIX}[a-f0-9]{16}$`));
  });

  it('recognizes Cloudflare no-touch partitions', () => {
    const partition = getCloudflareNoTouchPartition('https://claude.ai');

    expect(partition).toBeTruthy();
    expect(isCloudflareNoTouchPartition(partition!)).toBe(true);
    expect(isCloudflareNoTouchPartition('persist:tandem')).toBe(false);
  });

  it('detects cf_clearance set-cookie headers', () => {
    expect(responseHeadersContainCfClearance({
      'set-cookie': ['cf_clearance=test; Path=/; HttpOnly'],
    })).toBe(true);
  });

  it('ignores headers without cf_clearance', () => {
    expect(responseHeadersContainCfClearance({
      'set-cookie': ['session=abc; Path=/; HttpOnly'],
    })).toBe(false);
  });

  it('exposes the selector list used for DOM probes', () => {
    expect(CLOUDFLARE_CHALLENGE_SELECTORS).toContain('iframe[src*="challenges.cloudflare.com"]');
  });
});
