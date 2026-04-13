import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../behavior/replay', () => ({
  behaviorReplay: {
    getMouseTrajectory: vi.fn().mockReturnValue([]),
    getTypingDelay: vi.fn().mockReturnValue(0),
  },
}));

import { humanizedType } from '../humanized';

function createMockWebContents() {
  return {
    executeJavaScript: vi.fn(),
    sendInputEvent: vi.fn(),
    isDestroyed: vi.fn().mockReturnValue(false),
    isLoading: vi.fn().mockReturnValue(false),
    getURL: vi.fn().mockReturnValue('https://example.com/form'),
  };
}

describe('humanizedType', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('replaces an existing selector value when clear is requested', async () => {
    const wc = createMockWebContents();
    vi.mocked(wc.executeJavaScript)
      .mockResolvedValueOnce({ found: true, x: 120, y: 240, tag: 'INPUT', text: '' })
      .mockResolvedValueOnce({ found: true, focused: true, selectionPrepared: true, existingTextLength: 17 })
      .mockResolvedValueOnce({
        found: true,
        tagName: 'INPUT',
        text: '',
        value: 'snapshot@example.com',
        focused: true,
        connected: true,
        checked: null,
        disabled: false,
      })
      .mockResolvedValueOnce({
        title: 'Fixture',
        activeElement: {
          tagName: 'INPUT',
          id: 'email',
          name: 'email',
          type: 'email',
          value: 'snapshot@example.com',
        },
      });

    const resultPromise = humanizedType(wc as any, '#email', 'snapshot@example.com', true);
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result.ok).toBe(true);
    expect(result.completion.effectConfirmed).toBe(true);
    expect(result.postAction?.element?.value).toBe('snapshot@example.com');
    expect(
      wc.sendInputEvent.mock.calls.some(([event]) => event.keyCode === 'Backspace'),
    ).toBe(false);
    expect(
      wc.sendInputEvent.mock.calls.some(([event]) => event.type === 'char' && event.keyCode === 's'),
    ).toBe(true);
  });
});
