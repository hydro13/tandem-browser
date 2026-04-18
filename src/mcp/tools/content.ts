import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { apiCall, tabHeaders, truncateToWords, logActivity } from '../api-client.js';
import { wrapWithSecurityContext } from './_security-context.js';

export function registerContentTools(server: McpServer): void {
  server.tool(
    'tandem_read_page',
    'Read page content as markdown text (max 2000 words). Supports targeting a background tab by ID. If the page triggers Tandem\'s prompt-injection scanner, the output is prefixed with a warning banner (warn) or replaced with a block marker (high risk).',
    {
      tabId: z.string().optional().describe('Optional tab ID to target a background tab instead of the active tab'),
    },
    async ({ tabId }) => {
      const data = await apiCall('GET', '/page-content', undefined, tabHeaders(tabId));
      // If the scanner blocked this response, `data.blocked === true` and the
      // title/text fields will be absent. Let the security wrapper produce
      // the stop-signal; don't try to render a normal markdown envelope.
      if (data && typeof data === 'object' && (data as Record<string, unknown>).blocked === true) {
        await logActivity('read_page', 'blocked by injection scanner');
        return { content: [{ type: 'text', text: wrapWithSecurityContext(data, '') }] };
      }

      const title = data.title || 'Untitled';
      const url = data.url || '';
      const description = data.description || '';
      const bodyText = truncateToWords(data.text || '', 2000);

      let markdown = `# ${title}\n\n`;
      markdown += `**URL:** ${url}\n\n`;
      if (description) {
        markdown += `> ${description}\n\n`;
      }
      markdown += bodyText;

      await logActivity('read_page', `${title} (${url})`);
      return { content: [{ type: 'text', text: wrapWithSecurityContext(data, markdown) }] };
    }
  );

  server.tool(
    'tandem_screenshot',
    'Take a screenshot of a browser tab. Supports targeting a background tab by ID.',
    {
      tabId: z.string().optional().describe('Optional tab ID to target a background tab instead of the active tab'),
    },
    async ({ tabId }) => {
      const base64 = await apiCall('GET', '/screenshot', undefined, tabHeaders(tabId));
      await logActivity('screenshot');
      return {
        content: [{
          type: 'image',
          data: base64,
          mimeType: 'image/png',
        }],
      };
    }
  );

  server.tool(
    'tandem_get_page_html',
    'Get the raw HTML source of the current page. Supports targeting a background tab by ID. Raw HTML is the most prompt-injection-exposed surface — prefer tandem_read_page when possible. Output is prefixed with a scanner warning/block banner when triggered.',
    {
      tabId: z.string().optional().describe('Optional tab ID to target a background tab instead of the active tab'),
    },
    async ({ tabId }) => {
      const data = await apiCall('GET', '/page-html', undefined, tabHeaders(tabId));
      if (data && typeof data === 'object' && (data as Record<string, unknown>).blocked === true) {
        return { content: [{ type: 'text', text: wrapWithSecurityContext(data, '') }] };
      }
      // /page-html returns either a raw HTML string or a JSON envelope with
      // { html, injectionWarnings? }. When it's an envelope, extract the
      // HTML for display and forward warnings via the wrapper.
      let body: string;
      if (typeof data === 'string') {
        body = data;
      } else if (data && typeof data === 'object' && typeof (data as Record<string, unknown>).html === 'string') {
        body = (data as Record<string, unknown>).html as string;
      } else {
        body = JSON.stringify(data, null, 2);
      }
      return { content: [{ type: 'text', text: wrapWithSecurityContext(data, body) }] };
    }
  );

  server.tool(
    'tandem_extract_content',
    'Extract structured content from the current page using Tandem\'s content extraction engine. Supports targeting a background tab by ID.',
    {
      tabId: z.string().optional().describe('Optional tab ID to target a background tab instead of the active tab'),
    },
    async ({ tabId }) => {
      const data = await apiCall('POST', '/content/extract', undefined, tabHeaders(tabId));
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'tandem_extract_url',
    'Extract and parse content from a URL using headless rendering. Returns structured content.',
    {
      url: z.string().describe('The URL to extract content from'),
    },
    async ({ url }) => {
      const data = await apiCall('POST', '/content/extract/url', { url });
      await logActivity('extract_url', url);
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'tandem_get_links',
    'Get all links on the page with their text and URLs. Supports targeting a background tab by ID.',
    {
      tabId: z.string().optional().describe('Optional tab ID to target a background tab instead of the active tab'),
    },
    async ({ tabId }) => {
      const data = await apiCall('GET', '/links', undefined, tabHeaders(tabId));
      const links: Array<{ text: string; href: string; visible: boolean }> = data.links || [];

      let text = `Found ${links.length} links:\n\n`;
      for (const link of links) {
        const visibility = link.visible ? '' : ' [hidden]';
        text += `- [${link.text || '(no text)'}](${link.href})${visibility}\n`;
      }

      await logActivity('get_links', `${links.length} links found`);
      return { content: [{ type: 'text', text }] };
    }
  );

  server.tool(
    'tandem_get_forms',
    'Get all forms on the page with their fields and attributes. Supports targeting a background tab by ID.',
    {
      tabId: z.string().optional().describe('Optional tab ID to target a background tab instead of the active tab'),
    },
    async ({ tabId }) => {
      const data = await apiCall('GET', '/forms', undefined, tabHeaders(tabId));
      await logActivity('get_forms');
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'tandem_execute_js',
    'Execute JavaScript code in the agent\'s active tab, or in a specific tab when tabId is provided. Requires user approval (modal) before running. Supports targeting a background tab by ID without stealing focus.',
    {
      code: z.string().describe('JavaScript code to execute'),
      tabId: z.string().optional().describe('Optional tab ID to run the script in a specific tab instead of the agent\'s active tab. The user approval modal still fires regardless of tab choice.'),
    },
    {
      destructiveHint: true,
      readOnlyHint: false,
      openWorldHint: true,
    },
    async ({ code, tabId }) => {
      try {
        const result = await apiCall('POST', '/execute-js/confirm', { code }, tabHeaders(tabId));
        await logActivity('execute_js', code.substring(0, 80));
        return { content: [{ type: 'text', text: JSON.stringify(result.result ?? result, null, 2) }] };
      } catch (err) {
        if (err instanceof Error && err.message?.includes('rejected')) {
          return { content: [{ type: 'text', text: 'User rejected JavaScript execution.' }], isError: true };
        }
        throw err;
      }
    }
  );
}
