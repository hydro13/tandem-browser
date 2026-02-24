import { SecurityDB } from './security-db';
import { DevToolsManager } from '../devtools/manager';
import { KNOWN_TRACKERS, URL_REGEX, DOMAIN_REGEX, IPV4_OCTAL_REGEX, AnalysisConfidence } from './types';

/** Result of a page security analysis */
export interface PageAnalysis {
  url: string;
  domain: string | null;
  timestamp: number;
  forms: FormInfo[];
  scripts: ScriptInfo[];
  security: {
    isHttps: boolean;
    hasPasswordOnHttp: boolean;
    mixedContent: boolean;
    hiddenIframesWithForms: number;
    typosquat: TyposquatResult | null;
    missingHeaders: string[];
  };
  trackers: TrackerInfo[];
  riskScore: number; // 0-100 (0 = safe, 100 = very dangerous)
}

export interface FormInfo {
  action: string;
  method: string;
  id: string;
  hasPassword: boolean;
  hasEmail: boolean;
  hasCreditCard: boolean;
  isExternalAction: boolean;
}

export interface ScriptInfo {
  url: string;
  isExternal: boolean;
  domain: string | null;
  size: number;
  isKnown: boolean;
}

export interface TrackerInfo {
  domain: string;
  type: string; // 'pixel', 'script', 'iframe'
  url: string;
}

export interface TyposquatResult {
  suspectedTarget: string;
  distance: number;
  domain: string;
  substitution?: boolean;
}

// Deep scan size limit (1MB)
const MAX_SCAN_SIZE = 1024 * 1024;

// Inline script extraction regex
const INLINE_SCRIPT_REGEX = /<script[^>]*>([\s\S]*?)<\/script>/gi;

/** Convert octal IP notation to decimal (e.g., 0177.0.0.01 → 127.0.0.1) */
function octalIpToDecimal(octalIp: string): string {
  return octalIp.split('.').map(part => parseInt(part, 8).toString()).join('.');
}

// High-value domains to check for typosquatting
const TYPOSQUAT_TARGETS = [
  'paypal.com', 'google.com', 'facebook.com', 'linkedin.com',
  'github.com', 'amazon.com', 'microsoft.com', 'apple.com',
  'twitter.com', 'instagram.com', 'netflix.com', 'bankofamerica.com',
  'chase.com', 'wellsfargo.com', 'youtube.com', 'reddit.com',
  'outlook.com', 'yahoo.com', 'gmail.com', 'dropbox.com',
];

/**
 * ContentAnalyzer — Analyzes page content for phishing indicators and security risks.
 *
 * Performs async page analysis via Runtime.evaluate through DevToolsManager:
 * - Form inspection (password fields, external actions, credit card fields)
 * - Script inventory (external scripts, known vs unknown)
 * - Typosquatting detection (Levenshtein distance against high-value domains)
 * - Mixed content detection (HTTP resources on HTTPS pages)
 * - Hidden iframe detection
 * - Tracker inventory
 */
export class ContentAnalyzer {
  private db: SecurityDB;
  private devToolsManager: DevToolsManager;

  /** Callback to check if a domain is on the blocklist (wired by SecurityManager) */
  isDomainBlocked: ((domain: string) => boolean) | null = null;

  constructor(db: SecurityDB, devToolsManager: DevToolsManager) {
    this.db = db;
    this.devToolsManager = devToolsManager;
  }

