import { ipcRenderer } from 'electron';
import { IpcChannels } from '../shared/ipc-channels';

export function createTabsApi() {
  return {
    newTab: (url?: string) => ipcRenderer.invoke(IpcChannels.TAB_NEW, url),
    closeTab: (tabId: string) => ipcRenderer.invoke(IpcChannels.TAB_CLOSE, tabId),
    focusTab: (tabId: string) => ipcRenderer.invoke(IpcChannels.TAB_FOCUS, tabId),
    focusTabByIndex: (index: number) => ipcRenderer.invoke(IpcChannels.TAB_FOCUS_INDEX, index),
    listTabs: () => ipcRenderer.invoke(IpcChannels.TAB_LIST),
    showTabContextMenu: (tabId: string) => ipcRenderer.invoke(IpcChannels.SHOW_TAB_CONTEXT_MENU, tabId),
    sendTabUpdate: (data: { tabId: string; title?: string; url?: string; favicon?: string }) => {
      ipcRenderer.send(IpcChannels.TAB_UPDATE, data);
    },
    registerTab: (webContentsId: number, url: string) => {
      ipcRenderer.send(IpcChannels.TAB_REGISTER, { webContentsId, url });
    },
    onTabRegistered: (callback: (data: { tabId: string }) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: { tabId: string }) => callback(data);
      ipcRenderer.on(IpcChannels.TAB_REGISTERED, handler);
      return () => ipcRenderer.removeListener(IpcChannels.TAB_REGISTERED, handler);
    },
    onTabSourceChanged: (callback: (data: { tabId: string; source: string }) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: { tabId: string; source: string }) => callback(data);
      ipcRenderer.on(IpcChannels.TAB_SOURCE_CHANGED, handler);
      return () => ipcRenderer.removeListener(IpcChannels.TAB_SOURCE_CHANGED, handler);
    },
    onOpenUrlInNewTab: (callback: (url: string) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, url: string) => callback(url);
      ipcRenderer.on(IpcChannels.OPEN_URL_IN_NEW_TAB, handler);
      return () => ipcRenderer.removeListener(IpcChannels.OPEN_URL_IN_NEW_TAB, handler);
    },
  };
}
