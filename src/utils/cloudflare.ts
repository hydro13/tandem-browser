import crypto from 'crypto';

const CLOUDFLARE_CHALLENGE_HOSTS = new Set([
  'challenges.cloudflare.com',
]);

const CLOUDFLARE_CHALLENGE_PATH_PREFIXES = [
  '/cdn-cgi/challenge-platform',
];

export const CLOUDFLARE_NO_TOUCH_PARTITION_PREFIX = 'persist:cf-human-';

export const CLOUDFLARE_CHALLENGE_SELECTORS = [
  'iframe[src*="challenges.cloudflare.com"]',
  'script[src*="challenges.cloudflare.com/turnstile"]',
  'script[src*="/cdn-cgi/challenge-platform/"]',
  'input[name="cf-turnstile-response"]',
  '#challenge-running',
  '#challenge-form',
  '.cf-browser-verification',
  '.cf-challenge-running',
] as const;

function tryParseUrl(rawValue: string): URL | null {
  try {
    return new URL(rawValue);
  } catch {
    return null;
  }
}

export function getOriginFromUrl(rawValue: string): string | null {
  const parsed = tryParseUrl(rawValue);
  return parsed?.origin ?? null;
}

export function getCloudflareNoTouchPartitionForOrigin(origin: string): string | null {
  const normalizedOrigin = getOriginFromUrl(origin);
  if (!normalizedOrigin) {
    return null;
  }

  const suffix = crypto
    .createHash('sha256')
    .update(normalizedOrigin)
    .digest('hex')
    .slice(0, 16);
  return `${CLOUDFLARE_NO_TOUCH_PARTITION_PREFIX}${suffix}`;
}

export function getCloudflareNoTouchPartition(rawValue: string): string | null {
  const origin = getOriginFromUrl(rawValue);
  if (!origin) {
    return null;
  }

  return getCloudflareNoTouchPartitionForOrigin(origin);
}

export function isCloudflareNoTouchPartition(partition: string): boolean {
  return partition.startsWith(CLOUDFLARE_NO_TOUCH_PARTITION_PREFIX);
}

export function isCloudflareChallengeHostname(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase();
  return CLOUDFLARE_CHALLENGE_HOSTS.has(normalized);
}

export function isCloudflareChallengePath(pathname: string): boolean {
  return CLOUDFLARE_CHALLENGE_PATH_PREFIXES.some((prefix) =>
    pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

export function isCloudflareChallengeUrl(rawValue: string): boolean {
  const parsed = tryParseUrl(rawValue);
  if (!parsed || (parsed.protocol !== 'http:' && parsed.protocol !== 'https:')) {
    return false;
  }

  return (
    isCloudflareChallengeHostname(parsed.hostname) ||
    isCloudflareChallengePath(parsed.pathname)
  );
}

/**
 * Choose the page URL to reopen a Cloudflare-challenged tab at, in the no-touch
 * partition.
 *
 * The URL that tripped the detector (`preferredUrl`, i.e. the challenge-detected
 * event's URL) is frequently a challenge *sub-resource* — the challenge-platform
 * script (`/cdn-cgi/challenge-platform/.../main.js`) or an intermediate redirect
 * — not the page the user is trying to reach. Reopening the tab at such a URL
 * lands it on the raw challenge script instead of the destination page.
 *
 * Reopen at the tab's committed page URL first, fall back to the preferred URL,
 * and never return a Cloudflare challenge URL. Returns null when no safe
 * destination is available (caller should then not reroute).
 */
export function chooseCloudflareRerouteTarget(
  tabUrl: string | null,
  preferredUrl: string | null,
): string | null {
  for (const candidate of [tabUrl, preferredUrl]) {
    if (candidate && !isCloudflareChallengeUrl(candidate)) {
      return candidate;
    }
  }
  return null;
}

export function responseHeadersContainCfClearance(responseHeaders: Record<string, string[]>): boolean {
  for (const [key, values] of Object.entries(responseHeaders)) {
    if (key.toLowerCase() !== 'set-cookie' || !Array.isArray(values)) {
      continue;
    }

    if (values.some((value) => typeof value === 'string' && /^cf_clearance=/i.test(value.trim()))) {
      return true;
    }
  }

  return false;
}
