import { describe, it, expect, vi, beforeEach } from 'vitest';
import type fs from 'fs';

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof fs>('fs');
  return {
    ...actual,
    existsSync: vi.fn().mockReturnValue(false),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
    readFileSync: vi.fn().mockReturnValue('{}'),
  };
});

vi.mock('../../utils/paths', () => ({
  tandemDir: vi.fn((...parts: string[]) => `/tmp/tandem/${parts.join('/')}`),
  ensureDir: vi.fn((value: string) => value),
}));

vi.mock('../../utils/logger', () => ({
  createLogger: vi.fn().mockReturnValue({
    debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(),
  }),
}));

vi.mock('../../shared/ipc-channels', () => ({
  IpcChannels: { WORKSPACE_SWITCHED: 'workspace-switched' },
}));

import * as fsModule from 'fs';
import { WorkspaceManager } from '../manager';

describe('WorkspaceManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fsModule.existsSync).mockReturnValue(false);
  });

  function createManager(): WorkspaceManager {
    return new WorkspaceManager();
  }

  describe('constructor', () => {
    it('creates a default workspace on fresh state', () => {
      const wm = createManager();
      const list = wm.list();
      expect(list).toHaveLength(1);
      expect(list[0].name).toBe('Default');
      expect(list[0].isDefault).toBe(true);
    });

    it('sets active workspace to default', () => {
      const wm = createManager();
      const active = wm.getActive();
      expect(active.isDefault).toBe(true);
    });
  });

  describe('create', () => {
    it('creates a workspace with name', () => {
      const wm = createManager();
      const ws = wm.create({ name: 'Work' });
      expect(ws.name).toBe('Work');
      expect(ws.icon).toBe('briefcase');
      expect(ws.isDefault).toBe(false);
      expect(ws.tabIds).toEqual([]);
    });

    it('creates with custom icon and color', () => {
      const wm = createManager();
      const ws = wm.create({ name: 'Personal', icon: 'star', color: '#ff0000' });
      expect(ws.icon).toBe('star');
      expect(ws.color).toBe('#ff0000');
    });

    it('throws if name is empty', () => {
      const wm = createManager();
      expect(() => wm.create({ name: '' })).toThrow('name is required');
    });

    it('assigns incrementing order', () => {
      const wm = createManager();
      const ws1 = wm.create({ name: 'A' });
      const ws2 = wm.create({ name: 'B' });
      expect(ws1.order).toBe(1); // 0 is the default workspace
      expect(ws2.order).toBe(2);
    });
  });

  describe('get', () => {
    it('returns workspace by id', () => {
      const wm = createManager();
      const ws = wm.create({ name: 'Test' });
      expect(wm.get(ws.id)).toBeDefined();
      expect(wm.get(ws.id)!.name).toBe('Test');
    });

    it('returns undefined for nonexistent id', () => {
      const wm = createManager();
      expect(wm.get('nonexistent')).toBeUndefined();
    });
  });

  describe('update', () => {
    it('updates workspace name', () => {
      const wm = createManager();
      const ws = wm.create({ name: 'Old' });
      const updated = wm.update(ws.id, { name: 'New' });
      expect(updated.name).toBe('New');
    });

    it('updates icon and color', () => {
      const wm = createManager();
      const ws = wm.create({ name: 'Test' });
      const updated = wm.update(ws.id, { icon: 'globe', color: '#00ff00' });
      expect(updated.icon).toBe('globe');
      expect(updated.color).toBe('#00ff00');
    });

    it('throws for nonexistent workspace', () => {
      const wm = createManager();
      expect(() => wm.update('fake', { name: 'x' })).toThrow('not found');
    });
  });

  describe('remove', () => {
    it('removes a non-default workspace', () => {
      const wm = createManager();
      const ws = wm.create({ name: 'Deleteme' });
      wm.remove(ws.id);
      expect(wm.get(ws.id)).toBeUndefined();
    });

    it('throws when removing the default workspace', () => {
      const wm = createManager();
      const defaultWs = wm.list().find(w => w.isDefault)!;
      expect(() => wm.remove(defaultWs.id)).toThrow('Cannot delete the default workspace');
    });

    it('throws for nonexistent workspace', () => {
      const wm = createManager();
      expect(() => wm.remove('fake')).toThrow('not found');
    });

    it('moves tabs to default workspace when deleted', () => {
      const wm = createManager();
      const ws = wm.create({ name: 'Work' });
      wm.switch(ws.id);
      wm.assignTab(101);
      wm.remove(ws.id);
      const defaultWs = wm.list().find(w => w.isDefault)!;
      expect(defaultWs.tabIds).toContain(101);
    });

    it('switches to default if active workspace is deleted', () => {
      const wm = createManager();
      const ws = wm.create({ name: 'Active' });
      wm.switch(ws.id);
      wm.remove(ws.id);
      expect(wm.getActive().isDefault).toBe(true);
    });
  });

  describe('switch', () => {
    it('switches the active workspace', () => {
      const wm = createManager();
      const ws = wm.create({ name: 'Work' });
      const result = wm.switch(ws.id);
      expect(result.id).toBe(ws.id);
      expect(wm.getActiveId()).toBe(ws.id);
      expect(wm.getActiveSource()).toBe('selection');
    });

    it('throws for nonexistent workspace', () => {
      const wm = createManager();
      expect(() => wm.switch('fake')).toThrow('not found');
    });

    it('sends IPC notification when main window is set', () => {
      const wm = createManager();
      const mockSend = vi.fn();
      const mockWin = {
        isDestroyed: vi.fn().mockReturnValue(false),
        webContents: { send: mockSend, isDestroyed: vi.fn().mockReturnValue(false) },
      } as any;
      wm.setMainWindow(mockWin);
      const ws = wm.create({ name: 'Work' });
      wm.switch(ws.id);
      expect(mockSend).toHaveBeenCalledWith('workspace-switched', expect.objectContaining({ id: ws.id }));
    });
  });

  describe('assignTab', () => {
    it('assigns tab to active workspace', () => {
      const wm = createManager();
      wm.assignTab(42);
      const active = wm.getActive();
      expect(active.tabIds).toContain(42);
    });

    it('removes tab from previous workspace before assigning', () => {
      const wm = createManager();
      wm.assignTab(42);
      const ws2 = wm.create({ name: 'Other' });
      wm.switch(ws2.id);
      wm.assignTab(42);
      const defaultWs = wm.list().find(w => w.isDefault)!;
      expect(defaultWs.tabIds).not.toContain(42);
      expect(ws2.tabIds).toContain(42);
    });
  });

  describe('removeTab', () => {
    it('removes tab from its workspace', () => {
      const wm = createManager();
      wm.assignTab(42);
      wm.removeTab(42);
      const active = wm.getActive();
      expect(active.tabIds).not.toContain(42);
    });

    it('handles removing a tab that does not exist', () => {
      const wm = createManager();
      expect(() => wm.removeTab(999)).not.toThrow();
    });
  });

  describe('moveTab', () => {
    it('moves tab to target workspace', () => {
      const wm = createManager();
      wm.assignTab(42);
      const ws2 = wm.create({ name: 'Target' });
      wm.moveTab(42, ws2.id);
      expect(ws2.tabIds).toContain(42);
      const defaultWs = wm.list().find(w => w.isDefault)!;
      expect(defaultWs.tabIds).not.toContain(42);
    });

    it('throws for nonexistent target workspace', () => {
      const wm = createManager();
      expect(() => wm.moveTab(42, 'fake')).toThrow('not found');
    });
  });

  describe('getWorkspaceIdForTab', () => {
    it('returns workspace id for assigned tab', () => {
      const wm = createManager();
      wm.assignTab(42);
      const wsId = wm.getWorkspaceIdForTab(42);
      expect(wsId).toBe(wm.getActiveId());
    });

    it('returns null for unassigned tab', () => {
      const wm = createManager();
      expect(wm.getWorkspaceIdForTab(999)).toBeNull();
    });
  });

  describe('resetTabAssignments', () => {
    it('clears all tab assignments', () => {
      const wm = createManager();
      wm.assignTab(1);
      wm.assignTab(2);
      const ws = wm.create({ name: 'Other' });
      wm.switch(ws.id);
      wm.assignTab(3);
      wm.resetTabAssignments();
      for (const w of wm.list()) {
        expect(w.tabIds).toEqual([]);
      }
    });
  });

  describe('reconcileTabState', () => {
    it('removes stale and duplicate tab IDs, assigns unowned tabs to default, and syncs active workspace to the focused tab', () => {
      const wm = createManager();
      const wsA = wm.create({ name: 'Agent A' });
      const wsB = wm.create({ name: 'Agent B' });
      const workspaces = (wm as any).workspaces as Map<string, { tabIds: number[] }>;
      const defaultWs = wm.list().find(w => w.isDefault)!;

      workspaces.get(defaultWs.id)!.tabIds = [1, 1, 999];
      workspaces.get(wsA.id)!.tabIds = [1, 2];
      workspaces.get(wsB.id)!.tabIds = [];

      const result = wm.reconcileTabState([1, 2, 3], 2);

      expect(result).toEqual({ changed: true, activeId: wsA.id });
      expect(workspaces.get(defaultWs.id)!.tabIds).toEqual([1, 3]);
      expect(workspaces.get(wsA.id)!.tabIds).toEqual([2]);
      expect(workspaces.get(wsB.id)!.tabIds).toEqual([]);
      expect(wm.getActiveId()).toBe(wsA.id);
    });

    it('does not emit workspace-switched notifications for read-path reconciliation unless explicitly requested', () => {
      const wm = createManager();
      const ws = wm.create({ name: 'Agent A' });
      const mockSend = vi.fn();
      const mockWin = {
        isDestroyed: vi.fn().mockReturnValue(false),
        webContents: { send: mockSend, isDestroyed: vi.fn().mockReturnValue(false) },
      } as any;
      wm.setMainWindow(mockWin);

      const workspaces = (wm as any).workspaces as Map<string, { tabIds: number[] }>;
      const defaultWs = wm.list().find(w => w.isDefault)!;
      workspaces.get(defaultWs.id)!.tabIds = [1];
      workspaces.get(ws.id)!.tabIds = [2];

      wm.reconcileTabState([1, 2], 2);
      expect(mockSend).not.toHaveBeenCalled();

      wm.reconcileTabState([1, 2], 1, { notify: true });
      expect(mockSend).toHaveBeenCalledWith('workspace-switched', expect.objectContaining({ id: defaultWs.id }));
    });

    it('preserves an explicitly selected empty workspace until focus actually changes', () => {
      const wm = createManager();
      const ws = wm.create({ name: 'Empty' });

      wm.switch(ws.id);
      expect(wm.getActiveId()).toBe(ws.id);
      expect(wm.getActiveSource()).toBe('selection');

      wm.reconcileTabState([1], 1);
      expect(wm.getActiveId()).toBe(ws.id);
      expect(wm.getActiveSource()).toBe('selection');

      wm.reconcileTabState([1], 1, { followFocusedTab: true });
      expect(wm.getActiveId()).toBe(wm.list().find(workspace => workspace.isDefault)!.id);
      expect(wm.getActiveSource()).toBe('focused-tab');
    });
  });

  describe('list', () => {
    it('returns workspaces sorted by order', () => {
      const wm = createManager();
      wm.create({ name: 'B' });
      wm.create({ name: 'A' });
      const list = wm.list();
      expect(list[0].name).toBe('Default');
      expect(list[1].name).toBe('B');
      expect(list[2].name).toBe('A');
    });
  });
});
