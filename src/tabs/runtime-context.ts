import type { WorkspaceManager } from '../workspaces/manager';
import type { Tab, TabManager } from './manager';
import { buildTabOwnershipContext, type TabOwnershipContext } from './context';

function getSelectedWorkspace(workspaceManager: WorkspaceManager): { id: string | null; name: string | null } {
  const workspace = workspaceManager.getActive();
  return {
    id: workspace?.id ?? null,
    name: workspace?.name ?? null,
  };
}

export function buildOwnershipContextForTab(
  workspaceManager: WorkspaceManager,
  tab: Pick<Tab, 'webContentsId' | 'source'> | null,
  scope: 'tab' | 'global' = 'tab',
): TabOwnershipContext {
  const selectedWorkspace = getSelectedWorkspace(workspaceManager);
  const workspaceId = tab ? workspaceManager.getWorkspaceIdForTab(tab.webContentsId) : null;
  const workspace = workspaceId ? workspaceManager.get(workspaceId) ?? null : null;

  return buildTabOwnershipContext({
    source: tab?.source ?? null,
    workspaceId,
    workspaceName: workspace?.name ?? null,
    selectedWorkspaceId: selectedWorkspace.id,
    selectedWorkspaceName: selectedWorkspace.name,
    scope,
  });
}

export function buildOwnershipContextForTabId(
  tabManager: TabManager,
  workspaceManager: WorkspaceManager,
  tabId?: string,
  scope: 'tab' | 'global' = 'tab',
): TabOwnershipContext {
  const tab = tabId ? tabManager.getTab(tabId) : null;
  return buildOwnershipContextForTab(workspaceManager, tab, scope);
}
