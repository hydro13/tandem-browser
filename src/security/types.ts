// All types used across the security module

export type GuardianMode = 'strict' | 'balanced' | 'permissive';
export type EventSeverity = 'info' | 'low' | 'medium' | 'high' | 'critical';
export type EventCategory = 'network' | 'script' | 'form' | 'outbound' | 'behavior';
export type EventAction = 'auto_block' | 'agent_block' | 'user_allowed' | 'logged' | 'flagged';

export interface SecurityEvent {
  id?: number;
  timestamp: number;
  domain: string | null;
  tabId: string | null;
  eventType: string;       // 'blocked', 'warned', 'anomaly', 'zero_day', 'exfiltration_attempt'
  severity: EventSeverity;
  category: EventCategory;
  details: string;         // JSON string with full event details
  actionTaken: EventAction;
  falsePositive?: boolean;
}

export interface DomainInfo {
  id?: number;
  domain: string;
  firstSeen: number;
  lastSeen: number;
  visitCount: number;
  trustLevel: number;       // 0-100
  guardianMode: GuardianMode;
  category: string;
  notes: string | null;
}

export interface GuardianDecision {
  id: string;
  action: 'block' | 'allow' | 'hold' | 'monitor';
  reason: string;
  consumer: string;        // Which consumer made the decision
  elapsedMs: number;       // How long the decision took
}

export interface BlocklistEntry {
  domain: string;
  source: string;          // 'phishtank', 'urlhaus', 'stevenblack', 'manual', 'gatekeeper'
  category: string;        // 'phishing', 'malware', 'tracker', 'crypto_miner'
}

export interface GuardianStatus {
  active: boolean;
  defaultMode: GuardianMode;
  stats: {
    totalRequests: number;
    blockedRequests: number;
    allowedRequests: number;
    avgDecisionMs: number;
  };
  consumers: string[];     // From dispatcher status
}

// Banking/login domain patterns for auto-strict mode
export const BANKING_PATTERNS = [
  /bank/i, /paypal/i, /stripe\.com/, /wise\.com/,
  /\.gov\.[a-z]{2}$/, /login\./i, /signin\./i, /auth\./i,
  /accounts\.google/, /id\.apple\.com/,
];

// Known trusted CDN domains (don't flag as suspicious third-party)
export const TRUSTED_CDNS = new Set([
  'cdnjs.cloudflare.com', 'cdn.jsdelivr.net', 'unpkg.com',
  'ajax.googleapis.com', 'fonts.googleapis.com', 'fonts.gstatic.com',
  'cdn.cloudflare.com', 'stackpath.bootstrapcdn.com',
]);
