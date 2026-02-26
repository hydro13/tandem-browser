import { Router, Request, Response } from 'express';
import { RouteContext } from '../context';

export function registerAgentRoutes(router: Router, ctx: RouteContext): void {
  // ═══════════════════════════════════════════════
  // TASKS — Agent task management (Fase 5)
  // ═══════════════════════════════════════════════

  router.get('/tasks', (req: Request, res: Response) => {
    try {
      const status = req.query.status as string | undefined;
      const tasks = ctx.taskManager.listTasks(status as any);
      res.json(tasks);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.get('/tasks/:id', (req: Request, res: Response) => {
    const taskId = req.params.id as string;
    const task = ctx.taskManager.getTask(taskId);
    if (!task) return res.status(404).json({ error: 'Task not found' });
    res.json(task);
  });

  router.post('/tasks', (req: Request, res: Response) => {
    try {
      const { description, createdBy, assignedTo, steps } = req.body;
      if (!description || !steps) {
        return res.status(400).json({ error: 'description and steps required' });
      }
      const task = ctx.taskManager.createTask(
        description,
        createdBy || 'claude',
        assignedTo || 'claude',
        steps
      );
      res.json(task);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post('/tasks/:id/approve', (req: Request, res: Response) => {
    try {
      const taskId = req.params.id as string;
      const { stepId } = req.body;
      ctx.taskManager.respondToApproval(taskId, stepId, true);
      res.json({ ok: true, approved: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post('/tasks/:id/reject', (req: Request, res: Response) => {
    try {
      const taskId = req.params.id as string;
      const { stepId } = req.body;
      ctx.taskManager.respondToApproval(taskId, stepId, false);
      res.json({ ok: true, approved: false });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post('/tasks/:id/status', (req: Request, res: Response) => {
    try {
      const taskId = req.params.id as string;
      const { status, stepIndex, stepStatus, result } = req.body;
      if (status === 'running') ctx.taskManager.markTaskRunning(taskId);
      else if (status === 'done') ctx.taskManager.markTaskDone(taskId, result);
      else if (status === 'failed') ctx.taskManager.markTaskFailed(taskId, result || 'Unknown error');
      if (stepIndex !== undefined && stepStatus) {
        ctx.taskManager.updateStepStatus(taskId, stepIndex, stepStatus, result);
      }
      const task = ctx.taskManager.getTask(taskId);
      res.json(task || { error: 'Task not found' });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post('/emergency-stop', (_req: Request, res: Response) => {
    try {
      const result = ctx.taskManager.emergencyStop();
      if (ctx.panelManager) {
        ctx.panelManager.addChatMessage('copilot', `🛑 Emergency stop! ${result.stopped} tasks stopped.`);
      }
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.get('/tasks/check-approval', (req: Request, res: Response) => {
    try {
      const { actionType, targetUrl } = req.query;
      const needs = ctx.taskManager.needsApproval(
        actionType as string || '',
        targetUrl as string
      );
      res.json({ needsApproval: needs });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ═══════════════════════════════════════════════
  // AUTONOMY — Agent autonomy settings
  // ═══════════════════════════════════════════════

  router.get('/autonomy', (_req: Request, res: Response) => {
    res.json(ctx.taskManager.getAutonomySettings());
  });

  router.patch('/autonomy', (req: Request, res: Response) => {
    try {
      const updated = ctx.taskManager.updateAutonomySettings(req.body);
      res.json(updated);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ═══════════════════════════════════════════════
  // ACTIVITY LOG — Agent activity
  // ═══════════════════════════════════════════════

  router.get('/activity-log/agent', (req: Request, res: Response) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      res.json(ctx.taskManager.getActivityLog(limit));
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ═══════════════════════════════════════════════
  // TAB LOCKS — Multi-AI tab conflict prevention (Fase 5)
  // ═══════════════════════════════════════════════

  router.get('/tab-locks', (_req: Request, res: Response) => {
    try {
      res.json({ locks: ctx.tabLockManager.getAllLocks() });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post('/tab-locks/acquire', (req: Request, res: Response) => {
    try {
      const { tabId, agentId } = req.body;
      if (!tabId || !agentId) {
        return res.status(400).json({ error: 'tabId and agentId required' });
      }
      const result = ctx.tabLockManager.acquire(tabId, agentId);
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post('/tab-locks/release', (req: Request, res: Response) => {
    try {
      const { tabId, agentId } = req.body;
      if (!tabId || !agentId) {
        return res.status(400).json({ error: 'tabId and agentId required' });
      }
      const released = ctx.tabLockManager.release(tabId, agentId);
      res.json({ ok: released });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.get('/tab-locks/:tabId', (req: Request, res: Response) => {
    try {
      const tabId = req.params.tabId as string;
      const owner = ctx.tabLockManager.getOwner(tabId);
      res.json({ tabId, locked: owner !== null, owner });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });
}
