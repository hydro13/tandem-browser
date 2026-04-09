import { ipcRenderer } from 'electron';
import type { ToolbarExtension } from '../extensions/toolbar';
import { IpcChannels } from '../shared/ipc-channels';

export function createExtensionsApi() {
  return {
    getToolbarExtensions: () => ipcRenderer.invoke(IpcChannels.EXTENSION_TOOLBAR_LIST),
    openExtensionPopup: (extensionId: string, anchorBounds?: { x: number; y: number }) => ipcRenderer.invoke(IpcChannels.EXTENSION_POPUP_OPEN, extensionId, anchorBounds),
    closeExtensionPopup: () => ipcRenderer.invoke(IpcChannels.EXTENSION_POPUP_CLOSE),
    pinExtension: (extensionId: string, pinned: boolean) => ipcRenderer.invoke(IpcChannels.EXTENSION_PIN, extensionId, pinned),
    showExtensionContextMenu: (extensionId: string) => ipcRenderer.invoke(IpcChannels.EXTENSION_CONTEXT_MENU, extensionId),
    showExtensionOptions: (extensionId: string) => ipcRenderer.invoke(IpcChannels.EXTENSION_OPTIONS, extensionId),
    onExtensionToolbarUpdate: (callback: (extensions: ToolbarExtension[]) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, extensions: ToolbarExtension[]) => callback(extensions);
      ipcRenderer.on(IpcChannels.EXTENSION_TOOLBAR_UPDATE, handler);
      return () => ipcRenderer.removeListener(IpcChannels.EXTENSION_TOOLBAR_UPDATE, handler);
    },
    onExtensionRemoveRequest: (callback: (data: { id: string; diskId: string; name: string }) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: { id: string; diskId: string; name: string }) => callback(data);
      ipcRenderer.on(IpcChannels.EXTENSION_REMOVE_REQUEST, handler);
      return () => ipcRenderer.removeListener(IpcChannels.EXTENSION_REMOVE_REQUEST, handler);
    },
    onExtensionToolbarRefresh: (callback: () => void) => {
      const handler = () => callback();
      ipcRenderer.on(IpcChannels.EXTENSION_TOOLBAR_REFRESH, handler);
      return () => ipcRenderer.removeListener(IpcChannels.EXTENSION_TOOLBAR_REFRESH, handler);
    },
  };
}