  /** Full page analysis (called after page load — async is fine here) */
  async analyzePage(): Promise<PageAnalysis> {
    const wc = this.devToolsManager.getAttachedWebContents();
    const currentUrl = wc ? wc.getURL() : '';
    const domain = this.extractDomain(currentUrl);
    const isHttps = currentUrl.startsWith('https://');

    const analysis: PageAnalysis = {
      url: currentUrl,
      domain,
      timestamp: Date.now(),
      forms: [],
      scripts: [],
      security: {
        isHttps,
        hasPasswordOnHttp: false,
        mixedContent: false,
        hiddenIframesWithForms: 0,
        typosquat: null,
        missingHeaders: [],
      },
      trackers: [],
      riskScore: 0,
    };

    try {
      // 1. Analyze forms
      const formResult = await this.devToolsManager.sendCommand('Runtime.evaluate', {
        expression: `JSON.stringify(Array.from(document.forms).map(f => ({
          action: f.action || '',
          method: (f.method || 'GET').toUpperCase(),
          id: f.id || '',
          hasPassword: !!f.querySelector('input[type=password]'),
          hasEmail: !!f.querySelector('input[type=email]'),
          hasCreditCard: !!(f.querySelector('input[autocomplete*=cc-]') || f.querySelector('input[name*=card]') || f.querySelector('input[name*=credit]')),
        })))`,
        returnByValue: true,
      });
      if (formResult.result?.value) {
        const forms = JSON.parse(formResult.result.value);
        analysis.forms = forms.map((f: any) => ({
          ...f,
          isExternalAction: f.action ? this.isExternalUrl(f.action, domain) : false,
        }));
      }

      // 2. Check for password fields on HTTP
      if (!isHttps && analysis.forms.some(f => f.hasPassword)) {
        analysis.security.hasPasswordOnHttp = true;
        this.db.logEvent({
          timestamp: Date.now(),
          domain,
          tabId: null,
          eventType: 'warned',
          severity: 'high',
          category: 'form',
          details: JSON.stringify({ url: currentUrl, reason: 'password-on-http' }),
          actionTaken: 'flagged',
          confidence: AnalysisConfidence.HEURISTIC,
        });
      }

      // 3. Analyze scripts
      const scriptResult = await this.devToolsManager.sendCommand('Runtime.evaluate', {
        expression: `JSON.stringify(Array.from(document.querySelectorAll('script[src]')).map(s => ({
          url: s.src || '',
          size: 0,
        })))`,
        returnByValue: true,
      });
      if (scriptResult.result?.value) {
        const scripts = JSON.parse(scriptResult.result.value);
        analysis.scripts = scripts.map((s: any) => {
          const scriptDomain = this.extractDomain(s.url);
          const isExternal = scriptDomain !== domain;
          const isKnown = scriptDomain ? !!this.db.getScriptFingerprint(scriptDomain, s.url) : false;
          return { url: s.url, isExternal, domain: scriptDomain, size: s.size, isKnown };
        });
      }

      // 4. Check for hidden iframes with forms
      const iframeResult = await this.devToolsManager.sendCommand('Runtime.evaluate', {
        expression: `(function() {
          var count = 0;
          document.querySelectorAll('iframe').forEach(function(iframe) {
            var style = window.getComputedStyle(iframe);
            var hidden = style.display === 'none' || style.visibility === 'hidden' ||
                         parseInt(style.width) <= 1 || parseInt(style.height) <= 1 ||
                         style.opacity === '0';
            if (hidden) count++;
          });
          return count;
        })()`,
        returnByValue: true,
      });
      if (iframeResult.result?.value) {
        analysis.security.hiddenIframesWithForms = iframeResult.result.value;
      }

      // 5. Check mixed content
      if (isHttps) {
        const mixedResult = await this.devToolsManager.sendCommand('Runtime.evaluate', {
          expression: `(function() {
            var mixed = false;
            document.querySelectorAll('img[src^="http:"], script[src^="http:"], link[href^="http:"], iframe[src^="http:"]').forEach(function() { mixed = true; });
            return mixed;
          })()`,
          returnByValue: true,
        });
        if (mixedResult.result?.value) {
          analysis.security.mixedContent = true;
        }
      }

      // 6. Find trackers
      if (scriptResult.result?.value) {
        const scripts = JSON.parse(scriptResult.result.value);
        for (const s of scripts) {
          const sDomain = this.extractDomain(s.url);
          if (sDomain && KNOWN_TRACKERS.has(sDomain)) {
            analysis.trackers.push({ domain: sDomain, type: 'script', url: s.url });
          }
        }
      }

      // Also check for tracking pixels
      const pixelResult = await this.devToolsManager.sendCommand('Runtime.evaluate', {
        expression: `JSON.stringify(Array.from(document.querySelectorAll('img[width="1"][height="1"], img[style*="display:none"], img[style*="display: none"]')).map(i => i.src).filter(Boolean).slice(0, 20))`,
        returnByValue: true,
      });
      if (pixelResult.result?.value) {
        const pixels = JSON.parse(pixelResult.result.value);
        for (const url of pixels) {
          const pDomain = this.extractDomain(url);
          if (pDomain) {
            analysis.trackers.push({ domain: pDomain, type: 'pixel', url });
          }
        }
      }

    } catch (e: any) {
      console.warn('[ContentAnalyzer] Page analysis error:', e.message);
    }

    // 7. Typosquatting check
    if (domain) {
      analysis.security.typosquat = this.checkTyposquatting(domain);
      if (analysis.security.typosquat) {
        this.db.logEvent({
          timestamp: Date.now(),
          domain,
          tabId: null,
          eventType: 'warned',
          severity: 'high',
          category: 'network',
          details: JSON.stringify({
            reason: 'typosquatting',
            ...analysis.security.typosquat,
          }),
          actionTaken: 'flagged',
          confidence: AnalysisConfidence.ANOMALY,
        });
      }
    }

    // 8. Deep page source scan (CyberChef-inspired regex extraction)
    await this.deepScanPageSource(domain);

    // Calculate risk score
    analysis.riskScore = this.calculateRiskScore(analysis);

    return analysis;
  }

