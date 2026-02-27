import { createHash } from 'crypto';
import * as acorn from 'acorn';
import { SecurityDB } from './security-db';
import { Guardian } from './guardian';
import { DevToolsManager } from '../devtools/manager';
import { JS_THREAT_RULES, ThreatRuleMatch, ScriptAnalysisResult, AnalysisConfidence } from './types';
import {
  calculateEntropy,
  normalizeScriptSource,
  computeASTHash,
  computeASTFeatureVector,
  computeSimilarity,
  parseToAST,
} from './script-utils';

// Re-export pure functions for backward compatibility
export { calculateEntropy, normalizeScriptSource, computeASTHash, computeSimilarity } from './script-utils';

// Phase 6-A: AST parsing + hashing (Ghidra BSim-inspired obfuscation-resistant fingerprinting)
const MAX_AST_PARSE_SIZE = 200 * 1024; // 200KB — larger scripts too expensive to parse

// Phase 6-B: Similarity scoring — cosine similarity between AST feature vectors
const SIMILARITY_THRESHOLD = 0.85;    // "structurally similar" — flag for review
const SIMILARITY_IDENTICAL = 0.95;    // "structurally identical" — same as AST hash match

// Entropy thresholds (reference: normal JS = 4.5-5.5, minified = 5.0-5.8, obfuscated = 5.8-6.5, encrypted = 7.5-8.0)
const ENTROPY_THRESHOLD = 6.0;
const ENTROPY_HIGH = 6.5;
const ENTROPY_CRITICAL = 7.0;
const ENTROPY_MIN_LENGTH = 1000;
const ENTROPY_MAX_LENGTH = 500_000; // 500KB
const MAX_SCRIPT_SIZE = 500 * 1024; // 500KB — skip analysis for very large scripts

/** Run JS_THREAT_RULES against script source, return scored analysis result */
function analyzeScriptContent(source: string, url: string): ScriptAnalysisResult {
  const matches: ThreatRuleMatch[] = [];
  let totalScore = 0;

  for (const rule of JS_THREAT_RULES) {
    const match = rule.pattern.exec(source);
    if (match) {
      totalScore += rule.score;
      matches.push({
        rule,
        offset: match.index,
        matchedText: match[0].substring(0, 100),
      });
    }
  }

  let severity: ScriptAnalysisResult['severity'] = 'none';
  if (totalScore >= 50) severity = 'critical';
  else if (totalScore >= 30) severity = 'high';
  else if (totalScore >= 15) severity = 'medium';
  else if (totalScore > 0) severity = 'low';

  return {
    totalScore,
    matches,
    severity,
    scriptUrl: url,
    scriptLength: source.length,
  };
}

/**
 * ScriptGuard — CDP-based script analysis and security monitor injection.
 *
 * Uses the DevToolsManager subscriber system to:
 * 1. Track all loaded scripts via Debugger.scriptParsed
 * 2. Fingerprint scripts per domain (detect new/changed scripts)
 * 3. Shannon entropy analysis on external scripts (detect obfuscation)
 * 4. Inject invisible security monitors via Runtime.addBinding:
 *    - Keylogger detection (addEventListener on input fields from external scripts)
 *    - Crypto miner detection (WebAssembly.instantiate monitoring)
 *    - Clipboard hijack detection (clipboard.readText monitoring)
 *    - Form action hijack detection (form.action setter monitoring)
 *
 * IMPORTANT: Security monitor injections do NOT overlap with Stealth injections:
 *   Stealth: canvas, WebGL, fonts, audio, timing, navigator
 *   Security: addEventListener, WebAssembly, clipboard, form.action
 */
export class ScriptGuard {
  private db: SecurityDB;
  private guardian: Guardian;
  private devToolsManager: DevToolsManager;
  private monitorInjected = false;
  private scriptsParsed: Map<string, { url: string; length: number }> = new Map();
  private wasmEvents: number[] = []; // timestamps of WASM instantiations
  /** URLs fully analyzed this session — skip re-analysis on reload/navigation within same tab */
  private analyzedUrls: Set<string> = new Set();

  /** Callback for critical script-analysis detections (wired by SecurityManager for Gatekeeper notification) */
  onCriticalDetection: ((domain: string, analysis: ScriptAnalysisResult) => void) | null = null;

