import { ipcRenderer } from 'electron';
import { IpcChannels } from '../shared/ipc-channels';

export function createDrawingApi() {
  return {
    onDrawMode: (callback: (data: { enabled: boolean }) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: { enabled: boolean }) => callback(data);
      ipcRenderer.on(IpcChannels.DRAW_MODE, handler);
      return () => ipcRenderer.removeListener(IpcChannels.DRAW_MODE, handler);
    },
    onDrawClear: (callback: () => void) => {
      const handler = () => callback();
      ipcRenderer.on(IpcChannels.DRAW_CLEAR, handler);
      return () => ipcRenderer.removeListener(IpcChannels.DRAW_CLEAR, handler);
    },
    onScreenshotTaken: (callback: (data: { path: string; filename: string; appPath?: string; base64?: string }) => void) => {
      const handler = (
        _event: Electron.IpcRendererEvent,
        data: { path: string; filename: string; appPath?: string; base64?: string },
      ) => callback(data);
      ipcRenderer.on(IpcChannels.SCREENSHOT_TAKEN, handler);
      return () => ipcRenderer.removeListener(IpcChannels.SCREENSHOT_TAKEN, handler);
    },
    onScreenshotModeSelected: (callback: (mode: 'page' | 'application' | 'region') => void) => {
      const handler = (_event: Electron.IpcRendererEvent, mode: 'page' | 'application' | 'region') => callback(mode);
      ipcRenderer.on(IpcChannels.SCREENSHOT_MODE_SELECTED, handler);
      return () => ipcRenderer.removeListener(IpcChannels.SCREENSHOT_MODE_SELECTED, handler);
    },
    snapForWingman: () => ipcRenderer.invoke(IpcChannels.SNAP_FOR_WINGMAN),
    /** @deprecated Use snapForWingman */
    snapForKees: () => ipcRenderer.invoke(IpcChannels.SNAP_FOR_WINGMAN),
    quickScreenshot: () => ipcRenderer.invoke(IpcChannels.QUICK_SCREENSHOT),
    captureScreenshot: (
      mode: 'page' | 'application' | 'region',
      region?: { x: number; y: number; width: number; height: number },
    ) => ipcRenderer.invoke(IpcChannels.CAPTURE_SCREENSHOT, { mode, region }),
    showScreenshotMenu: (anchor: { x: number; y: number }) => ipcRenderer.invoke(IpcChannels.SHOW_SCREENSHOT_MENU, anchor),
  };
}
