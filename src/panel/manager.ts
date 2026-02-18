import { BrowserWindow } from 'electron';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { ConfigManager } from '../config/manager';

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
  private configManager?: ConfigManager;
  private activityLog: ActivityEvent[] = [];
  private chatMessages: ChatMessage[] = [];
  private eventCounter = 0;
  private chatCounter = 0;
  private panelOpen = false;
  private maxEvents = 500;
  private chatHistoryPath: string;
  private keesTyping = false;

  constructor(win: BrowserWindow, configManager?: ConfigManager) {
    this.win = win;
    this.configManager = configManager;
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

    // Fire webhook for robin messages (async, non-blocking)
    this.fireWebhook(msg).catch(() => {});

    return msg;
  }

  /** Fire webhook to notify OpenClaw of new chat message */
  private async fireWebhook(msg: ChatMessage): Promise<void> {
    if (!this.configManager) return;
    const config = this.configManager.getConfig();
    if (!config.webhook?.enabled || !config.webhook?.url) return;
    // Only notify for robin messages (kees messages come FROM OpenClaw, no need to echo back)
    if (msg.from !== 'robin') return;
    if (!config.webhook.notifyOnRobinChat) return;

    const url = config.webhook.url.replace(/\/$/, '');

    try {
      const response = await fetch(`${url}/api/sessions/main/events`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(config.webhook.secret ? { 'Authorization': `Bearer ${config.webhook.secret}` } : {}),
        },
        body: JSON.stringify({
          type: 'tandem-chat',
          text: `[Tandem Chat] Robin: ${msg.text}`,
          metadata: {
            messageId: msg.id,
            from: msg.from,
            timestamp: msg.timestamp,
            source: 'tandem-browser',
          },
        }),
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        console.warn(`⚠️ Webhook failed (${response.status}): ${response.statusText}`);
      }
    } catch (e: any) {
      // Silent fail — OpenClaw might not be running
      if (e.name !== 'AbortError') {
        console.warn('⚠️ Webhook dispatch failed (OpenClaw not running?):', e.message);
      }
    }
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
