import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IpcChannels } from '../../shared/ipc-channels';

// Minimal ipcRenderer mock — we only care about on/removeListener wiring.
const ipcListeners = new Map<string, Set<(...args: unknown[]) => void>>();
const sentMessages: Array<{ channel: string; payload: unknown }> = [];

vi.mock('electron', () => ({
  ipcRenderer: {
    on: vi.fn((channel: string, handler: (...args: unknown[]) => void) => {
      if (!ipcListeners.has(channel)) ipcListeners.set(channel, new Set());
      ipcListeners.get(channel)!.add(handler);
    }),
    removeListener: vi.fn((channel: string, handler: (...args: unknown[]) => void) => {
      ipcListeners.get(channel)?.delete(handler);
    }),
    invoke: vi.fn(),
    send: vi.fn((channel: string, payload: unknown) => {
      sentMessages.push({ channel, payload });
    }),
  },
}));

import { createPanelApi } from '../panel';

beforeEach(() => {
  ipcListeners.clear();
  sentMessages.length = 0;
  vi.clearAllMocks();
});

describe('createPanelApi()', () => {
  it('exposes onApprovalResponse paired with onApprovalRequest (audit #34 follow-up, dual-panel sync)', () => {
    const api = createPanelApi() as Record<string, unknown>;
    expect(typeof api.onApprovalRequest).toBe('function');
    expect(typeof api.onApprovalResponse).toBe('function');
  });

  it('onApprovalResponse subscribes to the APPROVAL_RESPONSE IPC channel and forwards data', () => {
    const api = createPanelApi();
    const received: Array<{ requestId: string; approved: boolean }> = [];
    api.onApprovalResponse((data) => received.push(data));

    const handlers = ipcListeners.get(IpcChannels.APPROVAL_RESPONSE);
    expect(handlers).toBeDefined();
    expect(handlers!.size).toBe(1);

    // Simulate the main process broadcasting a response
    const payload = { requestId: 'task-1:step-0', approved: false };
    for (const h of handlers!) h({}, payload);
    expect(received).toEqual([payload]);
  });

  it('onApprovalResponse returns an unsubscribe function that removes the listener', () => {
    const api = createPanelApi();
    const unsubscribe = api.onApprovalResponse(() => { /* no-op */ });
    expect(ipcListeners.get(IpcChannels.APPROVAL_RESPONSE)!.size).toBe(1);
    unsubscribe();
    expect(ipcListeners.get(IpcChannels.APPROVAL_RESPONSE)!.size).toBe(0);
  });

  it('onApprovalRequest and onApprovalResponse use distinct IPC channels', () => {
    expect(IpcChannels.APPROVAL_REQUEST).not.toBe(IpcChannels.APPROVAL_RESPONSE);
  });

  it('requestWingmanReAlert sends the payload over the WINGMAN_RE_ALERT channel', () => {
    const api = createPanelApi();
    api.requestWingmanReAlert({ title: 'Agent stalling', body: 'Approve or reject' });
    expect(sentMessages).toEqual([
      { channel: IpcChannels.WINGMAN_RE_ALERT, payload: { title: 'Agent stalling', body: 'Approve or reject' } },
    ]);
  });
});
