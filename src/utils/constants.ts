/**
 * Shared constants for Tandem Browser.
 *
 * Centralises magic numbers and strings that were previously scattered
 * across multiple source files so they can be changed in one place.
 */

/** Port the Tandem REST/SSE API listens on */
export const API_PORT = 8765;

/** Port the webhook/OpenClaw relay listens on */
export const WEBHOOK_PORT = 18789;

/** Default Electron session partition used for the main browser */
export const DEFAULT_PARTITION = 'persist:tandem';

/**
 * URL sub-strings that identify OAuth / authentication popup flows.
 * When a webview's window.open targets one of these, the popup is
 * allowed as a real BrowserWindow instead of being redirected to a tab.
 */
export const AUTH_POPUP_PATTERNS: string[] = [
  'accounts.google.com',
  'appleid.apple.com',
  'login.microsoftonline.com',
  '/oauth',
  '/auth',
];

// ─── Timeout / interval constants ────────────────

/** Interval for flushing cookies to disk (main process) */
export const COOKIE_FLUSH_INTERVAL_MS = 30_000;

/** Delay before attaching CDP to a newly registered tab */
export const CDP_ATTACH_DELAY_MS = 500;

/** General-purpose timeout for page loads, navigation, approval prompts, etc. */
export const DEFAULT_TIMEOUT_MS = 30_000;
