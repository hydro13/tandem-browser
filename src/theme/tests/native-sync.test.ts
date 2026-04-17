import { describe, it, expect } from 'vitest';
import { toNativeThemeSource } from '../resolver';

describe('toNativeThemeSource', () => {
  it('maps dark → dark', () => expect(toNativeThemeSource('dark')).toBe('dark'));
  it('maps light → light', () => expect(toNativeThemeSource('light')).toBe('light'));
  it('maps system → system', () => expect(toNativeThemeSource('system')).toBe('system'));
  it('maps unknown → system as safe fallback', () => {
    // @ts-expect-error runtime fallback
    expect(toNativeThemeSource('neon')).toBe('system');
  });
});