  /** Callback for checking if a domain is blocked (wired by SecurityManager to NetworkShield.checkDomain) */
  isDomainBlocked: ((domain: string) => boolean) | null = null;

  constructor(db: SecurityDB, guardian: Guardian, devToolsManager: DevToolsManager) {
    this.db = db;
    this.guardian = guardian;
    this.devToolsManager = devToolsManager;
    this.registerSubscriptions();
  }

  private registerSubscriptions(): void {
    this.devToolsManager.subscribe({
      name: 'ScriptGuard',
      events: ['Debugger.scriptParsed', 'Runtime.consoleAPICalled'],
      handler: (method, params) => {
        switch (method) {
          case 'Debugger.scriptParsed':
            this.analyzeScript(params);
            break;
          case 'Runtime.consoleAPICalled':
            this.monitorConsole(params);
            break;
        }
      }
    });
  }

  /** Analyze every loaded script (called via CDP Debugger.scriptParsed) */
  private analyzeScript(scriptInfo: Record<string, unknown>): void {
    const scriptId = scriptInfo.scriptId as string;
    const url = scriptInfo.url as string | undefined;
    const length = scriptInfo.length as number | undefined;
    const hash = scriptInfo.hash as string | undefined;

    // Skip inline scripts (no URL), chrome-extension, devtools, and debugger scripts
    if (!url || url.startsWith('chrome-extension://') || url.startsWith('devtools://') || url.startsWith('debugger://')) return;

    // Track in memory
    this.scriptsParsed.set(scriptId, { url, length: length || 0 });

    const domain = this.extractDomain(url);
    if (!domain) return;

    // 1. Check script fingerprint database
    const known = this.db.getScriptFingerprint(domain, url);
    if (known?.trusted) return; // Known and trusted — skip

    // 2. NEW script on a domain we've visited before → FLAG
    if (!known) {
      const domainInfo = this.db.getDomainInfo(domain);
      if (domainInfo && domainInfo.visitCount > 3) {
        this.db.logEvent({
          timestamp: Date.now(),
          domain,
          tabId: null,
          eventType: 'warned',
          severity: 'medium',
          category: 'script',
          details: JSON.stringify({ url: url.substring(0, 500), reason: 'new-script-on-known-domain', length }),
          actionTaken: 'flagged',
          confidence: AnalysisConfidence.SPECULATIVE,
        });
      }
    }

    // 3. Store/update fingerprint
    this.db.upsertScriptFingerprint(domain, url, hash);

    // 3b. Cross-domain correlation (Phase 3-A) — fast-path if CDP provided a hash
    // (Reliable correlation from fetched source happens in analyzeExternalScript)
    if (hash && typeof hash === 'string' && hash.length > 0) {
      this.correlateScriptHash(hash, domain, url);
    }

    // 4. Static analysis + entropy for external scripts (async — fires in background)
    // Skip if already analyzed this session (same URL = same CDN script, no need to re-analyze)
    const scriptLength = length || 0;
    if (scriptLength <= MAX_SCRIPT_SIZE && !this.analyzedUrls.has(url)) {
      const pageDomain = this.getCurrentPageDomain();
      if (pageDomain && domain !== pageDomain) {
        this.analyzeExternalScript(scriptId, url, domain).catch(e => console.warn('[ScriptGuard] analyzeExternalScript failed:', e instanceof Error ? e.message : e));
      }
    }
  }

