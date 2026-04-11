import type { BrowserWindow } from 'electron';
import type { PanelManager } from '../panel/manager';
import { IpcChannels } from '../shared/ipc-channels';

/**
 * VoiceManager — Manages voice input via Web Speech API in the SHELL.
 *
 * CRITICAL: Voice recognition runs in the Electron shell renderer,
 * NOT in any webview. Websites cannot detect it.
 *
 * Flow: Cmd+M → shell starts SpeechRecognition → transcripts sent via IPC
 * → displayed in Wingman panel chat → sent as message on silence/Enter.
 */
export class VoiceManager {

  // === 1. Private state ===

  private win: BrowserWindow;
  private panelManager: PanelManager;
  private listening = false;

  // === 2. Constructor ===

  constructor(win: BrowserWindow, panelManager: PanelManager) {
    this.win = win;
    this.panelManager = panelManager;
  }

  // === 4. Public methods ===

  /** Toggle voice on/off — tells renderer to start/stop SpeechRecognition */
  toggleVoice(): boolean {
    this.listening = !this.listening;
    if (this.canSendToRenderer()) {
      this.win.webContents.send(IpcChannels.VOICE_TOGGLE, { listening: this.listening });
    }
    if (this.listening) {
      // Ensure panel is open and on chat tab
      this.panelManager.togglePanel(true);
    }
    return this.listening;
  }

  /** Start voice */
  start(): void {
    if (!this.listening) {
      this.listening = true;
      if (this.canSendToRenderer()) {
        this.win.webContents.send(IpcChannels.VOICE_TOGGLE, { listening: true });
      }
      this.panelManager.togglePanel(true);
    }
  }

  /** Stop voice */
  stop(): void {
    if (this.listening) {
      this.listening = false;
      if (this.canSendToRenderer()) {
        this.win.webContents.send(IpcChannels.VOICE_TOGGLE, { listening: false });
      }
    }
  }

  /** Handle transcript from renderer */
  handleTranscript(text: string, isFinal: boolean): void {
    if (isFinal && text.trim()) {
      // Send as Robin's chat message
      this.panelManager.addChatMessage('robin', `🎙️ ${text.trim()}`);
    }
    // Send live transcript to renderer for display
    if (this.canSendToRenderer()) {
      this.win.webContents.send(IpcChannels.VOICE_TRANSCRIPT_DISPLAY, { text, isFinal });
    }
  }

  /** Update listening state (called from renderer) */
  setListening(listening: boolean): void {
    this.listening = listening;
  }

  /** Get current status */
  getStatus(): { listening: boolean } {
    return { listening: this.listening };
  }

  /** Is currently listening */
  isListening(): boolean {
    return this.listening;
  }

  // === 7. Private helpers ===

  private canSendToRenderer(): boolean {
    return !this.win.isDestroyed() && !this.win.webContents.isDestroyed();
  }
}
