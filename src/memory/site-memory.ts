import fs from 'fs';
import path from 'path';
import type { WebContents } from 'electron';
import { tandemDir } from '../utils/paths';
import { createLogger } from '../utils/logger';

const log = createLogger('SiteMemory');

export interface SiteVisit {
  url: string;
  title: string;
  description: string;
  headings: string[];
  formsCount: number;
  linksCount: number;
  textPreview: string;
  timestamp: number;
}

export interface SiteDiff {
  timestamp: number;
  changes: {
    titleChanged: boolean;
    descriptionChanged: boolean;
    newHeadings: string[];
    removedHeadings: string[];
    linksCountDelta: number;
    formsCountDelta: number;
    textPreviewChanged: boolean;
  };
}

export interface SiteData {
  domain: string;
  firstVisit: number;
  lastVisit: number;
  visitCount: number;
  totalTimeMs: number;
  visits: SiteVisit[];
  diffs: SiteDiff[];
}

/**
 * SiteMemoryManager — Remembers every site the AI copilot & human visit.
 * 
 * Stores structured data per domain in ~/.tandem/site-memory/{domain}.json
 * Tracks changes between visits (diff detection).
 */
export class SiteMemoryManager {
  private memoryDir: string;
  private visitStartTimes: Map<string, number> = new Map();

  constructor() {
    this.memoryDir = tandemDir('site-memory');
    if (!fs.existsSync(this.memoryDir)) {
      fs.mkdirSync(this.memoryDir, { recursive: true });
    }
  }

  /** Extract domain from URL */
  private getDomain(url: string): string {
    try {
      const u = new URL(url);
      return u.hostname;
    } catch {
      return 'unknown';
    }
  }

  /** Sanitize domain for filesystem */
  private domainToFilename(domain: string): string {
    return domain.replace(/[^a-zA-Z0-9.-]/g, '_') + '.json';
  }