  /** Cross-domain correlation: check if a script hash appears on blocked or many domains (Phase 3-A, extended in Phase 3-B for normalized hashes) */
  private correlateScriptHash(hash: string, currentDomain: string, scriptUrl: string, hashType: 'original' | 'normalized' = 'original'): void {
    // Get all domains where this script hash has been seen
    const domains = hashType === 'normalized'
      ? this.db.getDomainsForNormalizedHash(hash)
      : this.db.getDomainsForHash(hash);
    const domainCount = domains.length;

    const hashLabel = hashType === 'normalized' ? 'normalizedHash' : 'hash';
    const reasonSuffix = hashType === 'normalized' ? '-normalized' : '';

    // 1. Check if this hash has been seen on any blocked domain
    if (this.isDomainBlocked) {
      for (const seenDomain of domains) {
        if (seenDomain === currentDomain) continue; // skip self
        if (this.isDomainBlocked(seenDomain)) {
          this.db.logEvent({
            timestamp: Date.now(),
            domain: currentDomain,
            tabId: null,
            eventType: 'script-on-blocked-domain',
            severity: 'critical',
            category: 'script',
            details: JSON.stringify({
              scriptUrl: scriptUrl.substring(0, 500),
              [hashLabel]: hash,
              blockedDomain: seenDomain,
              totalDomains: domainCount,
              reason: `script-hash-seen-on-blocked-domain${reasonSuffix}`,
            }),
            actionTaken: 'flagged',
            confidence: AnalysisConfidence.KNOWN_MALWARE_HASH,
          });
          // Notify Gatekeeper via critical detection callback
          this.onCriticalDetection?.(currentDomain, {
            totalScore: 100,
            matches: [],
            severity: 'critical',
            scriptUrl,
            scriptLength: 0,
          });
          return; // One blocked-domain event is enough
        }
      }
    }

    // 2. Flag scripts seen on 5+ distinct domains (could be CDN or malware kit)
    if (domainCount >= 5) {
      this.db.logEvent({
        timestamp: Date.now(),
        domain: currentDomain,
        tabId: null,
        eventType: 'widespread-script',
        severity: 'low',
        category: 'script',
        details: JSON.stringify({
          scriptUrl: scriptUrl.substring(0, 500),
          [hashLabel]: hash,
          domainCount,
          domains: domains.slice(0, 10), // cap at 10 for readability
          reason: `script-hash-on-many-domains${reasonSuffix}`,
        }),
        actionTaken: 'flagged',
        confidence: AnalysisConfidence.BEHAVIORAL,
      });
    }
  }

  /** Cross-domain AST correlation: catch obfuscated variants of malware (Phase 6-B) */
  private correlateAstHash(astHash: string, currentDomain: string, scriptUrl: string): void {
    const domains = this.db.getDomainsForAstHash(astHash);

    // 1. Check if any domain with the same AST structure is blocked
    if (this.isDomainBlocked) {
      for (const seenDomain of domains) {
        if (seenDomain === currentDomain) continue;
        if (this.isDomainBlocked(seenDomain)) {
          this.db.logEvent({
            timestamp: Date.now(),
            domain: currentDomain,
            tabId: null,
            eventType: 'obfuscated-script-from-blocked-domain',
            severity: 'critical',
            category: 'script',
            details: JSON.stringify({
              scriptUrl: scriptUrl.substring(0, 500),
              astHash,
              blockedDomain: seenDomain,
              totalDomains: domains.length,
              reason: 'ast-hash-matches-blocked-domain',
            }),
            actionTaken: 'flagged',
            confidence: AnalysisConfidence.KNOWN_MALWARE_HASH,
          });
          this.onCriticalDetection?.(currentDomain, {
            totalScore: 100,
            matches: [],
            severity: 'critical',
            scriptUrl,
            scriptLength: 0,
          });
          return; // One blocked-domain event is enough
        }
      }
    }

    // 2. Check for obfuscation variants: 3+ domains share same AST hash with different regular hashes
    if (domains.length >= 3) {
      const matches = this.db.getAstMatches(astHash);
      const distinctHashes = new Set(matches.map(m => m.scriptHash).filter(Boolean));
      if (distinctHashes.size >= 2) {
        // Same AST structure, different surface form = likely obfuscation variants
        this.db.logEvent({
          timestamp: Date.now(),
          domain: currentDomain,
          tabId: null,
          eventType: 'obfuscation-variant-detected',
          severity: 'medium',
          category: 'script',
          details: JSON.stringify({
            scriptUrl: scriptUrl.substring(0, 500),
            astHash,
            domainCount: domains.length,
            hashVariantCount: distinctHashes.size,
            domains: domains.slice(0, 10),
            reason: 'ast-same-structure-different-hashes',
          }),
          actionTaken: 'flagged',
          confidence: AnalysisConfidence.HEURISTIC,
        });
      }
    }
  }

