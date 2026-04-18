import type { Handoff, HandoffManager } from '../handoffs/manager';
import type { TaskManager } from './task-manager';
import { wingmanAlert } from '../notifications/alert';

function appendHandoffNote(body: string, note: string): string {
  const trimmedBody = body.trim();
  return trimmedBody ? `${trimmedBody}\n\n${note}` : note;
}

/**
 * Keeps task execution state and durable human↔agent handoffs in sync.
 */
export class TaskHandoffCoordinator {
  constructor(
    private readonly taskManager: TaskManager,
    private readonly handoffManager: HandoffManager,
  ) {}

  handleApprovalRequest(data: Record<string, unknown>): Handoff | null {
    const taskId = typeof data.taskId === 'string' ? data.taskId : null;
    const stepId = typeof data.stepId === 'string' ? data.stepId : null;
    const task = taskId ? this.taskManager.getTask(taskId) : null;
    const action = data.action && typeof data.action === 'object'
      ? data.action as { params?: Record<string, unknown> }
      : null;
    const params = action?.params ?? {};

    const existing = taskId && stepId
      ? this.handoffManager.findOpenByTaskStep(taskId, stepId)
      : null;

    const payload = {
      status: 'waiting_approval' as const,
      title: 'Approval needed',
      body: typeof data.description === 'string' ? data.description : 'Agent action requires review.',
      reason: 'approval_required',
      actionLabel: 'Approve or reject this action',
      source: task?.createdBy ?? 'wingman',
      agentId: task?.assignedTo ?? null,
      taskId,
      stepId,
      workspaceId: typeof params.workspaceId === 'string' ? params.workspaceId : null,
      tabId: typeof params.tabId === 'string' ? params.tabId : null,
    };

    const isNew = !existing;
    const handoff = existing
      ? this.handoffManager.update(existing.id, payload)
      : this.handoffManager.create(payload);

    if (!handoff) {
      return null;
    }

    // Fire a native-OS notification (which plays the system sound on
    // macOS) so the user hears the agent stalling for input, even if
    // they're in a different workspace or away from the keyboard. Only
    // on the first creation — repeated emits for the same step (e.g.,
    // a retry) shouldn't spam.
    if (isNew) {
      wingmanAlert(handoff.title, handoff.body || handoff.reason);
    }

    this.syncHandoffState(handoff);
    return handoff;
  }

  handleApprovalResponse(data: { requestId: string; approved: boolean }): Handoff | null {
    const [taskId, stepId] = data.requestId.split(':');
    if (!taskId || !stepId) {
      return null;
    }

    const handoff = this.findLinkedHandoff(taskId, stepId);
    if (!handoff) {
      return null;
    }

    const updated = this.handoffManager.update(handoff.id, {
      status: 'resolved',
      open: false,
      actionLabel: data.approved ? 'Approval granted' : 'Approval rejected',
      body: appendHandoffNote(
        handoff.body,
        data.approved ? 'Approval granted.' : 'Approval rejected.',
      ),
    });

    if (!updated) {
      return null;
    }

    this.syncHandoffState(updated);
    return updated;
  }

  syncHandoffState(handoffOrId: string | Handoff): Handoff | null {
    const handoff = typeof handoffOrId === 'string'
      ? this.handoffManager.get(handoffOrId)
      : handoffOrId;
    if (!handoff) {
      return null;
    }
    if (!handoff.taskId || !handoff.stepId) {
      return handoff;
    }

    switch (handoff.status) {
      case 'waiting_approval':
        this.taskManager.pauseTaskForHandoff(handoff.taskId, handoff.stepId, handoff.id, 'approval');
        break;
      case 'needs_human':
      case 'blocked':
        this.taskManager.pauseTaskForHandoff(handoff.taskId, handoff.stepId, handoff.id, 'human');
        break;
      case 'completed_review':
        this.taskManager.linkStepHandoff(handoff.taskId, handoff.stepId, handoff.id, 'review');
        break;
      case 'ready_to_resume':
        this.taskManager.markTaskReadyToResume(handoff.taskId, handoff.stepId, handoff.id);
        break;
      case 'resolved':
        this.taskManager.clearStepHandoff(handoff.taskId, handoff.stepId, handoff.id);
        break;
      default:
        break;
    }

    return handoff;
  }

