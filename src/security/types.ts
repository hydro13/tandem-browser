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

// === Phase 2: Outbound Data Guard types ===

export interface OutboundDecision {
  action: 'allow' | 'block' | 'flag';
  reason: string;
  severity: EventSeverity;
}

export interface BodyAnalysis {
  sizeBytes: number;
  hasCredentials: boolean;
  hasFileUpload: boolean;
}

export interface OutboundStats {
  totalChecked: number;
  allowed: number;
  blocked: number;
  flagged: number;
}

export interface WhitelistEntry {
  id?: number;
  originDomain: string;
  destinationDomain: string;
  addedAt?: string;
}

// === Phase 4: AI Gatekeeper Agent types ===

export type GatekeeperAction = 'block' | 'allow' | 'monitor';

export interface PendingDecision {
  id: string;
  category: 'request' | 'anomaly' | 'behavior';
  domain: string;
  context: {
    page?: string;
    url?: string;
    resourceType?: string;
    method?: string;
    trust: number;
    mode: GuardianMode;
    [key: string]: unknown;
  };
  defaultAction: GatekeeperAction;
  timeout: number;
  createdAt: number;
}

export interface GatekeeperDecision {
  action: GatekeeperAction;
  reason: string;
  confidence: number;
}

export interface GatekeeperStatus {
  connected: boolean;
  pendingDecisions: number;
  totalDecisions: number;
  lastAgentSeen: number | null;
}

export interface GatekeeperHistoryEntry {
  id: string;
  domain: string;
  category: string;
  action: GatekeeperAction;
  reason: string;
  confidence: number;
  source: 'agent' | 'timeout' | 'queue-full' | 'rest';
  timestamp: number;
}

// === Phase 5: Evolution Engine + Agent Fleet types ===

export interface PageMetrics {
  script_count: number;
  external_domain_count: number;
  form_count: number;
  cookie_count: number;
  request_count: number;
  resource_size_total: number;
  [key: string]: number;
}

export interface Anomaly {
  domain: string;
  metric: string;
  expected: number;
  actual: number;
  deviation: number;
  tolerance: number;
  severity: EventSeverity;
}

export interface BaselineEntry {
  domain: string;
  metric: string;
  expectedValue: number;
  tolerance: number;
  sampleCount: number;
  lastUpdated: string;
}

export interface ZeroDayCandidate {
  id?: number;
  detectedAt: number;
  domain: string;
  anomalyType: string;
  baselineDeviation: number;
  details: string;
  resolved: boolean;
  resolution?: string | null;
  resolvedAt?: number | null;
}

export interface SecurityReport {
  period: 'day' | 'week' | 'month';
  generatedAt: number;
  totalRequests: number;
  blockedRequests: number;
  flaggedRequests: number;
  anomaliesDetected: number;
  zeroDayCandidates: ZeroDayCandidate[];
  trustChanges: TrustChange[];
  topBlockedDomains: { domain: string; count: number }[];
  newDomainsVisited: { domain: string; firstSeen: number }[];
  recommendations: string[];
}

export interface TrustChange {
  domain: string;
  event: string;
  oldTrust: number;
  newTrust: number;
  timestamp: number;
}

export interface CorrelatedThreat {
  type: 'campaign' | 'coordinated' | 'supply_chain';
  domains: string[];
  eventCount: number;
  timeSpanMs: number;
  description: string;
  severity: EventSeverity;
}

export interface UpdateResult {
  sources: { name: string; domains: number; added: number }[];
  totalAdded: number;
  totalRemoved: number;
  errors: string[];
}
