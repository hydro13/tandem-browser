import { Request } from 'express';
import { BrowserWindow, webContents } from 'electron';
import { ManagerRegistry } from '../registry';

export type RouteContext = ManagerRegistry & { win: BrowserWindow };

/** Get active tab's WebContents, or null */
export async function getActiveWC(ctx: RouteContext): Promise<Electron.WebContents | null> {
  return ctx.tabManager.getActiveWebContents();
}

/** Run JS in the active tab's webview */
export async function execInActiveTab(ctx: RouteContext, code: string): Promise<any> {
  const wc = await getActiveWC(ctx);
  if (!wc) throw new Error('No active tab');
  return wc.executeJavaScript(code);
}

/** Resolve X-Session header to partition string */
export function getSessionPartition(ctx: RouteContext, req: Request): string {
  const sessionName = req.headers['x-session'] as string;
  if (!sessionName || sessionName === 'default') {
    return 'persist:tandem';
  }
  return ctx.sessionManager.resolvePartition(sessionName);
}

/** Get WebContents for a session (via X-Session header) */
export async function getSessionWC(ctx: RouteContext, req: Request): Promise<Electron.WebContents | null> {
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
export async function execInSessionTab(ctx: RouteContext, req: Request, code: string): Promise<any> {
  const wc = await getSessionWC(ctx, req);
  if (!wc) throw new Error('No active tab for this session');
  return wc.executeJavaScript(code);
}
