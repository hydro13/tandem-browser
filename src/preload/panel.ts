import { ipcRenderer } from 'electron';
import type { ActivityEvent, ChatMessage } from '../panel/manager';
import { IpcChannels } from '../shared/ipc-channels';

export function createPanelApi() {
  return {
    onPanelToggle: (callback: (data: { open: boolean }) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: { open: boolean }) => callback(data);
      ipcRenderer.on(IpcChannels.PANEL_TOGGLE, handler);
      return () => ipcRenderer.removeListener(IpcChannels.PANEL_TOGGLE, handler);
    },
    setPanelOpen: (open: boolean) => ipcRenderer.send(IpcChannels.PANEL_OPEN_CHANGED, { open }),
    onActivityEvent: (callback: (event: ActivityEvent) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: ActivityEvent) => callback(data);
      ipcRenderer.on(IpcChannels.ACTIVITY_EVENT, handler);
      return () => ipcRenderer.removeListener(IpcChannels.ACTIVITY_EVENT, handler);
    },
    onChatMessage: (callback: (msg: ChatMessage) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: ChatMessage) => callback(data);
      ipcRenderer.on(IpcChannels.CHAT_MESSAGE, handler);
      return () => ipcRenderer.removeListener(IpcChannels.CHAT_MESSAGE, handler);
    },
    sendChatMessage: (text: string) => {
      ipcRenderer.send(IpcChannels.CHAT_SEND, text);
    },
    sendLegacyChatMessage: (text: string) => {
      ipcRenderer.send(IpcChannels.CHAT_SEND_LEGACY, text);
    },
    sendChatImage: (text: string, image: string) => ipcRenderer.invoke(IpcChannels.CHAT_SEND_IMAGE, { text, image }),
    persistChatMessage: (data: {
      from: 'user' | 'wingman' | 'claude';
      text?: string;
      image?: string;
      notifyWebhook?: boolean;
    }) => ipcRenderer.invoke(IpcChannels.CHAT_PERSIST_MESSAGE, data),
    onWingmanAlert: (callback: (data: { title: string; body: string }) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: { title: string; body: string }) => callback(data);
      ipcRenderer.on(IpcChannels.WINGMAN_ALERT, handler);
      return () => ipcRenderer.removeListener(IpcChannels.WINGMAN_ALERT, handler);
    },
    onWingmanTyping: (callback: (data: { typing: boolean }) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: { typing: boolean }) => callback(data);
      ipcRenderer.on(IpcChannels.WINGMAN_TYPING, handler);
      return () => ipcRenderer.removeListener(IpcChannels.WINGMAN_TYPING, handler);
    },
    /** @deprecated Use onWingmanTyping */
    onKeesTyping: (callback: (data: { typing: boolean }) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: { typing: boolean }) => callback(data);
      ipcRenderer.on(IpcChannels.WINGMAN_TYPING, handler);
      return () => ipcRenderer.removeListener(IpcChannels.WINGMAN_TYPING, handler);
    },
    onWingmanChatInject: (callback: (text: string) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, text: string) => callback(text);
      ipcRenderer.on(IpcChannels.WINGMAN_CHAT_INJECT, handler);
      return () => ipcRenderer.removeListener(IpcChannels.WINGMAN_CHAT_INJECT, handler);
    },
    /** @deprecated Use onWingmanChatInject */
    onKeesChatInject: (callback: (text: string) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, text: string) => callback(text);
      ipcRenderer.on(IpcChannels.WINGMAN_CHAT_INJECT, handler);
      return () => ipcRenderer.removeListener(IpcChannels.WINGMAN_CHAT_INJECT, handler);
    },
    onApprovalRequest: (callback: (data: { requestId: string; taskId: string; stepId: string; description: string; action: Record<string, unknown>; riskLevel: string }) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: { requestId: string; taskId: string; stepId: string; description: string; action: Record<string, unknown>; riskLevel: string }) => callback(data);
      ipcRenderer.on(IpcChannels.APPROVAL_REQUEST, handler);
      return () => ipcRenderer.removeListener(IpcChannels.APPROVAL_REQUEST, handler);
    },
    onLiveModeChanged: (callback: (data: { enabled: boolean }) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: { enabled: boolean }) => callback(data);
      ipcRenderer.on(IpcChannels.LIVE_MODE_CHANGED, handler);
      return () => ipcRenderer.removeListener(IpcChannels.LIVE_MODE_CHANGED, handler);
    },
    emergencyStop: () => ipcRenderer.invoke(IpcChannels.EMERGENCY_STOP),
  };
}