  /** Approximate similarity matching for flagged scripts against stored feature vectors (Phase 6-B) */
  private runSimilarityCheck(astNode: acorn.Node, currentDomain: string, scriptUrl: string): void {
    const currentVector = computeASTFeatureVector(astNode);
    const currentAstHash = computeASTHash(astNode);

    // Get all scripts with stored feature vectors (capped at 200 for performance)
    const candidates = this.db.getScriptsWithAstFeatures();

    for (const candidate of candidates) {
      // Skip same domain (pointless) and exact AST hash matches (already caught by correlateAstHash)
      if (candidate.domain === currentDomain) continue;
      if (candidate.astHash === currentAstHash) continue;

      // Phase 8: Compare against ALL cross-domain scripts (not just blocked)
      // Blocked-domain status determines severity, not eligibility
      const isBlocked = this.isDomainBlocked?.(candidate.domain) ?? false;

      // Deserialize stored feature vector
      let storedVector: Map<string, number>;
      try {
        const entries = JSON.parse(candidate.astFeatures) as [string, number][];
        storedVector = new Map(entries);
      } catch {
        continue; // Invalid stored data — skip
      }

      const similarity = computeSimilarity(currentVector, storedVector);

      if (similarity >= SIMILARITY_IDENTICAL) {
        // Structurally identical (but different AST hash — edge case)
        const severity = isBlocked ? 'critical' : 'medium';
        const reason = isBlocked ? 'structurally-identical-to-blocked-script' : 'structurally-identical-cross-domain';
        this.db.logEvent({
          timestamp: Date.now(),
          domain: currentDomain,
          tabId: null,
          eventType: 'ast-similarity-match',
          severity,
          category: 'script',
          details: JSON.stringify({
            scriptUrl: scriptUrl.substring(0, 500),
            similarity: Math.round(similarity * 1000) / 1000,
            matchedDomain: candidate.domain,
            matchedUrl: candidate.scriptUrl.substring(0, 500),
            matchedDomainBlocked: isBlocked,
            reason,
          }),
          actionTaken: 'flagged',
          confidence: isBlocked ? AnalysisConfidence.HEURISTIC : AnalysisConfidence.ANOMALY,
        });
        if (isBlocked) {
          this.onCriticalDetection?.(currentDomain, {
            totalScore: 100,
            matches: [],
            severity: 'critical',
            scriptUrl,
            scriptLength: 0,
          });
        }
      } else if (similarity >= SIMILARITY_THRESHOLD) {
        // Structurally similar — flag for review
        const severity = isBlocked ? 'high' : 'low';
        const reason = isBlocked ? 'structurally-similar-to-blocked-script' : 'structurally-similar-cross-domain';
        this.db.logEvent({
          timestamp: Date.now(),
          domain: currentDomain,
          tabId: null,
          eventType: 'ast-similarity-match',
          severity,
          category: 'script',
          details: JSON.stringify({
            scriptUrl: scriptUrl.substring(0, 500),
            similarity: Math.round(similarity * 1000) / 1000,
            matchedDomain: candidate.domain,
            matchedUrl: candidate.scriptUrl.substring(0, 500),
            matchedDomainBlocked: isBlocked,
            reason,
          }),
          actionTaken: 'flagged',
          confidence: isBlocked ? AnalysisConfidence.HEURISTIC : AnalysisConfidence.ANOMALY,
        });
      }
    }
  }

  /** Get the current page domain from the attached webContents */
  private getCurrentPageDomain(): string | null {
    const wc = this.devToolsManager.getAttachedWebContents();
    if (!wc) return null;
    return this.extractDomain(wc.getURL());
  }

