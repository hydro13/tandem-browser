export type ThemeSetting = 'dark' | 'light' | 'system';
export type ResolvedTheme = 'dark' | 'light';

export interface NativeThemeLike {
  readonly shouldUseDarkColors: boolean;
}

/**
 * Convert the user's theme setting into a concrete palette (`dark` | `light`).
 * Used at startup to pick a pre-paint theme for the preload.
 */
export function resolveInitialTheme(
  setting: ThemeSetting,
  nativeTheme: NativeThemeLike,
): ResolvedTheme {
  if (setting === 'light') return 'light';
  if (setting === 'dark') return 'dark';
  if (setting === 'system') return nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
  return 'dark';
}

export function buildThemeAdditionalArg(theme: ResolvedTheme): string {
  return `--tandem-theme=${theme}`;
}
