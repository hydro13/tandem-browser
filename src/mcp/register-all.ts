/**
 * Shared MCP tool and resource registration.
 *
 * Both the stdio MCP server (child process) and the HTTP MCP server
 * (in-process Express route) call this to get identical tool coverage.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { apiCall, truncateToWords } from './api-client.js';

// Tool registration imports
import { registerNavigationTools } from './tools/navigation.js';
import { registerTabTools } from './tools/tabs.js';
import { registerContentTools } from './tools/content.js';
import { registerSnapshotTools } from './tools/snapshots.js';
import { registerDevtoolsTools } from './tools/devtools.js';
import { registerNetworkTools } from './tools/network.js';
import { registerWorkspaceTools } from './tools/workspaces.js';
import { registerSessionTools } from './tools/sessions.js';
import { registerBookmarkTools } from './tools/bookmarks.js';
import { registerHistoryTools } from './tools/history.js';
import { registerChatTools } from './tools/chat.js';
import { registerTaskTools } from './tools/tasks.js';
import { registerHandoffTools } from './tools/handoffs.js';
import { registerWorkflowTools } from './tools/workflows.js';
import { registerExtensionTools } from './tools/extensions.js';
import { registerDeviceTools } from './tools/devices.js';
import { registerPasswordTools } from './tools/passwords.js';
import { registerFormTools } from './tools/forms.js';
import { registerScriptTools } from './tools/scripts.js';
import { registerPinboardTools } from './tools/pinboards.js';
import { registerWatchTools } from './tools/watches.js';
import { registerPreviewTools } from './tools/previews.js';
import { registerAuthTools } from './tools/auth.js';
import { registerHeadlessTools } from './tools/headless.js';
import { registerDataTools } from './tools/data.js';
import { registerContextTools } from './tools/context.js';
import { registerWindowTools } from './tools/window.js';
import { registerSidebarTools } from './tools/sidebar.js';
import { registerMediaTools } from './tools/media.js';
import { registerEventTools } from './tools/events.js';
import { registerSystemTools } from './tools/system.js';
import { registerAwarenessTools } from './tools/awareness.js';
import { registerClipboardTools } from './tools/clipboard.js';
import { registerAgentTrustTools } from './tools/agent-trust.js';

/** Register all MCP tools on the given server instance. */
export function registerAllTools(server: McpServer): void {
  registerNavigationTools(server);
  registerTabTools(server);
  registerContentTools(server);
  registerSnapshotTools(server);
  registerDevtoolsTools(server);
  registerNetworkTools(server);
  registerWorkspaceTools(server);
  registerSessionTools(server);
  registerBookmarkTools(server);
  registerHistoryTools(server);
  registerChatTools(server);
  registerTaskTools(server);
  registerHandoffTools(server);
  registerWorkflowTools(server);
  registerExtensionTools(server);
  registerDeviceTools(server);
  registerPasswordTools(server);
  registerFormTools(server);
  registerScriptTools(server);
  registerPinboardTools(server);
  registerWatchTools(server);
  registerPreviewTools(server);
  registerAuthTools(server);
  registerHeadlessTools(server);
  registerDataTools(server);
  registerContextTools(server);
  registerWindowTools(server);
  registerSidebarTools(server);
  registerMediaTools(server);
  registerEventTools(server);
  registerSystemTools(server);
  registerAwarenessTools(server);
  registerClipboardTools(server);
  registerAgentTrustTools(server);
}

/** Register all MCP resources on the given server instance. */
export function registerAllResources(server: McpServer): void {
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
    { description: 'All open browser tabs with workspace/source context when known' },
    async () => {
      const data = await apiCall('GET', '/active-tab/context');
      const tabs: Array<{
        id: string;
        title: string;
        url: string;
        active?: boolean;
        workspaceName?: string | null;
        source?: string | null;
      }> = data.tabs || [];

      let text = `Open tabs (${tabs.length}):\n\n`;
      for (const tab of tabs) {
        const marker = tab.active ? '-> ' : '   ';
        const details: string[] = [];
        if (tab.workspaceName) details.push(`workspace: ${tab.workspaceName}`);
        if (tab.source) details.push(`source: ${tab.source}`);
        const suffix = details.length > 0 ? ` [${details.join(', ')}]` : '';
        text += `${marker}[${tab.id}] ${tab.title || '(untitled)'} — ${tab.url}${suffix}\n`;
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
    'handoffs-open',
    'tandem://handoffs/open',
    { description: 'Open human↔agent handoffs that still need attention or review' },
    async () => {
      const data = await apiCall('GET', '/handoffs?openOnly=true');
      const handoffs: Array<{
        id: string;
        status: string;
        title: string;
        reason?: string | null;
        workspaceName?: string | null;
        tabTitle?: string | null;
      }> = data.handoffs || [];

      let text = `Open handoffs (${handoffs.length}):\n\n`;
      for (const handoff of handoffs) {
        const details = [
          `status=${handoff.status}`,
          handoff.reason ? `reason=${handoff.reason}` : null,
          handoff.workspaceName ? `workspace=${handoff.workspaceName}` : null,
          handoff.tabTitle ? `tab=${handoff.tabTitle}` : null,
        ].filter(Boolean).join(' | ');
        text += `- [${handoff.id}] ${handoff.title}${details ? ` (${details})` : ''}\n`;
      }
      return { contents: [{ uri: 'tandem://handoffs/open', mimeType: 'text/plain', text }] };
    }
  );

  server.resource(
    'context',
    'tandem://context',
    { description: 'Live browser context including active workspace/tab ownership and recent events' },
    async () => {
      const [summary, activeTabContext, recentEventsData] = await Promise.all([
        apiCall('GET', '/context/summary'),
        apiCall('GET', '/active-tab/context'),
        apiCall('GET', '/events/recent?limit=5'),
      ]);

      const lines: string[] = [];
      const activeWorkspace = activeTabContext.activeWorkspace;
      const activeTab = activeTabContext.activeTab;
      if (activeWorkspace) {
        lines.push(`Active workspace: ${activeWorkspace.name} (${activeWorkspace.id})`);
      }

      if (activeTab) {
        const parts = [
          `Active tab: ${activeTab.title || 'Untitled'} — ${activeTab.url || ''} (${activeTab.id})`,
          `workspace=${activeTab.workspaceName || activeTab.workspaceId || 'unknown'}`,
          `source=${activeTab.source ?? 'unknown'}`,
        ];
        if (activeTab.actor?.id) {
          parts.push(`actor=${activeTab.actor.id}`);
        }
        lines.push(parts.join(' | '));
      } else {
        lines.push('Active tab: none');
      }

      if (Array.isArray(recentEventsData.events) && recentEventsData.events.length > 0) {
        const eventLines = recentEventsData.events.slice(0, 5).map((event: {
          type?: string;
          tabId?: string | null;
          context?: {
            source?: string | null;
            workspace?: { id?: string | null; name?: string | null } | null;
          } | null;
        }) => {
          const workspace = event.context?.workspace?.name || event.context?.workspace?.id || 'unknown';
          const source = event.context?.source ?? 'unknown';
          return `- ${event.type} | tab=${event.tabId || 'none'} | workspace=${workspace} | source=${source}`;
        });
        lines.push('Recent events:');
        lines.push(...eventLines);
      }

      if (summary.text) {
        lines.push('');
        lines.push(summary.text);
      }

      return { contents: [{ uri: 'tandem://context', mimeType: 'text/plain', text: lines.join('\n') }] };
    }
  );
}
