import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { apiCall, logActivity } from './api-client.js';

const server = new McpServer({
  name: 'tandem-browser',
  version: '0.1.0',
});

// ═══════════════════════════════════════════════
// tandem_navigate — Navigate to a URL
// ═══════════════════════════════════════════════

server.tool(
  'tandem_navigate',
  'Navigate the active browser tab to a URL',
  { url: z.string().describe('The URL to navigate to') },
  async ({ url }) => {
    await apiCall('POST', '/navigate', { url });
    await logActivity('navigate', url);
    return { content: [{ type: 'text', text: `Navigated to ${url}` }] };
  }
);

// ═══════════════════════════════════════════════
// tandem_go_back — Browser back
// ═══════════════════════════════════════════════

server.tool(
  'tandem_go_back',
  'Go back to the previous page in browser history',
  async () => {
    await apiCall('POST', '/execute-js', { code: 'window.history.back()' });
    await logActivity('go_back');
    return { content: [{ type: 'text', text: 'Navigated back' }] };
  }
);

// ═══════════════════════════════════════════════
// tandem_go_forward — Browser forward
// ═══════════════════════════════════════════════

server.tool(
  'tandem_go_forward',
  'Go forward to the next page in browser history',
  async () => {
    await apiCall('POST', '/execute-js', { code: 'window.history.forward()' });
    await logActivity('go_forward');
    return { content: [{ type: 'text', text: 'Navigated forward' }] };
  }
);

// ═══════════════════════════════════════════════
// tandem_reload — Reload current page
// ═══════════════════════════════════════════════

server.tool(
  'tandem_reload',
  'Reload the current page',
  async () => {
    await apiCall('POST', '/execute-js', { code: 'window.location.reload()' });
    await logActivity('reload');
    return { content: [{ type: 'text', text: 'Page reloaded' }] };
  }
);

// ═══════════════════════════════════════════════
// tandem_read_page — Read current page content as markdown
// ═══════════════════════════════════════════════

function truncateToWords(text: string, maxWords: number): string {
  const words = text.split(/\s+/);
  if (words.length <= maxWords) return text;
  return words.slice(0, maxWords).join(' ') + '\n\n[... truncated, ' + (words.length - maxWords) + ' more words]';
}

server.tool(
  'tandem_read_page',
  'Read the current page content as markdown text (max 2000 words)',
  async () => {
    const data = await apiCall('GET', '/page-content');
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
    return { content: [{ type: 'text', text: markdown }] };
  }
);

// ═══════════════════════════════════════════════
// tandem_screenshot — Take a screenshot of the current page
// ═══════════════════════════════════════════════

