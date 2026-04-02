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

export function shouldSkipStealth(rawValue: string, skipHosts: Array<string> = []): boolean {
  const parsed = tryParseUrl(rawValue);
  if (!parsed || !urlHasProtocol(parsed, 'http:', 'https:')) return false;
  const host = parsed.hostname.replace(/^www\./, '');
  return new Set(skipHosts).has(host);
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
