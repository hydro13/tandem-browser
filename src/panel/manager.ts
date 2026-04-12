import type { BrowserWindow } from 'electron';
import path from 'path';
import fs from 'fs';
import type { ConfigManager } from '../config/manager';
import { wingmanAlert } from '../notifications/alert';
import { tandemDir, ensureDir } from '../utils/paths';
import { createLogger } from '../utils/logger';
import { IpcChannels } from '../shared/ipc-channels';

const log = createLogger('PanelManager');

// ─── Types ──────────────────────────────────────────────────────────

export interface ActivityEvent {
  id: number;
  type: 'navigate' | 'click' | 'scroll' | 'input' | 'tab-switch' | 'tab-open' | 'tab-close' | 'press-key' | 'press-key-combo';
  timestamp: number;
  data: Record<string, unknown>;
}

export interface ChatMessage {
  id: number;
  from: 'user' | 'wingman' | 'claude';
  text: string;
  timestamp: number;
  image?: string;  // relative filename in ~/.tandem/chat-images/
}

export interface AddChatMessageOptions {
  notifyWebhook?: boolean;
  emitIpc?: boolean;
}

// ─── Manager ────────────────────────────────────────────────────────

/**
 * PanelManager — Manages the Wingman side panel.
 *
 * Tracks activity events from Electron webview events (NOT injected into webview).
 * Stores chat messages persistently in ~/.tandem/chat-history.json.
 * Supports typing indicator for the AI wingman.
 */
export class PanelManager {

  // === 1. Private state ===

  private win: BrowserWindow;
  private configManager?: ConfigManager;
  private activityLog: ActivityEvent[] = [];
  private chatMessages: ChatMessage[] = [];
  private eventCounter = 0;
  private chatCounter = 0;
  private panelOpen = false;
  private maxEvents = 500;
  private chatHistoryPath: string;
  private wingmanTyping = false;
  private chatImagesDir: string;

  // === 2. Constructor ===

  constructor(win: BrowserWindow, configManager?: ConfigManager) {
    this.win = win;
    this.configManager = configManager;
    ensureDir(tandemDir());
    this.chatHistoryPath = tandemDir('chat-history.json');
    this.chatImagesDir = ensureDir(tandemDir('chat-images'));
    this.loadChatHistory();
  }

  // === 4. Public methods ===

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
    if (this.win && !this.win.isDestroyed() && !this.win.webContents.isDestroyed()) {
      this.win.webContents.send(IpcChannels.ACTIVITY_EVENT, event);
    }
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

  /** Save a base64 image to disk, return the filename */
  saveImage(base64Data: string): string {
    const raw = base64Data.replace(/^data:image\/\w+;base64,/, '');
    const ext = base64Data.startsWith('data:image/png') ? 'png' : 'jpg';
    const filename = `chat-${Date.now()}.${ext}`;
    const filePath = path.join(this.chatImagesDir, filename);
    fs.writeFileSync(filePath, Buffer.from(raw, 'base64'));
    return filename;
  }

  /** Get full path to a chat image */
  getImagePath(filename: string): string {
    return path.join(this.chatImagesDir, filename);
  }

