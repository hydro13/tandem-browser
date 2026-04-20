import type { Router, Request, Response } from 'express';
import type { RouteContext} from '../context';
import { getSessionWC, agentIdFromRequest } from '../context';
import { handleRouteError } from '../../utils/errors';
import { DEFAULT_TIMEOUT_MS } from '../../utils/constants';
import type { TaskStatus } from '../../agents/task-manager';
import { domainKeyFromUrl } from '../../security/agent-trust';

/**
 * Register agent task management, tab-lock, workflow, and watch routes.
 * @param router - Express router to attach routes to
 * @param ctx - shared manager registry and main BrowserWindow
 */
export function registerAgentRoutes(router: Router, ctx: RouteContext): void {
  // ═══════════════════════════════════════════════
  // TASKS — Agent task management (Phase 5)
  // ═══════════════════════════════════════════════

  router.get('/tasks', (req: Request, res: Response) => {
    try {
      const status = req.query.status as string | undefined;
      const tasks = ctx.taskManager.listTasks(status as TaskStatus | undefined);
      res.json(tasks);
    } catch (e) {
      handleRouteError(res, e);
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
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  router.post('/tasks/:id/approve', (req: Request, res: Response) => {
    try {
      const taskId = req.params.id as string;
      const { stepId } = req.body;
      ctx.taskManager.respondToApproval(taskId, stepId, true);
      res.json({ ok: true, approved: true });
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  router.post('/tasks/:id/reject', (req: Request, res: Response) => {
    try {
      const taskId = req.params.id as string;
      const { stepId } = req.body;
      ctx.taskManager.respondToApproval(taskId, stepId, false);
      res.json({ ok: true, approved: false });
    } catch (e) {
      handleRouteError(res, e);
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
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  router.post('/emergency-stop', (_req: Request, res: Response) => {
    try {
      const result = ctx.taskManager.emergencyStop();
      if (ctx.panelManager) {
        ctx.panelManager.addChatMessage('wingman', `🛑 Emergency stop! ${result.stopped} tasks stopped.`);
      }
      res.json(result);
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  // POST /execute-js/confirm — Execute JS with user approval gate (used by MCP)
  router.post('/execute-js/confirm', async (req: Request, res: Response) => {
    try {
      const { code } = req.body;
      if (!code || typeof code !== 'string') {
        res.status(400).json({ error: 'code is required' });
        return;
      }

      const preview = code.length > 120 ? code.substring(0, 120) + '...' : code;

      // Agent-trust precheck: if this (agent, domain) pair is already
      // covered by a T2 window, T3 trusted-domain entry, or T4 global
      // window, skip the modal and execute directly. This lets legitimate
      // iterative agent work proceed without per-call friction while
      // keeping full per-call approval as the default.
      //
      // The domain used for the check is the URL of the target tab at
      // the moment of the call. Cross-domain navigation invalidates T2
      // windows naturally (different key), which is intentional. Any
      // error in the precheck is swallowed — the call falls through to
      // the normal approval modal, which is the safe default.
      let isTrusted = false;
      try {
        const agentId = agentIdFromRequest(req);
        const preTargetWC = await getSessionWC(ctx, req);
        const targetUrl = preTargetWC && !preTargetWC.isDestroyed() && typeof preTargetWC.getURL === 'function'
          ? preTargetWC.getURL()
          : '';
        const domain = domainKeyFromUrl(targetUrl);
        if (domain && ctx.agentTrust.isApproved(agentId, domain)) {
          isTrusted = true;
        }
      } catch {
        // precheck is best-effort; fall through to approval
      }

      if (!isTrusted) {
        // Create a task with a single step that requires approval
        const task = ctx.taskManager.createTask(
          `Execute JavaScript: ${preview}`,
          'claude',
          'claude',
          [{
            description: `Execute JS in active tab: ${preview}`,
            action: { type: 'execute_js', params: { code } },
            riskLevel: 'high',
            requiresApproval: true,
          }]
        );

        // Request approval — resolves when user clicks approve/reject
        const approved = await Promise.race([
          ctx.taskManager.requestApproval(task, 0),
          new Promise<boolean>((resolve) => setTimeout(() => resolve(false), DEFAULT_TIMEOUT_MS)),
        ]);

        if (!approved) {
          res.status(403).json({ error: 'User rejected JS execution', rejected: true });
          return;
        }
      }

      // User approved (or trust tier covered this) — execute the code.
      // Use getSessionWC so the route honors X-Tab-Id / X-Session headers
      // like other tab-aware routes. Falls back to active tab when no
      // targeting header is present, preserving prior behavior.
      const wc = await getSessionWC(ctx, req);
      if (!wc) {
        res.status(400).json({ error: 'No active tab' });
        return;
      }
      const result = await wc.executeJavaScript(code);
      res.json({ ok: true, result });
    } catch (e) {
      handleRouteError(res, e);
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
    } catch (e) {
      handleRouteError(res, e);
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
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  // ═══════════════════════════════════════════════
  // ACTIVITY LOG — Agent activity
  // ═══════════════════════════════════════════════

  router.get('/activity-log/agent', (req: Request, res: Response) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      res.json(ctx.taskManager.getActivityLog(limit));
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  // ═══════════════════════════════════════════════
  // TAB LOCKS — Multi-AI tab conflict prevention (Phase 5)
  // ═══════════════════════════════════════════════

  router.get('/tab-locks', (_req: Request, res: Response) => {
    try {
      res.json({ locks: ctx.tabLockManager.getAllLocks() });
    } catch (e) {
      handleRouteError(res, e);
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
    } catch (e) {
      handleRouteError(res, e);
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
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  router.get('/tab-locks/:tabId', (req: Request, res: Response) => {
    try {
      const tabId = req.params.tabId as string;
      const owner = ctx.tabLockManager.getOwner(tabId);
      res.json({ tabId, locked: owner !== null, owner });
    } catch (e) {
      handleRouteError(res, e);
    }
  });
}
