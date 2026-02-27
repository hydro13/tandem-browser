import crypto from 'crypto';
import { DevToolsManager } from '../devtools/manager';
import { MockRule } from './types';

export class NetworkMocker {
  private rules: MockRule[] = [];
  private fetchEnabled = false;

  constructor(private devtools: DevToolsManager) {
    // Register CDP event subscriber for Fetch.requestPaused
    this.devtools.subscribe({
      name: 'NetworkMocker',
      events: ['Fetch.requestPaused'],
      handler: (_method: string, params: Record<string, unknown>) => this.handleRequestPaused(params),
    });
  }

  /** Add a mock/intercept rule */
  async addRule(rule: Omit<MockRule, 'id' | 'createdAt'>): Promise<MockRule> {
    const full: MockRule = {
      ...rule,
      id: crypto.randomUUID(),
      createdAt: Date.now(),
    };
    this.rules.push(full);

    // Enable CDP Fetch domain on first mock rule
    if (!this.fetchEnabled) {
      await this.enableFetch();
    }

    return full;
  }

  /** Remove rules matching a pattern — returns count removed */
  async removeRule(pattern: string): Promise<number> {
    const before = this.rules.length;
    this.rules = this.rules.filter(r => r.pattern !== pattern);
    const removed = before - this.rules.length;

    // Disable Fetch when no rules remain
    if (this.rules.length === 0 && this.fetchEnabled) {
      await this.disableFetch();
    }

    return removed;
  }

  /** Remove a rule by id — returns count removed (0 or 1) */
  async removeRuleById(id: string): Promise<number> {
    const before = this.rules.length;
    this.rules = this.rules.filter(r => r.id !== id);
    const removed = before - this.rules.length;

    if (this.rules.length === 0 && this.fetchEnabled) {
      await this.disableFetch();
    }

    return removed;
  }

  /** Clear all rules + disable Fetch — returns count removed */
  async clearRules(): Promise<number> {
    const count = this.rules.length;
    this.rules = [];

    if (this.fetchEnabled) {
      await this.disableFetch();
    }

    return count;
  }

  /** Get all active rules */
  getRules(): MockRule[] {
    return [...this.rules];
  }

  /** Enable CDP Fetch domain to intercept requests */
  private async enableFetch(): Promise<void> {
    if (this.fetchEnabled) return;
    await this.devtools.sendCommand('Fetch.enable', {
      patterns: [{ urlPattern: '*', requestStage: 'Request' }],
    });
    this.fetchEnabled = true;
    console.log('[NetworkMocker] Fetch.enable — interception active');
  }

  /** Disable CDP Fetch domain (performance: stop intercepting) */
  private async disableFetch(): Promise<void> {
    if (!this.fetchEnabled) return;
    try {
      await this.devtools.sendCommand('Fetch.disable', {});
    } catch (e) {
      console.warn('[NetworkMocker] Fetch.disable failed:', e instanceof Error ? e.message : String(e));
    }
    this.fetchEnabled = false;
    console.log('[NetworkMocker] Fetch.disable — interception stopped');
  }

  /** Find the first matching rule for a URL */
  private matchRule(url: string): MockRule | null {
    for (const rule of this.rules) {
      if (this.globMatch(rule.pattern, url)) {
        return rule;
      }
    }
    return null;
  }

  /**
   * Simple glob matching: * = anything except /, ** = anything including /
   * No npm packages — hand-written implementation.
   */
  private globMatch(pattern: string, url: string): boolean {
    // Exact match shortcut
    if (pattern === url) return true;

    // Convert glob pattern to regex
    let regex = '';
    let i = 0;
    while (i < pattern.length) {
      const ch = pattern[i];
      if (ch === '*') {
        if (pattern[i + 1] === '*') {
          // ** matches anything including /
          regex += '.*';
          i += 2;
          // Skip trailing / after ** (e.g. **/ )
          if (pattern[i] === '/') {
            regex += '(?:/)?';
            i++;
          }
          continue;
        }
        // * matches anything except /
        regex += '[^/]*';
        i++;
        continue;
      }
      if (ch === '?') {
        regex += '[^/]';
        i++;
        continue;
      }
      // Escape regex special chars
      if ('.+^${}()|[]\\'.includes(ch)) {
        regex += '\\' + ch;
      } else {
        regex += ch;
      }
      i++;
    }

    try {
      return new RegExp('^' + regex + '$').test(url);
    } catch {
      return false;
    }
  }

  /** Handle CDP Fetch.requestPaused event */
  private async handleRequestPaused(params: Record<string, unknown>): Promise<void> {
    const requestId = params.requestId as string;
    const request = params.request as Record<string, unknown> | undefined;
    const url = request?.url as string;

    if (!requestId || !url) {
      // Safety: continue unmatched requests
      try {
        await this.devtools.sendCommand('Fetch.continueRequest', { requestId });
      } catch { /* ignore */ }
      return;
    }

    const rule = this.matchRule(url);

    if (!rule) {
      // No match — let request through
      try {
        await this.devtools.sendCommand('Fetch.continueRequest', { requestId });
      } catch { /* ignore */ }
      return;
    }

    try {
      // Optional delay
      if (rule.delay && rule.delay > 0) {
        await new Promise(resolve => setTimeout(resolve, rule.delay));
      }

      if (rule.abort) {
        // Block request
        await this.devtools.sendCommand('Fetch.failRequest', {
          requestId,
          errorReason: 'BlockedByClient',
        });
      } else {
        // Mock response — body must be base64 encoded
        const bodyStr = typeof rule.body === 'string' ? rule.body : JSON.stringify(rule.body ?? '');
        const responseBody = Buffer.from(bodyStr).toString('base64');

        await this.devtools.sendCommand('Fetch.fulfillRequest', {
          requestId,
          responseCode: rule.status || 200,
          responseHeaders: [
            { name: 'Content-Type', value: 'application/json' },
            ...Object.entries(rule.headers || {}).map(([name, value]) => ({ name, value })),
          ],
          body: responseBody,
        });
      }
    } catch (e) {
      console.error(`[NetworkMocker] Error handling paused request ${url}:`, e instanceof Error ? e.message : String(e));
      // Try to continue the request so the browser doesn't hang
      try {
        await this.devtools.sendCommand('Fetch.continueRequest', { requestId });
      } catch { /* ignore */ }
    }
  }

  /** Cleanup — called from will-quit handler */
  destroy(): void {
    this.rules = [];
    this.devtools.unsubscribe('NetworkMocker');
    // Don't await disableFetch here — app is quitting
    if (this.fetchEnabled) {
      this.devtools.sendCommand('Fetch.disable', {}).catch(() => {});
      this.fetchEnabled = false;
    }
  }
}
