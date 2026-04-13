import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { apiCall, getMcpSource, logActivity } from '../api-client.js';

interface ContextTab {
  id: string;
  title: string;
  url: string;
  active?: boolean;
  emoji?: string | null;
  workspaceName?: string | null;
  source?: string | null;
}

function formatTabLine(tab: ContextTab): string {
  const marker = tab.active ? '-> ' : '   ';
  const emojiPrefix = tab.emoji ? `${tab.emoji} ` : '';
  const details: string[] = [];
  if (tab.workspaceName) details.push(`workspace: ${tab.workspaceName}`);
  if (tab.source) details.push(`source: ${tab.source}`);
  const suffix = details.length > 0 ? ` [${details.join(', ')}]` : '';
  return `${marker}[${tab.id}] ${emojiPrefix}${tab.title || '(untitled)'}\n   ${tab.url}${suffix}\n`;
}

export function registerTabTools(server: McpServer): void {
  server.tool(
    'tandem_list_tabs',
    'List all open browser tabs with their titles, URLs, IDs, and workspace/source context when known.',
    async () => {
      const data = await apiCall('GET', '/active-tab/context');
      const tabs: ContextTab[] = data.tabs || [];

      let text = `Open tabs (${tabs.length}):\n\n`;
      for (const tab of tabs) {
        text += formatTabLine(tab);
      }

      return { content: [{ type: 'text', text }] };
    }
  );

  server.tool(
    'tandem_open_tab',
    'Open a new browser tab, optionally with a URL and workspace assignment',
    {
      url: z.string().optional().describe('URL to open (default: new tab page)'),
      workspaceId: z.string().optional().describe('Optional workspace ID to assign the new tab to'),
      source: z.string().optional().describe('Optional actor/source override. Defaults to the MCP connector source.'),
    },
    async ({ url, workspaceId, source }) => {
      const body: Record<string, unknown> = {
        url: url || undefined,
        source: source || getMcpSource(),
      };
      if (workspaceId) body.workspaceId = workspaceId;
      const result = await apiCall('POST', '/tabs/open', body);
      await logActivity('open_tab', url || 'new tab');
      return { content: [{ type: 'text', text: `Opened tab: ${result.tab?.id || 'unknown'} — ${url || 'new tab'}` }] };
    }
  );

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

  server.tool(
    'tandem_tab_emoji_set',
    'Set an emoji badge on a browser tab for visual identification',
    {
      tabId: z.string().describe('The tab ID to set the emoji on'),
      emoji: z.string().describe('The emoji to display (e.g. "🔥", "📚", "🧪")'),
    },
    async ({ tabId, emoji }) => {
      await apiCall('POST', `/tabs/${encodeURIComponent(tabId)}/emoji`, { emoji });
      await logActivity('tab_emoji_set', `${tabId}: ${emoji}`);
      return { content: [{ type: 'text', text: `Set emoji ${emoji} on tab ${tabId}` }] };
    }
  );

  server.tool(
    'tandem_tab_emoji_remove',
    'Remove the emoji badge from a browser tab',
    {
      tabId: z.string().describe('The tab ID to remove the emoji from'),
    },
    async ({ tabId }) => {
      await apiCall('DELETE', `/tabs/${encodeURIComponent(tabId)}/emoji`);
      await logActivity('tab_emoji_remove', tabId);
      return { content: [{ type: 'text', text: `Removed emoji from tab ${tabId}` }] };
    }
  );

  server.tool(
    'tandem_tab_emoji_flash',
    'Flash a pulsing emoji on a tab to attract the user\'s attention (e.g. signal that a page is ready for review)',
    {
      tabId: z.string().describe('The tab ID to flash the emoji on'),
      emoji: z.string().describe('The emoji to flash (e.g. "🔥", "✅", "⚠️")'),
    },
    async ({ tabId, emoji }) => {
      await apiCall('POST', `/tabs/${encodeURIComponent(tabId)}/emoji`, { emoji, flash: true });
      await logActivity('tab_emoji_flash', `${tabId}: ${emoji}`);
      return { content: [{ type: 'text', text: `Flashing emoji ${emoji} on tab ${tabId}` }] };
    }
  );
}
