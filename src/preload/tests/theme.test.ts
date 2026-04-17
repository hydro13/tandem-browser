import { describe, it, expect } from 'vitest';
import { parseThemeArg } from '../theme';

describe('parseThemeArg', () => {
  it('extracts theme from --tandem-theme=light', () => {
    expect(parseThemeArg(['--tandem-theme=light'])).toBe('light');
  });

  it('extracts theme from --tandem-theme=dark with other args', () => {
    expect(parseThemeArg(['--foo', '--tandem-theme=dark', '--bar'])).toBe('dark');
  });

  it('returns null if no matching arg', () => {
    expect(parseThemeArg(['--other=1'])).toBe(null);
  });

  it('rejects unknown theme values', () => {
    expect(parseThemeArg(['--tandem-theme=neon'])).toBe(null);
  });

  it('handles empty argv', () => {
    expect(parseThemeArg([])).toBe(null);
  });
});
