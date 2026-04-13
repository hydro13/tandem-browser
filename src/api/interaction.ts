import type { Request, Response } from 'express';
import { webContents } from 'electron';
import type { RouteContext, TabTargetSource } from './context';
import { resolveRequestedTab } from './context';
import type { Tab } from '../tabs/manager';

export interface EffectiveTabTarget {
  requestedTabId: string | null;
  tab: Tab | null;
  source: TabTargetSource | 'active';
  sessionName: string | null;
}

export interface InteractionScope {
  kind: 'tab';
  tabId: string | null;
  wcId: number | null;
  source: EffectiveTabTarget['source'] | 'ref';
  url: string | null;
  title: string | null;
  sessionName: string | null;
}

interface ResolveEffectiveTabTargetOptions {
  allowBody?: boolean;
  allowQuery?: boolean;
  allowSession?: boolean;
}

function getSessionName(req: Request): string | null {
  const rawValue = req.headers['x-session'];
  if (Array.isArray(rawValue)) {
    return rawValue[0]?.trim() || null;
  }
  return typeof rawValue === 'string' && rawValue.trim() ? rawValue.trim() : null;
}

export function sendRequestedTabNotFound(res: Response, tabId: string): void {
  res.status(404).json({ error: `Tab ${tabId} not found` });
}

export function resolveEffectiveTabTarget(
  ctx: RouteContext,
  req: Request,
  opts?: ResolveEffectiveTabTargetOptions,
): EffectiveTabTarget {
  const requestedTab = resolveRequestedTab(ctx, req, opts);
  if (requestedTab.requestedTabId) {
    return {
      requestedTabId: requestedTab.requestedTabId,
      tab: requestedTab.tab,
      source: requestedTab.source ?? 'header',
      sessionName: null,
    };
  }

  if (opts?.allowSession !== false) {
    const sessionName = getSessionName(req);
    if (sessionName && sessionName !== 'default') {
      const partition = ctx.sessionManager.resolvePartition(sessionName);
      const sessionTab = ctx.tabManager.listTabs().find(tab => tab.partition === partition) || null;
      return {
        requestedTabId: null,
        tab: sessionTab,
        source: 'session',
        sessionName,
      };
    }
  }

  return {
    requestedTabId: null,
    tab: ctx.tabManager.getActiveTab(),
    source: 'active',
    sessionName: null,
  };
}

export function buildInteractionScope(target: EffectiveTabTarget): InteractionScope {
  const wc = target.tab ? webContents.fromId(target.tab.webContentsId) : null;

  return {
    kind: 'tab',
    tabId: target.tab?.id ?? target.requestedTabId ?? null,
    wcId: target.tab?.webContentsId ?? null,
    source: target.source,
    url: target.tab?.url ?? wc?.getURL?.() ?? null,
    title: target.tab?.title ?? null,
    sessionName: target.sessionName,
  };
}
