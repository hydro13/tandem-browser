import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';

// Mock fs to avoid real filesystem writes
vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof fs>('fs');
  return {
    ...actual,
    default: {
      ...actual,
      existsSync: vi.fn().mockReturnValue(false),
      mkdirSync: vi.fn(),
      writeFileSync: vi.fn(),
      readFileSync: vi.fn().mockReturnValue('[]'),
      readdirSync: vi.fn().mockReturnValue([]),
    },
    existsSync: vi.fn().mockReturnValue(false),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
    readFileSync: vi.fn().mockReturnValue('[]'),
    readdirSync: vi.fn().mockReturnValue([]),
  };
});

import { TaskManager, getRiskLevel, type AITask } from '../task-manager';

describe('getRiskLevel()', () => {
  it('returns none for read actions', () => {
    expect(getRiskLevel('read_page')).toBe('none');
    expect(getRiskLevel('screenshot')).toBe('none');
    expect(getRiskLevel('scroll')).toBe('none');
  });

  it('returns low for navigation actions', () => {
    expect(getRiskLevel('navigate')).toBe('low');
    expect(getRiskLevel('open_tab')).toBe('low');
    expect(getRiskLevel('close_tab')).toBe('low');
  });

  it('returns medium for click/select', () => {
    expect(getRiskLevel('click')).toBe('medium');
    expect(getRiskLevel('select')).toBe('medium');
  });

  it('returns high for type/form/execute actions', () => {
    expect(getRiskLevel('type')).toBe('high');
    expect(getRiskLevel('fill_form')).toBe('high');
    expect(getRiskLevel('execute_js')).toBe('high');
  });

  it('returns medium for unknown actions', () => {
    expect(getRiskLevel('unknown_action')).toBe('medium');
  });
});

