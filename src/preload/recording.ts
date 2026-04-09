import { ipcRenderer } from 'electron';
import { IpcChannels } from '../shared/ipc-channels';

export function createRecordingApi() {
  return {
    getDesktopSource: () => ipcRenderer.invoke(IpcChannels.GET_DESKTOP_SOURCE),
    startRecording: (mode: 'application' | 'region', region?: { x: number; y: number; width: number; height: number }) =>
      ipcRenderer.invoke(IpcChannels.START_RECORDING, { mode, region }),
    stopRecording: () => ipcRenderer.invoke(IpcChannels.STOP_RECORDING),
    sendRecordingChunk: (data: ArrayBuffer) => ipcRenderer.send(IpcChannels.RECORDING_CHUNK, data),
    onRecordingModeSelected: (callback: (mode: 'application' | 'region') => void) => {
      const handler = (_event: Electron.IpcRendererEvent, mode: 'application' | 'region') => callback(mode);
      ipcRenderer.on(IpcChannels.RECORDING_MODE_SELECTED, handler);
      return () => ipcRenderer.removeListener(IpcChannels.RECORDING_MODE_SELECTED, handler);
    },
    onRecordingFinished: (callback: (data: { path: string; filename: string; duration: number }) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: { path: string; filename: string; duration: number }) => callback(data);
      ipcRenderer.on(IpcChannels.RECORDING_FINISHED, handler);
      return () => ipcRenderer.removeListener(IpcChannels.RECORDING_FINISHED, handler);
    },
  };
}
