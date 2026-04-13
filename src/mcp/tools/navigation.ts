import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { apiCall, tabHeaders, logActivity } from '../api-client.js';
import { coerceShape } from '../coerce.js';

function summarizeActionResult(prefix: string, result: Record<string, unknown>): string {
  const scope = result.scope as Record<string, unknown> | undefined;
  const completion = result.completion as Record<string, unknown> | undefined;
  const scopeLabel = typeof scope?.tabId === 'string' ? `tab ${scope.tabId}` : 'active scope';
  const mode = completion?.mode === 'confirmed' ? 'confirmed' : 'dispatched';
  const caveat = typeof completion?.caveat === 'string' ? ` Caveat: ${completion.caveat}` : '';
  return `${prefix} (${scopeLabel}; ${mode}).${caveat}\n\n${JSON.stringify(result, null, 2)}`;
}

export function registerNavigationTools(server: McpServer): void {
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

  server.tool(
    'tandem_go_back',
    'Go back to the previous page in browser history',
    async () => {
      await apiCall('POST', '/execute-js', { code: 'window.history.back()' });
      await logActivity('go_back');
      return { content: [{ type: 'text', text: 'Navigated back' }] };
    }
  );

  server.tool(
    'tandem_go_forward',
    'Go forward to the next page in browser history',
    async () => {
      await apiCall('POST', '/execute-js', { code: 'window.history.forward()' });
      await logActivity('go_forward');
      return { content: [{ type: 'text', text: 'Navigated forward' }] };
    }
  );

  server.tool(
    'tandem_reload',
    'Reload the current page',
    async () => {
      await apiCall('POST', '/execute-js', { code: 'window.location.reload()' });
      await logActivity('reload');
      return { content: [{ type: 'text', text: 'Page reloaded' }] };
    }
  );

  server.tool(
    'tandem_wait_for_load',
    'Wait for a page to finish loading. Returns the resolved tab scope and whether the wait completed or timed out. Supports targeting a background tab by ID.',
    coerceShape({
      timeout: z.number().optional().default(10000).describe('Timeout in milliseconds (default: 10000)'),
      tabId: z.string().optional().describe('Optional tab ID to target a background tab instead of the active tab'),
    }),
    async ({ timeout, tabId }) => {
      const result = await apiCall('POST', '/wait', { timeout }, tabHeaders(tabId));
      await logActivity('wait_for_load');

      if (result.timeout) {
        return { content: [{ type: 'text', text: `Page load timed out.\n\n${JSON.stringify(result, null, 2)}` }] };
      }
      return { content: [{ type: 'text', text: `Page loaded successfully.\n\n${JSON.stringify(result, null, 2)}` }] };
    }
  );

  server.tool(
    'tandem_click',
    'Click an element on the page by CSS selector. Returns explicit scope, completion semantics, and post-action state. Supports targeting a background tab by ID.',
    {
      selector: z.string().describe('CSS selector of the element to click'),
      tabId: z.string().optional().describe('Optional tab ID to target a background tab instead of the active tab'),
    },
    async ({ selector, tabId }) => {
      const result = await apiCall('POST', '/click', { selector }, tabHeaders(tabId));
      await logActivity('click', selector);
      return { content: [{ type: 'text', text: summarizeActionResult(`Clicked ${selector}`, result) }] };
    }
  );

  server.tool(
    'tandem_type',
    'Type text into an input field by CSS selector. Returns explicit scope, completion semantics, and confirmed post-type state when available. Supports targeting a background tab by ID.',
    coerceShape({
      selector: z.string().describe('CSS selector of the input field'),
      text: z.string().describe('Text to type'),
      clear: z.boolean().optional().default(false).describe('Clear the field before typing'),
      tabId: z.string().optional().describe('Optional tab ID to target a background tab instead of the active tab'),
    }),
    async ({ selector, text, clear, tabId }) => {
      const result = await apiCall('POST', '/type', { selector, text, clear }, tabHeaders(tabId));
      await logActivity('type', `${selector}: "${text.substring(0, 50)}"`);
      return { content: [{ type: 'text', text: summarizeActionResult(`Typed "${text}" into ${selector}`, result) }] };
    }
  );

  server.tool(
    'tandem_scroll',
    'Scroll the page up or down, to top/bottom, or to a specific element. Supports targeting a background tab by ID.',
    coerceShape({
      direction: z.enum(['up', 'down']).describe('Scroll direction'),
      amount: z.number().optional().default(500).describe('Scroll amount in pixels (default: 500)'),
      target: z.enum(['top', 'bottom']).optional().describe('Scroll to absolute position: top or bottom of page'),
      selector: z.string().optional().describe('CSS selector of element to scroll into view'),
      tabId: z.string().optional().describe('Optional tab ID to target a background tab instead of the active tab'),
    }),
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

  server.tool(
    'tandem_press_key',
    'Send a keyboard event (keyDown + keyUp) to the browser tab. Returns explicit scope, completion semantics, and post-action page state; it does not claim a stronger guarantee than the route can confirm. Common key names: PageDown, PageUp, Escape, Enter, Tab, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Backspace, Delete, Home, End, Space. For modifier combos use the modifiers param: ["control"], ["shift"], ["meta", "shift"], ["alt"]. Supports targeting a background tab by ID.',
    coerceShape({
      key: z.string().describe('Key to press (e.g. "PageDown", "Escape", "Enter", "Tab", "a", "ArrowDown")'),
      modifiers: z.array(z.string()).optional().describe('Optional modifier keys: "control", "shift", "alt", "meta" (e.g. ["control", "shift"])'),
      tabId: z.string().optional().describe('Optional tab ID to target a background tab instead of the active tab'),
    }),
    async ({ key, modifiers, tabId }) => {
      const body: Record<string, unknown> = { key };
      if (modifiers && modifiers.length > 0) body.modifiers = modifiers;
      const result = await apiCall('POST', '/press-key', body, tabHeaders(tabId));
      const detail = modifiers && modifiers.length > 0 ? `${modifiers.join('+')}+${key}` : key;
      await logActivity('press_key', detail);
      return { content: [{ type: 'text', text: summarizeActionResult(`Pressed key ${detail}`, result) }] };
    }
  );

  server.tool(
    'tandem_press_key_combo',
    'Send multiple key presses in sequence with a small delay between each. Returns explicit scope, completion semantics, and post-action page state; it does not claim a stronger guarantee than the route can confirm. Useful for things like pressing Tab 3 times then Enter, or typing a sequence of arrow key navigations. Uses the same key names as tandem_press_key.',
    coerceShape({
      keys: z.array(z.string()).describe('Array of key names to press in sequence (e.g. ["Tab", "Tab", "Tab", "Enter"])'),
      tabId: z.string().optional().describe('Optional tab ID to target a background tab instead of the active tab'),
    }),
    async ({ keys, tabId }) => {
      const result = await apiCall('POST', '/press-key-combo', { keys }, tabHeaders(tabId));
      const detail = keys.join(' → ');
      await logActivity('press_key_combo', detail);
      return { content: [{ type: 'text', text: summarizeActionResult(`Pressed keys ${detail}`, result) }] };
    }
  );
}
