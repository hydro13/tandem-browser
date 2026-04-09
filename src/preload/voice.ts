import { ipcRenderer } from 'electron';
import { IpcChannels } from '../shared/ipc-channels';

export function createVoiceApi() {
  return {
    onVoiceToggle: (callback: (data: { listening: boolean }) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: { listening: boolean }) => callback(data);
      ipcRenderer.on(IpcChannels.VOICE_TOGGLE, handler);
      return () => ipcRenderer.removeListener(IpcChannels.VOICE_TOGGLE, handler);
    },
    onVoiceTranscript: (callback: (data: { text: string; isFinal: boolean }) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: { text: string; isFinal: boolean }) => callback(data);
      ipcRenderer.on(IpcChannels.VOICE_TRANSCRIPT_DISPLAY, handler);
      return () => ipcRenderer.removeListener(IpcChannels.VOICE_TRANSCRIPT_DISPLAY, handler);
    },
    sendVoiceTranscript: (text: string, isFinal: boolean) => {
      ipcRenderer.send(IpcChannels.VOICE_TRANSCRIPT, { text, isFinal });
    },
    sendVoiceStatus: (listening: boolean) => {
      ipcRenderer.send(IpcChannels.VOICE_STATUS_UPDATE, { listening });
    },
    requestMicPermission: () => ipcRenderer.invoke(IpcChannels.REQUEST_MIC_PERMISSION),
    transcribeAudio: (buffer: ArrayBuffer, language?: string) => ipcRenderer.invoke(IpcChannels.TRANSCRIBE_AUDIO, { buffer, language }),
    getSpeechBackend: () => ipcRenderer.invoke(IpcChannels.GET_SPEECH_BACKEND),
  };
}
