/**
 * Prompt Injection Scanner Middleware
 *
 * Sits on API routes that return page content to AI agents.
 * Scans response data for prompt injection patterns and adds warnings.
 *
 * Affected routes: /page-content, /page-html, /snapshot, /snapshot/text, /execute-js
 *
 * Does NOT modify original content — adds `injectionWarnings` field to JSON responses.
 * Also: OS notification, visual banner in browser, security DB log, Gatekeeper alert.
 * Performance: ~1-5ms per request (regex-based, no external calls).
 */
import type { Request, Response, NextFunction } from 'express';
import { Notification, BrowserWindow } from 'electron';
import { PromptInjectionGuard } from '../../security/prompt-injection-guard';
import { createLogger } from '../../utils/logger';

const log = createLogger('InjectionScanner');
const guard = new PromptInjectionGuard();

/** Escape a string for safe embedding in JavaScript template literals and HTML attributes */
function escapeForJs(str: string): string {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/\$/g, '\\$')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Throttle notifications — max 1 per 30 seconds per domain
const lastNotificationTime = new Map<string, number>();
const NOTIFICATION_COOLDOWN_MS = 30_000;

// Block threshold — pages above this score get content replaced, not forwarded
const BLOCK_THRESHOLD = 70;

// User overrides — domains explicitly allowed to pass through after user action
const userOverrides = new Map<string, number>(); // domain → timestamp
const OVERRIDE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface InjectionWarning {
  riskScore: number;
  findingCount: number;
  summary: string;
  findings: Array<{
    id: string;
    severity: string;
    category: string;
    description: string;
    matchedText?: string;
  }>;
}

/**
 * Allow a domain to bypass injection blocking for 5 minutes.
 * Called when the user clicks "Override" in the banner.
 */
export function addInjectionOverride(domain: string): void {
  userOverrides.set(domain, Date.now());
  log.info(`Override granted for ${domain} — expires in 5 minutes`);
}

/**
 * Extract scannable text from various response shapes.
 */
function extractText(body: unknown): { text: string; html: string } {
  if (!body || typeof body !== 'object') return { text: '', html: '' };

  const obj = body as Record<string, unknown>;
  const parts: string[] = [];
  let html = '';

  // /page-content shape: { title, description, text, url }
  if (typeof obj.text === 'string') parts.push(obj.text);
  if (typeof obj.title === 'string') parts.push(obj.title);
  if (typeof obj.description === 'string') parts.push(obj.description);

  // /page-html shape: { html }
  if (typeof obj.html === 'string') {
    html = obj.html;
    parts.push(obj.html);
  }

  // /snapshot shape: { tree } or string
  if (typeof obj.tree === 'string') parts.push(obj.tree);
  if (typeof obj.snapshot === 'string') parts.push(obj.snapshot);

  // /execute-js shape: { result } or { value }
  if (typeof obj.result === 'string') parts.push(obj.result);
  if (typeof obj.value === 'string') parts.push(obj.value);

  // /snapshot/text shape: { text }
  // Already handled above via obj.text

  return { text: parts.join('\n'), html };
}

/**
 * Wrap res.json to intercept and scan the response before sending.
 */
