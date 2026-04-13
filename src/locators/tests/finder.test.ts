import { describe, expect, it, vi } from 'vitest';
import { LocatorFinder } from '../finder';

describe('LocatorFinder', () => {
  it('falls back to runtime label resolution for simple label-for controls', async () => {
    const snapshot = {
      getAccessibilityTree: vi.fn(),
      registerBackendNodeId: vi.fn().mockReturnValue('@e1'),
    };

    const devTools = {
      evaluateInTab: vi.fn().mockResolvedValue('#email'),
      evaluate: vi.fn(),
      sendCommandToTab: vi.fn(async (_wcId: number, method: string) => {
        if (method === 'DOM.enable') {
          return {};
        }

        if (method === 'DOM.getDocument') {
          return { root: { nodeId: 1 } };
        }

        if (method === 'DOM.querySelector') {
          return { nodeId: 55 };
        }

        if (method === 'DOM.describeNode') {
          return { node: { backendNodeId: 501, nodeName: 'INPUT' } };
        }

        if (method === 'Accessibility.getPartialAXTree') {
          return { nodes: [{ role: { value: 'textbox' }, name: { value: 'Email' } }] };
        }

        throw new Error(`Unexpected command: ${method}`);
      }),
      sendCommand: vi.fn(),
    };

    const finder = new LocatorFinder(devTools as any, snapshot as any);
    const result = await finder.find({ by: 'label', value: 'Email' }, { wcId: 100 });

    expect(result).toEqual({
      found: true,
      ref: '@e1',
      text: 'Email',
      role: 'textbox',
      tagName: 'input',
      count: 1,
    });
    expect(snapshot.registerBackendNodeId).toHaveBeenCalledWith(501, 100);
    expect(devTools.evaluateInTab).toHaveBeenCalled();
  });
});
