import { ipcRenderer } from 'electron';
import { IpcChannels } from '../shared/ipc-channels';

export function createWindowApi() {
  return {
    getPlatform: () => process.platform,
    showAppMenu: (x: number, y: number) => ipcRenderer.send(IpcChannels.SHOW_APP_MENU, { x, y }),
    minimizeWindow: () => ipcRenderer.send(IpcChannels.WINDOW_MINIMIZE),
    maximizeWindow: () => ipcRenderer.send(IpcChannels.WINDOW_MAXIMIZE),
    closeWindow: () => ipcRenderer.send(IpcChannels.WINDOW_CLOSE),
    isWindowMaximized: () => ipcRenderer.invoke(IpcChannels.IS_WINDOW_MAXIMIZED),
    onShortcut: (callback: (action: string) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, action: string) => callback(action);
      ipcRenderer.on(IpcChannels.SHORTCUT, handler);
      return () => ipcRenderer.removeListener(IpcChannels.SHORTCUT, handler);
    },
    onDownloadComplete: (callback: (data: { id: string; filename: string; savePath: string }) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: { id: string; filename: string; savePath: string }) => callback(data);
      ipcRenderer.on(IpcChannels.DOWNLOAD_COMPLETE, handler);
      return () => ipcRenderer.removeListener(IpcChannels.DOWNLOAD_COMPLETE, handler);
    },
  };
}
