import { BrowserWindow } from 'electron';
import { PanelManager } from '../panel/manager';

/**
 * VoiceManager — Manages voice input via Web Speech API in the SHELL.
 * 
 * CRITICAL: Voice recognition runs in the Electron shell renderer,
 * NOT in any webview. Websites cannot detect it.
 * 
 * Flow: Cmd+M → shell starts SpeechRecognition → transcripts sent via IPC
 * → displayed in Copilot panel chat → sent as message on silence/Enter.
 */
export class VoiceManager {
  private win: BrowserWindow;
  private panelManager: PanelManager;
  private listening = false;

  constructor(win: BrowserWindow, panelManager: PanelManager) {
    this.win = win;
    this.panelManager = panelManager;
  }

  /** Toggle voice on/off — tells renderer to start/stop SpeechRecognition */
  toggleVoice(): boolean {
    this.listening = !this.listening;
    this.win.webContents.send('voice-toggle', { listening: this.listening });
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
      this.win.webContents.send('voice-toggle', { listening: true });
      this.panelManager.togglePanel(true);
    }
  }

  /** Stop voice */
  stop(): void {
    if (this.listening) {
      this.listening = false;
      this.win.webContents.send('voice-toggle', { listening: false });
    }
  }

  /** Handle transcript from renderer */
  handleTranscript(text: string, isFinal: boolean): void {
    if (isFinal && text.trim()) {
      // Send as Robin's chat message
      this.panelManager.addChatMessage('robin', `🎙️ ${text.trim()}`);
    }
    // Send live transcript to renderer for display
    this.win.webContents.send('voice-transcript-display', { text, isFinal });
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
}
