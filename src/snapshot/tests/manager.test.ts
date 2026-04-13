import { describe, expect, it, vi } from 'vitest';
import { SnapshotManager } from '../manager';

function createMockWebContents() {
  return {
    sendInputEvent: vi.fn(),
    executeJavaScript: vi.fn().mockResolvedValue({
      title: 'Fixture',
      activeElement: {
        tagName: 'INPUT',
        id: 'email',
        name: 'email',
        type: 'email',
        value: 'snapshot@example.com',
      },
    }),
    isDestroyed: vi.fn().mockReturnValue(false),
    isLoading: vi.fn().mockReturnValue(false),
    getURL: vi.fn().mockReturnValue('https://example.com/form'),
  };
}

describe('SnapshotManager.fillRef', () => {
  it('replaces the existing value instead of appending characters', async () => {
    const wc = createMockWebContents();
    const sendCommandToTab = vi.fn(async (_wcId: number, method: string, params?: Record<string, unknown>) => {
      if (method === 'DOM.enable') {
        return {};
      }

      if (method === 'DOM.getBoxModel') {
        return { model: { content: [0, 0, 120, 0, 120, 24, 0, 24] } };
      }

      if (method === 'DOM.resolveNode') {
        return { object: { objectId: 'obj-1' } };
      }

      if (method === 'Runtime.callFunctionOn') {
        const declaration = String(params?.functionDeclaration ?? '');
        if (declaration.includes('scrollIntoView')) {
          return { result: { value: null } };
        }

        if (declaration.includes('selectionPrepared')) {
          return {
            result: {
              value: {
                focused: true,
                selectionPrepared: true,
                existingTextLength: 17,
              },
            },
          };
        }

        return {
          result: {
            value: {
              found: true,
              tagName: 'INPUT',
              text: '',
              value: 'snapshot@example.com',
              focused: true,
              connected: true,
              checked: null,
              disabled: false,
              role: 'textbox',
            },
          },
        };
      }

      throw new Error(`Unexpected command: ${method}`);
    });

    const devtools = {
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
      attachToTab: vi.fn().mockResolvedValue(wc),
      ensureAttached: vi.fn().mockResolvedValue(wc),
      sendCommandToTab,
      sendCommand: vi.fn(),
      getAttachedWebContents: vi.fn().mockReturnValue(wc),
      getDispatchWebContents: vi.fn().mockReturnValue(wc),
    };

    const manager = new SnapshotManager(devtools as any);
    vi.spyOn(manager as any, 'performClick').mockResolvedValue(undefined);
    vi.spyOn(manager as any, 'delay').mockResolvedValue(undefined);

    const ref = manager.registerBackendNodeId(123, 100);
    const result = await manager.fillRef(ref, 'snapshot@example.com');

    expect(result.completion.effectConfirmed).toBe(true);
    expect(result.completion.mode).toBe('confirmed');
    expect(result.postAction.element?.value).toBe('snapshot@example.com');
    expect(
      wc.sendInputEvent.mock.calls.some(([event]) => event.keyCode === 'Backspace'),
    ).toBe(false);
    expect(
      wc.sendInputEvent.mock.calls.some(([event]) => event.type === 'char' && event.keyCode === 's'),
    ).toBe(true);
  });
});
