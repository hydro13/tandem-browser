import { describe, it, expect, vi } from 'vitest';

// ipcRenderer is only available inside the Electron renderer. For this unit
// test we mock the minimal surface so the preload module can be imported.
vi.mock('electron', () => ({
  ipcRenderer: {
    invoke: vi.fn(),
    on: vi.fn(),
    removeListener: vi.fn(),
  },
}));

import { createContentApi } from '../content';

describe('createContentApi()', () => {
  it('does NOT expose executeJS — per audit #34 High-4 the IPC channel was removed', () => {
    // Regression guard: if someone re-adds executeJS to the preload without
    // re-adding a proper gate (scheme block + approval flow), this test flips
    // red so the review catches it.
    const api = createContentApi() as Record<string, unknown>;
    expect(api).not.toHaveProperty('executeJS');
  });

  it('still exposes the read-only page-state helpers', () => {
    const api = createContentApi() as Record<string, unknown>;
    expect(typeof api.getPageContent).toBe('function');
    expect(typeof api.getPageStatus).toBe('function');
  });
});
