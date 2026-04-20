import type { Request } from 'express';
import type { BrowserWindow} from 'electron';
import { webContents } from 'electron';
import type { ManagerRegistry } from '../registry';
import type { Tab } from '../tabs/manager';
import { DEFAULT_PARTITION } from '../utils/constants';

export type RouteContext = ManagerRegistry & { win: BrowserWindow };
export type TabTargetSource = 'header' | 'body' | 'query' | 'session' | 'active';

/**
 * Derive a stable agent identifier from the incoming request.
 *
 * Used by the agent-trust system (T2/T3/T4 tiers) to key per-agent
 * trust state. Local agents (using `~/.tandem/api-token`) resolve to
 * `'local'`. Paired remote agents (binding tokens starting with
 * `tdm_ast_`) resolve to a short stable suffix of their binding token,
 * so two paired agents get separate trust buckets. Requests with no
 * bearer token resolve to `'shell'` (shell-internal paths).
 *
 * NOTE: This is intentionally simple and does not consult pairingManager
 * for the human-readable agentLabel. That's a UI concern — the store
 * only needs a *stable* key. If the binding-metadata lookup becomes
 * cheap later, we can upgrade this helper without touching callers.
 */
export function agentIdFromRequest(req: Request): string {
  const auth = req.headers.authorization;
  if (!auth) return 'shell';
  // Manual, linear-time parse. Avoids a regex with a greedy `\s+`
  // quantifier on uncontrolled input (CodeQL ReDoS warning).
  const trimmed = String(auth).trim();
  if (trimmed.length > 8192) return 'shell'; // header size sanity
  // Case-insensitive "Bearer " prefix.
  if (trimmed.length < 7) return 'shell';
  const prefix = trimmed.slice(0, 6);
  if (prefix.toLowerCase() !== 'bearer') return 'shell';
  // Exactly one whitespace separator required between "Bearer" and token.
  // This matches the existing auth middleware's expectations and avoids a
  // backtracking quantifier.
  const separator = trimmed.charCodeAt(6);
  if (separator !== 0x20 && separator !== 0x09) return 'shell';
  const token = trimmed.slice(7).trim();
  if (!token) return 'shell';
  if (token.startsWith('tdm_ast_')) {
    // Paired binding token — take the 8-char suffix after the prefix as
    // the stable per-agent id. Collisions within that 8-char space are
    // astronomically unlikely given the tokens are already random.
    const rest = token.slice('tdm_ast_'.length);
    return 'agent:' + rest.slice(0, 8);
  }
  // Any other valid bearer = local api-token user.
  return 'local';
}

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