export function injectionScannerMiddleware(req: Request, res: Response, next: NextFunction): void {
  const originalJson = res.json.bind(res);

  res.json = function (body: unknown): Response {
    // Only scan successful responses with content
    if (res.statusCode >= 400 || !body || typeof body !== 'object') {
      return originalJson(body);
    }

    try {
      const { text, html } = extractText(body);

      // Skip if there's nothing meaningful to scan
      if (text.length < 20) {
        return originalJson(body);
      }

      const report = guard.scan(text, html || undefined);

      if (!report.clean) {
        const warning: InjectionWarning = {
          riskScore: report.riskScore,
          findingCount: report.findings.length,
          summary: report.summary,
          findings: report.findings.map(f => ({
            id: f.ruleId || 'unknown',
            severity: f.severity,
            category: f.category,
            description: f.description,
            matchedText: f.matchedText?.substring(0, 100),
          })),
        };

        // Check if user has overridden for this domain
        const pageUrl = (body as Record<string, unknown>).url as string || req.path;
        let domain = 'unknown';
        try { domain = new URL(pageUrl).hostname; } catch { /* use default */ }

        const overrideTime = userOverrides.get(domain);
        const hasValidOverride = overrideTime && (Date.now() - overrideTime) < OVERRIDE_TTL_MS;

        // BLOCK: high risk + no override → do NOT send content to AI
        if (report.riskScore >= BLOCK_THRESHOLD && !hasValidOverride) {
          log.warn(
            `🛑 BLOCKED — Prompt injection on ${domain} (score ${report.riskScore}/100). ` +
            `Content NOT forwarded to AI. ${report.findings.length} finding(s).`
          );

          // 1. OS notification
          try {
            new Notification({
              title: '🛑 Page Blocked — Prompt Injection',
              body: `${domain} — Risk: ${report.riskScore}/100\n${warning.findings[0]?.description || ''}`,
              urgency: 'critical',
            }).show();
          } catch { /* best effort */ }

          // 2. Visual modal + red tab indicator
          try {
            const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
            if (win && !win.isDestroyed()) {
              const findingsHtml = warning.findings
                .slice(0, 5)
                .map(f => `<div style="padding:4px 0;border-bottom:1px solid rgba(255,255,255,0.1);"><span style="background:#991b1b;padding:1px 6px;border-radius:3px;font-size:10px;font-weight:bold;">${escapeForJs(f.severity.toUpperCase())}</span> ${escapeForJs(f.description)}${f.matchedText ? '<br><span style=\\"opacity:0.7;font-style:italic;\\">Matched: \\"' + escapeForJs(f.matchedText.substring(0, 80)) + '\\"</span>' : ''}</div>`)
                .join('');
              const safePageUrl = escapeForJs(pageUrl.substring(0, 120));
              const tabId = escapeForJs((req.headers['x-tab-id'] as string) || '');
              win.webContents.executeJavaScript(`
                (() => {
                  // Remove existing
                  const existing = document.getElementById('tandem-injection-overlay');
                  if (existing) existing.remove();

                  // Mark the tab red
                  const activeTab = document.querySelector('.tab[data-tab-id="${tabId}"]') || document.querySelector('.tab.active');
                  if (activeTab) {
                    activeTab.style.setProperty('background', '#dc2626', 'important');
                    activeTab.style.setProperty('color', 'white', 'important');
                    activeTab.dataset.injectionBlocked = 'true';
                  }

                  // Dark overlay
                  const overlay = document.createElement('div');
                  overlay.id = 'tandem-injection-overlay';
                  overlay.style.cssText = 'position:fixed;inset:0;z-index:999998;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;';

                  // Modal
                  const modal = document.createElement('div');
                  modal.style.cssText = 'background:#1a1a2e;border:2px solid #dc2626;border-radius:12px;padding:24px;max-width:560px;width:90%;color:white;font:13px/1.6 -apple-system,sans-serif;box-shadow:0 8px 32px rgba(220,38,38,0.3);';
                  modal.innerHTML = \`
                    <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;">
                      <span style="font-size:28px;">🛑</span>
                      <div>
                        <div style="font-size:16px;font-weight:bold;">Prompt Injection BLOCKED</div>
                        <div style="font-size:12px;opacity:0.7;">Risk: ${report.riskScore}/100</div>
                      </div>
                    </div>
                    <div style="background:rgba(220,38,38,0.15);border-radius:6px;padding:8px 12px;margin-bottom:12px;font-size:12px;">
                      <b>Source:</b> ${safePageUrl}
                    </div>
                    <div style="margin-bottom:16px;font-size:12px;">
                      <div style="margin-bottom:6px;font-weight:bold;opacity:0.8;">Detected threats:</div>
                      ${findingsHtml}
                    </div>
                    <div style="font-size:11px;opacity:0.6;margin-bottom:16px;">
                      Page content was NOT sent to your AI agent. No data was leaked.
                    </div>
                    <div style="display:flex;gap:8px;justify-content:flex-end;">
                      <button id="tandem-inj-dismiss" style="background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);color:white;padding:6px 16px;border-radius:6px;cursor:pointer;font-size:12px;">Close this alert</button>
                      <button id="tandem-inj-override" style="background:#dc2626;border:none;color:white;padding:6px 16px;border-radius:6px;cursor:pointer;font-size:12px;">⚠️ Override — Allow this page</button>
                    </div>
                  \`;

                  overlay.appendChild(modal);
                  document.body.appendChild(overlay);

                  // Dismiss = just close the modal, nothing else
                  document.getElementById('tandem-inj-dismiss').addEventListener('click', () => {
                    overlay.remove();
                  });

                  // Override = call API, then close
                  document.getElementById('tandem-inj-override').addEventListener('click', () => {
                    // Second confirmation — are you REALLY sure?
                    modal.innerHTML = \`
                      <div style="text-align:center;padding:20px;">
                        <span style="font-size:36px;">⚠️</span>
                        <div style="font-size:16px;font-weight:bold;margin:12px 0;">Are you absolutely sure?</div>
                        <div style="font-size:13px;opacity:0.8;margin-bottom:20px;line-height:1.6;">
                          This will send the page content to your AI agent.<br>
                          <b>The AI may execute the malicious instructions</b> found on this page.<br>
                          This could compromise your system configuration and security.
                        </div>
                        <div style="display:flex;gap:12px;justify-content:center;">
                          <button id="tandem-inj-confirm-no" style="background:#22c55e;border:none;color:white;padding:8px 20px;border-radius:6px;cursor:pointer;font-size:13px;font-weight:bold;">🛡️ NO — Get me out of here!</button>
                          <button id="tandem-inj-confirm-yes" style="background:#991b1b;border:1px solid #dc2626;color:white;padding:8px 20px;border-radius:6px;cursor:pointer;font-size:13px;">Yes, I am sure</button>
                        </div>
                      </div>
                    \`;

                    // NO = close everything
                    document.getElementById('tandem-inj-confirm-no').addEventListener('click', () => {
                      overlay.remove();
                    });

                    // YES = actually override
                    document.getElementById('tandem-inj-confirm-yes').addEventListener('click', async () => {
                      try {
                        const token = window.__TANDEM_TOKEN__ || '';
                        await fetch('http://localhost:8765/security/injection-override', {
                          method: 'POST',
                          headers: {
                            'Content-Type': 'application/json',
                            'Authorization': 'Bearer ' + token,
                            // Marks this call as originating from the shell's
                            // post-confirmation "Override" button. The route
                            // handler trusts this header to skip the second
                            // approval modal. See src/api/routes/misc.ts —
                            // audit #34 Medium #3 and the header-based fix.
                            'X-Tandem-Shell-Initiated': '1',
                          },
                          body: JSON.stringify({ domain: '${domain}' }),
                        });
                        modal.innerHTML = '<div style="text-align:center;padding:20px;"><span style="font-size:24px;">✅</span><div style="margin-top:8px;">Override granted for 5 minutes.<br>Retry your request.</div></div>';
                        const tab = document.querySelector('[data-injection-blocked="true"]');
                        if (tab) { tab.style.removeProperty('background'); tab.style.removeProperty('color'); tab.removeAttribute('data-injection-blocked'); }
                        setTimeout(() => overlay.remove(), 3000);
                      } catch (e) {
                        modal.innerHTML = '<div style="text-align:center;padding:20px;color:#f87171;">Override failed. Try again.</div>';
                      }
                    });
                  });
                })();
              `).catch(() => {});
            }
          } catch { /* best effort */ }

          // Return blocked response — original content is NOT included
          return originalJson({
            blocked: true,
            reason: 'prompt_injection_detected',
            riskScore: report.riskScore,
            domain,
            message: `⚠️ This page was BLOCKED by Tandem Security — prompt injection detected (score: ${report.riskScore}/100). Content was NOT forwarded. The user has been notified and can override if they choose.`,
            findings: warning.findings,
            overrideUrl: `POST /security/injection-override {"domain":"${domain}"}`,
          });
        }

        // 3. Log to terminal
        log.warn(
          `⚠️ Prompt injection detected on ${req.path}: score ${report.riskScore}/100, ` +
          `${report.findings.length} finding(s) — ${warning.summary}`
        );

        // 1. OS notification (throttled per domain)
        const now = Date.now();
        const lastNotif = lastNotificationTime.get(domain) || 0;
        if (now - lastNotif > NOTIFICATION_COOLDOWN_MS) {
          try {
            new Notification({
              title: '⚠️ Prompt Injection Detected — Tandem',
              body: `Risk: ${report.riskScore}/100 on ${domain}\n${warning.findings[0]?.description || ''}`,
              urgency: report.riskScore >= 50 ? 'critical' : 'normal',
            }).show();
            lastNotificationTime.set(domain, now);
          } catch { /* notification may fail in some environments */ }
        }

        // 2. Visual warning modal (centered, like the block modal)
        try {
          const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
          if (win && !win.isDestroyed()) {
            const color = report.riskScore >= 40 ? '#f59e0b' : '#3b82f6';
            const findingsHtml = warning.findings
              .slice(0, 5)
              .map(f => `<div style="padding:4px 0;border-bottom:1px solid rgba(255,255,255,0.1);"><span style="background:${color};color:#000;padding:1px 6px;border-radius:3px;font-size:10px;font-weight:bold;">${escapeForJs(f.severity.toUpperCase())}</span> ${escapeForJs(f.description)}${f.matchedText ? '<br><span style="opacity:0.7;font-style:italic;">Matched: "' + escapeForJs(f.matchedText.substring(0, 80)) + '"</span>' : ''}</div>`)
              .join('');
            const safePageUrl = escapeForJs(pageUrl.substring(0, 120));
            const warnTabId = escapeForJs((req.headers['x-tab-id'] as string) || '');
            win.webContents.executeJavaScript(`
              (() => {
                const existing = document.getElementById('tandem-injection-overlay');
                if (existing) existing.remove();

                // Mark tab with warning color
                const activeTab = document.querySelector('.tab[data-tab-id="${warnTabId}"]') || document.querySelector('.tab.active');
                if (activeTab) {
                  activeTab.style.setProperty('background', '${color}', 'important');
                  activeTab.style.setProperty('color', '#000', 'important');
                  activeTab.dataset.injectionWarning = 'true';
                }

                const overlay = document.createElement('div');
                overlay.id = 'tandem-injection-overlay';
                overlay.style.cssText = 'position:fixed;inset:0;z-index:999998;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;';

                const modal = document.createElement('div');
                modal.style.cssText = 'background:#1a1a2e;border:2px solid ${color};border-radius:12px;padding:24px;max-width:560px;width:90%;color:white;font:13px/1.6 -apple-system,sans-serif;box-shadow:0 8px 32px rgba(245,158,11,0.2);';
                modal.innerHTML = \`
                  <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;">
                    <span style="font-size:28px;">⚠️</span>
                    <div>
                      <div style="font-size:16px;font-weight:bold;">Suspicious Content Detected</div>
                      <div style="font-size:12px;opacity:0.7;">Risk: ${report.riskScore}/100 — Content was forwarded with warnings</div>
                    </div>
                  </div>
                  <div style="background:rgba(245,158,11,0.15);border-radius:6px;padding:8px 12px;margin-bottom:12px;font-size:12px;">
                    <b>Source:</b> ${safePageUrl}
                  </div>
                  <div style="margin-bottom:16px;font-size:12px;">
                    <div style="margin-bottom:6px;font-weight:bold;opacity:0.8;">Detected patterns:</div>
                    ${findingsHtml}
                  </div>
                  <div style="font-size:11px;opacity:0.6;margin-bottom:16px;">
                    Content was forwarded to your AI agent with injection warnings attached. The AI should treat this content with caution.
                  </div>
                  <div style="display:flex;justify-content:flex-end;">
                    <button id="tandem-warn-dismiss" style="background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);color:white;padding:6px 16px;border-radius:6px;cursor:pointer;font-size:12px;">Close this alert</button>
                  </div>
                \`;

                overlay.appendChild(modal);
                document.body.appendChild(overlay);

                document.getElementById('tandem-warn-dismiss').addEventListener('click', () => {
                  overlay.remove();
                  const tab = document.querySelector('[data-injection-warning="true"]');
                  if (tab) { tab.style.removeProperty('background'); tab.style.removeProperty('color'); tab.removeAttribute('data-injection-warning'); }
                });

                // Auto-dismiss after 30s
                setTimeout(() => { if (document.getElementById('tandem-injection-overlay')) { overlay.remove(); } }, 30000);
              })();
            `).catch(() => {});
          }
        } catch { /* best effort */ }

        // 4. Security event for Gatekeeper / security DB
        // Emit via the response locals so SecurityManager can pick it up
        res.locals.injectionDetected = {
          riskScore: report.riskScore,
          domain,
          path: req.path,
          findingCount: report.findings.length,
          categories: [...new Set(warning.findings.map(f => f.category))],
        };

        // Add warnings to the response — do NOT modify original content
        const enriched = { ...(body as Record<string, unknown>), injectionWarnings: warning };
        return originalJson(enriched);
      }
    } catch (e) {
      // Scanner failure must never break the API response
      log.warn('Injection scanner error:', e instanceof Error ? e.message : String(e));
    }

    return originalJson(body);
  } as typeof res.json;

  next();
}
