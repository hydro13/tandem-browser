import { ipcMain, type BrowserWindow } from 'electron';
import { syncTabsToContext } from '../ipc/handlers';
import type { Logger } from '../utils/logger';
import { CDP_ATTACH_DELAY_MS } from '../utils/constants';
import type { PendingTabRegister, RuntimeManagers } from './types';
import { IpcChannels } from '../shared/ipc-channels';

interface RegisterInitialTabLifecycleOptions {
  win: BrowserWindow;
  runtime: RuntimeManagers;
  canUseWindow: (win: BrowserWindow | null) => win is BrowserWindow;
  pendingTabRegister: PendingTabRegister | null;
  setPendingTabRegister: (data: PendingTabRegister | null) => void;
  log: Logger;
}

async function restoreSessionTabs(runtime: RuntimeManagers, initialTabId: string, log: Logger): Promise<void> {
  const saved = runtime.sessionRestoreManager.load();
  if (!saved || saved.tabs.length === 0) {
    return;
  }

  log.info(`Restoring ${saved.tabs.length} tabs from session`);
  runtime.workspaceManager.resetTabAssignments();
  const defaultWorkspaceId = runtime.workspaceManager.list().find(ws => ws.isDefault)?.id ?? null;

  let firstRestoredTabId: string | null = null;
  for (const savedTab of saved.tabs) {
    try {
      const tab = await runtime.tabManager.openTab(savedTab.url, savedTab.groupId ?? undefined, 'robin', 'persist:tandem', false);
      const targetWorkspaceId = savedTab.workspaceId && runtime.workspaceManager.get(savedTab.workspaceId)
        ? savedTab.workspaceId
        : defaultWorkspaceId;
      if (targetWorkspaceId) {
        runtime.workspaceManager.moveTab(tab.webContentsId, targetWorkspaceId);
      }
      if (savedTab.pinned) {
        runtime.tabManager.pinTab(tab.id);
      }
      if (savedTab.title) {
        tab.title = savedTab.title;
      }
      if (!firstRestoredTabId) {
        firstRestoredTabId = tab.id;
      }
      if (saved.activeTabId === savedTab.id) {
        firstRestoredTabId = tab.id;
      }
    } catch (e) {
      log.warn('Failed to restore tab:', savedTab.url, e instanceof Error ? e.message : String(e));
    }
  }

  if (firstRestoredTabId) {
    await runtime.tabManager.closeTab(initialTabId);
    const activeWorkspace = runtime.workspaceManager.getActive();
    runtime.workspaceManager.switch(activeWorkspace.id);
    await runtime.tabManager.focusTab(firstRestoredTabId);
  }
}

function scheduleSecurityAndDevToolsAttach(runtime: RuntimeManagers, webContentsId: number, log: Logger): void {
  setTimeout(async () => {
    await runtime.devToolsManager.attachToTab(webContentsId).catch(e => log.warn('devToolsManager.attachToTab failed:', e instanceof Error ? e.message : e));
    runtime.securityManager.onTabAttached(webContentsId).catch(e => log.warn('securityManager.onTabAttached failed:', e instanceof Error ? e.message : e));
  }, CDP_ATTACH_DELAY_MS);
}

function processInitialTabRegistration(
  runtime: RuntimeManagers,
  win: BrowserWindow,
  data: PendingTabRegister,
  canUseWindow: (win: BrowserWindow | null) => win is BrowserWindow,
  log: Logger,
): void {
  if (runtime.tabManager.count !== 0) {
    return;
  }

  const tab = runtime.tabManager.registerInitialTab(data.webContentsId, data.url);
  if (canUseWindow(win)) {
    win.webContents.send(IpcChannels.TAB_REGISTERED, { tabId: tab.id });
  }
  runtime.eventStream.handleTabEvent('tab-opened', { tabId: tab.id, url: data.url });
  syncTabsToContext(runtime.tabManager, runtime.contextBridge);
  scheduleSecurityAndDevToolsAttach(runtime, data.webContentsId, log);
  restoreSessionTabs(runtime, tab.id, log)
    .then(() => runtime.tabManager.reconcileWithRenderer()
      .then(r => {
        if (r.removed.length > 0) {
          log.info(`Post-restore reconcile: removed ${r.removed.length} renderer orphan(s): ${r.removed.join(', ')}`);
        }
      })
      .catch(e => log.warn('Post-restore reconcile failed:', e instanceof Error ? e.message : String(e))))
    .catch(e => log.warn('Session restore failed:', e instanceof Error ? e.message : String(e)));
}

export function registerInitialTabLifecycle(opts: RegisterInitialTabLifecycleOptions): void {
  const { win, runtime, canUseWindow, pendingTabRegister, setPendingTabRegister, log } = opts;

  ipcMain.on(IpcChannels.TAB_REGISTER, (_event, data: PendingTabRegister) => {
    if (runtime.tabManager.count !== 0) {
      return;
    }
    processInitialTabRegistration(runtime, win, data, canUseWindow, log);
  });

  if (pendingTabRegister && runtime.tabManager.count === 0) {
    setPendingTabRegister(null);
    processInitialTabRegistration(runtime, win, pendingTabRegister, canUseWindow, log);
  }
}