  /** Combined static analysis + entropy check on external script source via CDP */
  private async analyzeExternalScript(scriptId: string, url: string, domain: string): Promise<void> {
    try {
      const result = await this.devToolsManager.sendCommand('Debugger.getScriptSource', { scriptId });
      const source = (result as any)?.scriptSource;
      if (!source || typeof source !== 'string') return;
      if (source.length > MAX_SCRIPT_SIZE) return;

      const perfStart = performance.now();

      // 0. Compute reliable script_hash from source (Phase 8 — CDP hash param is unreliable)
      const sourceHash = createHash('sha256').update(source).digest('hex');
      this.db.updateScriptHash(domain, url, sourceHash);
      this.correlateScriptHash(sourceHash, domain, url);

      // 0a. Compute and store normalized hash (Phase 3-B)
      const normalized = normalizeScriptSource(source);
      const normalizedHash = createHash('sha256').update(normalized).digest('hex');
      this.db.updateNormalizedHash(domain, url, normalizedHash);

      // 0b. Cross-domain correlation on normalized hash (Phase 3-B)
      this.correlateScriptHash(normalizedHash, domain, url, 'normalized');

      // 0c. AST hash for obfuscation-resistant fingerprinting (Phase 6-A)
      let astNode: acorn.Node | null = null;
      if (source.length <= MAX_AST_PARSE_SIZE) {
        astNode = parseToAST(source);
        if (astNode) {
          const astHash = computeASTHash(astNode);
          this.db.updateAstHash(domain, url, astHash);

          // 0d. Compute and store feature vector for similarity scoring (Phase 6-B)
          const featureVector = computeASTFeatureVector(astNode);
          const serialized = JSON.stringify(Array.from(featureVector.entries()));
          this.db.updateAstFeatures(domain, url, serialized);

          // 0e. Cross-domain AST correlation (Phase 6-B)
          this.correlateAstHash(astHash, domain, url);
        }
        // If parse fails (syntax error), ast_hash stays null — graceful degradation
      }

      // 1. Run rule engine
      const analysis = analyzeScriptContent(source, url);

      // 2. Run entropy check (if within size bounds)
      let entropy: number | undefined;
      if (source.length >= ENTROPY_MIN_LENGTH && source.length <= ENTROPY_MAX_LENGTH) {
        entropy = calculateEntropy(source);
        analysis.entropy = entropy;

        // Boost score by 25% if both high entropy AND rules match (Phase 2-B.4)
        if (entropy >= ENTROPY_THRESHOLD && analysis.matches.length > 0) {
          analysis.totalScore = Math.round(analysis.totalScore * 1.25);
          // Recalculate severity with boosted score
          if (analysis.totalScore >= 50) analysis.severity = 'critical';
          else if (analysis.totalScore >= 30) analysis.severity = 'high';
          else if (analysis.totalScore >= 15) analysis.severity = 'medium';
        }
      }

      // 3. Log entropy event if high (preserves Phase 1 behavior)
      if (entropy !== undefined && entropy >= ENTROPY_THRESHOLD) {
        const entropySeverity = entropy >= ENTROPY_CRITICAL ? 'critical' : entropy >= ENTROPY_HIGH ? 'high' : 'medium';
        this.db.logEvent({
          timestamp: Date.now(),
          domain,
          tabId: null,
          eventType: 'warned',
          severity: entropySeverity,
          category: 'script',
          details: JSON.stringify({
            url: url.substring(0, 500),
            reason: 'high-entropy-script',
            entropy: Math.round(entropy * 100) / 100,
            length: source.length,
          }),
          actionTaken: 'flagged',
          confidence: AnalysisConfidence.ANOMALY,
        });
      }

      // 4. Log rule engine results
      if (analysis.severity !== 'none') {
        const ruleConfidence = (analysis.severity === 'critical' || analysis.severity === 'high')
          ? AnalysisConfidence.HEURISTIC
          : AnalysisConfidence.ANOMALY;
        this.db.logEvent({
          timestamp: Date.now(),
          domain,
          tabId: null,
          eventType: 'script-analysis',
          severity: analysis.severity as 'low' | 'medium' | 'high' | 'critical',
          category: 'script',
          details: JSON.stringify({
            totalScore: analysis.totalScore,
            matchCount: analysis.matches.length,
            topMatches: analysis.matches.slice(0, 5).map(m => ({
              ruleId: m.rule.id,
              category: m.rule.category,
              score: m.rule.score,
              matchedText: m.matchedText,
            })),
            scriptUrl: analysis.scriptUrl.substring(0, 500),
            scriptLength: analysis.scriptLength,
            entropy: analysis.entropy,
          }),
          actionTaken: 'flagged',
          confidence: ruleConfidence,
        });

        // 5. For critical severity: notify Gatekeeper via callback
        if (analysis.severity === 'critical') {
          this.onCriticalDetection?.(domain, analysis);
        }
      }

      // 6. Similarity scoring for flagged scripts (Phase 6-B)
      // Only run for scripts that triggered rules or had high entropy (performance gate)
      const isFlagged = analysis.severity !== 'none' || (entropy !== undefined && entropy >= ENTROPY_THRESHOLD);
      if (isFlagged && astNode) {
        this.runSimilarityCheck(astNode, domain, url);
      }

      // Mark URL as analyzed so reloads/navigations within this session skip re-analysis
      this.analyzedUrls.add(url);

      const perfMs = performance.now() - perfStart;
      if (perfMs > 50) {
        console.warn(`[ScriptGuard] Slow analysis: ${url} took ${perfMs.toFixed(1)}ms`);
      }
    } catch {
      // CDP command failed (tab closed, debugger detached) — silently ignore
    }
  }

