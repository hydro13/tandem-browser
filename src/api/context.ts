import type { Request } from 'express';
import type { BrowserWindow} from 'electron';
import { webContents } from 'electron';
import type { ManagerRegistry } from '../registry';
import { DEFAULT_PARTITION } from '../utils/constants';

export type RouteContext = ManagerRegistry & { win: BrowserWindow };

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
  const sessionName = req.headers['x-session'] as string;
  if (!sessionName || sessionName === 'default') {
    return DEFAULT_PARTITION;
  }
  return ctx.sessionManager.resolvePartition(sessionName);
}

/** Get WebContents for a session (via X-Tab-Id or X-Session header) */
export async function getSessionWC(ctx: RouteContext, req: Request): Promise<Electron.WebContents | null> {
  // X-Tab-Id takes priority — allows reading background tabs without focusing them
  const tabId = req.headers['x-tab-id'] as string;
  if (tabId) {
    const tab = ctx.tabManager.listTabs().find(t => t.id === tabId);
    if (!tab) return null;
    return webContents.fromId(tab.webContentsId) || null;
  }

  const sessionName = req.headers['x-session'] as string;
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
