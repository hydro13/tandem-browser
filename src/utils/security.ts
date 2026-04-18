import fs from 'fs';
import os from 'os';
import path from 'path';

const HTML_ESCAPE_RE = /[&<>"']/g;

const HTML_ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(value: string): string {
  return value.replace(HTML_ESCAPE_RE, (char) => HTML_ESCAPE_MAP[char] ?? char);
}

export function getErrorMessage(error: unknown, fallback: string = 'Unexpected error'): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === 'string' && error) {
    return error;
  }

  try {
    const rendered = String(error);
    return rendered && rendered !== '[object Object]' ? rendered : fallback;
  } catch {
    return fallback;
  }
}

export function tryParseUrl(rawValue: string, base?: string | URL): URL | null {
  try {
    return new URL(rawValue, base);
  } catch {
    return null;
  }
}

export function isHttpUrl(rawValue: string, base?: string | URL): boolean {
  const parsed = tryParseUrl(rawValue, base);
  return !!parsed && (parsed.protocol === 'http:' || parsed.protocol === 'https:');
}

function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split('.').map((s) => Number.parseInt(s, 10));
  if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) {
    return true;
  }
  const [a, b] = parts;
  if (a === 0) return true;
  if (a === 127) return true;
  if (a === 10) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 169 && b === 254) return true;
  return false;
}

function isPrivateIPv6(hostname: string): boolean {
  const v = hostname.toLowerCase();
  if (v === '::' || v === '::1') return true;

  // IPv4-mapped IPv6 in dotted form: ::ffff:A.B.C.D
  const dotted = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (dotted) return isPrivateIPv4(dotted[1]);

  // IPv4-mapped IPv6 in hex form (Node's normalized output): ::ffff:XXXX:YYYY
  const hex = v.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (hex) {
    const hi = Number.parseInt(hex[1], 16);
    const lo = Number.parseInt(hex[2], 16);
    const a = (hi >> 8) & 0xff;
    const b = hi & 0xff;
    const c = (lo >> 8) & 0xff;
    const d = lo & 0xff;
    return isPrivateIPv4(`${a}.${b}.${c}.${d}`);
  }

  if (/^fe[89ab]/.test(v)) return true; // link-local
  if (/^f[cd]/.test(v)) return true;    // ULA
  return false;
}

/**
 * Returns true when `raw` is a http(s) URL whose host is safe to navigate to
 * from an agent-triggered route. Rejects non-web schemes (file/javascript/data/…)
 * and private/loopback/link-local IP literals. DNS hostnames pass through — the
 * 8-layer security shield handles those.
 */
export function isSafeNavigationUrl(raw: string): boolean {
  if (!raw || typeof raw !== 'string') return false;
  const trimmed = raw.trim();
  if (!trimmed) return false;

  const parsed = tryParseUrl(trimmed);
  if (!parsed) return false;

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;

  const rawHost = parsed.hostname;
  if (!rawHost) return false;

  const host = rawHost.replace(/^\[/, '').replace(/\]$/, '').toLowerCase();
  if (!host) return false;
  if (host === 'localhost') return false;

  if (host.includes(':')) {
    return !isPrivateIPv6(host);
  }
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    return !isPrivateIPv4(host);
  }

  return true;
}

export function hostnameMatches(url: URL, hostname: string): boolean {
  const normalizedHost = url.hostname.toLowerCase();
  const normalizedExpected = hostname.toLowerCase();
  return normalizedHost === normalizedExpected || normalizedHost.endsWith(`.${normalizedExpected}`);
}

export function urlHasProtocol(url: URL, ...protocols: string[]): boolean {
  return protocols.includes(url.protocol.toLowerCase());
}

export function pathnameMatchesPrefix(url: URL, prefix: string): boolean {
  return url.pathname === prefix || url.pathname.startsWith(`${prefix}/`);
}

export function isGoogleAuthUrl(rawValue: string): boolean {
  const parsed = tryParseUrl(rawValue);
  if (!parsed || !urlHasProtocol(parsed, 'http:', 'https:')) {
    return false;
  }

  return (
    hostnameMatches(parsed, 'accounts.google.com') ||
    hostnameMatches(parsed, 'consent.google.com') ||
    hostnameMatches(parsed, 'googleapis.com') ||
    hostnameMatches(parsed, 'gstatic.com') ||
    (hostnameMatches(parsed, 'google.com') && pathnameMatchesPrefix(parsed, '/signin')) ||
    (hostnameMatches(parsed, 'google.com') && pathnameMatchesPrefix(parsed, '/o/oauth2'))
  );
}

