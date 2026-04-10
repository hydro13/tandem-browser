import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { apiCall, truncateToWords } from './api-client.js';
import { API_PORT } from '../utils/constants';
// MCP uses stdio for protocol messages — ALL logging must go to stderr.
// createLogger uses console.info/debug which go to stdout and break the protocol.
const log = {
  info:  (...args: unknown[]) => console.error('[McpServer]', ...args),
  warn:  (...args: unknown[]) => console.error('[McpServer]', ...args),
  error: (...args: unknown[]) => console.error('[McpServer]', ...args),
  debug: (...args: unknown[]) => console.error('[McpServer]', ...args),
};

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

// log is defined above — stderr-only for MCP stdio safety

const server = new McpServer({
  name: 'tandem-browser',
  version: '0.70.0',  // 236 tools — full API parity + awareness + clipboard
});

// ═══════════════════════════════════════════════
// Register all tools
// ═══════════════════════════════════════════════

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

// ═══════════════════════════════════════════════
// MCP Resources
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
// SSE Event Listener — sends MCP notifications on browser events
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
