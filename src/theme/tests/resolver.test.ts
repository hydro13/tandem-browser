import { describe, it, expect } from 'vitest';
import { resolveInitialTheme } from '../resolver';

describe('resolveInitialTheme', () => {
  it('returns "dark" when config is dark', () => {
    expect(resolveInitialTheme('dark', { shouldUseDarkColors: false })).toBe('dark');
  });

  it('returns "light" when config is light', () => {
    expect(resolveInitialTheme('light', { shouldUseDarkColors: true })).toBe('light');
  });

  it('returns "dark" when config is system and OS prefers dark', () => {
    expect(resolveInitialTheme('system', { shouldUseDarkColors: true })).toBe('dark');
  });

  it('returns "light" when config is system and OS prefers light', () => {
    expect(resolveInitialTheme('system', { shouldUseDarkColors: false })).toBe('light');
  });

  it('falls back to "dark" for unknown values', () => {
    // @ts-expect-error testing runtime fallback
    expect(resolveInitialTheme('magenta', { shouldUseDarkColors: false })).toBe('dark');
  });
});