/**
 * Sites that actively detect stealth patches and break when injected.
 * These sites get no stealth injection — they run as a normal browser.
 */
const STEALTH_SKIP_HOSTS = new Set([
  'x.com',
  'twitter.com',
  'abs.twimg.com',
  'zhipin.com',
  'login.zhipin.com',
]);

export function shouldSkipStealth(rawValue: string): boolean {
  const parsed = tryParseUrl(rawValue);
  if (!parsed || !urlHasProtocol(parsed, 'http:', 'https:')) return false;
  const host = parsed.hostname.replace(/^www\./, '');
  return STEALTH_SKIP_HOSTS.has(host);
}

export function isSearchEngineResultsUrl(rawValue: string): boolean {
  const parsed = tryParseUrl(rawValue);
  if (!parsed || !urlHasProtocol(parsed, 'http:', 'https:')) {
    return false;
  }

  return (
    (hostnameMatches(parsed, 'google.com') && pathnameMatchesPrefix(parsed, '/search')) ||
    (hostnameMatches(parsed, 'bing.com') && pathnameMatchesPrefix(parsed, '/search')) ||
    (hostnameMatches(parsed, 'duckduckgo.com') && parsed.searchParams.has('q'))
  );
}

export function assertSinglePathSegment(value: string, label: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${label} is required`);
  }
  if (trimmed === '.' || trimmed === '..' || trimmed.includes('/') || trimmed.includes('\\') || trimmed.includes('\0')) {
    throw new Error(`Invalid ${label}`);
  }
  return trimmed;
}

export function resolvePathWithinRoot(rootDir: string, ...segments: string[]): string {
  const resolvedRoot = path.resolve(rootDir);
  const candidate = path.resolve(resolvedRoot, ...segments);
  if (candidate !== resolvedRoot && !candidate.startsWith(resolvedRoot + path.sep)) {
    throw new Error('Resolved path escapes root directory');
  }
  return candidate;
}

export function assertPathWithinRoot(rootDir: string, candidatePath: string): string {
  const resolvedRoot = path.resolve(rootDir);
  const resolvedCandidate = path.resolve(candidatePath);
  if (resolvedCandidate !== resolvedRoot && !resolvedCandidate.startsWith(resolvedRoot + path.sep)) {
    throw new Error('Path escapes root directory');
  }
  return resolvedCandidate;
}

export function resolvePathInAllowedRoots(candidatePath: string, allowedRoots: string[]): string {
  const trimmed = candidatePath.trim();
  if (!trimmed) {
    throw new Error('Path is required');
  }

  const resolvedCandidate = path.resolve(trimmed);
  for (const root of allowedRoots) {
    try {
      return assertPathWithinRoot(root, resolvedCandidate);
    } catch {
      continue;
    }
  }

  throw new Error('Path is outside the allowed directories');
}

export function normalizeExistingDirectoryPath(value: string, label: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${label} is required`);
  }

  const resolved = assertPathWithinRoot(os.homedir(), path.resolve(trimmed));
  const stat = fs.statSync(resolved);
  if (!stat.isDirectory()) {
    throw new Error(`${label} must be a directory`);
  }

  return resolved;
}

const CHROME_EXTENSION_ID_RE = /^[a-p]{32}$/;

export function isChromeExtensionId(value: string): boolean {
  return CHROME_EXTENSION_ID_RE.test(value);
}

export function assertChromeExtensionId(value: string): string {
  const segment = assertSinglePathSegment(value, 'extension ID');
  if (!isChromeExtensionId(segment)) {
    throw new Error('Invalid extension ID');
  }
  return segment;
}

const NATIVE_MESSAGING_HOST_RE = /^[A-Za-z0-9._-]+$/;

export function assertNativeMessagingHostName(value: string): string {
  const segment = assertSinglePathSegment(value, 'native messaging host');
  if (!NATIVE_MESSAGING_HOST_RE.test(segment)) {
    throw new Error('Invalid native messaging host');
  }
  return segment;
}
