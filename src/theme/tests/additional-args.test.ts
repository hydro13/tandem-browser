import { describe, it, expect } from 'vitest';
import { buildThemeAdditionalArg } from '../resolver';

describe('buildThemeAdditionalArg', () => {
  it('returns --tandem-theme=light for light', () => {
    expect(buildThemeAdditionalArg('light')).toBe('--tandem-theme=light');
  });
  it('returns --tandem-theme=dark for dark', () => {
    expect(buildThemeAdditionalArg('dark')).toBe('--tandem-theme=dark');
  });
});
