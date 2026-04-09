import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { apiCall, logActivity } from './api-client.js';
import { API_PORT } from '../utils/constants';
import { createLogger } from '../utils/logger';
import { hostnameMatches, tryParseUrl, urlHasProtocol } from '../utils/security';

const log = createLogger('McpServer');

const server = new McpServer({
  name: 'tandem-browser',
  version: '0.2.0',  // 52 tools
});

/** Build X-Tab-Id headers when a tabId is provided */
function tabHeaders(tabId?: string): Record<string, string> | undefined {
  return tabId ? { 'X-Tab-Id': tabId } : undefined;
}

// ═══════════════════════════════════════════════
// tandem_navigate — Navigate to a URL
// ═══════════════════════════════════════════════

server.tool(
  'tandem_navigate',
  'Navigate a browser tab to a URL. Supports targeting a background tab by ID.',
  {
    url: z.string().describe('The URL to navigate to'),
    tabId: z.string().optional().describe('Optional tab ID to target a background tab instead of the active tab'),
  },
  async ({ url, tabId }) => {
    await apiCall('POST', '/navigate', { url }, tabHeaders(tabId));
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
  'Read page content as markdown text (max 2000 words). Supports targeting a background tab by ID.',
  {
    tabId: z.string().optional().describe('Optional tab ID to target a background tab instead of the active tab'),
  },
  async ({ tabId }) => {
    const data = await apiCall('GET', '/page-content', undefined, tabHeaders(tabId));
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

// ═══════════════════════════════════════════════
// tandem_get_links — Get all links on the current page
// ═══════════════════════════════════════════════

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

// ═══════════════════════════════════════════════
// tandem_wait_for_load — Wait for the page to finish loading
// ═══════════════════════════════════════════════

server.tool(
  'tandem_wait_for_load',
  'Wait for a page to finish loading. Supports targeting a background tab by ID.',
  {
    timeout: z.number().optional().default(10000).describe('Timeout in milliseconds (default: 10000)'),
    tabId: z.string().optional().describe('Optional tab ID to target a background tab instead of the active tab'),
  },
  async ({ timeout, tabId }) => {
    const result = await apiCall('POST', '/wait', { timeout }, tabHeaders(tabId));
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
  'Click an element on the page by CSS selector. Supports targeting a background tab by ID.',
  {
    selector: z.string().describe('CSS selector of the element to click'),
    tabId: z.string().optional().describe('Optional tab ID to target a background tab instead of the active tab'),
  },
  async ({ selector, tabId }) => {
    const result = await apiCall('POST', '/click', { selector }, tabHeaders(tabId));
    await logActivity('click', selector);
    return { content: [{ type: 'text', text: `Clicked: ${selector} — ${JSON.stringify(result)}` }] };
  }
);

// ═══════════════════════════════════════════════
// tandem_type — Type text into an element
// ═══════════════════════════════════════════════

server.tool(
  'tandem_type',
  'Type text into an input field by CSS selector. Supports targeting a background tab by ID.',
  {
    selector: z.string().describe('CSS selector of the input field'),
    text: z.string().describe('Text to type'),
    clear: z.boolean().optional().default(false).describe('Clear the field before typing'),
    tabId: z.string().optional().describe('Optional tab ID to target a background tab instead of the active tab'),
  },
  async ({ selector, text, clear, tabId }) => {
    await apiCall('POST', '/type', { selector, text, clear }, tabHeaders(tabId));
    await logActivity('type', `${selector}: "${text.substring(0, 50)}"`);
    return { content: [{ type: 'text', text: `Typed "${text}" into ${selector}` }] };
  }
);

// ═══════════════════════════════════════════════
// tandem_scroll — Scroll the page
// ═══════════════════════════════════════════════

server.tool(
  'tandem_scroll',
  'Scroll the page up or down, to top/bottom, or to a specific element. Supports targeting a background tab by ID.',
  {
    direction: z.enum(['up', 'down']).describe('Scroll direction'),
    amount: z.number().optional().default(500).describe('Scroll amount in pixels (default: 500)'),
    target: z.enum(['top', 'bottom']).optional().describe('Scroll to absolute position: top or bottom of page'),
    selector: z.string().optional().describe('CSS selector of element to scroll into view'),
    tabId: z.string().optional().describe('Optional tab ID to target a background tab instead of the active tab'),
  },
  async ({ direction, amount, target, selector, tabId }) => {
    const body: Record<string, unknown> = { direction, amount };
    if (target) body.target = target;
    if (selector) body.selector = selector;
    await apiCall('POST', '/scroll', body, tabHeaders(tabId));
    const detail = target ? target : selector ? `to ${selector}` : `${direction} ${amount}px`;
    await logActivity('scroll', detail);
    return { content: [{ type: 'text', text: `Scrolled ${detail}` }] };
  }
);

// ═══════════════════════════════════════════════
// tandem_press_key — Send a keyboard event
// ═══════════════════════════════════════════════

server.tool(
  'tandem_press_key',
  'Send a keyboard event (keyDown + keyUp) to the browser tab. Common key names: PageDown, PageUp, Escape, Enter, Tab, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Backspace, Delete, Home, End, Space. For modifier combos use the modifiers param: ["control"], ["shift"], ["meta", "shift"], ["alt"]. Supports targeting a background tab by ID.',
  {
    key: z.string().describe('Key to press (e.g. "PageDown", "Escape", "Enter", "Tab", "a", "ArrowDown")'),
    modifiers: z.array(z.string()).optional().describe('Optional modifier keys: "control", "shift", "alt", "meta" (e.g. ["control", "shift"])'),
    tabId: z.string().optional().describe('Optional tab ID to target a background tab instead of the active tab'),
  },
  async ({ key, modifiers, tabId }) => {
    const body: Record<string, unknown> = { key };
    if (modifiers && modifiers.length > 0) body.modifiers = modifiers;
    const result = await apiCall('POST', '/press-key', body, tabHeaders(tabId));
    const detail = modifiers && modifiers.length > 0 ? `${modifiers.join('+')}+${key}` : key;
    await logActivity('press_key', detail);
    return { content: [{ type: 'text', text: `Pressed key: ${detail} — ${JSON.stringify(result)}` }] };
  }
);

// ═══════════════════════════════════════════════
// tandem_press_key_combo — Send multiple key presses in sequence
// ═══════════════════════════════════════════════

server.tool(
  'tandem_press_key_combo',
  'Send multiple key presses in sequence with a small delay between each. Useful for things like pressing Tab 3 times then Enter, or typing a sequence of arrow key navigations. Uses the same key names as tandem_press_key.',
  {
    keys: z.array(z.string()).describe('Array of key names to press in sequence (e.g. ["Tab", "Tab", "Tab", "Enter"])'),
    tabId: z.string().optional().describe('Optional tab ID to target a background tab instead of the active tab'),
  },
  async ({ keys, tabId }) => {
    const result = await apiCall('POST', '/press-key-combo', { keys }, tabHeaders(tabId));
    const detail = keys.join(' → ');
    await logActivity('press_key_combo', detail);
    return { content: [{ type: 'text', text: `Pressed keys: ${detail} — ${JSON.stringify(result)}` }] };
  }
);

// ═══════════════════════════════════════════════
// tandem_snapshot — Get accessibility tree with @ref IDs
// ═══════════════════════════════════════════════

server.tool(
  'tandem_snapshot',
  'Get the accessibility tree of the page with @ref IDs for element interaction. Supports targeting a background tab by ID.',
  {
    tabId: z.string().optional().describe('Optional tab ID to target a background tab instead of the active tab'),
    compact: z.boolean().optional().describe('Return a compact snapshot (fewer details)'),
    interactive: z.boolean().optional().describe('Only include interactive elements'),
    selector: z.string().optional().describe('CSS selector to scope the snapshot to a subtree'),
  },
  async ({ tabId, compact, interactive, selector }) => {
    const params = new URLSearchParams();
    if (compact) params.set('compact', 'true');
    if (interactive) params.set('interactive', 'true');
    if (selector) params.set('selector', selector);
    const qs = params.toString();
    const endpoint = qs ? `/snapshot?${qs}` : '/snapshot';
    const data = await apiCall('GET', endpoint, undefined, tabHeaders(tabId));
    await logActivity('snapshot', `${data.count ?? 0} nodes`);
    return { content: [{ type: 'text', text: data.snapshot || '' }] };
  }
);

// ═══════════════════════════════════════════════
// tandem_snapshot_click — Click element by @ref from snapshot
// ═══════════════════════════════════════════════

server.tool(
  'tandem_snapshot_click',
  'Click an element by its @ref ID from a previous snapshot. Supports targeting a background tab by ID.',
  {
    ref: z.string().describe('The @ref ID of the element to click (e.g. "@e1")'),
    tabId: z.string().optional().describe('Optional tab ID to target a background tab instead of the active tab'),
  },
  async ({ ref, tabId }) => {
    await apiCall('POST', '/snapshot/click', { ref }, tabHeaders(tabId));
    await logActivity('snapshot_click', ref);
    return { content: [{ type: 'text', text: `Clicked element ${ref}` }] };
  }
);

// ═══════════════════════════════════════════════
// tandem_snapshot_fill — Fill input by @ref from snapshot
// ═══════════════════════════════════════════════

server.tool(
  'tandem_snapshot_fill',
  'Fill an input element by its @ref ID from a previous snapshot. Supports targeting a background tab by ID.',
  {
    ref: z.string().describe('The @ref ID of the input element (e.g. "@e3")'),
    value: z.string().describe('The value to fill into the input'),
    tabId: z.string().optional().describe('Optional tab ID to target a background tab instead of the active tab'),
  },
  async ({ ref, value, tabId }) => {
    await apiCall('POST', '/snapshot/fill', { ref, value }, tabHeaders(tabId));
    await logActivity('snapshot_fill', `${ref}: "${value.substring(0, 50)}"`);
    return { content: [{ type: 'text', text: `Filled element ${ref} with "${value}"` }] };
  }
);

// ═══════════════════════════════════════════════
// tandem_find — Find elements by semantic locator
// ═══════════════════════════════════════════════

server.tool(
  'tandem_find',
  'Find elements on the page by semantic locator (role, text, label, or placeholder). Supports targeting a background tab by ID.',
  {
    by: z.enum(['role', 'text', 'label', 'placeholder']).describe('Locator strategy'),
    value: z.string().describe('Value to search for'),
    tabId: z.string().optional().describe('Optional tab ID to target a background tab instead of the active tab'),
  },
  async ({ by, value, tabId }) => {
    const result = await apiCall('POST', '/find', { by, value }, tabHeaders(tabId));
    await logActivity('find', `${by}="${value}"`);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  }
);

// ═══════════════════════════════════════════════
// tandem_find_click — Find and click element
// ═══════════════════════════════════════════════

server.tool(
  'tandem_find_click',
  'Find an element by semantic locator and click it. Supports targeting a background tab by ID.',
  {
    by: z.enum(['role', 'text', 'label', 'placeholder']).describe('Locator strategy'),
    value: z.string().describe('Value to search for'),
    tabId: z.string().optional().describe('Optional tab ID to target a background tab instead of the active tab'),
  },
  async ({ by, value, tabId }) => {
    const result = await apiCall('POST', '/find/click', { by, value }, tabHeaders(tabId));
    await logActivity('find_click', `${by}="${value}"`);
    return { content: [{ type: 'text', text: `Clicked element found by ${by}="${value}" (ref: ${result.ref})` }] };
  }
);

// ═══════════════════════════════════════════════
// tandem_find_fill — Find and fill element
// ═══════════════════════════════════════════════

server.tool(
  'tandem_find_fill',
  'Find an input element by semantic locator and fill it with text. Supports targeting a background tab by ID.',
  {
    by: z.enum(['role', 'text', 'label', 'placeholder']).describe('Locator strategy'),
    value: z.string().describe('Value to search for the element'),
    text: z.string().describe('Text to fill into the input'),
    tabId: z.string().optional().describe('Optional tab ID to target a background tab instead of the active tab'),
  },
  async ({ by, value, text, tabId }) => {
    const result = await apiCall('POST', '/find/fill', { by, value, fillValue: text }, tabHeaders(tabId));
    await logActivity('find_fill', `${by}="${value}": "${text.substring(0, 50)}"`);
    return { content: [{ type: 'text', text: `Filled element found by ${by}="${value}" with "${text}" (ref: ${result.ref})` }] };
  }
);

// ═══════════════════════════════════════════════
// tandem_get_forms — Get all forms on page with fields
// ═══════════════════════════════════════════════

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

// ═══════════════════════════════════════════════
// tandem_execute_js — Execute JavaScript in the active tab
// ═══════════════════════════════════════════════

server.tool(
  'tandem_execute_js',
  'Execute JavaScript code in the active browser tab. Returns the result.',
  {
    code: z.string().describe('JavaScript code to execute'),
  },
  {
    destructiveHint: true,
    readOnlyHint: false,
    openWorldHint: true,
  },
  async ({ code }) => {
    try {
      const result = await apiCall('POST', '/execute-js/confirm', { code });
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
  'Open a new browser tab, optionally with a URL and workspace assignment',
  {
    url: z.string().optional().describe('URL to open (default: new tab page)'),
    workspaceId: z.string().optional().describe('Optional workspace ID to assign the new tab to'),
  },
  async ({ url, workspaceId }) => {
    const body: Record<string, unknown> = { url: url || undefined, source: 'wingman' };
    if (workspaceId) body.workspaceId = workspaceId;
    const result = await apiCall('POST', '/tabs/open', body);
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
// tandem_send_message — Send a message to the Wingman panel
// ═══════════════════════════════════════════════

server.tool(
  'tandem_send_message',
  'Send a message that appears in the Wingman chat panel (visible to the human)',
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
  'Get recent chat messages from the Wingman panel',
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
// tandem_research — Autonomous research (Phase 4.2)
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
      // Step 1: Open a new tab for research (source: wingman)
      const tabResult = await apiCall('POST', '/tabs/open', { url: 'about:blank', source: 'wingman' });
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
// DevTools — CDP Bridge tools
// ═══════════════════════════════════════════════

server.tool(
  'tandem_devtools_console',
  'Get console log entries from the browser DevTools. Use to inspect logs, warnings, errors, and debug output from the page. Supports filtering by level (log, warn, error, info, debug) and searching message text. Supports targeting a background tab by ID.',
  {
    level: z.string().optional().describe('Filter by log level: log, warn, error, info, debug'),
    search: z.string().optional().describe('Search string to filter messages'),
    limit: z.number().optional().describe('Maximum entries to return (default: 100)'),
    tabId: z.string().optional().describe('Optional tab ID to target a background tab instead of the active tab'),
  },
  async ({ level, search, limit, tabId }) => {
    const params = new URLSearchParams();
    if (level) params.set('level', level);
    if (search) params.set('search', search);
    if (limit !== undefined) params.set('limit', String(limit));
    const qs = params.toString();
    const endpoint = qs ? `/devtools/console?${qs}` : '/devtools/console';
    const data = await apiCall('GET', endpoint, undefined, tabHeaders(tabId));
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  'tandem_devtools_console_errors',
  'Get only console errors from the browser DevTools. A quick way to check if the page has any JavaScript errors. Supports targeting a background tab by ID.',
  {
    limit: z.number().optional().describe('Maximum errors to return (default: 50)'),
    tabId: z.string().optional().describe('Optional tab ID to target a background tab instead of the active tab'),
  },
  async ({ limit, tabId }) => {
    const params = new URLSearchParams();
    if (limit !== undefined) params.set('limit', String(limit));
    const qs = params.toString();
    const endpoint = qs ? `/devtools/console/errors?${qs}` : '/devtools/console/errors';
    const data = await apiCall('GET', endpoint, undefined, tabHeaders(tabId));
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  'tandem_devtools_network',
  'Get network request entries captured via CDP (Chrome DevTools Protocol). Includes full headers and POST bodies. Use to inspect API calls, failed requests, and resource loading. Supports targeting a background tab by ID.',
  {
    domain: z.string().optional().describe('Filter by domain (e.g. "api.example.com")'),
    type: z.string().optional().describe('Filter by resource type (e.g. "XHR", "Fetch", "Script")'),
    failed: z.boolean().optional().describe('Filter to only failed requests (true) or successful (false)'),
    limit: z.number().optional().describe('Maximum entries to return (default: 100)'),
    tabId: z.string().optional().describe('Optional tab ID to target a background tab instead of the active tab'),
  },
  async ({ domain, type, failed, limit, tabId }) => {
    const params = new URLSearchParams();
    if (domain) params.set('domain', domain);
    if (type) params.set('type', type);
    if (failed !== undefined) params.set('failed', String(failed));
    if (limit !== undefined) params.set('limit', String(limit));
    const qs = params.toString();
    const endpoint = qs ? `/devtools/network?${qs}` : '/devtools/network';
    const data = await apiCall('GET', endpoint, undefined, tabHeaders(tabId));
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  'tandem_devtools_evaluate',
  'Evaluate a JavaScript expression via CDP Runtime in the active tab. Returns the result. Use for inspecting page state, reading variables, or running diagnostic code. Supports targeting a background tab by ID. WARNING: This can modify page state.',
  {
    expression: z.string().describe('JavaScript expression to evaluate'),
    tabId: z.string().optional().describe('Optional tab ID to target a background tab instead of the active tab'),
  },
  {
    destructiveHint: true,
    readOnlyHint: false,
    openWorldHint: true,
  },
  async ({ expression, tabId }) => {
    const data = await apiCall('POST', '/devtools/evaluate', { expression }, tabHeaders(tabId));
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  'tandem_devtools_dom_query',
  'Query the DOM by CSS selector via CDP. Returns matching nodes with their attributes and text content. Use to inspect page structure without executing JavaScript. Supports targeting a background tab by ID.',
  {
    selector: z.string().describe('CSS selector to query'),
    tabId: z.string().optional().describe('Optional tab ID to target a background tab instead of the active tab'),
  },
  async ({ selector, tabId }) => {
    const data = await apiCall('POST', '/devtools/dom/query', { selector }, tabHeaders(tabId));
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  'tandem_devtools_performance',
  'Get performance metrics from the browser via CDP. Includes timing data like DOM content loaded, first paint, layout counts, and memory usage. Supports targeting a background tab by ID.',
  {
    tabId: z.string().optional().describe('Optional tab ID to target a background tab instead of the active tab'),
  },
  async ({ tabId }) => {
    const data = await apiCall('GET', '/devtools/performance', undefined, tabHeaders(tabId));
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  'tandem_devtools_storage',
  'Get browser storage data (cookies, localStorage, sessionStorage) for the current page via CDP. Supports targeting a background tab by ID.',
  {
    tabId: z.string().optional().describe('Optional tab ID to target a background tab instead of the active tab'),
  },
  async ({ tabId }) => {
    const data = await apiCall('GET', '/devtools/storage', undefined, tabHeaders(tabId));
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  }
);

// ═══════════════════════════════════════════════
// Network Inspector — webRequest-level tools
// ═══════════════════════════════════════════════

server.tool(
  'tandem_network_log',
  'Get the network request log captured via Electron webRequest API. Lighter-weight than DevTools network — shows URL, method, status, and timing for recent requests. Supports targeting a background tab by ID.',
  {
    domain: z.string().optional().describe('Filter by domain'),
    type: z.string().optional().describe('Filter by resource type'),
    limit: z.number().optional().describe('Maximum entries to return (default: 100)'),
    tabId: z.string().optional().describe('Optional tab ID to target a background tab instead of the active tab'),
  },
  async ({ domain, type, limit, tabId }) => {
    const params = new URLSearchParams();
    if (domain) params.set('domain', domain);
    if (type) params.set('type', type);
    if (limit !== undefined) params.set('limit', String(limit));
    const qs = params.toString();
    const endpoint = qs ? `/network/log?${qs}` : '/network/log';
    const data = await apiCall('GET', endpoint, undefined, tabHeaders(tabId));
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  'tandem_network_apis',
  'Get a summary of detected API endpoints from network traffic. Shows unique API paths grouped by domain, useful for understanding what services the page communicates with.',
  async () => {
    const data = await apiCall('GET', '/network/apis');
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  'tandem_network_domains',
  'Get a list of all domains that the page has made requests to, with request counts. Useful for understanding third-party dependencies and data flows.',
  async () => {
    const data = await apiCall('GET', '/network/domains');
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  'tandem_network_har',
  'Export the network log as a HAR (HTTP Archive) file. Returns a full HAR 1.2 JSON object that can be imported into browser DevTools or other analysis tools.',
  async () => {
    const data = await apiCall('GET', '/network/har');
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  'tandem_network_mock',
  'Add a network mock rule to intercept and override HTTP responses. Matched requests will return the specified status, body, and headers instead of hitting the real server. WARNING: This modifies network behavior.',
  {
    url: z.string().describe('URL pattern to match (supports wildcards)'),
    method: z.string().optional().describe('HTTP method to match (e.g. "GET", "POST")'),
    status: z.number().optional().describe('HTTP status code to return (default: 200)'),
    body: z.string().optional().describe('Response body to return'),
    headers: z.record(z.string(), z.string()).optional().describe('Response headers to return'),
  },
  {
    destructiveHint: true,
    readOnlyHint: false,
    openWorldHint: false,
  },
  async ({ url, method, status, body, headers }) => {
    const payload: Record<string, unknown> = { pattern: url };
    if (method) payload.method = method;
    if (status !== undefined) payload.status = status;
    if (body) payload.body = body;
    if (headers) payload.headers = headers;
    const data = await apiCall('POST', '/network/mock', payload);
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  'tandem_network_unmock',
  'Remove a network mock rule by URL pattern. The matching pattern must be the same as the one used when creating the mock.',
  {
    url: z.string().describe('URL pattern of the mock to remove'),
  },
  async ({ url }) => {
    const data = await apiCall('POST', '/network/unmock', { pattern: url });
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  'tandem_network_mocks',
  'List all active network mock rules. Shows the URL patterns being intercepted and their configured responses.',
  async () => {
    const data = await apiCall('GET', '/network/mocks');
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  }
);

// ═══════════════════════════════════════════════
// Workspace management tools
// ═══════════════════════════════════════════════

server.tool(
  'tandem_workspace_list',
  'List all workspaces and the currently active workspace',
  async () => {
    const data = await apiCall('GET', '/workspaces');
    await logActivity('workspace_list');
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  'tandem_workspace_create',
  'Create a new workspace for organizing tabs',
  {
    name: z.string().describe('Name for the new workspace'),
    icon: z.string().optional().describe('Optional icon for the workspace'),
    color: z.string().optional().describe('Optional color for the workspace'),
  },
  async ({ name, icon, color }) => {
    const body: Record<string, unknown> = { name };
    if (icon) body.icon = icon;
    if (color) body.color = color;
    const data = await apiCall('POST', '/workspaces', body);
    await logActivity('workspace_create', name);
    return { content: [{ type: 'text', text: `Created workspace: ${JSON.stringify(data.workspace)}` }] };
  }
);

server.tool(
  'tandem_workspace_activate',
  'Switch to a workspace by its ID',
  {
    id: z.string().describe('Workspace ID to activate'),
  },
  async ({ id }) => {
    const data = await apiCall('POST', `/workspaces/${id}/activate`);
    await logActivity('workspace_activate', id);
    return { content: [{ type: 'text', text: `Activated workspace: ${JSON.stringify(data.workspace)}` }] };
  }
);

server.tool(
  'tandem_workspace_delete',
  'Delete a workspace by its ID. This removes the workspace and ungroups its tabs.',
  {
    id: z.string().describe('Workspace ID to delete'),
  },
  {
    destructiveHint: true,
    readOnlyHint: false,
    openWorldHint: false,
  },
  async ({ id }) => {
    await apiCall('DELETE', `/workspaces/${id}`);
    await logActivity('workspace_delete', id);
    return { content: [{ type: 'text', text: `Deleted workspace: ${id}` }] };
  }
);

server.tool(
  'tandem_workspace_move_tab',
  'Move a tab into a workspace',
  {
    id: z.string().describe('Workspace ID to move the tab into'),
    tabId: z.string().describe('Tab ID to move'),
  },
  async ({ id, tabId }) => {
    await apiCall('POST', `/workspaces/${id}/tabs`, { tabId });
    await logActivity('workspace_move_tab', `tab ${tabId} → workspace ${id}`);
    return { content: [{ type: 'text', text: `Moved tab ${tabId} to workspace ${id}` }] };
  }
);

// ═══════════════════════════════════════════════
// Session management tools
// ═══════════════════════════════════════════════

server.tool(
  'tandem_session_list',
  'List all isolated browser sessions with tab counts',
  async () => {
    const data = await apiCall('GET', '/sessions/list');
    await logActivity('session_list');
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  'tandem_session_create',
  'Create a new isolated browser session with its own cookies and storage',
  {
    name: z.string().describe('Name for the new session'),
    partition: z.string().optional().describe('Optional partition identifier for session isolation'),
  },
  async ({ name, partition }) => {
    const body: Record<string, unknown> = { name };
    if (partition) body.partition = partition;
    const data = await apiCall('POST', '/sessions/create', body);
    await logActivity('session_create', name);
    return { content: [{ type: 'text', text: `Created session: ${data.name} (partition: ${data.partition})` }] };
  }
);

server.tool(
  'tandem_session_switch',
  'Switch the active browser session',
  {
    name: z.string().describe('Name of the session to switch to'),
  },
  async ({ name }) => {
    const data = await apiCall('POST', '/sessions/switch', { name });
    await logActivity('session_switch', name);
    return { content: [{ type: 'text', text: `Switched to session: ${data.active}` }] };
  }
);

server.tool(
  'tandem_session_destroy',
  'Destroy an isolated browser session and close all its tabs',
  {
    name: z.string().describe('Name of the session to destroy'),
  },
  {
    destructiveHint: true,
    readOnlyHint: false,
    openWorldHint: false,
  },
  async ({ name }) => {
    await apiCall('POST', '/sessions/destroy', { name });
    await logActivity('session_destroy', name);
    return { content: [{ type: 'text', text: `Destroyed session: ${name}` }] };
  }
);

server.tool(
  'tandem_session_fetch',
  'Perform a fetch request within the context of a browser session (same-origin, includes cookies/auth). The request runs inside the active tab using the page\'s session credentials.',
  {
    url: z.string().describe('URL to fetch (must be same-origin as the active tab)'),
    method: z.string().optional().describe('HTTP method (default: GET)'),
    body: z.string().optional().describe('Request body (for POST/PUT/PATCH)'),
    sessionName: z.string().optional().describe('Optional session name to target (uses active session if omitted)'),
  },
  async ({ url, method, body, sessionName }) => {
    const payload: Record<string, unknown> = { url };
    if (method) payload.method = method;
    if (body) payload.body = body;
    const headers = sessionName ? { 'X-Session': sessionName } : undefined;
    const data = await apiCall('POST', '/sessions/fetch', payload, headers);
    await logActivity('session_fetch', `${method || 'GET'} ${url}`);
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  }
);

// ═══════════════════════════════════════════════
// Wingman alert tool
// ═══════════════════════════════════════════════

server.tool(
  'tandem_wingman_alert',
  'Show a native OS notification alert to the user via the Wingman system',
  {
    message: z.string().describe('Alert message to display'),
    level: z.enum(['info', 'warning', 'error']).optional().describe('Alert level (default: info)'),
  },
  async ({ message, level }) => {
    const title = level === 'error' ? 'Error' : level === 'warning' ? 'Warning' : 'Info';
    await apiCall('POST', '/wingman-alert', { title, body: message });
    await logActivity('wingman_alert', `[${level || 'info'}] ${message.substring(0, 80)}`);
    return { content: [{ type: 'text', text: `Alert sent: [${level || 'info'}] ${message}` }] };
  }
);

// ═══════════════════════════════════════════════
// Tab Locks — Multi-agent coordination
// ═══════════════════════════════════════════════

server.tool(
  'tandem_tab_lock',
  'Acquire a lock on a browser tab for exclusive agent access. Use for multi-agent coordination to prevent conflicting actions on the same tab.',
  {
    tabId: z.string().describe('The tab ID to lock'),
    agent: z.string().optional().describe('Agent identifier claiming the lock'),
    timeout: z.number().optional().describe('Lock timeout in milliseconds'),
  },
  async ({ tabId, agent, timeout }) => {
    const body: Record<string, unknown> = { tabId };
    if (agent) body.agent = agent;
    if (timeout !== undefined) body.timeout = timeout;
    const data = await apiCall('POST', '/tab-locks/acquire', body);
    await logActivity('tab_lock', `locked tab ${tabId}${agent ? ` for ${agent}` : ''}`);
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  'tandem_tab_unlock',
  'Release a lock on a browser tab, allowing other agents to access it.',
  {
    tabId: z.string().describe('The tab ID to unlock'),
  },
  async ({ tabId }) => {
    const data = await apiCall('POST', '/tab-locks/release', { tabId });
    await logActivity('tab_unlock', `released tab ${tabId}`);
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  'tandem_tab_locks_list',
  'List all active tab locks. Shows which tabs are locked and by which agents.',
  async () => {
    const data = await apiCall('GET', '/tab-locks');
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  }
);

// ═══════════════════════════════════════════════
// Content & Utility tools
// ═══════════════════════════════════════════════

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
  'tandem_get_page_html',
  'Get the raw HTML source of the current page. Supports targeting a background tab by ID.',
  {
    tabId: z.string().optional().describe('Optional tab ID to target a background tab instead of the active tab'),
  },
  async ({ tabId }) => {
    const data = await apiCall('GET', '/page-html', undefined, tabHeaders(tabId));
    return { content: [{ type: 'text', text: typeof data === 'string' ? data : JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  'tandem_get_cookies',
  'Get browser cookies, optionally filtered by URL.',
  {
    url: z.string().optional().describe('URL to filter cookies for'),
  },
  async ({ url }) => {
    const params = new URLSearchParams();
    if (url) params.set('url', url);
    const qs = params.toString();
    const endpoint = qs ? `/cookies?${qs}` : '/cookies';
    const data = await apiCall('GET', endpoint);
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  'tandem_clear_cookies',
  'Clear browser cookies, optionally filtered by domain.',
  {
    domain: z.string().optional().describe('Domain to clear cookies for (clears all if omitted)'),
  },
  async ({ domain }) => {
    const body: Record<string, unknown> = {};
    if (domain) body.domain = domain;
    const data = await apiCall('POST', '/cookies/clear', body);
    await logActivity('clear_cookies', domain ? `domain: ${domain}` : 'all cookies');
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
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

    const text = `# ${title}\n**URL:** ${url}\n\n${bodyText}`;
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
  { description: 'Recent chat messages from the Wingman panel' },
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
// SSE Event Listener — sends MCP notifications on browser events (Phase 2.2)
// ═══════════════════════════════════════════════

function startEventListener(): void {
  const token = (() => {
    try {
      const tokenPath = require('path').join(require('os').homedir(), '.tandem', 'api-token');
      return require('fs').readFileSync(tokenPath, 'utf-8').trim();
    } catch { return ''; }
  })();

  const url = `http://localhost:${API_PORT}/events/stream`;

  const connect = () => {
    fetch(url, token ? { headers: { 'Authorization': `Bearer ${token}` } } : {}).then(async (response) => {
      if (!response.ok || !response.body) {
        log.error('SSE connect failed:', response.status);
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
                server.server.sendResourceUpdated({ uri: 'tandem://page/current' }).catch(e => log.warn('sendResourceUpdated page/current failed:', e instanceof Error ? e.message : e));
                server.server.sendResourceUpdated({ uri: 'tandem://context' }).catch(e => log.warn('sendResourceUpdated context failed:', e instanceof Error ? e.message : e));
              }
              if (['tab-opened', 'tab-closed', 'tab-focused'].includes(event.type)) {
                server.server.sendResourceUpdated({ uri: 'tandem://tabs/list' }).catch(e => log.warn('sendResourceUpdated tabs/list failed:', e instanceof Error ? e.message : e));
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

      void read();
    }).catch(() => {
      // Tandem not running yet, retry
      setTimeout(connect, 5000);
    });
  };

  // Start with a delay to let Tandem boot up
  setTimeout(connect, 2000);
}

// ═══════════════════════════════════════════════
// tandem_preview_create — Create a live HTML preview
// ═══════════════════════════════════════════════

server.tool(
  'tandem_preview_create',
  'Create a live HTML preview page in Tandem Browser. Returns the preview URL. The page supports live reload — use tandem_preview_update to push changes.',
  {
    html: z.string().describe('The HTML content for the preview page'),
    title: z.string().optional().describe('Optional title for the preview'),
  },
  async ({ html, title }) => {
    const body: Record<string, string> = { html };
    if (title) body.title = title;
    const data = await apiCall('POST', '/preview', body);
    await logActivity('preview_create', data.title || title || 'Untitled');
    return { content: [{ type: 'text', text: JSON.stringify({ id: data.id, url: data.url, title: data.title }) }] };
  }
);

// ═══════════════════════════════════════════════
// tandem_preview_update — Update a live HTML preview
// ═══════════════════════════════════════════════

server.tool(
  'tandem_preview_update',
  'Update the HTML content of an existing preview. The browser tab will live-reload automatically.',
  {
    id: z.string().describe('The preview ID to update'),
    html: z.string().describe('The new HTML content'),
  },
  async ({ id, html }) => {
    const data = await apiCall('PUT', `/preview/${encodeURIComponent(id)}`, { html });
    await logActivity('preview_update', `${id} (v${data.version})`);
    return { content: [{ type: 'text', text: JSON.stringify({ id: data.id, version: data.version, url: data.url }) }] };
  }
);

// ═══════════════════════════════════════════════
// tandem_preview_list — List all active previews
// ═══════════════════════════════════════════════

server.tool(
  'tandem_preview_list',
  'List all active HTML previews with their IDs, titles, and URLs.',
  async () => {
    const data = await apiCall('GET', '/previews');
    await logActivity('preview_list');
    return { content: [{ type: 'text', text: JSON.stringify(data.previews) }] };
  }
);

// ═══════════════════════════════════════════════
// tandem_preview_delete — Delete a preview
// ═══════════════════════════════════════════════

server.tool(
  'tandem_preview_delete',
  'Delete an existing HTML preview.',
  {
    id: z.string().describe('The preview ID to delete'),
  },
  {
    destructiveHint: true,
    readOnlyHint: false,
    openWorldHint: false,
  },
  async ({ id }) => {
    await apiCall('DELETE', `/preview/${encodeURIComponent(id)}`);
    await logActivity('preview_delete', id);
    return { content: [{ type: 'text', text: `Preview '${id}' deleted` }] };
  }
);

// ═══════════════════════════════════════════════
// Start the server
// ═══════════════════════════════════════════════

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  log.info('Tandem MCP server started (stdio transport)');

  // Start SSE listener for live notifications
  startEventListener();
}

main().catch((err) => {
  log.error('Fatal error starting MCP server:', err);
  process.exit(1);
});