  /**
   * Deep page source scan — extracts URLs, domains, and IPs from raw page HTML.
   * Checks found URLs/domains against the blocklist, flags octal IPs.
   * Also scans inline <script> blocks separately.
   */
  private async deepScanPageSource(pageDomain: string | null): Promise<void> {
    try {
      const sourceResult = await this.devToolsManager.sendCommand('Runtime.evaluate', {
        expression: 'document.documentElement.outerHTML',
        returnByValue: true,
      });
      if (!sourceResult.result?.value) return;

      let source: string = sourceResult.result.value;
      if (source.length > MAX_SCAN_SIZE) {
        source = source.substring(0, MAX_SCAN_SIZE);
      }

      // Scan the full page source
      this.scanSourceForThreats(source, pageDomain, 'page');

      // Extract and scan inline script blocks separately
      let match: RegExpExecArray | null;
      const scriptRegex = new RegExp(INLINE_SCRIPT_REGEX.source, INLINE_SCRIPT_REGEX.flags);
      while ((match = scriptRegex.exec(source)) !== null) {
        const scriptContent = match[1];
        if (scriptContent && scriptContent.trim().length > 0) {
          this.scanSourceForThreats(scriptContent, pageDomain, 'inline-script');
        }
      }
    } catch (e: any) {
      console.warn('[ContentAnalyzer] Deep scan error:', e.message);
    }
  }

  /**
   * Scan a source string for blocked URLs/domains and suspicious IPs.
   * @param source - The source text to scan
   * @param pageDomain - The current page domain (to avoid self-flagging)
   * @param sourceType - Where the source came from ('page' or 'inline-script')
   */
  private scanSourceForThreats(source: string, pageDomain: string | null, sourceType: string): void {
    // 1. Extract and check URLs
    const urlRegex = new RegExp(URL_REGEX.source, URL_REGEX.flags);
    let match: RegExpExecArray | null;
    while ((match = urlRegex.exec(source)) !== null) {
      const foundUrl = match[0];
      const domain = this.extractDomain(foundUrl);
      if (!domain || domain === pageDomain) continue;
      this.checkDomainAgainstBlocklist(domain, foundUrl, match.index, source, pageDomain);
    }

    // 2. Extract and check bare domains
    const domainRegex = new RegExp(DOMAIN_REGEX.source, DOMAIN_REGEX.flags);
    while ((match = domainRegex.exec(source)) !== null) {
      const foundDomain = match[0].toLowerCase();
      if (foundDomain === pageDomain) continue;
      this.checkDomainAgainstBlocklist(foundDomain, null, match.index, source, pageDomain);
    }

    // 3. Check for octal IPs (evasion technique)
    const octalRegex = new RegExp(IPV4_OCTAL_REGEX.source, IPV4_OCTAL_REGEX.flags);
    while ((match = octalRegex.exec(source)) !== null) {
      const octalIp = match[0];
      const decimalIp = octalIpToDecimal(octalIp);
      const context = source.substring(
        Math.max(0, match.index - 50),
        Math.min(source.length, match.index + octalIp.length + 50)
      );

      this.db.logEvent({
        timestamp: Date.now(),
        domain: pageDomain,
        tabId: null,
        eventType: 'octal-ip-evasion',
        severity: 'medium',
        category: 'network',
        details: JSON.stringify({
          octalIp,
          decimalIp,
          sourceType,
          context,
        }),
        actionTaken: 'flagged',
        confidence: AnalysisConfidence.HEURISTIC,
      });
    }
  }