  /** Monitor console for suspicious patterns */
  private monitorConsole(params: Record<string, unknown>): void {
    // Watch for crypto mining indicators in console
    if (params.type === 'error' || params.type === 'warning') {
      const text = ((params.args as Record<string, unknown>[]) || []).map((a: Record<string, unknown>) => (a.value as string) || (a.description as string) || '').join(' ');
      if (/coinhive|cryptonight|monero|minero|coinbase.*miner/i.test(text)) {
        this.db.logEvent({
          timestamp: Date.now(),
          domain: null,
          tabId: null,
          eventType: 'warned',
          severity: 'high',
          category: 'script',
          details: JSON.stringify({ reason: 'crypto-miner-console', text: text.substring(0, 500) }),
          actionTaken: 'flagged',
          confidence: AnalysisConfidence.HEURISTIC,
        });
      }
    }
  }

  /**
   * Inject security monitor code into the current page.
   * Uses Runtime.addBinding (invisible to page — same pattern as Copilot Vision).
   * Uses Page.addScriptToEvaluateOnNewDocument for persistence across navigations.
   */
  async injectMonitors(): Promise<void> {
    if (this.monitorInjected) return;

    const monitorScript = `(function() {
      // Guard against double-injection
      if (window.__tandemSecurityMonitorsActive) return;
      window.__tandemSecurityMonitorsActive = true;

      // === Keylogger detection ===
      var origAddEventListener = EventTarget.prototype.addEventListener;
      EventTarget.prototype.addEventListener = function(type, listener, options) {
        if ((type === 'keydown' || type === 'keypress' || type === 'keyup') &&
            (this instanceof HTMLInputElement || this instanceof HTMLTextAreaElement)) {
          try {
            var stack = new Error().stack || '';
            if (typeof __tandemSecurityAlert === 'function') {
              __tandemSecurityAlert(JSON.stringify({
                type: 'keylogger_suspect',
                eventType: type,
                elementTag: this.tagName,
                elementName: this.name || this.id || 'unknown',
                callerStack: stack.substring(0, 500),
              }));
            }
          } catch(e) {}
        }
        return origAddEventListener.call(this, type, listener, options);
      };

      // === Crypto miner detection (WebAssembly) ===
      if (typeof WebAssembly !== 'undefined' && WebAssembly.instantiate) {
        var origWasmInstantiate = WebAssembly.instantiate;
        WebAssembly.instantiate = function() {
          try {
            if (typeof __tandemSecurityAlert === 'function') {
              __tandemSecurityAlert(JSON.stringify({
                type: 'wasm_instantiate',
                timestamp: Date.now(),
              }));
            }
          } catch(e) {}
          return origWasmInstantiate.apply(this, arguments);
        };
      }

      // === Clipboard hijack detection ===
      if (navigator.clipboard && navigator.clipboard.readText) {
        var origClipboardRead = navigator.clipboard.readText.bind(navigator.clipboard);
        navigator.clipboard.readText = function() {
          try {
            if (typeof __tandemSecurityAlert === 'function') {
              __tandemSecurityAlert(JSON.stringify({
                type: 'clipboard_read',
                timestamp: Date.now(),
              }));
            }
          } catch(e) {}
          return origClipboardRead.apply(this, arguments);
        };
      }

      // === Form action hijack detection ===
      var formActionDescriptor = Object.getOwnPropertyDescriptor(HTMLFormElement.prototype, 'action');
      if (formActionDescriptor && formActionDescriptor.set) {
        var origSet = formActionDescriptor.set;
        Object.defineProperty(HTMLFormElement.prototype, 'action', {
          get: formActionDescriptor.get,
          set: function(value) {
            try {
              if (typeof __tandemSecurityAlert === 'function') {
                __tandemSecurityAlert(JSON.stringify({
                  type: 'form_action_change',
                  newAction: String(value).substring(0, 200),
                  formId: this.id || 'unknown',
                }));
              }
            } catch(e) {}
            return origSet.call(this, value);
          },
          enumerable: formActionDescriptor.enumerable,
          configurable: formActionDescriptor.configurable,
        });
      }
    })();`;

    try {
      // Register the binding FIRST (invisible CDP-level binding)
      await this.devToolsManager.sendCommand('Runtime.addBinding', {
        name: '__tandemSecurityAlert',
      });

      // Subscribe to binding calls
      this.devToolsManager.subscribe({
        name: 'ScriptGuard:Alerts',
        events: ['Runtime.bindingCalled'],
        handler: (_method, params) => {
          if (params.name === '__tandemSecurityAlert') {
            try {
              this.handleSecurityAlert(JSON.parse(params.payload as string));
            } catch { /* invalid JSON */ }
          }
        }
      });

      // Inject as persistent script (survives navigations)
      await this.devToolsManager.sendCommand('Page.addScriptToEvaluateOnNewDocument', {
        source: monitorScript,
        worldName: '', // main world — must see page scripts
      });

      // Also run immediately on current page
      await this.devToolsManager.sendCommand('Runtime.evaluate', {
        expression: monitorScript,
        silent: true,
      });

      this.monitorInjected = true;
      console.log('[ScriptGuard] Security monitors injected');
    } catch (e) {
      console.warn('[ScriptGuard] Monitor injection failed:', e instanceof Error ? e.message : String(e));
    }
  }

