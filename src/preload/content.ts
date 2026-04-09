import { ipcRenderer } from 'electron';
import { IpcChannels } from '../shared/ipc-channels';

export function createContentApi() {
  return {
    getPageContent: () => ipcRenderer.invoke(IpcChannels.GET_PAGE_CONTENT),
    getPageStatus: () => ipcRenderer.invoke(IpcChannels.GET_PAGE_STATUS),
    executeJS: (code: string) => ipcRenderer.invoke(IpcChannels.EXECUTE_JS, code),
  };
}
