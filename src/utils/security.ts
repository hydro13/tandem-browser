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
