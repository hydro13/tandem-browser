import { BrowserWindow } from 'electron';
import path from 'path';
import fs from 'fs';
import os from 'os';

export interface ActivityEvent {
  id: number;
  type: 'navigate' | 'click' | 'scroll' | 'input' | 'tab-switch' | 'tab-open' | 'tab-close';
  timestamp: number;
  data: Record<string, unknown>;
}

export interface ChatMessage {
  id: number;
  from: 'robin' | 'kees' | 'claude';
  text: string;
  timestamp: number;
}

/**
 * PanelManager — Manages the Kees side panel.
 * 
 * Tracks activity events from Electron webview events (NOT injected into webview).
 * Stores chat messages persistently in ~/.tandem/chat-history.json.
 * Supports typing indicator for Kees.
 */
export class PanelManager {
  private win: BrowserWindow;
  private activityLog: ActivityEvent[] = [];
  private chatMessages: ChatMessage[] = [];
  private eventCounter = 0;
  private chatCounter = 0;
  private panelOpen = false;
  private maxEvents = 500;
  private chatHistoryPath: string;
  private keesTyping = false;

  constructor(win: BrowserWindow) {
    this.win = win;
    const tandemDir = path.join(os.homedir(), '.tandem');
    if (!fs.existsSync(tandemDir)) {
      fs.mkdirSync(tandemDir, { recursive: true });
    }
    this.chatHistoryPath = path.join(tandemDir, 'chat-history.json');
    this.loadChatHistory();
  }

  /** Load chat history from disk */
  private loadChatHistory(): void {
    try {
      if (fs.existsSync(this.chatHistoryPath)) {
        const data = JSON.parse(fs.readFileSync(this.chatHistoryPath, 'utf-8'));
        if (Array.isArray(data)) {
          this.chatMessages = data;
          this.chatCounter = this.chatMessages.length > 0
            ? Math.max(...this.chatMessages.map(m => m.id))
            : 0;
        }
      }
    } catch {
      // Corrupted file — start fresh
      this.chatMessages = [];
      this.chatCounter = 0;
    }
  }

  /** Save chat history to disk */
  private saveChatHistory(): void {
    try {
      fs.writeFileSync(this.chatHistoryPath, JSON.stringify(this.chatMessages, null, 2));
    } catch {
      // Silent fail
    }
  }

  /** Log an activity event */
  logActivity(type: ActivityEvent['type'], data: Record<string, unknown> = {}): ActivityEvent {
    const event: ActivityEvent = {
      id: ++this.eventCounter,
      type,
      timestamp: Date.now(),
      data,
    };
    this.activityLog.push(event);
    if (this.activityLog.length > this.maxEvents) {
      this.activityLog = this.activityLog.slice(-this.maxEvents);
    }
    // Push to renderer for real-time display
    this.win.webContents.send('activity-event', event);
    return event;
  }

  /** Get activity log (optionally filtered by type, limited) */
  getActivityLog(limit: number = 50, type?: string): ActivityEvent[] {
    let events = this.activityLog;
    if (type) {
      events = events.filter(e => e.type === type);
    }
    return events.slice(-limit);
  }

  /** Add a chat message */
  addChatMessage(from: 'robin' | 'kees' | 'claude', text: string): ChatMessage {
    const msg: ChatMessage = {
      id: ++this.chatCounter,
      from,
      text,
      timestamp: Date.now(),
    };
    this.chatMessages.push(msg);
    this.saveChatHistory();
    this.win.webContents.send('chat-message', msg);
    // Clear typing indicator when Kees sends a message
    if (from === 'kees' && this.keesTyping) {
      this.setKeesTyping(false);
    }
    return msg;
  }

  /** Get chat history */
  getChatMessages(limit: number = 50): ChatMessage[] {
    return this.chatMessages.slice(-limit);
  }

  /** Get messages since a given ID (for polling) */
  getChatMessagesSince(sinceId: number): ChatMessage[] {
    return this.chatMessages.filter(m => m.id > sinceId);
  }

  /** Set Kees typing indicator */
  setKeesTyping(typing: boolean): void {
    this.keesTyping = typing;
    this.win.webContents.send('kees-typing', { typing });
  }

  /** Is Kees typing? */
  isKeesTyping(): boolean {
    return this.keesTyping;
  }

  /** Toggle panel open/closed */
  togglePanel(open?: boolean): boolean {
    this.panelOpen = open !== undefined ? open : !this.panelOpen;
    this.win.webContents.send('panel-toggle', { open: this.panelOpen });
    return this.panelOpen;
  }

  /** Get panel state */
  isPanelOpen(): boolean {
    return this.panelOpen;
  }
}
