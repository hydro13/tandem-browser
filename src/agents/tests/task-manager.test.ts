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
      const task = tm.createTask('Test task', 'user', 'claude', [
        { description: 'Step 1', action: { type: 'navigate', params: { url: 'https://test.com' } }, riskLevel: 'low', requiresApproval: false },
      ]);
      expect(task.description).toBe('Test task');
      expect(task.status).toBe('pending');
      expect(task.createdBy).toBe('user');
      expect(task.assignedTo).toBe('claude');
      expect(task.steps).toHaveLength(1);
      expect(task.steps[0].status).toBe('pending');
    });

    it('generates unique task IDs', () => {
      const t1 = tm.createTask('Task 1', 'user', 'claude', []);
      const t2 = tm.createTask('Task 2', 'user', 'claude', []);
      expect(t1.id).not.toBe(t2.id);
    });

    it('emits task-created event', () => {
      const handler = vi.fn();
      tm.on('task-created', handler);
      const task = tm.createTask('Task', 'user', 'claude', []);
      expect(handler).toHaveBeenCalledWith(task);
    });

    it('persists task to filesystem', () => {
      const task = tm.createTask('Task', 'user', 'claude', []);
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

    it('ignores prototype-polluting keys in autonomy patches', () => {
      const patch = JSON.parse('{"__proto__":{"polluted":true},"autoApproveClick":true}') as any;
      tm.updateAutonomySettings(patch);
      expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
      expect(tm.getAutonomySettings().autoApproveClick).toBe(true);
    });
  });

  describe('emergencyStop()', () => {
    it('pauses running tasks', () => {
      // Create a task and simulate it running
      const task = tm.createTask('Task', 'user', 'claude', [
        { description: 'Step', action: { type: 'click', params: {} }, riskLevel: 'medium', requiresApproval: true },
      ]);

      // Mock getTask to return running task
      const storedJson = JSON.stringify({ ...task, status: 'running', steps: [{ ...task.steps[0], status: 'running' }] });
      vi.mocked(fs.readdirSync).mockReturnValue([`${task.id}.json`] as unknown as fs.Dirent[]);
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
      const task = tm.createTask('Task', 'user', 'claude', [
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

    it('requestApproval returns false for an invalid step index', async () => {
      await expect(tm.requestApproval({
        id: 'task-1',
        description: 'Task',
        createdBy: 'user',
        assignedTo: 'claude',
        status: 'pending',
        steps: [],
        currentStep: 0,
        results: [],
        createdAt: 1,
        updatedAt: 1,
      }, 3)).resolves.toBe(false);
    });

    it('requestApproval resolves once the matching approval-response arrives', async () => {
      const task = tm.createTask('Task', 'user', 'claude', [
        { description: 'Step', action: { type: 'click', params: {} }, riskLevel: 'medium', requiresApproval: true },
      ]);

      const promise = tm.requestApproval(task, 0);
      tm.emit('approval-response', { requestId: `${task.id}:${task.steps[0].id}`, approved: true });

      await expect(promise).resolves.toBe(true);
    });

    it('respondToApproval no-ops when the task or step is missing', () => {
      const writesBeforeMissingTask = vi.mocked(fs.writeFileSync).mock.calls.length;
      vi.mocked(fs.existsSync).mockReturnValue(false);
      tm.respondToApproval('missing-task', 'step-1', true);
      expect(vi.mocked(fs.writeFileSync).mock.calls.length).toBe(writesBeforeMissingTask);

      const task = tm.createTask('Task', 'user', 'claude', [
        { description: 'Step', action: { type: 'click', params: {} }, riskLevel: 'medium', requiresApproval: true },
      ]);
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(task));

      const writesBeforeMissingStep = vi.mocked(fs.writeFileSync).mock.calls.length;
      tm.respondToApproval(task.id, 'missing-step', true);
      expect(vi.mocked(fs.writeFileSync).mock.calls.length).toBe(writesBeforeMissingStep);
    });
  });

  describe('task lifecycle', () => {
    let task: AITask;

    beforeEach(() => {
      task = tm.createTask('Lifecycle test', 'user', 'claude', [
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

    it('updateStepStatus ignores invalid step indexes', () => {
      const writesBefore = vi.mocked(fs.writeFileSync).mock.calls.length;
      const result = tm.updateStepStatus(task.id, '__proto__' as any, 'done');
      expect(result).toBeNull();
      expect(vi.mocked(fs.writeFileSync).mock.calls.length).toBe(writesBefore);
    });

    it('markTaskFailed changes status and adds error', () => {
      tm.markTaskFailed(task.id, 'Something went wrong');
      const lastCall = vi.mocked(fs.writeFileSync).mock.calls.at(-1);
      const written = JSON.parse(lastCall![1] as string);
      expect(written.status).toBe('failed');
      expect(written.results).toContainEqual({ error: 'Something went wrong' });
    });

    it('pauses a task for a human handoff and records step metadata', () => {
      const updated = tm.pauseTaskForHandoff(task.id, task.steps[1].id, 'handoff-1', 'human');

      expect(updated?.status).toBe('paused');
      expect(updated?.steps[1]).toEqual(expect.objectContaining({
        handoffId: 'handoff-1',
        waitingOn: 'human',
      }));
    });

    it('pauses running steps for approval handoffs and exposes step lookup helpers', () => {
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
        ...task,
        status: 'running',
        steps: [
          task.steps[0],
          { ...task.steps[1], status: 'running' },
        ],
      }));

      const updated = tm.pauseTaskForHandoff(task.id, task.steps[1].id, 'handoff-approval', 'approval');
      expect(updated?.status).toBe('waiting-approval');
      expect(updated?.steps[1].status).toBe('pending');

      const stepContext = tm.getStep(task.id, task.steps[1].id);
      expect(stepContext?.stepIndex).toBe(1);
      expect(tm.getStep(task.id, 'missing-step')).toBeNull();
      vi.mocked(fs.existsSync).mockReturnValue(false);
      expect(tm.getStep('missing-task', task.steps[1].id)).toBeNull();
    });

    it('links step handoffs and clears readiness only for non-human waits', () => {
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
        ...task,
        steps: [
          task.steps[0],
          { ...task.steps[1], handoffId: 'handoff-1', readyToResumeAt: 123, waitingOn: 'human' },
        ],
      }));

      const humanLinked = tm.linkStepHandoff(task.id, task.steps[1].id, 'handoff-human', 'human');
      expect(humanLinked?.steps[1].readyToResumeAt).toBe(123);
      expect(humanLinked?.steps[1].waitingOn).toBe('human');

      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
        ...task,
        steps: [
          task.steps[0],
          { ...task.steps[1], handoffId: 'handoff-1', readyToResumeAt: 123, waitingOn: 'human' },
        ],
      }));

      const reviewLinked = tm.linkStepHandoff(task.id, task.steps[1].id, 'handoff-review', 'review');
      expect(reviewLinked?.steps[1].readyToResumeAt).toBeUndefined();
      expect(reviewLinked?.steps[1].waitingOn).toBe('review');
    });

    it('marks a paused task ready to resume and can resume it', () => {
      tm.pauseTaskForHandoff(task.id, task.steps[1].id, 'handoff-1', 'human');
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
        ...task,
        status: 'paused',
        steps: [
          task.steps[0],
          { ...task.steps[1], handoffId: 'handoff-1', waitingOn: 'human' },
        ],
      }));

      const ready = tm.markTaskReadyToResume(task.id, task.steps[1].id, 'handoff-1');
      expect(ready?.status).toBe('ready-to-resume');
      expect(ready?.steps[1].readyToResumeAt).toBeDefined();

      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
        ...task,
        status: 'ready-to-resume',
        steps: [
          task.steps[0],
          {
            ...task.steps[1],
            status: 'pending',
            handoffId: 'handoff-1',
            readyToResumeAt: Date.now(),
          },
        ],
      }));

      const resumed = tm.resumeTask(task.id, task.steps[1].id, 'handoff-1');
      expect(resumed?.status).toBe('running');
      expect(resumed?.steps[1]).toEqual(expect.objectContaining({
        status: 'running',
      }));
      expect(resumed?.steps[1].handoffId).toBeUndefined();
    });

    it('does not move terminal steps into ready-to-resume or running again', () => {
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
        ...task,
        status: 'paused',
        steps: [
          task.steps[0],
          { ...task.steps[1], status: 'done', handoffId: 'handoff-1' },
        ],
      }));

      const ready = tm.markTaskReadyToResume(task.id, task.steps[1].id, 'handoff-1');
      expect(ready?.status).toBe('paused');
      expect(ready?.steps[1].status).toBe('done');

      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
        ...task,
        status: 'ready-to-resume',
        steps: [
          task.steps[0],
          { ...task.steps[1], status: 'rejected', handoffId: 'handoff-1' },
        ],
      }));

      expect(tm.resumeTask(task.id, task.steps[1].id, 'handoff-1')).toBeNull();
    });

    it('guards resume and clear operations when handoff ids do not match', () => {
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
        ...task,
        status: 'ready-to-resume',
        steps: [
          task.steps[0],
          { ...task.steps[1], status: 'pending', handoffId: 'handoff-expected', readyToResumeAt: 123 },
        ],
      }));

      expect(tm.resumeTask(task.id, task.steps[1].id, 'handoff-other')).toBeNull();

      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
        ...task,
        status: 'paused',
        steps: [
          task.steps[0],
          { ...task.steps[1], handoffId: 'handoff-expected', waitingOn: 'human', readyToResumeAt: 123 },
        ],
      }));

      expect(tm.clearStepHandoff(task.id, task.steps[1].id, 'handoff-other')).toBeNull();
      const cleared = tm.clearStepHandoff(task.id, task.steps[1].id, 'handoff-expected');
      expect(cleared?.steps[1].handoffId).toBeUndefined();
      expect(cleared?.steps[1].waitingOn).toBeUndefined();
      expect(cleared?.steps[1].readyToResumeAt).toBeUndefined();
    });
  });
});
