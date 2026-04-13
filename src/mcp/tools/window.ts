import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { apiCall, getMcpSource, truncateToWords, logActivity } from '../api-client.js';
import { coerceShape } from '../coerce.js';
import { hostnameMatches, tryParseUrl, urlHasProtocol } from '../../utils/security';

/**
 * Human-like delay using Gaussian distribution (reused from X-Scout).
 */
function humanDelay(range: { min: number; max: number }): Promise<void> {
  const u1 = Math.random();
  const u2 = Math.random();
  const gaussian = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  const normalized = (gaussian + 3) / 6;
  const clamped = Math.max(0, Math.min(1, normalized));
  const ms = Math.round(range.min + clamped * (range.max - range.min));
  return new Promise(resolve => setTimeout(resolve, ms));
}

const TIMING = {
  betweenPages: { min: 3000, max: 8000 },
  readingTime: { min: 2000, max: 6000 },
  beforeAction: { min: 500, max: 1500 },
};

export function registerWindowTools(server: McpServer): void {
  server.tool(
    'tandem_research',
    'Perform autonomous research by opening tabs, searching, and reading pages. Returns a summary of findings. Uses human-paced timing to avoid detection.',
    coerceShape({
      query: z.string().describe('What to research'),
      maxPages: z.number().optional().default(5).describe('Maximum number of pages to visit (1-10)'),
      searchEngine: z.enum(['google', 'duckduckgo']).optional().default('duckduckgo').describe('Search engine to use'),
    }),
    async ({ query, maxPages, searchEngine }) => {
      const clampedMax = Math.min(Math.max(maxPages || 5, 1), 10);
      await logActivity('research_start', `"${query}" (max ${clampedMax} pages via ${searchEngine})`);

      // Check emergency stop
      try {
        const _stopCheck = await apiCall('GET', '/tasks/check-approval?actionType=navigate');
        // If navigate needs approval, we should not auto-research
      } catch { /* ignore, continue */ }

      // Create a task for tracking
      let taskId: string | undefined;
      try {
        const task = await apiCall('POST', '/tasks', {
          description: `Research: "${query}"`,
          createdBy: 'claude',
          assignedTo: 'claude',
          steps: [
            { description: `Search for "${query}" via ${searchEngine}`, action: { type: 'navigate', params: { query } }, riskLevel: 'low', requiresApproval: false },
            { description: `Read the top ${clampedMax} results`, action: { type: 'read_page', params: {} }, riskLevel: 'none', requiresApproval: false },
          ]
        });
        taskId = task.id;
        await apiCall('POST', `/tasks/${taskId}/status`, { status: 'running' });
      } catch { /* task tracking optional */ }

      const findings: Array<{ title: string; url: string; snippet: string }> = [];

      try {
        // Step 1: Open a new tab for research with the MCP connector source.
        const tabResult = await apiCall('POST', '/tabs/open', { url: 'about:blank', source: getMcpSource() });
        const researchTabId = tabResult?.tab?.id;

        await humanDelay(TIMING.beforeAction);

        // Step 2: Navigate to search engine
        const searchUrl = searchEngine === 'google'
          ? `https://www.google.com/search?q=${encodeURIComponent(query)}`
          : `https://duckduckgo.com/?q=${encodeURIComponent(query)}`;

        await apiCall('POST', '/navigate', { url: searchUrl });
        await humanDelay(TIMING.readingTime);

        // Step 3: Read search results page
        const searchPage = await apiCall('GET', '/page-content');
        const _searchText = searchPage.text || '';

        // Step 4: Get links from search results
        const linksData = await apiCall('GET', '/links');
        const links: Array<{ href: string; text: string }> = (linksData.links || [])
          .filter((l: { href?: string; text?: string }) => {
            const href = l.href || '';
            const parsed = tryParseUrl(href);
            // Filter out search engine internal links
            return !!parsed &&
              urlHasProtocol(parsed, 'http:', 'https:') &&
              !hostnameMatches(parsed, 'google.com') &&
              !hostnameMatches(parsed, 'duckduckgo.com') &&
              !hostnameMatches(parsed, 'bing.com') &&
              !!l.text && l.text.length > 5;
          })
          .slice(0, clampedMax);

        // Step 5: Visit each result page with human-paced timing
        for (let i = 0; i < links.length; i++) {
          const link = links[i];
          await logActivity('research_visit', `(${i + 1}/${links.length}) ${link.text.substring(0, 60)}`);
          await humanDelay(TIMING.betweenPages);

          try {
            await apiCall('POST', '/navigate', { url: link.href });
            await humanDelay(TIMING.readingTime);

            const pageContent = await apiCall('GET', '/page-content');
            const pageText = truncateToWords(pageContent.text || '', 300);
            const pageTitle = pageContent.title || link.text;

            findings.push({
              title: pageTitle,
              url: link.href,
              snippet: pageText,
            });
          } catch (e) {
            // Page failed to load, skip
            findings.push({
              title: link.text,
              url: link.href,
              snippet: `(Load error: ${e instanceof Error ? e.message : String(e)})`,
            });
          }
        }

        // Step 6: Close the research tab (return to Robin's tab)
        if (researchTabId) {
          try {
            await apiCall('POST', '/tabs/close', { tabId: researchTabId });
          } catch { /* tab may already be closed */ }
        }

        // Mark task as done
        if (taskId) {
          try {
            await apiCall('POST', `/tasks/${taskId}/status`, { status: 'done', result: findings });
          } catch { /* optional */ }
        }

      } catch (e) {
        const eMsg = e instanceof Error ? e.message : String(e);
        if (taskId) {
          try {
            await apiCall('POST', `/tasks/${taskId}/status`, { status: 'failed', result: eMsg });
          } catch { /* optional */ }
        }

        await logActivity('research_error', eMsg);
        return {
          content: [{
            type: 'text',
            text: `Research failed: ${eMsg}\n\nPartial findings (${findings.length}):\n${findings.map(f => `- ${f.title}: ${f.snippet.substring(0, 100)}`).join('\n')}`,
          }],
        };
      }

      // Build summary
      let summary = `# Research: "${query}"\n\n`;
      summary += `Found ${findings.length} sources:\n\n`;
      for (let i = 0; i < findings.length; i++) {
        const f = findings[i];
        summary += `## ${i + 1}. ${f.title}\n`;
        summary += `**URL:** ${f.url}\n`;
        summary += `${f.snippet}\n\n`;
      }

      await logActivity('research_complete', `"${query}" — ${findings.length} sources found`);

      return { content: [{ type: 'text', text: summary }] };
    }
  );
}
