/**
 * Chat Router Interfaces — Phase 3
 * Shared types for all chat backends (OpenClaw, Claude Activity, etc.)
 */

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  source: 'robin' | 'openclaw' | 'claude';
  timestamp: number;
}

export interface ChatBackend {
  id: string;
  name: string;
  icon: string;

  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;

  sendMessage(text: string): Promise<void>;

  onMessage(cb: (msg: ChatMessage) => void): void;
  onTyping(cb: (typing: boolean) => void): void;
  onConnectionChange(cb: (connected: boolean) => void): void;
}