describe('TaskManager', () => {
  let tm: TaskManager;

  beforeEach(() => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(fs.readFileSync).mockReturnValue('[]');
    vi.mocked(fs.readdirSync).mockReturnValue([]);
    tm = new TaskManager();
  });

  afterEach(() => {
    tm.destroy();
  });

  describe('createTask()', () => {
    it('creates a task with pending status', () => {
      const task = tm.createTask('Test task', 'robin', 'claude', [
        { description: 'Step 1', action: { type: 'navigate', params: { url: 'https://test.com' } }, riskLevel: 'low', requiresApproval: false },
      ]);
      expect(task.description).toBe('Test task');
      expect(task.status).toBe('pending');
      expect(task.createdBy).toBe('robin');
      expect(task.assignedTo).toBe('claude');
      expect(task.steps).toHaveLength(1);
      expect(task.steps[0].status).toBe('pending');
    });

    it('generates unique task IDs', () => {
      const t1 = tm.createTask('Task 1', 'robin', 'claude', []);
      const t2 = tm.createTask('Task 2', 'robin', 'claude', []);
      expect(t1.id).not.toBe(t2.id);
    });

    it('emits task-created event', () => {
      const handler = vi.fn();
      tm.on('task-created', handler);
      const task = tm.createTask('Task', 'robin', 'claude', []);
      expect(handler).toHaveBeenCalledWith(task);
    });

    it('persists task to filesystem', () => {
      const task = tm.createTask('Task', 'robin', 'claude', []);
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining(task.id),
        expect.any(String)
      );
    });
  });

  describe('needsApproval()', () => {
    it('does not require approval for read actions', () => {
      expect(tm.needsApproval('read_page')).toBe(false);
      expect(tm.needsApproval('screenshot')).toBe(false);
    });

    it('does not require approval for low-risk navigation', () => {
      expect(tm.needsApproval('navigate')).toBe(false);
    });

    it('requires approval for click actions by default', () => {
      expect(tm.needsApproval('click')).toBe(true);
    });

    it('requires approval for high-risk actions', () => {
      expect(tm.needsApproval('type')).toBe(true);
      expect(tm.needsApproval('fill_form')).toBe(true);
      expect(tm.needsApproval('execute_js')).toBe(true);
    });

    it('auto-approves clicks on trusted sites when click auto-approve is on', () => {
      tm.updateAutonomySettings({ autoApproveClick: true });
      expect(tm.needsApproval('click', 'https://google.com/search')).toBe(false);
      expect(tm.needsApproval('click', 'https://maps.google.com')).toBe(false);
    });
  });

  describe('autonomy settings', () => {
    it('returns default settings', () => {
      const settings = tm.getAutonomySettings();
      expect(settings.autoApproveRead).toBe(true);
      expect(settings.autoApproveNavigate).toBe(true);
      expect(settings.autoApproveClick).toBe(false);
      expect(settings.autoApproveType).toBe(false);
    });

    it('patches settings without losing existing values', () => {
      tm.updateAutonomySettings({ autoApproveClick: true });
      const settings = tm.getAutonomySettings();
      expect(settings.autoApproveClick).toBe(true);
      expect(settings.autoApproveRead).toBe(true); // unchanged
    });

    it('persists settings to filesystem', () => {
      tm.updateAutonomySettings({ autoApproveClick: true });
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('autonomy-settings.json'),
        expect.any(String)
      );
    });
  });

  describe('emergencyStop()', () => {
    it('pauses running tasks', () => {
      // Create a task and simulate it running
      const task = tm.createTask('Task', 'robin', 'claude', [
        { description: 'Step', action: { type: 'click', params: {} }, riskLevel: 'medium', requiresApproval: true },
      ]);

      // Mock getTask to return running task
      const storedJson = JSON.stringify({ ...task, status: 'running', steps: [{ ...task.steps[0], status: 'running' }] });
      vi.mocked(fs.readdirSync).mockReturnValue([`${task.id}.json`] as any);
      vi.mocked(fs.readFileSync).mockReturnValue(storedJson);
      vi.mocked(fs.existsSync).mockReturnValue(true);

      const result = tm.emergencyStop();
      expect(result.stopped).toBe(1);
    });

    it('emits emergency-stop event', () => {
      const handler = vi.fn();
      tm.on('emergency-stop', handler);
      tm.emergencyStop();
      expect(handler).toHaveBeenCalled();
    });

    it('sets emergency stopped flag temporarily', () => {
      tm.emergencyStop();
      expect(tm.isEmergencyStopped()).toBe(true);
    });
  });

  describe('activity log', () => {
    it('logs activity entries', () => {
      const handler = vi.fn();
      tm.on('activity', handler);
      tm.logActivity({
        timestamp: Date.now(),
        agent: 'claude',
        action: 'navigate',
        target: 'https://test.com',
      });
      expect(handler).toHaveBeenCalled();
      expect(tm.getActivityLog(1)).toHaveLength(1);
    });

    it('returns last N entries', () => {
      for (let i = 0; i < 5; i++) {
        tm.logActivity({ timestamp: i, agent: 'claude', action: `action-${i}` });
      }
      expect(tm.getActivityLog(3)).toHaveLength(3);
      expect(tm.getActivityLog(3)[2].action).toBe('action-4'); // most recent
    });
  });

  describe('approval flow', () => {
    it('respondToApproval emits approval-response', () => {
      const task = tm.createTask('Task', 'robin', 'claude', [
        { description: 'Step', action: { type: 'click', params: {} }, riskLevel: 'medium', requiresApproval: true },
      ]);

      // Mock the task being saved and retrievable
      const taskJson = JSON.stringify(task);
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(taskJson);

      const handler = vi.fn();
      tm.on('approval-response', handler);

      tm.respondToApproval(task.id, task.steps[0].id, true);

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ approved: true })
      );
    });
  });

  describe('task lifecycle', () => {
    let task: AITask;

    beforeEach(() => {
      task = tm.createTask('Lifecycle test', 'robin', 'claude', [
        { description: 'Step 1', action: { type: 'read_page', params: {} }, riskLevel: 'none', requiresApproval: false },
        { description: 'Step 2', action: { type: 'click', params: {} }, riskLevel: 'medium', requiresApproval: true },
      ]);
      // Mock retrieval
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(task));
    });

    it('markTaskRunning changes status', () => {
      tm.markTaskRunning(task.id);
      // Verify it writes with running status
      const lastCall = vi.mocked(fs.writeFileSync).mock.calls.at(-1);
      const written = JSON.parse(lastCall![1] as string);
      expect(written.status).toBe('running');
    });

    it('markTaskDone changes status and sets completedAt', () => {
      tm.markTaskDone(task.id, ['result1', 'result2']);
      const lastCall = vi.mocked(fs.writeFileSync).mock.calls.at(-1);
      const written = JSON.parse(lastCall![1] as string);
      expect(written.status).toBe('done');
      expect(written.completedAt).toBeDefined();
      expect(written.results).toEqual(['result1', 'result2']);
    });

    it('markTaskFailed changes status and adds error', () => {
      tm.markTaskFailed(task.id, 'Something went wrong');
      const lastCall = vi.mocked(fs.writeFileSync).mock.calls.at(-1);
      const written = JSON.parse(lastCall![1] as string);
      expect(written.status).toBe('failed');
      expect(written.results).toContainEqual({ error: 'Something went wrong' });
    });
  });
});