  private handleSecurityAlert(alert: Record<string, unknown>): void {
    // Get current URL for domain context
    const wc = this.devToolsManager.getAttachedWebContents();
    const currentUrl = wc ? wc.getURL() : '';
    const domain = this.extractDomain(currentUrl);

    switch (alert.type) {
      case 'keylogger_suspect':
        this.db.logEvent({
          timestamp: Date.now(),
          domain,
          tabId: null,
          eventType: 'warned',
          severity: 'high',
          category: 'script',
          details: JSON.stringify(alert),
          actionTaken: 'flagged',
          confidence: AnalysisConfidence.BEHAVIORAL,
        });
        break;

      case 'wasm_instantiate':
        // Track WASM instantiation timestamps for crypto miner correlation
        this.wasmEvents.push(Date.now());
        // Keep only recent events (last 5 minutes)
        const fiveMinAgo = Date.now() - 5 * 60_000;
        this.wasmEvents = this.wasmEvents.filter(t => t > fiveMinAgo);

        this.db.logEvent({
          timestamp: Date.now(),
          domain,
          tabId: null,
          eventType: 'warned',
          severity: 'medium',
          category: 'behavior',
          details: JSON.stringify({ ...alert, domain, wasmCount: this.wasmEvents.length }),
          actionTaken: 'flagged',
          confidence: AnalysisConfidence.BEHAVIORAL,
        });
        break;

      case 'clipboard_read':
        this.db.logEvent({
          timestamp: Date.now(),
          domain,
          tabId: null,
          eventType: 'warned',
          severity: 'medium',
          category: 'behavior',
          details: JSON.stringify({ ...alert, domain }),
          actionTaken: 'flagged',
          confidence: AnalysisConfidence.BEHAVIORAL,
        });
        break;

      case 'form_action_change': {
        // Check if new action URL is external
        const newDomain = this.extractDomain(alert.newAction as string);
        if (newDomain && domain && newDomain !== domain) {
          this.db.logEvent({
            timestamp: Date.now(),
            domain,
            tabId: null,
            eventType: 'warned',
            severity: 'high',
            category: 'script',
            details: JSON.stringify({ ...alert, domain, externalTarget: newDomain }),
            actionTaken: 'flagged',
            confidence: AnalysisConfidence.BEHAVIORAL,
          });
        }
        break;
      }
    }
  }

  /** Get recent WASM event count (for crypto miner correlation in BehaviorMonitor) */
  getRecentWasmCount(): number {
    const fiveMinAgo = Date.now() - 5 * 60_000;
    this.wasmEvents = this.wasmEvents.filter(t => t > fiveMinAgo);
    return this.wasmEvents.length;
  }

  /** Get all scripts parsed in this session */
  getScriptsParsed(): Map<string, { url: string; length: number }> {
    return this.scriptsParsed;
  }

  /** Reset state (call on tab switch) */
  reset(): void {
    this.monitorInjected = false;
    this.scriptsParsed.clear();
    this.analyzedUrls.clear();
  }

  private extractDomain(url: string): string | null {
    try {
      return new URL(url).hostname.toLowerCase();
    } catch {
      return null;
    }
  }

  destroy(): void {
    this.devToolsManager.unsubscribe('ScriptGuard');
    this.devToolsManager.unsubscribe('ScriptGuard:Alerts');
  }
}
