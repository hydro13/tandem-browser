import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn().mockReturnValue(false),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
  },
  existsSync: vi.fn().mockReturnValue(false),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

vi.mock('../../utils/paths', () => ({
  ensureDir: vi.fn((value: string) => value),
  tandemDir: vi.fn((...parts: string[]) => `/tmp/tandem/${parts.join('/')}`),
}));

vi.mock('../../notifications/alert', () => ({
  wingmanAlert: vi.fn(),
}));

import { PanelManager } from '../manager';
import { wingmanAlert } from '../../notifications/alert';

function createWindowStub() {
  return {
    isDestroyed: vi.fn().mockReturnValue(false),
    webContents: {
      isDestroyed: vi.fn().mockReturnValue(false),
      send: vi.fn(),
    },
  };
}

describe('PanelManager reply notifications', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('notifies when Wingman replies while the panel is closed', () => {
    const win = createWindowStub();
    const manager = new PanelManager(win as never);

    manager.addChatMessage('wingman', 'Here is the answer you asked for.');

    expect(wingmanAlert).toHaveBeenCalledWith('Wingman replied', 'Here is the answer you asked for.');
  });

  it('does not notify when the panel is open', () => {
    const win = createWindowStub();
    const manager = new PanelManager(win as never);

    manager.togglePanel(true);
    manager.addChatMessage('wingman', 'No notification should appear.');

    expect(wingmanAlert).not.toHaveBeenCalled();
  });

  it('does not notify for user messages', () => {
    const win = createWindowStub();
    const manager = new PanelManager(win as never);

    manager.addChatMessage('user', 'This is my own message.');

    expect(wingmanAlert).not.toHaveBeenCalled();
  });

  it('uses Claude as the sender label for Claude replies', () => {
    const win = createWindowStub();
    const manager = new PanelManager(win as never);

    manager.addChatMessage('claude', 'I have another suggestion.');

    expect(wingmanAlert).toHaveBeenCalledWith('Claude replied', 'I have another suggestion.');
  });

  it('clears typing indicator when wingman sends a message', () => {
    const win = createWindowStub();
    const manager = new PanelManager(win as never);

    manager.setWingmanTyping(true);
    manager.addChatMessage('wingman', 'Done thinking.');

    // Typing indicator should be cleared — verified by the IPC send
    const typingCalls = (win.webContents.send as any).mock.calls
      .filter((c: any[]) => c[0] === 'wingman-typing');
    const lastTyping = typingCalls[typingCalls.length - 1];
    expect(lastTyping[1]).toEqual({ typing: false });
  });

  it('falls back to an image message when there is no text', () => {
    const win = createWindowStub();
    const manager = new PanelManager(win as never);

    manager.addChatMessage('wingman', '', 'chat-123.png');

    expect(wingmanAlert).toHaveBeenCalledWith('Wingman replied', 'Sent an image.');
  });
});
