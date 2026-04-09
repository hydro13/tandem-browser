import { ipcRenderer } from 'electron';
import { IpcChannels } from '../shared/ipc-channels';

export function createBookmarksApi() {
  return {
    bookmarkPage: (url: string, title: string) => ipcRenderer.invoke(IpcChannels.BOOKMARK_PAGE, url, title),
    unbookmarkPage: (url: string) => ipcRenderer.invoke(IpcChannels.UNBOOKMARK_PAGE, url),
    isBookmarked: (url: string) => ipcRenderer.invoke(IpcChannels.IS_BOOKMARKED, url),
    onBookmarkStatusChanged: (callback: (data: { url: string; bookmarked: boolean }) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: { url: string; bookmarked: boolean }) => callback(data);
      ipcRenderer.on(IpcChannels.BOOKMARK_STATUS_CHANGED, handler);
      return () => ipcRenderer.removeListener(IpcChannels.BOOKMARK_STATUS_CHANGED, handler);
    },
  };
}
