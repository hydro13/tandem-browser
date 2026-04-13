import { describe, it, expect, vi } from 'vitest';
import {
  captureNavigationState,
  confirmSelectorValue,
} from '../page-state';

function createMockWebContents() {
  return {
    executeJavaScript: vi.fn(),
    isDestroyed: vi.fn().mockReturnValue(false),
    isLoading: vi.fn().mockReturnValue(false),
    getURL: vi.fn().mockReturnValue('https://example.com/start'),
  };
}

describe('interaction page-state helpers', () => {
  it('confirmSelectorValue waits for the requested value to appear', async () => {
    const wc = createMockWebContents();
    vi.mocked(wc.executeJavaScript)
      .mockResolvedValueOnce({
        found: true,
        tagName: 'INPUT',
        text: null,
        value: 'old',
        focused: true,
        connected: true,
        checked: null,
        disabled: false,
      })
      .mockResolvedValueOnce({
        found: true,
        tagName: 'INPUT',
        text: null,
        value: 'new value',
        focused: true,
        connected: true,
        checked: null,
        disabled: false,
      });

    const result = await confirmSelectorValue(wc as any, '#email', 'new value', 200);

    expect(result.confirmed).toBe(true);
    expect(result.state?.value).toBe('new value');
    expect(wc.executeJavaScript).toHaveBeenCalledTimes(2);
  });

  it('confirmSelectorValue reports an unconfirmed result when the value never updates', async () => {
    const wc = createMockWebContents();
    vi.mocked(wc.executeJavaScript).mockResolvedValue({
      found: true,
      tagName: 'INPUT',
      text: null,
      value: 'stale',
      focused: true,
      connected: true,
      checked: null,
      disabled: false,
    });

    const result = await confirmSelectorValue(wc as any, '#email', 'wanted', 120);

    expect(result.confirmed).toBe(false);
    expect(result.state?.value).toBe('stale');
    expect(wc.executeJavaScript.mock.calls.length).toBeGreaterThan(1);
  });

  it('captureNavigationState waits for a navigation signal when requested', async () => {
    const wc = createMockWebContents();
    const state = {
      url: 'https://example.com/start',
      loading: false,
    };

    vi.mocked(wc.getURL).mockImplementation(() => state.url);
    vi.mocked(wc.isLoading).mockImplementation(() => state.loading);

    setTimeout(() => {
      state.url = 'https://example.com/next';
      state.loading = true;
    }, 10);
    setTimeout(() => {
      state.loading = false;
    }, 30);

    const result = await captureNavigationState(wc as any, 'https://example.com/start', {
      waitForNavigation: true,
      timeoutMs: 200,
      settleMs: 5,
    });

    expect(result.waitApplied).toBe(true);
    expect(result.changed).toBe(true);
    expect(result.urlAfter).toBe('https://example.com/next');
    expect(result.completed).toBe(true);
    expect(result.timeout).toBe(false);
  });
});
