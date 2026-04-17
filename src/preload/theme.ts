/**
 * Read --tandem-theme=<theme> from process.argv (passed via
 * webPreferences.additionalArguments) and stamp it onto <html> before paint.
 *
 * This runs in the preload's isolated world at document-start. At that point
 * <html> exists but <body>/children may not — setAttribute on documentElement
 * is safe and is exactly what we need to make CSS variable overrides apply
 * before the first paint.
 */

// The preload tsconfig does not include the DOM lib (node-style target), but
// this module runs in a renderer preload where `document` is available. We
// declare just the shape we use rather than pulling in the whole DOM lib,
// which would conflict with node types (Buffer/fetch) in main-process code.
interface ThemeDocumentElement {
  setAttribute(name: string, value: string): void;
}
interface ThemeDocument {
  documentElement: ThemeDocumentElement | null;
}
declare const document: ThemeDocument | undefined;

const VALID = new Set(['dark', 'light']);

export function parseThemeArg(argv: readonly string[]): 'dark' | 'light' | null {
  const prefix = '--tandem-theme=';
  for (const a of argv) {
    if (a.startsWith(prefix)) {
      const v = a.slice(prefix.length);
      if (VALID.has(v)) return v as 'dark' | 'light';
      return null;
    }
  }
  return null;
}

/**
 * Called from the preload entry. Stamps two attributes on <html>:
 *   - data-theme="light"            when resolved theme is light (no attribute for dark, since dark is CSS default)
 *   - data-tandem-initial-theme=... always, so shell code can read what we decided
 */
export function applyInitialTheme(): void {
  if (typeof document === 'undefined' || !document || !document.documentElement) return;
  const theme = parseThemeArg(process.argv);
  if (!theme) return;
  if (theme === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
  }
  document.documentElement.setAttribute('data-tandem-initial-theme', theme);
}
