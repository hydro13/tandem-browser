import { describe, it, expect, vi } from 'vitest';
import {
  captureNavigationState,
  confirmSelectorValue,
  didActiveElementChange,
  didInteractionElementChange,
  hasObservableInteractionEffect,
  hasObservablePageChange,
  readPageState,
  readSelectorState,
} from '../page-state';

function createMockWebContents() {
  return {
    executeJavaScript: vi.fn(),
    isDestroyed: vi.fn().mockReturnValue(false),
    isLoading: vi.fn().mockReturnValue(false),
    getURL: vi.fn().mockReturnValue('https://example.com/start'),
  };
}

describe('readPageState', () => {
  it('returns empty state when webContents is destroyed', async () => {
    const wc = {
      executeJavaScript: vi.fn(),
      isDestroyed: vi.fn().mockReturnValue(true),
      isLoading: vi.fn().mockReturnValue(false),
      getURL: vi.fn().mockReturnValue('https://example.com'),
    };

    const state = await readPageState(wc as any);

    expect(state).toEqual({
      url: '',
      title: '',
      loading: false,
      activeElement: { tagName: null, id: null, name: null, type: null, value: null },
    });
    expect(wc.executeJavaScript).not.toHaveBeenCalled();
  });

  it('returns page state from executeJavaScript result', async () => {
    const wc = {
      executeJavaScript: vi.fn().mockResolvedValue({
        title: 'My Page',
        activeElement: { tagName: 'INPUT', id: 'email', name: 'email', type: 'text', value: 'test@example.com' },
      }),
      isDestroyed: vi.fn().mockReturnValue(false),
      isLoading: vi.fn().mockReturnValue(false),
      getURL: vi.fn().mockReturnValue('https://example.com/page'),
    };

    const state = await readPageState(wc as any);

    expect(state.url).toBe('https://example.com/page');
    expect(state.title).toBe('My Page');
    expect(state.loading).toBe(false);
    expect(state.activeElement.tagName).toBe('INPUT');
    expect(state.activeElement.value).toBe('test@example.com');
  });

  it('returns safe fallback state when executeJavaScript throws', async () => {
    const wc = {
      executeJavaScript: vi.fn().mockRejectedValue(new Error('renderer crashed')),
      isDestroyed: vi.fn().mockReturnValue(false),
      isLoading: vi.fn().mockReturnValue(true),
      getURL: vi.fn().mockReturnValue('https://example.com/loading'),
    };

    const state = await readPageState(wc as any);

    expect(state.url).toBe('https://example.com/loading');
    expect(state.title).toBe('');
    expect(state.loading).toBe(true);
    expect(state.activeElement).toEqual({ tagName: null, id: null, name: null, type: null, value: null });
  });

  it('truncates long active element values to 200 chars', async () => {
    const longValue = 'x'.repeat(300);
    const wc = {
      executeJavaScript: vi.fn().mockResolvedValue({
        title: 'Test',
        activeElement: { tagName: 'TEXTAREA', id: 'bio', name: 'bio', type: null, value: longValue },
      }),
      isDestroyed: vi.fn().mockReturnValue(false),
      isLoading: vi.fn().mockReturnValue(false),
      getURL: vi.fn().mockReturnValue('https://example.com'),
    };

    const state = await readPageState(wc as any);

    expect(state.activeElement.value).toBe(`${'x'.repeat(200)}...`);
  });
});

describe('readSelectorState', () => {
  it('returns null when webContents is destroyed', async () => {
    const wc = {
      executeJavaScript: vi.fn(),
      isDestroyed: vi.fn().mockReturnValue(true),
    };

    const result = await readSelectorState(wc as any, '#input');

    expect(result).toBeNull();
    expect(wc.executeJavaScript).not.toHaveBeenCalled();
  });

  it('returns element state for a found element', async () => {
    const elementState = {
      found: true,
      tagName: 'INPUT',
      text: '',
      value: 'hello',
      focused: true,
      connected: true,
      checked: null,
      disabled: false,
    };
    const wc = {
      executeJavaScript: vi.fn().mockResolvedValue(elementState),
      isDestroyed: vi.fn().mockReturnValue(false),
    };

    const result = await readSelectorState(wc as any, '#input');

    expect(result).toEqual(elementState);
  });

  it('returns null when element is not found (JS returns null)', async () => {
    const wc = {
      executeJavaScript: vi.fn().mockResolvedValue(null),
      isDestroyed: vi.fn().mockReturnValue(false),
    };

    const result = await readSelectorState(wc as any, '#missing');

    expect(result).toBeNull();
  });

  it('returns null when executeJavaScript throws', async () => {
    const wc = {
      executeJavaScript: vi.fn().mockRejectedValue(new Error('crash')),
      isDestroyed: vi.fn().mockReturnValue(false),
    };

    const result = await readSelectorState(wc as any, '#input');

    expect(result).toBeNull();
  });
});

describe('interaction page-state helpers', () => {
  it('treats same-tag focus moves as an active-element change', () => {
    expect(didActiveElementChange(
      { tagName: 'BUTTON', id: 'save', name: null, type: null, value: null },
      { tagName: 'BUTTON', id: 'cancel', name: null, type: null, value: null },
    )).toBe(true);
  });

  it('detects observable page and element effects from focus movement', () => {
    const beforePage = {
      url: 'https://example.com',
      title: 'Example',
      loading: false,
      activeElement: { tagName: 'BUTTON', id: 'save', name: null, type: null, value: null },
    };
    const afterPage = {
      ...beforePage,
      activeElement: { tagName: 'BUTTON', id: 'cancel', name: null, type: null, value: null },
    };
    const beforeElement = {
      found: true,
      tagName: 'BUTTON',
      text: 'Save',
      value: null,
      focused: false,
      connected: true,
      checked: null,
      disabled: false,
    };
    const afterElement = {
      ...beforeElement,
      focused: true,
    };

    expect(hasObservablePageChange(beforePage as any, afterPage as any)).toBe(true);
    expect(didInteractionElementChange(beforeElement, afterElement)).toBe(true);
    expect(hasObservableInteractionEffect({
      beforePage: beforePage as any,
      afterPage: afterPage as any,
      beforeElement,
      afterElement,
    })).toBe(true);
  });

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
