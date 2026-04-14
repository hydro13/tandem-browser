import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TaskHandoffCoordinator } from '../task-handoff-coordinator';

function createHandoff(overrides: Record<string, unknown> = {}) {
  return {
    id: 'handoff-1',
    status: 'needs_human',
    title: 'Need help',
    body: 'Solve captcha',
    reason: 'captcha',
    workspaceId: null,
    tabId: null,
    agentId: 'claude',
    source: 'claude',
    actionLabel: null,
    taskId: 'task-1',
    stepId: 'step-1',
    open: true,
    createdAt: 1,
    updatedAt: 2,
    ...overrides,
  };
}

describe('TaskHandoffCoordinator', () => {
  const taskManager = {
    getTask: vi.fn(),
    getStep: vi.fn(),
    pauseTaskForHandoff: vi.fn(),
    linkStepHandoff: vi.fn(),
    markTaskReadyToResume: vi.fn(),
    resumeTask: vi.fn(),
    clearStepHandoff: vi.fn(),
    respondToApproval: vi.fn(),
  } as any;

  const handoffManager = {
    findOpenByTaskStep: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    get: vi.fn(),
  } as any;

  let coordinator: TaskHandoffCoordinator;

  beforeEach(() => {
    vi.clearAllMocks();
    coordinator = new TaskHandoffCoordinator(taskManager, handoffManager);
  });

  it('creates approval handoffs and pauses the linked task step for approval', () => {
    taskManager.getTask.mockReturnValue({ createdBy: 'user', assignedTo: 'claude' });
    handoffManager.create.mockReturnValue(createHandoff({ status: 'waiting_approval', reason: 'approval_required' }));

    const handoff = coordinator.handleApprovalRequest({
      taskId: 'task-1',
      stepId: 'step-1',
      description: 'Delete all rows',
      action: { params: { workspaceId: 'ws-1', tabId: 'tab-1' } },
    });

    expect(handoffManager.create).toHaveBeenCalledWith(expect.objectContaining({
      status: 'waiting_approval',
      workspaceId: 'ws-1',
      tabId: 'tab-1',
      source: 'user',
    }));
    expect(taskManager.pauseTaskForHandoff).toHaveBeenCalledWith('task-1', 'step-1', 'handoff-1', 'approval');
    expect(handoff?.status).toBe('waiting_approval');
  });

  it('updates an existing approval handoff instead of creating a duplicate', () => {
    taskManager.getTask.mockReturnValue({ createdBy: 'openclaw', assignedTo: 'claude' });
    handoffManager.findOpenByTaskStep.mockReturnValue(createHandoff({ id: 'handoff-existing' }));
    handoffManager.update.mockReturnValue(createHandoff({
      id: 'handoff-existing',
      status: 'waiting_approval',
      reason: 'approval_required',
    }));

    const handoff = coordinator.handleApprovalRequest({
      taskId: 'task-1',
      stepId: 'step-1',
      action: null,
    });

    expect(handoffManager.update).toHaveBeenCalledWith('handoff-existing', expect.objectContaining({
      source: 'openclaw',
      body: 'Agent action requires review.',
      workspaceId: null,
      tabId: null,
    }));
    expect(handoffManager.create).not.toHaveBeenCalled();
    expect(handoff?.id).toBe('handoff-existing');
  });

  it('returns null when approval handoff creation/update fails', () => {
    handoffManager.findOpenByTaskStep.mockReturnValue(null);
    handoffManager.create.mockReturnValue(null);

    const handoff = coordinator.handleApprovalRequest({
      taskId: 'task-1',
      stepId: 'step-1',
    });

    expect(handoff).toBeNull();
    expect(taskManager.pauseTaskForHandoff).not.toHaveBeenCalled();
  });

  it('marks human-blocked handoffs ready and transitions the task to resumable state', () => {
    const updated = createHandoff({
      status: 'ready_to_resume',
      actionLabel: 'Resume agent',
      body: 'Solve captcha\n\nHuman marked this task ready for the agent to resume.',
    });
    handoffManager.get.mockReturnValue(createHandoff());
    handoffManager.update.mockReturnValue(updated);

    const handoff = coordinator.markReady('handoff-1');

    expect(handoffManager.update).toHaveBeenCalledWith('handoff-1', expect.objectContaining({
      status: 'ready_to_resume',
      open: true,
      actionLabel: 'Resume agent',
    }));
    expect(taskManager.markTaskReadyToResume).toHaveBeenCalledWith('task-1', 'step-1', 'handoff-1');
    expect(handoff?.status).toBe('ready_to_resume');
  });

  it('returns null when markReady cannot update the handoff', () => {
    handoffManager.get.mockReturnValue(null);
    handoffManager.update.mockReturnValue(null);

    expect(coordinator.markReady('handoff-missing')).toBeNull();
    expect(taskManager.markTaskReadyToResume).not.toHaveBeenCalled();
  });

  it('resumes a linked task and resolves the handoff', () => {
    handoffManager.get.mockReturnValue(createHandoff({ status: 'ready_to_resume' }));
    taskManager.resumeTask.mockReturnValue({ id: 'task-1', status: 'running' });
    handoffManager.update.mockReturnValue(createHandoff({
      status: 'resolved',
      open: false,
      actionLabel: 'Agent resumed',
      resolvedAt: 3,
    }));

    const handoff = coordinator.resume('handoff-1');

    expect(taskManager.resumeTask).toHaveBeenCalledWith('task-1', 'step-1', 'handoff-1');
    expect(handoffManager.update).toHaveBeenCalledWith('handoff-1', expect.objectContaining({
      status: 'resolved',
      open: false,
      actionLabel: 'Agent resumed',
    }));
    expect(taskManager.clearStepHandoff).toHaveBeenCalledWith('task-1', 'step-1', 'handoff-1');
    expect(handoff?.status).toBe('resolved');
  });

  it('resolves non-task handoffs without trying to resume a task', () => {
    handoffManager.get.mockReturnValue(createHandoff({ taskId: null, stepId: null, body: '' }));
    handoffManager.update.mockReturnValue(createHandoff({
      taskId: null,
      stepId: null,
      status: 'resolved',
      open: false,
      actionLabel: 'Agent resumed',
      body: 'Agent resumed from this handoff.',
      resolvedAt: 3,
    }));

    const handoff = coordinator.resume('handoff-1');

    expect(taskManager.resumeTask).not.toHaveBeenCalled();
    expect(handoff?.status).toBe('resolved');
  });

  it('throws when a linked task handoff is not resumable', () => {
    handoffManager.get.mockReturnValue(createHandoff({ status: 'ready_to_resume' }));
    taskManager.resumeTask.mockReturnValue(null);

    expect(() => coordinator.resume('handoff-1')).toThrow('Task task-1 step step-1 is not resumable');
  });

  it('returns null when resume cannot find a handoff', () => {
    handoffManager.get.mockReturnValue(null);

    expect(coordinator.resume('handoff-missing')).toBeNull();
  });

  it('approves and rejects waiting handoffs through the linked task step', () => {
    const waiting = createHandoff({ status: 'waiting_approval', reason: 'approval_required' });
    handoffManager.get.mockReturnValue(waiting);
    taskManager.getStep.mockReturnValue({ task: { id: 'task-1' }, step: { id: 'step-1' }, stepIndex: 0 });
    handoffManager.get.mockReturnValueOnce(waiting).mockReturnValueOnce(waiting).mockReturnValueOnce(waiting).mockReturnValueOnce(waiting);

    coordinator.approve('handoff-1');
    coordinator.reject('handoff-1');

    expect(taskManager.respondToApproval).toHaveBeenNthCalledWith(1, 'task-1', 'step-1', true);
    expect(taskManager.respondToApproval).toHaveBeenNthCalledWith(2, 'task-1', 'step-1', false);
  });

  it('returns null when approve cannot find a handoff', () => {
    handoffManager.get.mockReturnValue(null);

    expect(coordinator.approve('handoff-missing')).toBeNull();
  });

  it('throws when approve/reject target is not linked to a task step', () => {
    handoffManager.get.mockReturnValue(createHandoff({ taskId: null, stepId: null }));

    expect(() => coordinator.approve('handoff-1')).toThrow('Cannot approve a handoff that is not linked to a task step');
    expect(() => coordinator.reject('handoff-1')).toThrow('Cannot reject a handoff that is not linked to a task step');
  });

  it('throws when approve/reject target task step is missing', () => {
    handoffManager.get.mockReturnValue(createHandoff());
    taskManager.getStep.mockReturnValue(null);

    expect(() => coordinator.approve('handoff-1')).toThrow('Linked task task-1 step step-1 was not found');
  });

  it('syncs resolved handoffs by clearing linked step metadata', () => {
    const handoff = createHandoff({ status: 'resolved', open: false });

    coordinator.syncHandoffState(handoff);

    expect(taskManager.clearStepHandoff).toHaveBeenCalledWith('task-1', 'step-1', 'handoff-1');
  });

  it('syncs completed-review handoffs', () => {
    const review = createHandoff({ id: 'handoff-review', status: 'completed_review' });
    handoffManager.get.mockReturnValue(review);

    expect(coordinator.syncHandoffState('handoff-review')).toEqual(review);
    expect(taskManager.linkStepHandoff).toHaveBeenCalledWith('task-1', 'step-1', 'handoff-review', 'review');
  });

  it('falls back to lookup by task/step when linked handoff id is stale', () => {
    const review = createHandoff({ id: 'handoff-review', status: 'completed_review' });
    taskManager.getStep.mockReturnValue({ task: { id: 'task-1' }, step: { id: 'step-1', handoffId: 'handoff-stale' }, stepIndex: 0 });
    handoffManager.get.mockReturnValue(null);
    handoffManager.findOpenByTaskStep.mockReturnValue(review);
    handoffManager.update.mockReturnValue(createHandoff({
      id: 'handoff-review',
      status: 'resolved',
      open: false,
      actionLabel: 'Approval rejected',
      resolvedAt: 3,
    }));

    const found = coordinator.handleApprovalResponse({ requestId: 'task-1:step-1', approved: false });
    expect(handoffManager.update).toHaveBeenCalledWith('handoff-review', expect.objectContaining({
      actionLabel: 'Approval rejected',
    }));
    expect(found?.id).toBe('handoff-review');
  });

  it('returns null for invalid approval-response payloads or missing handoffs', () => {
    expect(coordinator.handleApprovalResponse({ requestId: 'task-only', approved: true })).toBeNull();

    taskManager.getStep.mockReturnValue(null);
    handoffManager.findOpenByTaskStep.mockReturnValue(null);
    expect(coordinator.handleApprovalResponse({ requestId: 'task-1:step-1', approved: true })).toBeNull();
  });

  it('returns null when approval-response cannot update the handoff', () => {
    const waiting = createHandoff({ status: 'waiting_approval', reason: 'approval_required' });
    taskManager.getStep.mockReturnValue({ task: { id: 'task-1' }, step: { id: 'step-1', handoffId: 'handoff-1' }, stepIndex: 0 });
    handoffManager.get.mockReturnValueOnce(waiting).mockReturnValueOnce(null);
    handoffManager.update.mockReturnValue(null);

    expect(coordinator.handleApprovalResponse({ requestId: 'task-1:step-1', approved: true })).toBeNull();
  });

  it('returns null when syncing a missing handoff id and no-ops for non-task statuses', () => {
    handoffManager.get.mockReturnValue(null);
    expect(coordinator.syncHandoffState('missing')).toBeNull();

    const ready = createHandoff({ taskId: null, stepId: null, status: 'ready_to_resume' });
    expect(coordinator.syncHandoffState(ready)).toEqual(ready);

    const unknown = createHandoff({ status: 'resolved', taskId: 'task-1', stepId: 'step-1' });
    expect(coordinator.syncHandoffState(unknown)).toEqual(unknown);
  });
});