  markReady(handoffId: string): Handoff | null {
    const handoff = this.handoffManager.update(handoffId, {
      status: 'ready_to_resume',
      open: true,
      actionLabel: 'Resume agent',
      body: appendHandoffNote(
        this.requireHandoff(handoffId)?.body ?? '',
        'Human marked this task ready for the agent to resume.',
      ),
    });
    if (!handoff) {
      return null;
    }
    this.syncHandoffState(handoff);
    return handoff;
  }

  resume(handoffId: string): Handoff | null {
    const handoff = this.requireHandoff(handoffId);
    if (!handoff) {
      return null;
    }

    if (handoff.taskId && handoff.stepId) {
      const resumed = this.taskManager.resumeTask(handoff.taskId, handoff.stepId, handoff.id);
      if (!resumed) {
        throw new Error(`Task ${handoff.taskId} step ${handoff.stepId} is not resumable`);
      }
    }

    const resolved = this.handoffManager.update(handoff.id, {
      status: 'resolved',
      open: false,
      actionLabel: 'Agent resumed',
      body: appendHandoffNote(handoff.body, 'Agent resumed from this handoff.'),
    });
    if (!resolved) {
      return null;
    }

    this.syncHandoffState(resolved);
    return resolved;
  }

  approve(handoffId: string): Handoff | null {
    const handoff = this.requireHandoff(handoffId);
    if (!handoff) {
      return null;
    }

    if (!handoff.taskId || !handoff.stepId) {
      return this.resolveStandaloneApproval(handoff, true);
    }

    this.requireTaskLinkedHandoff(handoffId, 'approve');

    this.taskManager.respondToApproval(handoff.taskId as string, handoff.stepId as string, true);
    return this.handoffManager.get(handoffId);
  }

  reject(handoffId: string): Handoff | null {
    const handoff = this.requireHandoff(handoffId);
    if (!handoff) {
      return null;
    }

    if (!handoff.taskId || !handoff.stepId) {
      return this.resolveStandaloneApproval(handoff, false);
    }

    this.requireTaskLinkedHandoff(handoffId, 'reject');

    this.taskManager.respondToApproval(handoff.taskId as string, handoff.stepId as string, false);
    return this.handoffManager.get(handoffId);
  }

  private findLinkedHandoff(taskId: string, stepId: string): Handoff | null {
    const taskContext = this.taskManager.getStep(taskId, stepId);
    const handoffId = taskContext?.step.handoffId;
    if (handoffId) {
      const linked = this.handoffManager.get(handoffId);
      if (linked) {
        return linked;
      }
    }
    return this.handoffManager.findOpenByTaskStep(taskId, stepId);
  }

  private requireHandoff(handoffId: string): Handoff | null {
    return this.handoffManager.get(handoffId);
  }

  private resolveStandaloneApproval(handoff: Handoff, approved: boolean): Handoff | null {
    const updated = this.handoffManager.update(handoff.id, {
      status: 'resolved',
      open: false,
      actionLabel: approved ? 'Approved' : 'Rejected',
      body: appendHandoffNote(
        handoff.body,
        approved ? 'Human approved this handoff.' : 'Human rejected this handoff.',
      ),
    });
    if (!updated) {
      return null;
    }
    this.syncHandoffState(updated);
    return updated;
  }

  private requireTaskLinkedHandoff(handoffId: string, verb: string): Handoff | null {
    const handoff = this.requireHandoff(handoffId);
    if (!handoff) {
      return null;
    }
    if (!handoff.taskId || !handoff.stepId) {
      throw new Error(`Cannot ${verb} a handoff that is not linked to a task step`);
    }
    if (!this.taskManager.getStep(handoff.taskId, handoff.stepId)) {
      throw new Error(`Linked task ${handoff.taskId} step ${handoff.stepId} was not found`);
    }
    return handoff;
  }
}