  /** Load site data from disk */
  private loadSite(domain: string): SiteData | null {
    const filePath = path.join(this.memoryDir, this.domainToFilename(domain));
    if (!fs.existsSync(filePath)) return null;
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    } catch (e) {
      log.warn('Site memory load failed for', domain + ':', e instanceof Error ? e.message : String(e));
      return null;
    }
  }

  /** Save site data to disk */
  private saveSite(data: SiteData): void {
    const filePath = path.join(this.memoryDir, this.domainToFilename(data.domain));
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  }

  /** Record a page visit start (for time tracking) */
  trackVisitStart(url: string): void {
    const domain = this.getDomain(url);
    this.visitStartTimes.set(domain, Date.now());
  }

  /** Record a page visit end (navigated away) */
  trackVisitEnd(url: string): void {
    const domain = this.getDomain(url);
    const startTime = this.visitStartTimes.get(domain);
    if (startTime) {
      const elapsed = Date.now() - startTime;
      const site = this.loadSite(domain);
      if (site) {
        site.totalTimeMs += elapsed;
        this.saveSite(site);
      }
      this.visitStartTimes.delete(domain);
    }
  }

  /**
   * Extract page data from a webContents via executeJavaScript.
   * Called from main process — does NOT inject into webview.
   */
  async recordVisit(wc: WebContents, url: string): Promise<SiteVisit | null> {
    const domain = this.getDomain(url);
    if (domain === 'unknown' || url.startsWith('file://') || url.startsWith('about:')) return null;

    try {
      const pageData = await wc.executeJavaScript(`
        (() => {
          const title = document.title || '';
          const meta = document.querySelector('meta[name="description"]');
          const description = meta ? meta.getAttribute('content') || '' : '';
          const headings = Array.from(document.querySelectorAll('h1, h2, h3')).slice(0, 20).map(h => h.textContent?.trim() || '').filter(Boolean);
          const formsCount = document.querySelectorAll('form').length;
          const linksCount = document.querySelectorAll('a[href]').length;
          const body = document.body ? document.body.innerText || '' : '';
          const textPreview = body.replace(/\\s+/g, ' ').trim().substring(0, 500);
          return { title, description, headings, formsCount, linksCount, textPreview };
        })()
      `);

      const visit: SiteVisit = {
        url,
        title: pageData.title,
        description: pageData.description,
        headings: pageData.headings,
        formsCount: pageData.formsCount,
        linksCount: pageData.linksCount,
        textPreview: pageData.textPreview,
        timestamp: Date.now(),
      };

      // Load or create site data
      let site = this.loadSite(domain);
      const _isNew = !site;

      if (!site) {
        site = {
          domain,
          firstVisit: Date.now(),
          lastVisit: Date.now(),
          visitCount: 0,
          totalTimeMs: 0,
          visits: [],
          diffs: [],
        };
      }

      // Compute diff with last visit
      if (site.visits.length > 0) {
        const last = site.visits[site.visits.length - 1];
        const diff = this.computeDiff(last, visit);
        if (diff) {
          site.diffs.push(diff);
          // Keep max 50 diffs
          if (site.diffs.length > 50) {
            site.diffs = site.diffs.slice(-50);
          }
        }
      }

      site.lastVisit = Date.now();
      site.visitCount++;

      // Keep max 100 visits
      site.visits.push(visit);
      if (site.visits.length > 100) {
        site.visits = site.visits.slice(-100);
      }

      this.saveSite(site);
      this.trackVisitStart(url);

      return visit;
    } catch (e) {
      log.warn('Site memory recordVisit failed for', url + ':', e instanceof Error ? e.message : String(e));
      return null;
    }
  }

  /** Compute diff between two visits */
  private computeDiff(prev: SiteVisit, curr: SiteVisit): SiteDiff | null {
    const prevHeadingsSet = new Set(prev.headings);
    const currHeadingsSet = new Set(curr.headings);

    const newHeadings = curr.headings.filter(h => !prevHeadingsSet.has(h));
    const removedHeadings = prev.headings.filter(h => !currHeadingsSet.has(h));

    const titleChanged = prev.title !== curr.title;
    const descriptionChanged = prev.description !== curr.description;
    const textPreviewChanged = prev.textPreview !== curr.textPreview;
    const linksCountDelta = curr.linksCount - prev.linksCount;
    const formsCountDelta = curr.formsCount - prev.formsCount;

    // Only create diff if something changed
    if (!titleChanged && !descriptionChanged && newHeadings.length === 0 &&
        removedHeadings.length === 0 && linksCountDelta === 0 &&
        formsCountDelta === 0 && !textPreviewChanged) {
      return null;
    }

    return {
      timestamp: Date.now(),
      changes: {
        titleChanged,
        descriptionChanged,
        newHeadings,
        removedHeadings,
        linksCountDelta,
        formsCountDelta,
        textPreviewChanged,
      },
    };
  }

  /** List all known domains */
  listSites(): { domain: string; lastVisit: number; visitCount: number }[] {
    try {
      const files = fs.readdirSync(this.memoryDir).filter(f => f.endsWith('.json'));
      return files.map(f => {
        try {
          const data: SiteData = JSON.parse(fs.readFileSync(path.join(this.memoryDir, f), 'utf-8'));
          return { domain: data.domain, lastVisit: data.lastVisit, visitCount: data.visitCount };
        } catch (e) {
          log.warn('Site memory listSites: skipping corrupt file', f + ':', e instanceof Error ? e.message : String(e));
          return null;
        }
      }).filter(Boolean) as { domain: string; lastVisit: number; visitCount: number }[];
    } catch (e) {
      log.warn('Site memory listSites: dir read failed:', e instanceof Error ? e.message : String(e));
      return [];
    }
  }

  /** Get full site data for a domain */
  getSite(domain: string): SiteData | null {
    return this.loadSite(domain);
  }

  /** Get diffs for a domain */
  getDiffs(domain: string): SiteDiff[] {
    const site = this.loadSite(domain);
    return site ? site.diffs : [];
  }

  /** Search across all site memories */
  search(query: string): { domain: string; url: string; title: string; snippet: string; timestamp: number }[] {
    const q = query.toLowerCase();
    const results: { domain: string; url: string; title: string; snippet: string; timestamp: number }[] = [];

    try {
      const files = fs.readdirSync(this.memoryDir).filter(f => f.endsWith('.json'));
      for (const f of files) {
        try {
          const data: SiteData = JSON.parse(fs.readFileSync(path.join(this.memoryDir, f), 'utf-8'));
          for (const visit of data.visits) {
            const searchableText = `${visit.title} ${visit.description} ${visit.headings.join(' ')} ${visit.textPreview}`.toLowerCase();
            if (searchableText.includes(q)) {
              // Find snippet around the match
              const idx = searchableText.indexOf(q);
              const start = Math.max(0, idx - 40);
              const end = Math.min(searchableText.length, idx + q.length + 40);
              const snippet = (start > 0 ? '...' : '') + searchableText.substring(start, end) + (end < searchableText.length ? '...' : '');

              results.push({
                domain: data.domain,
                url: visit.url,
                title: visit.title,
                snippet,
                timestamp: visit.timestamp,
              });
              break; // One result per domain
            }
          }
        } catch (e) { log.warn('Site memory search: skipping corrupt file', f + ':', e instanceof Error ? e.message : String(e)); }
      }
    } catch (e) { log.warn('Site memory search: dir read failed:', e instanceof Error ? e.message : String(e)); }

    return results.sort((a, b) => b.timestamp - a.timestamp);
  }

  /** Get average time on site (ms) */
  getAverageTime(domain: string): number {
    const site = this.loadSite(domain);
    if (!site || site.visitCount === 0) return 0;
    return Math.round(site.totalTimeMs / site.visitCount);
  }
}
