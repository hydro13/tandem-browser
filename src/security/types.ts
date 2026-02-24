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

// === Phase 2-A: Script Analysis Threat Rules ===

export interface ThreatRule {
  id: string;
  pattern: RegExp;
  score: number;
  category: 'obfuscation' | 'exfiltration' | 'injection' | 'evasion' | 'redirect';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
}

export interface ThreatRuleMatch {
  rule: ThreatRule;
  offset: number;
  matchedText: string;  // first 100 chars
}

export interface ScriptAnalysisResult {
  totalScore: number;
  matches: ThreatRuleMatch[];
  severity: 'none' | 'low' | 'medium' | 'high' | 'critical';
  scriptUrl: string;
  scriptLength: number;
  entropy?: number;
}

export const JS_THREAT_RULES: ThreatRule[] = [
  // --- Obfuscation ---
  { id: 'eval_string', pattern: /\beval\s*\(\s*['"]/, score: 25, category: 'obfuscation', severity: 'high', description: 'eval() called with string literal' },
  { id: 'eval_fromcharcode', pattern: /eval\s*\(\s*String\.fromCharCode/, score: 35, category: 'obfuscation', severity: 'critical', description: 'eval() with String.fromCharCode decoding' },
  { id: 'eval_atob', pattern: /eval\s*\(\s*atob\s*\(/, score: 30, category: 'obfuscation', severity: 'high', description: 'eval() with base64 decoding' },
  { id: 'eval_function', pattern: /eval\s*\(\s*function/, score: 20, category: 'obfuscation', severity: 'medium', description: 'eval() with function expression' },
  { id: 'function_constructor', pattern: /new\s+Function\s*\(\s*['"]/, score: 25, category: 'obfuscation', severity: 'high', description: 'Function constructor with string body' },
  { id: 'fromcharcode_chain', pattern: /String\.fromCharCode\s*\(\s*\d+\s*,\s*\d+\s*,\s*\d+/, score: 15, category: 'obfuscation', severity: 'medium', description: 'String.fromCharCode chain (3+ codes)' },
  { id: 'charcode_loop', pattern: /for\s*\([^)]*\)\s*\{[^}]*String\.fromCharCode/, score: 20, category: 'obfuscation', severity: 'medium', description: 'Loop-based character code decoding' },
  { id: 'hex_escape_heavy', pattern: /(?:\\x[0-9a-fA-F]{2}){10,}/, score: 20, category: 'obfuscation', severity: 'medium', description: 'Heavy hex escape sequences (10+)' },
  { id: 'unicode_escape_heavy', pattern: /(?:\\u[0-9a-fA-F]{4}){8,}/, score: 20, category: 'obfuscation', severity: 'medium', description: 'Heavy unicode escape sequences (8+)' },
  { id: 'silent_catch', pattern: /catch\s*\(\w*\)\s*\{\s*\}/, score: 8, category: 'evasion', severity: 'low', description: 'Silent catch block (error suppression)' },

  // --- Exfiltration ---
  { id: 'cookie_access', pattern: /document\.cookie/, score: 10, category: 'exfiltration', severity: 'low', description: 'Access to document.cookie' },
  { id: 'cookie_to_fetch', pattern: /document\.cookie[\s\S]{0,100}fetch\s*\(/, score: 40, category: 'exfiltration', severity: 'critical', description: 'Cookie access near fetch() call' },
  { id: 'cookie_to_xhr', pattern: /document\.cookie[\s\S]{0,100}XMLHttpRequest/, score: 40, category: 'exfiltration', severity: 'critical', description: 'Cookie access near XMLHttpRequest' },
  { id: 'cookie_to_img', pattern: /document\.cookie[\s\S]{0,100}\.src\s*=/, score: 35, category: 'exfiltration', severity: 'critical', description: 'Cookie access near image src assignment' },
  { id: 'localstorage_exfil', pattern: /localStorage[\s\S]{0,100}(?:fetch|XMLHttpRequest|\.src\s*=)/, score: 30, category: 'exfiltration', severity: 'high', description: 'localStorage access near exfiltration vector' },
  { id: 'credential_harvest', pattern: /querySelector\s*\([^)]*(?:password|passwd|credit|ssn)[^)]*\)[\s\S]{0,100}(?:fetch|XMLHttpRequest)/i, score: 45, category: 'exfiltration', severity: 'critical', description: 'Credential field query near exfiltration vector' },

  // --- Injection ---
  { id: 'innerhtml_dynamic', pattern: /\.innerHTML\s*=\s*(?!\s*['"]<)/, score: 10, category: 'injection', severity: 'low', description: 'Dynamic innerHTML assignment' },
  { id: 'document_write', pattern: /document\.write\s*\(/, score: 12, category: 'injection', severity: 'medium', description: 'document.write() call' },
  { id: 'dynamic_script_create', pattern: /createElement\s*\(\s*['"]script['"]\)/, score: 15, category: 'injection', severity: 'medium', description: 'Dynamic script element creation' },
  { id: 'dynamic_iframe_create', pattern: /createElement\s*\(\s*['"]iframe['"]\)/, score: 15, category: 'injection', severity: 'medium', description: 'Dynamic iframe element creation' },
  { id: 'activex_object', pattern: /new\s+ActiveXObject\s*\(/, score: 40, category: 'injection', severity: 'critical', description: 'ActiveX object creation' },
  { id: 'wscript_shell', pattern: /WScript\.(?:CreateObject|Shell)/, score: 40, category: 'injection', severity: 'critical', description: 'WScript shell access' },

  // --- Redirect ---
  { id: 'location_redirect', pattern: /(?:window\.)?location\s*(?:\.href\s*)?=\s*[^=!]/, score: 12, category: 'redirect', severity: 'medium', description: 'Dynamic location redirect' },
  { id: 'meta_refresh_inject', pattern: /\.innerHTML[\s\S]{0,50}meta[\s\S]{0,50}refresh/i, score: 30, category: 'redirect', severity: 'high', description: 'Meta refresh injection via innerHTML' },
  { id: 'window_open_data', pattern: /window\.open\s*\(\s*['"]data:/, score: 25, category: 'redirect', severity: 'high', description: 'window.open with data: URI' },
];

// Known analytics/tracker domains (merged from outbound-guard + content-analyzer)
export const KNOWN_TRACKERS = new Set([
  // Google Analytics / Tag Manager / Ads
  'www.google-analytics.com', 'google-analytics.com',
  'analytics.google.com', 'www.googletagmanager.com',
  'googletagmanager.com', 'stats.g.doubleclick.net',
  'pagead2.googlesyndication.com', 'doubleclick.net',
  // Facebook/Meta
  'www.facebook.com', 'connect.facebook.net',
  'pixel.facebook.com', 'graph.facebook.com',
  'facebook.net', 'fbcdn.net',
  // Microsoft/LinkedIn
  'bat.bing.com', 'px.ads.linkedin.com',
  'snap.licdn.com',
  // Twitter/X
  'ads-twitter.com',
  // Other ad networks
  'adsrvr.org', 'adnxs.com',
  'criteo.com', 'outbrain.com', 'taboola.com',
  // Analytics platforms
  'mc.yandex.ru', 'cdn.mxpnl.com', 'api.mixpanel.com', 'mixpanel.com',
  'api.segment.io', 'cdn.segment.com', 'segment.com',
  'api.amplitude.com', 'cdn.amplitude.com', 'amplitude.com',
  'rum-http-intake.logs.datadoghq.com',
  'sentry.io', 'o0.ingest.sentry.io',
  'plausible.io', 'stats.wp.com',
  'api.hubspot.com', 'track.hubspot.com',
  'hotjar.com', 'fullstory.com', 'mouseflow.com', 'crazyegg.com',
  'newrelic.com', 'nr-data.net',
  // Social media pixels
  'ct.pinterest.com', 'analytics.tiktok.com',
  'sc-static.net', 'tr.snapchat.com',
]);

// Major hosting platforms that appear in URL-based blocklists as malware hosts
// but should never be domain-level blocked (the threat is the specific URL, not the domain)
export const URL_LIST_SAFE_DOMAINS = new Set([
  'github.com', 'raw.githubusercontent.com', 'githubusercontent.com',
  'dropbox.com', 'dl.dropboxusercontent.com',
  'drive.google.com', 'docs.google.com', 'storage.googleapis.com',
  'onedrive.live.com', '1drv.ms',
  'cdn.discordapp.com', 'discord.com', 'media.discordapp.net',
  'bitbucket.org', 'gitlab.com',
  'amazonaws.com', 's3.amazonaws.com',
  'blob.core.windows.net', 'azurewebsites.net',
  'pastebin.com', 'transfer.sh', 'anonfiles.com',
  'mediafire.com', 'mega.nz', 'mega.co.nz',
  'archive.org', 'web.archive.org',
]);
