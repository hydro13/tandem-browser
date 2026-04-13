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

export function registerSnapshotTools(server: McpServer): void {
  server.tool(
    'tandem_snapshot',
    'Get the accessibility tree of the page with @ref IDs for element interaction. Supports targeting a background tab by ID.',
    coerceShape({
      tabId: z.string().optional().describe('Optional tab ID to target a background tab instead of the active tab'),
      compact: z.boolean().optional().describe('Return a compact snapshot (fewer details)'),
      interactive: z.boolean().optional().describe('Only include interactive elements'),
      selector: z.string().optional().describe('CSS selector to scope the snapshot to a subtree'),
    }),
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

  server.tool(
    'tandem_snapshot_click',
    'Click an element by its @ref ID from a previous snapshot. Returns explicit scope, completion semantics, and post-action state. Supports targeting a background tab by ID.',
    {
      ref: z.string().describe('The @ref ID of the element to click (e.g. "@e1")'),
      tabId: z.string().optional().describe('Optional tab ID to target a background tab instead of the active tab'),
    },
    async ({ ref, tabId }) => {
      const result = await apiCall('POST', '/snapshot/click', { ref }, tabHeaders(tabId));
      await logActivity('snapshot_click', ref);
      return { content: [{ type: 'text', text: summarizeActionResult(`Clicked element ${ref}`, result) }] };
    }
  );

  server.tool(
    'tandem_snapshot_fill',
    'Fill an input element by its @ref ID from a previous snapshot. Returns explicit scope, completion semantics, and confirmed post-fill state when available. Supports targeting a background tab by ID.',
    {
      ref: z.string().describe('The @ref ID of the input element (e.g. "@e3")'),
      value: z.string().describe('The value to fill into the input'),
      tabId: z.string().optional().describe('Optional tab ID to target a background tab instead of the active tab'),
    },
    async ({ ref, value, tabId }) => {
      const result = await apiCall('POST', '/snapshot/fill', { ref, value }, tabHeaders(tabId));
      await logActivity('snapshot_fill', `${ref}: "${value.substring(0, 50)}"`);
      return { content: [{ type: 'text', text: summarizeActionResult(`Filled element ${ref} with "${value}"`, result) }] };
    }
  );

  server.tool(
    'tandem_snapshot_text',
    'Get the text content of an element by its @ref ID from a previous snapshot. Supports targeting a background tab by ID.',
    {
      ref: z.string().describe('The @ref ID of the element (e.g. "@e1")'),
      tabId: z.string().optional().describe('Optional tab ID to target a background tab instead of the active tab'),
    },
    async ({ ref, tabId }) => {
      const params = new URLSearchParams({ ref });
      const data = await apiCall('GET', `/snapshot/text?${params.toString()}`, undefined, tabHeaders(tabId));
      await logActivity('snapshot_text', ref);
      return { content: [{ type: 'text', text: data.text ?? '' }] };
    }
  );

  server.tool(
    'tandem_find',
    'Find elements on the page by semantic locator (role, text, label, or placeholder). Returns the locator query result plus the resolved tab scope. Supports targeting a background tab by ID.',
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

  server.tool(
    'tandem_find_click',
    'Find an element by semantic locator and click it. Returns the resolved tab scope, locator resolution details, completion semantics, and post-action state. Supports targeting a background tab by ID.',
    {
      by: z.enum(['role', 'text', 'label', 'placeholder']).describe('Locator strategy'),
      value: z.string().describe('Value to search for'),
      tabId: z.string().optional().describe('Optional tab ID to target a background tab instead of the active tab'),
    },
    async ({ by, value, tabId }) => {
      const result = await apiCall('POST', '/find/click', { by, value }, tabHeaders(tabId));
      await logActivity('find_click', `${by}="${value}"`);
      return { content: [{ type: 'text', text: summarizeActionResult(`Clicked element found by ${by}="${value}"`, result) }] };
    }
  );

  server.tool(
    'tandem_find_fill',
    'Find an input element by semantic locator and fill it with text. Returns the resolved tab scope, locator resolution details, completion semantics, and confirmed post-fill state when available. Supports targeting a background tab by ID.',
    {
      by: z.enum(['role', 'text', 'label', 'placeholder']).describe('Locator strategy'),
      value: z.string().describe('Value to search for the element'),
      text: z.string().describe('Text to fill into the input'),
      tabId: z.string().optional().describe('Optional tab ID to target a background tab instead of the active tab'),
    },
    async ({ by, value, text, tabId }) => {
      const result = await apiCall('POST', '/find/fill', { by, value, fillValue: text }, tabHeaders(tabId));
      await logActivity('find_fill', `${by}="${value}": "${text.substring(0, 50)}"`);
      return { content: [{ type: 'text', text: summarizeActionResult(`Filled element found by ${by}="${value}" with "${text}"`, result) }] };
    }
  );

  server.tool(
    'tandem_find_all',
    'Find all matching elements on the page by semantic locator. Returns all matches instead of just the first. Supports targeting a background tab by ID.',
    {
      by: z.enum(['role', 'text', 'label', 'placeholder']).describe('Locator strategy'),
      value: z.string().describe('Value to search for'),
      tabId: z.string().optional().describe('Optional tab ID to target a background tab instead of the active tab'),
    },
    async ({ by, value, tabId }) => {
      const result = await apiCall('POST', '/find/all', { by, value }, tabHeaders(tabId));
      await logActivity('find_all', `${by}="${value}"`);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
  );
}