  /** Add a chat message */
  addChatMessage(
    from: 'user' | 'wingman' | 'claude',
    text: string,
    image?: string,
    opts: AddChatMessageOptions = {},
  ): ChatMessage {
    const msg: ChatMessage = {
      id: ++this.chatCounter,
      from,
      text,
      timestamp: Date.now(),
      image,
    };
    this.chatMessages.push(msg);
    this.saveChatHistory();
    if (opts.emitIpc !== false && this.win && !this.win.isDestroyed() && !this.win.webContents.isDestroyed()) {
      this.win.webContents.send(IpcChannels.CHAT_MESSAGE, msg);
    }
    // Clear typing indicator when wingman sends a message
    if (from === 'wingman' && this.wingmanTyping) {
      this.setWingmanTyping(false);
    }

    this.maybeNotifyForIncomingReply(msg);

    // Fire webhook for user messages (async, non-blocking)
    if (opts.notifyWebhook !== false) {
      this.fireWebhook(msg).catch(e => log.warn('fireWebhook failed:', e instanceof Error ? e.message : e));
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

  /** Set Wingman typing indicator */
  setWingmanTyping(typing: boolean): void {
    this.wingmanTyping = typing;
    if (this.win && !this.win.isDestroyed() && !this.win.webContents.isDestroyed()) {
      this.win.webContents.send(IpcChannels.WINGMAN_TYPING, { typing });
    }
  }

  /** @deprecated Use setWingmanTyping */
  setKeesTyping(typing: boolean): void {
    this.setWingmanTyping(typing);
  }

  /** Is Wingman typing? */
  isWingmanTyping(): boolean {
    return this.wingmanTyping;
  }

  /** @deprecated Use isWingmanTyping */
  isKeesTyping(): boolean {
    return this.wingmanTyping;
  }

  /** Toggle panel open/closed */
  togglePanel(open?: boolean): boolean {
    this.panelOpen = open !== undefined ? open : !this.panelOpen;
    if (this.win && !this.win.isDestroyed() && !this.win.webContents.isDestroyed()) {
      this.win.webContents.send(IpcChannels.PANEL_TOGGLE, { open: this.panelOpen });
    }
    return this.panelOpen;
  }

  /** Update panel open state silently (no IPC back to frontend — avoids feedback loop) */
  setPanelOpenSilent(open: boolean): void {
    this.panelOpen = open;
  }

  /** Notify UI about live mode change */
  sendLiveModeChanged(enabled: boolean): void {
    if (this.win && !this.win.isDestroyed() && !this.win.webContents.isDestroyed()) {
      this.win.webContents.send(IpcChannels.LIVE_MODE_CHANGED, { enabled });
    }
  }

  /** Get panel state */
  isPanelOpen(): boolean {
    return this.panelOpen;
  }

  // === 7. Private I/O ===

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

  /** Fire webhook to notify OpenClaw of new chat message */
  private async fireWebhook(msg: ChatMessage): Promise<void> {
    if (!this.configManager) return;
    const config = this.configManager.getConfig();
    if (!config.webhook?.enabled || !config.webhook?.url) return;
    // Only notify for user messages (wingman messages come FROM OpenClaw, no need to echo back)
    if (msg.from !== 'user') return;
    if (!config.webhook.notifyOnRobinChat) return;

    const url = config.webhook.url.replace(/\/$/, '');

    try {
      const response = await fetch(`${url}/hooks/wake`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(config.webhook.secret ? { 'Authorization': `Bearer ${config.webhook.secret}` } : {}),
        },
        body: JSON.stringify({
          text: `[Tandem Chat] User: ${msg.text}${msg.image ? ' [image attached]' : ''}`,
          mode: 'now',
        }),
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        log.warn(`⚠️ Webhook failed (${response.status}): ${response.statusText}`);
      }
    } catch (e) {
      // Silent fail — OpenClaw might not be running
      if (!(e instanceof Error) || e.name !== 'AbortError') {
        log.warn('⚠️ Webhook dispatch failed (OpenClaw not running?):', e instanceof Error ? e.message : String(e));
      }
    }
  }

  private maybeNotifyForIncomingReply(msg: ChatMessage): void {
    if (this.panelOpen) return;
    if (msg.from === 'user') return;

    const sender = this.getReplySenderLabel(msg.from);
    const body = this.buildReplyNotificationBody(msg);
    wingmanAlert(`${sender} replied`, body);
  }

  private getReplySenderLabel(from: ChatMessage['from']): string {
    if (from === 'claude') return 'Claude';
    return 'Wingman';
  }

  private buildReplyNotificationBody(msg: ChatMessage): string {
    const trimmed = msg.text.trim();
    if (trimmed.length > 0) {
      return trimmed.length > 140 ? `${trimmed.slice(0, 137)}...` : trimmed;
    }
    if (msg.image) {
      return 'Sent an image.';
    }
    return 'Sent a new message.';
  }
}
