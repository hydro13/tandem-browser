import { ipcRenderer } from 'electron';
import { IpcChannels } from '../shared/ipc-channels';

export function createWorkspacesApi() {
  return {
    onWorkspaceSwitched: (callback: (workspace: { id: string; name: string; icon: string; color: string; tabIds: number[] }) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, workspace: { id: string; name: string; icon: string; color: string; tabIds: number[] }) => callback(workspace);
      ipcRenderer.on(IpcChannels.WORKSPACE_SWITCHED, handler);
      return () => ipcRenderer.removeListener(IpcChannels.WORKSPACE_SWITCHED, handler);
    },
    onPinboardItemAdded: (callback: (boardId: string) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, boardId: string) => callback(boardId);
      ipcRenderer.on(IpcChannels.PINBOARD_ITEM_ADDED, handler);
      return () => ipcRenderer.removeListener(IpcChannels.PINBOARD_ITEM_ADDED, handler);
    },
    onReloadSidebarWebview: (callback: (id: string) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, id: string) => callback(id);
      ipcRenderer.on(IpcChannels.RELOAD_SIDEBAR_WEBVIEW, handler);
      return () => ipcRenderer.removeListener(IpcChannels.RELOAD_SIDEBAR_WEBVIEW, handler);
    },
  };
}
