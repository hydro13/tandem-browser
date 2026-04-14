import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { apiCall, logActivity } from '../api-client.js';
import { coerceShape } from '../coerce.js';

const watchDiffModeSchema = z.enum(['content', 'title', 'title-or-content', 'text-length']);

export function registerWatchTools(server: McpServer): void {
  server.tool(
    'tandem_watch_list',
    'List all website watches (site monitoring)',
    async () => {
      const data = await apiCall('GET', '/watch/list');
      await logActivity('watch_list');
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'tandem_watch_add',
    'Add a website to the watch list for monitoring changes',
    coerceShape({
      url: z.string().describe('URL to monitor'),
      intervalMinutes: z.number().optional().describe('Check interval in minutes (default: 30)'),
      diffMode: watchDiffModeSchema.optional().describe('Change detection mode: content, title, title-or-content, or text-length'),
    }),
    async ({ url, intervalMinutes, diffMode }) => {
      const data = await apiCall('POST', '/watch/add', { url, intervalMinutes, diffMode });
      await logActivity('watch_add', url);
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'tandem_watch_remove',
    'Remove a website from the watch list',
    {
      url: z.string().optional().describe('URL of the watch to remove'),
      id: z.string().optional().describe('ID of the watch to remove'),
    },
    {
      destructiveHint: true,
      readOnlyHint: false,
      openWorldHint: false,
    },
    async ({ url, id }) => {
      const data = await apiCall('DELETE', '/watch/remove', { url, id });
      await logActivity('watch_remove', id || url || '');
      return { content: [{ type: 'text', text: data.ok ? `Removed watch: ${id || url}` : `Watch not found: ${id || url}` }] };
    }
  );

  server.tool(
    'tandem_watch_check',
    'Force an immediate check of a watched website for changes',
    {
      url: z.string().optional().describe('URL of the watch to check'),
      id: z.string().optional().describe('ID of the watch to check'),
    },
    async ({ url, id }) => {
      const data = await apiCall('POST', '/watch/check', { url, id });
      await logActivity('watch_check', id || url || '');
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );
}
