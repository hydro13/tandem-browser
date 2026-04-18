import { ipcRenderer } from 'electron';
import { IpcChannels } from '../shared/ipc-channels';

export function createContentApi() {
  return {
    getPageContent: () => ipcRenderer.invoke(IpcChannels.GET_PAGE_CONTENT),
    getPageStatus: () => ipcRenderer.invoke(IpcChannels.GET_PAGE_STATUS),
    // executeJS was removed in audit #34 High-4 — the IPC channel gave any
    // renderer that could reach window.tandem (e.g. via shell XSS) the ability
    // to run arbitrary JS in the active webview. The channel is gone; agents
    // should use the HTTP API routes (/execute-js/confirm, gated; or /execute-js,
    // scanner-protected), not renderer IPC.
  };
}
