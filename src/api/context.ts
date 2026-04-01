import type { Request } from 'express';
import type { BrowserWindow} from 'electron';
import { webContents } from 'electron';
import type { ManagerRegistry } from '../registry';
import type { Tab } from '../tabs/manager';
import { DEFAULT_PARTITION } from '../utils/constants';

export type RouteContext = ManagerRegistry & { win: BrowserWindow };
export type TabTargetSource = 'header' | 'body' | 'query' | 'session' | 'active';

export interface RequestedTabResolution {
  requestedTabId: string | null;
  tab: Tab | null;
  source: TabTargetSource | null;
}

interface ResolveRequestedTabOptions {
  allowBody?: boolean;
  allowQuery?: boolean;
}

function getSingleHeaderValue(req: Request, headerName: string): string | null {
  const rawValue = req.headers[headerName];
  if (Array.isArray(rawValue)) {
    return rawValue[0]?.trim() || null;
  }
  return typeof rawValue === 'string' && rawValue.trim() ? rawValue.trim() : null;
}

function getSingleBodyValue(req: Request, key: string): string | null {
  const rawBody = req.body as Record<string, unknown> | undefined;
  const rawValue = rawBody?.[key];
  return typeof rawValue === 'string' && rawValue.trim() ? rawValue.trim() : null;
}

function getSingleQueryValue(req: Request, key: string): string | null {
  const rawValue = req.query[key];
  if (Array.isArray(rawValue)) {
    const first = rawValue[0];
    return typeof first === 'string' && first.trim() ? first.trim() : null;
  }
  return typeof rawValue === 'string' && rawValue.trim() ? rawValue.trim() : null;
}

/** Get active tab's WebContents, or null */
export async function getActiveWC(ctx: RouteContext): Promise<Electron.WebContents | null> {
  return ctx.tabManager.getActiveWebContents();
}

/** Run JS in the active tab's webview */
export async function execInActiveTab<T = unknown>(ctx: RouteContext, code: string): Promise<T> {
  const wc = await getActiveWC(ctx);
  if (!wc) throw new Error('No active tab');
  return wc.executeJavaScript(code) as Promise<T>;
}

/** Resolve X-Session header to partition string */
export function getSessionPartition(ctx: RouteContext, req: Request): string {
  const sessionName = getSingleHeaderValue(req, 'x-session');
  if (!sessionName || sessionName === 'default') {
    return DEFAULT_PARTITION;
  }
  return ctx.sessionManager.resolvePartition(sessionName);
}

/** Resolve the tab explicitly requested by header/body/query, if any. */
export function resolveRequestedTab(
  ctx: RouteContext,
  req: Request,
  opts?: ResolveRequestedTabOptions,
): RequestedTabResolution {
  const headerTabId = getSingleHeaderValue(req, 'x-tab-id');
  if (headerTabId) {
    return {
      requestedTabId: headerTabId,
      tab: ctx.tabManager.listTabs().find(t => t.id === headerTabId) || null,
      source: 'header',
    };
  }

  if (opts?.allowBody) {
    const bodyTabId = getSingleBodyValue(req, 'tabId');
    if (bodyTabId) {
      return {
        requestedTabId: bodyTabId,
        tab: ctx.tabManager.listTabs().find(t => t.id === bodyTabId) || null,
        source: 'body',
      };
    }
  }

  if (opts?.allowQuery) {
    const queryTabId = getSingleQueryValue(req, 'tabId');
    if (queryTabId) {
      return {
        requestedTabId: queryTabId,
        tab: ctx.tabManager.listTabs().find(t => t.id === queryTabId) || null,
        source: 'query',
      };
    }
  }

  return { requestedTabId: null, tab: null, source: null };
}

/** Get WebContents for a session (via X-Tab-Id or X-Session header) */
export async function getSessionWC(ctx: RouteContext, req: Request): Promise<Electron.WebContents | null> {
  const requestedTab = resolveRequestedTab(ctx, req);
  if (requestedTab.requestedTabId) {
    if (!requestedTab.tab) return null;
    return webContents.fromId(requestedTab.tab.webContentsId) || null;
  }

  const sessionName = getSingleHeaderValue(req, 'x-session');
  if (!sessionName || sessionName === 'default') {
    return getActiveWC(ctx);
  }
  const partition = getSessionPartition(ctx, req);
  const tabs = ctx.tabManager.listTabs().filter(t => t.partition === partition);
  if (tabs.length === 0) return null;
  return webContents.fromId(tabs[0].webContentsId) || null;
}

/** Run JS in a session's tab (via X-Session header) */
export async function execInSessionTab<T = unknown>(ctx: RouteContext, req: Request, code: string): Promise<T> {
  const wc = await getSessionWC(ctx, req);
  if (!wc) throw new Error('No active tab for this session');
  return wc.executeJavaScript(code) as Promise<T>;
}
