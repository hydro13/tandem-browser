import { ipcRenderer } from 'electron';
import { IpcChannels } from '../shared/ipc-channels';

export function createNavigationApi() {
  return {
    navigate: (url: string) => ipcRenderer.invoke(IpcChannels.NAVIGATE, url),
    goBack: () => ipcRenderer.invoke(IpcChannels.GO_BACK),
    goForward: () => ipcRenderer.invoke(IpcChannels.GO_FORWARD),
    reload: () => ipcRenderer.invoke(IpcChannels.RELOAD),
    onNavigated: (callback: (url: string) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, url: string) => callback(url);
      ipcRenderer.on(IpcChannels.NAVIGATED, handler);
      return () => ipcRenderer.removeListener(IpcChannels.NAVIGATED, handler);
    },
  };
}
