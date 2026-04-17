// @vitest-environment jsdom
// Suppress auto-init in tests — we invoke APIs manually.
globalThis.__TANDEM_THEME_SUPPRESS_AUTOINIT__ = true;
if (typeof window !== 'undefined') window.__TANDEM_THEME_SUPPRESS_AUTOINIT__ = true;

import { describe, it, expect, beforeEach, vi } from 'vitest';

async function loadFresh() {
  // Reset data-theme only — callers set data-tandem-initial-theme before loading
  // when they need it, and we must not clobber that setup here.
  document.documentElement.removeAttribute('data-theme');
  vi.resetModules();
  return await import('../js/theme.js');
}

describe('shell theme module', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.removeAttribute('data-tandem-initial-theme');
  });

  it('applyTheme("light") sets data-theme=light', async () => {
    const { applyTheme } = await loadFresh();
    applyTheme('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('applyTheme("system") sets data-theme=system', async () => {
    const { applyTheme } = await loadFresh();
    applyTheme('system');
    expect(document.documentElement.getAttribute('data-theme')).toBe('system');
  });

  it('applyTheme("dark") removes data-theme (dark is CSS default)', async () => {
    const { applyTheme } = await loadFresh();
    document.documentElement.setAttribute('data-theme', 'light');
    applyTheme('dark');
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });

  it('applyTheme ignores unknown values', async () => {
    const { applyTheme } = await loadFresh();
    applyTheme('hotpink');
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });

  it('readInitialTheme reads from <html data-tandem-initial-theme>', async () => {
    document.documentElement.setAttribute('data-tandem-initial-theme', 'light');
    const { readInitialTheme } = await loadFresh();
    expect(readInitialTheme()).toBe('light');
  });

  it('loadThemeFromConfig prefers appearance.theme over legacy config.theme', async () => {
    const { loadThemeFromConfig } = await loadFresh();
    const fakeFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ theme: 'light', appearance: { theme: 'dark' } }),
    });
    globalThis.fetch = fakeFetch;
    await loadThemeFromConfig();
    // dark = no attribute (CSS default is dark)
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });

  it('loadThemeFromConfig falls back to legacy config.theme if appearance missing', async () => {
    const { loadThemeFromConfig } = await loadFresh();
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ theme: 'light' }),
    });
    await loadThemeFromConfig();
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });
});
