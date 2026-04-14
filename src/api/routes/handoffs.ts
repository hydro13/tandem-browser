import type { Request, Response, Router } from 'express';
import type { RouteContext } from '../context';
import type { Handoff, HandoffStatus, UpdateHandoffInput } from '../../handoffs/manager';
import { HANDOFF_STATUSES } from '../../handoffs/manager';
import { wingmanAlert } from '../../notifications/alert';
import { handleRouteError } from '../../utils/errors';

interface SerializedHandoff extends Handoff {
  actionable: boolean;
  workspaceName: string | null;
  tabTitle: string | null;
  tabUrl: string | null;
}

function isHandoffStatus(value: unknown): value is HandoffStatus {
  return typeof value === 'string' && HANDOFF_STATUSES.includes(value as HandoffStatus);
}

function getOptionalString(value: unknown): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  if (typeof value !== 'string') {
    throw new Error('expected string');
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isOptionalStringInput(value: unknown): boolean {
  return value === undefined || value === null || typeof value === 'string';
}

function serializeHandoff(ctx: RouteContext, handoff: Handoff): SerializedHandoff {
  const workspace = handoff.workspaceId ? ctx.workspaceManager.get(handoff.workspaceId) : undefined;
  const tab = handoff.tabId
    ? ctx.tabManager.listTabs().find(candidate => candidate.id === handoff.tabId) ?? null
    : null;

  return {
    ...handoff,
    actionable: handoff.open,
    workspaceName: workspace?.name ?? null,
    tabTitle: tab?.title ?? null,
    tabUrl: tab?.url ?? null,
  };
}

function resolveTargetContext(ctx: RouteContext, workspaceId: string | null | undefined, tabId: string | null | undefined): { workspaceId: string | null; tabId: string | null } {
  const normalizedWorkspaceId = workspaceId ?? null;
  const normalizedTabId = tabId ?? null;
  let resolvedWorkspaceId = normalizedWorkspaceId;

  if (normalizedWorkspaceId) {
    const workspace = ctx.workspaceManager.get(normalizedWorkspaceId);
    if (!workspace) {
      throw new Error(`Workspace ${normalizedWorkspaceId} not found`);
    }
  }

  if (normalizedTabId) {
    const tab = ctx.tabManager.listTabs().find(candidate => candidate.id === normalizedTabId);
    if (!tab) {
      throw new Error(`Tab ${normalizedTabId} not found`);
    }
    const tabWorkspaceId = ctx.workspaceManager.getWorkspaceIdForTab(tab.webContentsId);
    if (resolvedWorkspaceId && tabWorkspaceId && resolvedWorkspaceId !== tabWorkspaceId) {
      throw new Error(`Tab ${normalizedTabId} does not belong to workspace ${resolvedWorkspaceId}`);
    }
    resolvedWorkspaceId = resolvedWorkspaceId ?? tabWorkspaceId ?? null;
  }

  return {
    workspaceId: resolvedWorkspaceId,
    tabId: normalizedTabId,
  };
}

export function registerHandoffRoutes(router: Router, ctx: RouteContext): void {
  router.get('/handoffs', (req: Request, res: Response) => {
    try {
      const openOnly = req.query.openOnly === 'true' || req.query.openOnly === '1';
      const status = req.query.status;
      if (status !== undefined && !isHandoffStatus(status)) {
        res.status(400).json({ error: `status must be one of: ${HANDOFF_STATUSES.join(', ')}` });
        return;
      }

      const workspaceId = typeof req.query.workspaceId === 'string' ? req.query.workspaceId : undefined;
      const tabId = typeof req.query.tabId === 'string' ? req.query.tabId : undefined;
      const taskId = typeof req.query.taskId === 'string' ? req.query.taskId : undefined;
      const stepId = typeof req.query.stepId === 'string' ? req.query.stepId : undefined;

      const handoffs = ctx.handoffManager.list({
        openOnly,
        status,
        workspaceId,
        tabId,
        taskId,
        stepId,
      }).map(handoff => serializeHandoff(ctx, handoff));

      res.json({ handoffs });
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  router.get('/handoffs/:id', (req: Request, res: Response) => {
    try {
      const handoffId = req.params.id as string;
      const handoff = ctx.handoffManager.get(handoffId);
      if (!handoff) {
        res.status(404).json({ error: 'Handoff not found' });
        return;
      }
      res.json(serializeHandoff(ctx, handoff));
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  router.post('/handoffs', (req: Request, res: Response) => {
    try {
      const {
        status,
        title,
        body,
        reason,
        workspaceId,
        tabId,
        agentId,
        source,
        actionLabel,
        taskId,
        stepId,
        open,
        notify,
      } = req.body as Record<string, unknown>;

      if (!isHandoffStatus(status)) {
        res.status(400).json({ error: `status must be one of: ${HANDOFF_STATUSES.join(', ')}` });
        return;
      }
      if (typeof title !== 'string' || title.trim().length === 0) {
        res.status(400).json({ error: 'title is required' });
        return;
      }
      if (body !== undefined && typeof body !== 'string') {
        res.status(400).json({ error: 'body must be a string' });
        return;
      }
      if (reason !== undefined && typeof reason !== 'string') {
        res.status(400).json({ error: 'reason must be a string' });
        return;
      }
      for (const [field, value] of Object.entries({ workspaceId, tabId, agentId, source, actionLabel, taskId, stepId })) {
        if (!isOptionalStringInput(value)) {
          res.status(400).json({ error: `${field} must be a string when provided` });
          return;
        }
      }

      const target = resolveTargetContext(
        ctx,
        getOptionalString(workspaceId),
        getOptionalString(tabId),
      );

      const handoff = ctx.handoffManager.create({
        status,
        title,
        body: typeof body === 'string' ? body : undefined,
        reason: typeof reason === 'string' ? reason : undefined,
        workspaceId: target.workspaceId,
        tabId: target.tabId,
        agentId: getOptionalString(agentId),
        source: getOptionalString(source),
        actionLabel: getOptionalString(actionLabel),
        taskId: getOptionalString(taskId),
        stepId: getOptionalString(stepId),
        open: typeof open === 'boolean' ? open : undefined,
      });

      if (notify === true) {
        wingmanAlert(handoff.title, handoff.body || handoff.reason);
      }

      ctx.taskHandoffCoordinator.syncHandoffState(handoff);

      res.json(serializeHandoff(ctx, handoff));
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  router.patch('/handoffs/:id', (req: Request, res: Response) => {
    try {
      const patchSource = req.body as Record<string, unknown>;
      const patch: UpdateHandoffInput = {};

      if (patchSource.status !== undefined) {
        if (!isHandoffStatus(patchSource.status)) {
          res.status(400).json({ error: `status must be one of: ${HANDOFF_STATUSES.join(', ')}` });
          return;
        }
        patch.status = patchSource.status;
      }

      if (patchSource.title !== undefined) {
        if (typeof patchSource.title !== 'string' || patchSource.title.trim().length === 0) {
          res.status(400).json({ error: 'title must be a non-empty string' });
          return;
        }
        patch.title = patchSource.title;
      }

      if (patchSource.body !== undefined) {
        if (typeof patchSource.body !== 'string') {
          res.status(400).json({ error: 'body must be a string' });
          return;
        }
        patch.body = patchSource.body;
      }

      if (patchSource.reason !== undefined) {
        if (typeof patchSource.reason !== 'string') {
          res.status(400).json({ error: 'reason must be a string' });
          return;
        }
        patch.reason = patchSource.reason;
      }
      for (const field of ['workspaceId', 'tabId', 'agentId', 'source', 'actionLabel', 'taskId', 'stepId'] as const) {
        if (!isOptionalStringInput(patchSource[field])) {
          res.status(400).json({ error: `${field} must be a string when provided` });
          return;
        }
      }

      if (patchSource.open !== undefined) {
        if (typeof patchSource.open !== 'boolean') {
          res.status(400).json({ error: 'open must be a boolean' });
          return;
        }
        patch.open = patchSource.open;
      }

      const target = resolveTargetContext(
        ctx,
        getOptionalString(patchSource.workspaceId),
        getOptionalString(patchSource.tabId),
      );

      if (patchSource.workspaceId !== undefined) {
        patch.workspaceId = target.workspaceId;
      }
      if (patchSource.tabId !== undefined) {
        patch.tabId = target.tabId;
      }
      if (patchSource.agentId !== undefined) {
        patch.agentId = getOptionalString(patchSource.agentId);
      }
      if (patchSource.source !== undefined) {
        patch.source = getOptionalString(patchSource.source);
      }
      if (patchSource.actionLabel !== undefined) {
        patch.actionLabel = getOptionalString(patchSource.actionLabel);
      }
      if (patchSource.taskId !== undefined) {
        patch.taskId = getOptionalString(patchSource.taskId);
      }
      if (patchSource.stepId !== undefined) {
        patch.stepId = getOptionalString(patchSource.stepId);
      }

      const handoffId = req.params.id as string;
      const handoff = ctx.handoffManager.update(handoffId, patch);
      if (!handoff) {
        res.status(404).json({ error: 'Handoff not found' });
        return;
      }

      ctx.taskHandoffCoordinator.syncHandoffState(handoff);
      res.json(serializeHandoff(ctx, handoff));
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  router.post('/handoffs/:id/resolve', (req: Request, res: Response) => {
    try {
      const handoffId = req.params.id as string;
      const handoff = ctx.handoffManager.resolve(handoffId);
      if (!handoff) {
        res.status(404).json({ error: 'Handoff not found' });
        return;
      }
      ctx.taskHandoffCoordinator.syncHandoffState(handoff);
      res.json(serializeHandoff(ctx, handoff));
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  router.post('/handoffs/:id/ready', (req: Request, res: Response) => {
    try {
      const handoffId = req.params.id as string;
      const handoff = ctx.taskHandoffCoordinator.markReady(handoffId);
      if (!handoff) {
        res.status(404).json({ error: 'Handoff not found' });
        return;
      }
      res.json(serializeHandoff(ctx, handoff));
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  router.post('/handoffs/:id/resume', (req: Request, res: Response) => {
    try {
      const handoffId = req.params.id as string;
      const handoff = ctx.taskHandoffCoordinator.resume(handoffId);
      if (!handoff) {
        res.status(404).json({ error: 'Handoff not found' });
        return;
      }
      res.json(serializeHandoff(ctx, handoff));
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  router.post('/handoffs/:id/approve', (req: Request, res: Response) => {
    try {
      const handoffId = req.params.id as string;
      const handoff = ctx.taskHandoffCoordinator.approve(handoffId);
      if (!handoff) {
        res.status(404).json({ error: 'Handoff not found' });
        return;
      }
      res.json(serializeHandoff(ctx, handoff));
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  router.post('/handoffs/:id/reject', (req: Request, res: Response) => {
    try {
      const handoffId = req.params.id as string;
      const handoff = ctx.taskHandoffCoordinator.reject(handoffId);
      if (!handoff) {
        res.status(404).json({ error: 'Handoff not found' });
        return;
      }
      res.json(serializeHandoff(ctx, handoff));
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  router.post('/handoffs/:id/activate', async (req: Request, res: Response) => {
    try {
      const handoffId = req.params.id as string;
      const handoff = ctx.handoffManager.get(handoffId);
      if (!handoff) {
        res.status(404).json({ error: 'Handoff not found' });
        return;
      }

      const tabs = ctx.tabManager.listTabs();
      let focusedTabId: string | null = null;

      if (handoff.workspaceId) {
        const workspace = ctx.workspaceManager.get(handoff.workspaceId);
        if (workspace) {
          ctx.workspaceManager.switch(workspace.id);
        }
      }

      if (handoff.tabId) {
        const tab = tabs.find(candidate => candidate.id === handoff.tabId);
        if (tab) {
          await ctx.tabManager.focusTab(tab.id);
          focusedTabId = tab.id;
        }
      } else if (handoff.workspaceId) {
        const workspace = ctx.workspaceManager.get(handoff.workspaceId);
        const targetTab = workspace?.tabIds
          .map(webContentsId => tabs.find(tab => tab.webContentsId === webContentsId) ?? null)
          .find((tab): tab is NonNullable<typeof tab> => Boolean(tab));
        if (targetTab) {
          await ctx.tabManager.focusTab(targetTab.id);
          focusedTabId = targetTab.id;
        }
      }

      res.json({
        ok: true,
        handoff: serializeHandoff(ctx, handoff),
        activeWorkspaceId: ctx.workspaceManager.getActiveId(),
        focusedTabId,
      });
    } catch (e) {
      handleRouteError(res, e);
    }
  });
}