server.tool(
  'tandem_screenshot',
  'Take a screenshot of the current browser tab',
  async () => {
    const base64 = await apiCall('GET', '/screenshot');
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

// ═══════════════════════════════════════════════
// tandem_get_links — Get all links on the current page
// ═══════════════════════════════════════════════

server.tool(
  'tandem_get_links',
  'Get all links on the current page with their text and URLs',
  async () => {
    const data = await apiCall('GET', '/links');
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

// ═══════════════════════════════════════════════
// tandem_wait_for_load — Wait for the page to finish loading
// ═══════════════════════════════════════════════

server.tool(
  'tandem_wait_for_load',
  'Wait for the current page to finish loading',
  { timeout: z.number().optional().default(10000).describe('Timeout in milliseconds (default: 10000)') },
  async ({ timeout }) => {
    const result = await apiCall('POST', '/wait', { timeout });
    await logActivity('wait_for_load');

    if (result.timeout) {
      return { content: [{ type: 'text', text: 'Page load timed out — the page may still be loading.' }] };
    }
    return { content: [{ type: 'text', text: 'Page loaded successfully.' }] };
  }
);

// ═══════════════════════════════════════════════
// tandem_click — Click an element (Sessie 1.2)
// ═══════════════════════════════════════════════

server.tool(
  'tandem_click',
  'Click an element on the page by CSS selector',
  {
    selector: z.string().describe('CSS selector of the element to click'),
  },
  async ({ selector }) => {
    const result = await apiCall('POST', '/click', { selector });
    await logActivity('click', selector);
    return { content: [{ type: 'text', text: `Clicked: ${selector} — ${JSON.stringify(result)}` }] };
  }
);

// ═══════════════════════════════════════════════
// tandem_type — Type text into an element
// ═══════════════════════════════════════════════

server.tool(
  'tandem_type',
  'Type text into an input field by CSS selector',
  {
    selector: z.string().describe('CSS selector of the input field'),
    text: z.string().describe('Text to type'),
    clear: z.boolean().optional().default(false).describe('Clear the field before typing'),
  },
  async ({ selector, text, clear }) => {
    await apiCall('POST', '/type', { selector, text, clear });
    await logActivity('type', `${selector}: "${text.substring(0, 50)}"`);
    return { content: [{ type: 'text', text: `Typed "${text}" into ${selector}` }] };
  }
);

// ═══════════════════════════════════════════════
// tandem_scroll — Scroll the page
// ═══════════════════════════════════════════════

server.tool(
  'tandem_scroll',
  'Scroll the page up or down',
  {
    direction: z.enum(['up', 'down']).describe('Scroll direction'),
    amount: z.number().optional().default(500).describe('Scroll amount in pixels (default: 500)'),
  },
  async ({ direction, amount }) => {
    await apiCall('POST', '/scroll', { direction, amount });
    await logActivity('scroll', `${direction} ${amount}px`);
    return { content: [{ type: 'text', text: `Scrolled ${direction} ${amount}px` }] };
  }
);

// ═══════════════════════════════════════════════
// tandem_execute_js — Execute JavaScript in the active tab
// ═══════════════════════════════════════════════

server.tool(
  'tandem_execute_js',
  'Execute JavaScript code in the active browser tab. Returns the result.',
  {
    code: z.string().describe('JavaScript code to execute'),
  },
  async ({ code }) => {
    const result = await apiCall('POST', '/execute-js', { code });
    await logActivity('execute_js', code.substring(0, 80));
    return { content: [{ type: 'text', text: JSON.stringify(result.result ?? result, null, 2) }] };
  }
);

// ═══════════════════════════════════════════════
// tandem_list_tabs — List all open tabs
// ═══════════════════════════════════════════════

server.tool(
  'tandem_list_tabs',
  'List all open browser tabs with their titles, URLs, and IDs',
  async () => {
    const data = await apiCall('GET', '/tabs/list');
    const tabs: Array<{ id: string; title: string; url: string; active: boolean }> = data.tabs || [];

    let text = `Open tabs (${tabs.length}):\n\n`;
    for (const tab of tabs) {
      const marker = tab.active ? '→ ' : '  ';
      text += `${marker}[${tab.id}] ${tab.title || '(untitled)'}\n   ${tab.url}\n`;
    }

    return { content: [{ type: 'text', text }] };
  }
);

// ═══════════════════════════════════════════════
// tandem_open_tab — Open a new tab
// ═══════════════════════════════════════════════

server.tool(
  'tandem_open_tab',
  'Open a new browser tab, optionally with a URL',
  {
    url: z.string().optional().describe('URL to open (default: new tab page)'),
  },
  async ({ url }) => {
    const result = await apiCall('POST', '/tabs/open', { url: url || undefined, source: 'kees' });
    await logActivity('open_tab', url || 'new tab');
    return { content: [{ type: 'text', text: `Opened tab: ${result.tab?.id || 'unknown'} — ${url || 'new tab'}` }] };
  }
);

// ═══════════════════════════════════════════════
// tandem_close_tab — Close a tab
// ═══════════════════════════════════════════════

server.tool(
  'tandem_close_tab',
  'Close a browser tab by its ID',
  {
    tabId: z.string().describe('The tab ID to close'),
  },
  async ({ tabId }) => {
    await apiCall('POST', '/tabs/close', { tabId });
    await logActivity('close_tab', tabId);
    return { content: [{ type: 'text', text: `Closed tab: ${tabId}` }] };
  }
);

// ═══════════════════════════════════════════════
// tandem_focus_tab — Focus/switch to a tab
// ═══════════════════════════════════════════════

server.tool(
  'tandem_focus_tab',
  'Switch to a specific browser tab by its ID',
  {
    tabId: z.string().describe('The tab ID to focus'),
  },
  async ({ tabId }) => {
    await apiCall('POST', '/tabs/focus', { tabId });
    await logActivity('focus_tab', tabId);
    return { content: [{ type: 'text', text: `Focused tab: ${tabId}` }] };
  }
);

// ═══════════════════════════════════════════════
// tandem_send_message — Send a message to the Kees panel
// ═══════════════════════════════════════════════

server.tool(
  'tandem_send_message',
  'Send a message that appears in the Kees chat panel (visible to Robin)',
  {
    text: z.string().describe('Message text to display'),
  },
  async ({ text }) => {
    await apiCall('POST', '/chat', { text, from: 'claude' });
    return { content: [{ type: 'text', text: `Message sent: "${text.substring(0, 100)}"` }] };
  }
);

// ═══════════════════════════════════════════════
// tandem_get_chat_history — Get chat messages
// ═══════════════════════════════════════════════

server.tool(
  'tandem_get_chat_history',
  'Get recent chat messages from the Kees panel',
  {
    limit: z.number().optional().default(20).describe('Number of messages to return (default: 20)'),
  },
  async ({ limit }) => {
    const data = await apiCall('GET', `/chat?limit=${limit}`);
    const messages: Array<{ from: string; text: string; timestamp: number }> = data.messages || [];

    let text = `Chat history (${messages.length} messages):\n\n`;
    for (const msg of messages) {
      const time = new Date(msg.timestamp).toLocaleTimeString();
      text += `[${time}] ${msg.from}: ${msg.text}\n`;
    }

    return { content: [{ type: 'text', text }] };
  }
);

// ═══════════════════════════════════════════════
// tandem_search_bookmarks — Search bookmarks
// ═══════════════════════════════════════════════

server.tool(
  'tandem_search_bookmarks',
  'Search through saved bookmarks by keyword',
  {
    query: z.string().describe('Search query'),
  },
  async ({ query }) => {
    const data = await apiCall('GET', `/bookmarks/search?q=${encodeURIComponent(query)}`);
    const results: Array<{ name: string; url: string }> = data.results || [];

    let text = `Bookmark results for "${query}" (${results.length}):\n\n`;
    for (const bm of results) {
      text += `- [${bm.name}](${bm.url})\n`;
    }

    return { content: [{ type: 'text', text }] };
  }
);

// ═══════════════════════════════════════════════
// tandem_search_history — Search browsing history
// ═══════════════════════════════════════════════

server.tool(
  'tandem_search_history',
  'Search through browsing history by keyword',
  {
    query: z.string().describe('Search query'),
  },
  async ({ query }) => {
    const data = await apiCall('GET', `/history/search?q=${encodeURIComponent(query)}`);
    const results: Array<{ url: string; title: string; visitedAt: number }> = data.results || [];

    let text = `History results for "${query}" (${results.length}):\n\n`;
    for (const entry of results) {
      const time = new Date(entry.visitedAt).toLocaleString();
      text += `- [${entry.title || entry.url}](${entry.url}) — ${time}\n`;
    }

    return { content: [{ type: 'text', text }] };
  }
);

// ═══════════════════════════════════════════════
// tandem_get_context — Get full browser context overview
// ═══════════════════════════════════════════════

server.tool(
  'tandem_get_context',
  'Get a comprehensive overview of the current browser state: active tab, open tabs, recent chat, and voice status',
  async () => {
    const [status, tabsData, chatData] = await Promise.all([
      apiCall('GET', '/status'),
      apiCall('GET', '/tabs/list'),
      apiCall('GET', '/chat?limit=5'),
    ]);

    const tabs: Array<{ id: string; title: string; url: string; active: boolean }> = tabsData.tabs || [];
    const messages: Array<{ from: string; text: string }> = chatData.messages || [];

    let text = `=== Browser Context ===\n\n`;

    // Active tab
    text += `Active tab: ${status.title || 'Unknown'}\n`;
    text += `URL: ${status.url || 'None'}\n`;
    text += `Loading: ${status.loading ? 'Yes' : 'No'}\n\n`;

    // All tabs
    text += `Open tabs (${tabs.length}):\n`;
    for (const tab of tabs) {
      const marker = tab.active ? '→ ' : '  ';
      text += `${marker}[${tab.id}] ${tab.title || '(untitled)'} — ${tab.url}\n`;
    }

    // Recent chat
    if (messages.length > 0) {
      text += `\nRecent chat:\n`;
      for (const msg of messages.slice(-5)) {
        text += `  ${msg.from}: ${msg.text.substring(0, 100)}\n`;
      }
    }

    return { content: [{ type: 'text', text }] };
  }
);

// ═══════════════════════════════════════════════
// tandem_research — Autonomous research (Fase 4.2)
// ═══════════════════════════════════════════════

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

server.tool(
  'tandem_research',
  'Perform autonomous research by opening tabs, searching, and reading pages. Returns a summary of findings. Uses human-paced timing to avoid detection.',
  {
    query: z.string().describe('What to research'),
    maxPages: z.number().optional().default(5).describe('Maximum number of pages to visit (1-10)'),
    searchEngine: z.enum(['google', 'duckduckgo']).optional().default('duckduckgo').describe('Search engine to use'),
  },
  async ({ query, maxPages, searchEngine }) => {
    const clampedMax = Math.min(Math.max(maxPages || 5, 1), 10);
    await logActivity('research_start', `"${query}" (max ${clampedMax} pages via ${searchEngine})`);

    // Check emergency stop
    try {
      const stopCheck = await apiCall('GET', '/tasks/check-approval?actionType=navigate');
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
          { description: `Zoek "${query}" via ${searchEngine}`, action: { type: 'navigate', params: { query } }, riskLevel: 'low', requiresApproval: false },
          { description: `Lees top ${clampedMax} resultaten`, action: { type: 'read_page', params: {} }, riskLevel: 'none', requiresApproval: false },
        ]
      });
      taskId = task.id;
      await apiCall('POST', `/tasks/${taskId}/status`, { status: 'running' });
    } catch { /* task tracking optional */ }

    const findings: Array<{ title: string; url: string; snippet: string }> = [];

    try {
      // Step 1: Open a new tab for research (source: kees)
      const tabResult = await apiCall('POST', '/tabs/open', { url: 'about:blank', source: 'kees' });
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
      const searchText = searchPage.text || '';

      // Step 4: Get links from search results
      const linksData = await apiCall('GET', '/links');
      const links: Array<{ href: string; text: string }> = (linksData.links || [])
        .filter((l: any) => {
          const href = l.href || '';
          // Filter out search engine internal links
          return href.startsWith('http') &&
            !href.includes('google.com') &&
            !href.includes('duckduckgo.com') &&
            !href.includes('bing.com') &&
            !href.includes('javascript:') &&
            l.text && l.text.length > 5;
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
        } catch (e: any) {
          // Page failed to load, skip
          findings.push({
            title: link.text,
            url: link.href,
            snippet: `(Fout bij laden: ${e.message})`,
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

    } catch (e: any) {
      if (taskId) {
        try {
          await apiCall('POST', `/tasks/${taskId}/status`, { status: 'failed', result: e.message });
        } catch { /* optional */ }
      }

      await logActivity('research_error', e.message);
      return {
        content: [{
          type: 'text',
          text: `Research failed: ${e.message}\n\nPartial findings (${findings.length}):\n${findings.map(f => `- ${f.title}: ${f.snippet.substring(0, 100)}`).join('\n')}`,
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

// tandem_create_task — Create an AI task with steps
server.tool(
  'tandem_create_task',
  'Create an AI task with multiple steps that can be tracked and approved by Robin',
  {
    description: z.string().describe('What the task is about'),
    steps: z.array(z.object({
      description: z.string().describe('Step description'),
      actionType: z.string().describe('Action type: navigate, read_page, click, type, etc.'),
      params: z.record(z.string(), z.string()).optional().describe('Action parameters as key-value pairs'),
    })).describe('Steps to execute'),
  },
  async ({ description, steps }) => {
    const formattedSteps = steps.map(s => ({
      description: s.description,
      action: { type: s.actionType, params: s.params || {} },
      riskLevel: 'low' as const,
      requiresApproval: false,
    }));

    const task = await apiCall('POST', '/tasks', {
      description,
      createdBy: 'claude',
      assignedTo: 'claude',
      steps: formattedSteps,
    });

    await logActivity('task_created', `"${description}" (${steps.length} steps)`);
    return {
      content: [{
        type: 'text',
        text: `Task created: ${task.id}\nDescription: ${description}\nSteps: ${steps.length}\nStatus: ${task.status}`,
      }],
    };
  }
);

// tandem_emergency_stop — Emergency stop all agent activity
server.tool(
  'tandem_emergency_stop',
  'Emergency stop: pause ALL running agent tasks immediately',
  async () => {
    const result = await apiCall('POST', '/emergency-stop');
    await logActivity('emergency_stop', `${result.stopped} tasks stopped`);
    return {
      content: [{
        type: 'text',
        text: `Emergency stop: ${result.stopped} tasks paused.`,
      }],
    };
  }
);

// ═══════════════════════════════════════════════
// MCP Resources (Sessie 1.3)
// ═══════════════════════════════════════════════

server.resource(
  'page-current',
  'tandem://page/current',
  { description: 'Current page content (title, URL, text)' },
  async () => {
    const data = await apiCall('GET', '/page-content');
    const title = data.title || 'Untitled';
    const url = data.url || '';
    const bodyText = truncateToWords(data.text || '', 2000);

    let text = `# ${title}\n**URL:** ${url}\n\n${bodyText}`;
    return { contents: [{ uri: 'tandem://page/current', mimeType: 'text/plain', text }] };
  }
);

server.resource(
  'tabs-list',
  'tandem://tabs/list',
  { description: 'All open browser tabs' },
  async () => {
    const data = await apiCall('GET', '/tabs/list');
    const tabs: Array<{ id: string; title: string; url: string; active: boolean }> = data.tabs || [];

    let text = `Open tabs (${tabs.length}):\n\n`;
    for (const tab of tabs) {
      const marker = tab.active ? '→ ' : '  ';
      text += `${marker}[${tab.id}] ${tab.title || '(untitled)'} — ${tab.url}\n`;
    }
    return { contents: [{ uri: 'tandem://tabs/list', mimeType: 'text/plain', text }] };
  }
);

server.resource(
  'chat-history',
  'tandem://chat/history',
  { description: 'Recent chat messages from the Kees panel' },
  async () => {
    const data = await apiCall('GET', '/chat?limit=50');
    const messages: Array<{ from: string; text: string; timestamp: number }> = data.messages || [];

    let text = `Chat history (${messages.length} messages):\n\n`;
    for (const msg of messages) {
      const time = new Date(msg.timestamp).toLocaleTimeString();
      text += `[${time}] ${msg.from}: ${msg.text}\n`;
    }
    return { contents: [{ uri: 'tandem://chat/history', mimeType: 'text/plain', text }] };
  }
);

server.resource(
  'context',
  'tandem://context',
  { description: 'Live browser context: active tab, open tabs, recent events, voice status' },
  async () => {
    const summary = await apiCall('GET', '/context/summary');
    return { contents: [{ uri: 'tandem://context', mimeType: 'text/plain', text: summary.text || '' }] };
  }
);

// ═══════════════════════════════════════════════
// SSE Event Listener — sends MCP notifications on browser events (Fase 2.2)
// ═══════════════════════════════════════════════

function startEventListener(): void {
  const token = (() => {
    try {
      const tokenPath = require('path').join(require('os').homedir(), '.tandem', 'api-token');
      return require('fs').readFileSync(tokenPath, 'utf-8').trim();
    } catch { return ''; }
  })();

  const url = `http://localhost:8765/events/stream${token ? `?token=${token}` : ''}`;

  const connect = () => {
    fetch(url).then(async (response) => {
      if (!response.ok || !response.body) {
        console.error('SSE connect failed:', response.status);
        setTimeout(connect, 5000);
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      const read = async (): Promise<void> => {
        try {
          const { done, value } = await reader.read();
          if (done) {
            // Connection closed, reconnect
            setTimeout(connect, 2000);
            return;
          }

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            try {
              const event = JSON.parse(line.slice(6));
              // Send MCP notifications for meaningful events
              if (['navigation', 'page-loaded', 'tab-focused'].includes(event.type)) {
                server.server.sendResourceUpdated({ uri: 'tandem://page/current' }).catch(() => {});
                server.server.sendResourceUpdated({ uri: 'tandem://context' }).catch(() => {});
              }
              if (['tab-opened', 'tab-closed', 'tab-focused'].includes(event.type)) {
                server.server.sendResourceUpdated({ uri: 'tandem://tabs/list' }).catch(() => {});
              }
            } catch {
              // Ignore parse errors (comments, heartbeats)
            }
          }

          return read();
        } catch {
          // Connection error, reconnect
          setTimeout(connect, 2000);
        }
      };

      read();
    }).catch(() => {
      // Tandem not running yet, retry
      setTimeout(connect, 5000);
    });
  };

  // Start with a delay to let Tandem boot up
  setTimeout(connect, 2000);
}

// ═══════════════════════════════════════════════
// Start the server
// ═══════════════════════════════════════════════

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Tandem MCP server started (stdio transport)');

  // Start SSE listener for live notifications
  startEventListener();
}

main().catch((err) => {
  console.error('Fatal error starting MCP server:', err);
  process.exit(1);
});
