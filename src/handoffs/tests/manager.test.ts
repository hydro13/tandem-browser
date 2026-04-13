import { beforeEach, describe, expect, it, vi } from 'vitest';

const fsState = vi.hoisted(() => ({
  exists: false,
  readText: '[]',
}));

vi.mock('fs', () => {
  const existsSync = vi.fn(() => fsState.exists);
  const readFileSync = vi.fn(() => fsState.readText);
  const writeFileSync = vi.fn();
  return {
    default: { existsSync, readFileSync, writeFileSync },
    existsSync,
    readFileSync,
    writeFileSync,
  };
});

vi.mock('../../utils/paths', () => ({
  ensureDir: vi.fn(),
  tandemDir: vi.fn((...parts: string[]) => `/tmp/tandem/${parts.join('/')}`),
}));

import fs from 'fs';
import { HandoffManager } from '../manager';

describe('HandoffManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fsState.exists = false;
    fsState.readText = '[]';
  });

  it('loads sanitized handoffs from disk and applies filters with open-first sorting', () => {
    fsState.exists = true;
    fsState.readText = JSON.stringify([
      {
        id: 'resolved-1',
        status: 'resolved',
        title: 'Already handled',
        body: 'Done',
        reason: 'done',
        workspaceId: 'ws-1',
        tabId: 'tab-1',
        open: true,
        createdAt: 10,
        updatedAt: 30,
      },
      {
        id: 'open-1',
        status: 'needs_human',
        title: ' Need review ',
        body: ' Please review ',
        reason: ' human_help ',
        workspaceId: ' ws-1 ',
        tabId: ' tab-2 ',
        taskId: 'task-1',
        stepId: 'step-1',
        createdAt: 1,
        updatedAt: 20,
      },
      {
        id: 'open-2',
        status: 'blocked',
        title: 'Second',
        createdAt: 2,
        updatedAt: 40,
      },
      {
        id: 'broken-1',
        status: 'oops',
        title: 'Invalid',
      },
    ]);

    const manager = new HandoffManager();

    expect(manager.list().map(handoff => handoff.id)).toEqual([
      'open-2',
      'open-1',
      'resolved-1',
    ]);
    expect(manager.list({ openOnly: true }).map(handoff => handoff.id)).toEqual([
      'open-2',
      'open-1',
    ]);
    expect(manager.list({ workspaceId: 'ws-1', taskId: 'task-1', stepId: 'step-1' })).toEqual([
      expect.objectContaining({
        id: 'open-1',
        workspaceId: 'ws-1',
        tabId: 'tab-2',
        open: true,
      }),
    ]);
    expect(manager.get('resolved-1')).toEqual(expect.objectContaining({
      open: false,
      resolvedAt: 30,
    }));

    const copy = manager.get('open-1');
    expect(copy).not.toBeNull();
    copy!.title = 'Changed externally';
    expect(manager.get('open-1')?.title).toBe('Need review');
  });

  it('creates handoffs with trimmed values, fallback defaults, persistence, and events', () => {
    const manager = new HandoffManager();
    const createdListener = vi.fn();
    manager.on('handoff-created', createdListener);

    const handoff = manager.create({
      status: 'resolved',
      title: '   ',
      body: '  Review done  ',
      reason: '   ',
      workspaceId: ' ws-9 ',
      tabId: ' tab-9 ',
      agentId: ' agent-1 ',
      source: ' source-1 ',
      actionLabel: '   ',
      taskId: ' task-9 ',
      stepId: ' step-9 ',
    });

    expect(handoff).toEqual(expect.objectContaining({
      status: 'resolved',
      title: 'Agent handoff',
      body: 'Review done',
      reason: 'human_help',
      workspaceId: 'ws-9',
      tabId: 'tab-9',
      agentId: 'agent-1',
      source: 'source-1',
      actionLabel: null,
      taskId: 'task-9',
      stepId: 'step-9',
      open: false,
    }));
    expect(handoff.resolvedAt).toBeTypeOf('number');
    expect(createdListener).toHaveBeenCalledWith(expect.objectContaining({
      id: handoff.id,
      open: false,
    }));
    expect(vi.mocked(fs.writeFileSync)).toHaveBeenCalledWith(
      '/tmp/tandem/handoffs.json',
      expect.stringContaining('"status": "resolved"'),
    );
  });

  it('updates, reopens, resolves, and finds open handoffs by task step', () => {
    const manager = new HandoffManager();
    const updatedListener = vi.fn();
    manager.on('handoff-updated', updatedListener);

    const first = manager.create({
      status: 'blocked',
      title: 'Login required',
      reason: 'login_required',
      workspaceId: 'ws-1',
      tabId: 'tab-1',
      source: 'claude',
      taskId: 'task-1',
      stepId: 'step-1',
    });
    manager.create({
      status: 'resolved',
      title: 'Done',
      taskId: 'task-1',
      stepId: 'step-1',
    });

    expect(manager.findOpenByTaskStep('task-1', 'step-1')?.id).toBe(first.id);

    const paused = manager.update(first.id, {
      title: '   ',
      body: '  Sign in first  ',
      reason: '   ',
      workspaceId: '',
      tabId: '',
      source: '',
      open: false,
    });
    expect(paused).toEqual(expect.objectContaining({
      title: 'Login required',
      body: 'Sign in first',
      reason: 'login_required',
      workspaceId: null,
      tabId: null,
      source: null,
      open: false,
    }));
    expect(paused?.resolvedAt).toBeTypeOf('number');

    const reopened = manager.update(first.id, {
      status: 'ready_to_resume',
      open: true,
      actionLabel: 'Resume agent',
    });
    expect(reopened).toEqual(expect.objectContaining({
      status: 'ready_to_resume',
      open: true,
      actionLabel: 'Resume agent',
      resolvedAt: undefined,
    }));

    const resolved = manager.resolve(first.id);
    expect(resolved).toEqual(expect.objectContaining({
      status: 'resolved',
      open: false,
    }));
    expect(manager.findOpenByTaskStep('task-1', 'step-1')).toBeNull();
    expect(manager.resolve('missing')).toBeNull();
    expect(manager.update('missing', { open: false })).toBeNull();
    expect(updatedListener).toHaveBeenCalled();
  });

  it('recovers from malformed disk state without throwing', () => {
    fsState.exists = true;
    fsState.readText = '{not-json';

    const manager = new HandoffManager();

    expect(manager.list()).toEqual([]);
    expect(vi.mocked(fs.readFileSync)).toHaveBeenCalledWith('/tmp/tandem/handoffs.json', 'utf-8');
  });
});
