import { ipcRenderer } from 'electron';
import { IpcChannels } from '../shared/ipc-channels';

export function createActivityApi() {
  return {
    sendWebviewEvent: (data: { type: string; url?: string; tabId?: string }) => {
      ipcRenderer.send(IpcChannels.ACTIVITY_WEBVIEW_EVENT, data);
    },
    onAutoSnapshotRequest: (callback: (data: { url: string }) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: { url: string }) => callback(data);
      ipcRenderer.on(IpcChannels.AUTO_SNAPSHOT_REQUEST, handler);
      return () => ipcRenderer.removeListener(IpcChannels.AUTO_SNAPSHOT_REQUEST, handler);
    },
  };
}