  /** Check a domain against the blocklist and log an event if blocked */
  private checkDomainAgainstBlocklist(
    domain: string, url: string | null, offset: number, source: string, pageDomain: string | null
  ): void {
    if (!this.isDomainBlocked) return;
    if (!this.isDomainBlocked(domain)) return;

    const context = source.substring(
      Math.max(0, offset - 50),
      Math.min(source.length, offset + (url || domain).length + 50)
    );

    this.db.logEvent({
      timestamp: Date.now(),
      domain: pageDomain,
      tabId: null,
      eventType: 'hidden-blocked-url',
      severity: 'high',
      category: 'network',
      details: JSON.stringify({
        blockedDomain: domain,
        url: url || undefined,
        context,
      }),
      actionTaken: 'flagged',
      confidence: AnalysisConfidence.BLOCKLIST,
    });
  }

  /** Check if a domain is a potential typosquat of a high-value target */
  checkTyposquatting(domain: string): TyposquatResult | null {
    // Strip www. prefix for comparison
    const cleanDomain = domain.replace(/^www\./, '');

    for (const target of TYPOSQUAT_TARGETS) {
      // Skip exact matches
      if (cleanDomain === target) continue;

      // Levenshtein distance check
      const distance = this.levenshtein(cleanDomain, target);
      if (distance > 0 && distance <= 2) {
        return { suspectedTarget: target, distance, domain: cleanDomain };
      }

      // Common substitution check: l→1, o→0, rn→m, i→l
      if (this.hasCommonSubstitution(cleanDomain, target)) {
        return { suspectedTarget: target, distance: 1, domain: cleanDomain, substitution: true };
      }
    }
    return null;
  }

  /** Levenshtein distance between two strings */
  private levenshtein(a: string, b: string): number {
    const m = a.length;
    const n = b.length;
    const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,      // deletion
          dp[i][j - 1] + 1,      // insertion
          dp[i - 1][j - 1] + cost // substitution
        );
      }
    }
    return dp[m][n];
  }

  /** Check for common visual substitutions used in typosquatting */
  private hasCommonSubstitution(domain: string, target: string): boolean {
    const substitutions: [string, string][] = [
      ['l', '1'], ['1', 'l'],
      ['o', '0'], ['0', 'o'],
      ['rn', 'm'], ['m', 'rn'],
      ['i', 'l'], ['l', 'i'],
      ['vv', 'w'], ['w', 'vv'],
      ['cl', 'd'], ['d', 'cl'],
    ];

    for (const [from, to] of substitutions) {
      const replaced = domain.replace(from, to);
      if (replaced === target) return true;
    }
    return false;
  }

  /** Check if a URL points to an external domain */
  private isExternalUrl(url: string, pageDomain: string | null): boolean {
    if (!pageDomain) return false;
    const urlDomain = this.extractDomain(url);
    if (!urlDomain) return false;
    return urlDomain !== pageDomain && !urlDomain.endsWith('.' + pageDomain);
  }

  /** Calculate composite risk score from analysis results */
  private calculateRiskScore(analysis: PageAnalysis): number {
    let score = 0;

    if (!analysis.security.isHttps) score += 15;
    if (analysis.security.hasPasswordOnHttp) score += 30;
    if (analysis.security.mixedContent) score += 10;
    if (analysis.security.hiddenIframesWithForms > 0) score += 20;
    if (analysis.security.typosquat) score += 35;

    // External form actions with password fields
    const suspiciousForms = analysis.forms.filter(f => f.isExternalAction && (f.hasPassword || f.hasCreditCard));
    score += suspiciousForms.length * 25;

    // Unknown external scripts
    const unknownExternalScripts = analysis.scripts.filter(s => s.isExternal && !s.isKnown);
    score += Math.min(unknownExternalScripts.length * 5, 20);

    return Math.min(score, 100);
  }

  private extractDomain(url: string): string | null {
    try {
      return new URL(url).hostname.toLowerCase();
    } catch {
      return null;
    }
  }
}
