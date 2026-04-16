import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import fs from 'node:fs';
import path from 'node:path';
import { API_PORT } from '../utils/constants';
import { registerAllTools, registerAllResources } from './register-all.js';

// MCP uses stdio for protocol messages — ALL logging must go to stderr.
// createLogger uses console.info/debug which go to stdout and break the protocol.
/* eslint-disable no-console -- stdout is reserved for MCP protocol; stderr is the only safe log channel */
const log = {
  info:  (...args: unknown[]) => console.error('[McpServer]', ...args),
  warn:  (...args: unknown[]) => console.error('[McpServer]', ...args),
  error: (...args: unknown[]) => console.error('[McpServer]', ...args),
  debug: (...args: unknown[]) => console.error('[McpServer]', ...args),
};
/* eslint-enable no-console */

function readPackageVersion(): string {
  const packagePath = path.resolve(__dirname, '..', '..', 'package.json');
  try {
    const raw = fs.readFileSync(packagePath, 'utf-8');
    const pkg = JSON.parse(raw) as { version?: string };
    if (typeof pkg.version === 'string' && pkg.version.trim().length > 0) {
      return pkg.version.trim();
    }
  } catch (error) {
    log.warn('Falling back to MCP version placeholder; failed to read package.json', error);
  }
  return '0.72.2';
}

const server = new McpServer({
  name: 'tandem-browser',
  version: readPackageVersion(),
});

// ═══════════════════════════════════════════════
// Register all tools and resources (shared with HTTP MCP transport)
// ═══════════════════════════════════════════════

registerAllTools(server);
registerAllResources(server);

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
              if (['navigation', 'page-loaded', 'tab-focused', 'handoff-created', 'handoff-updated'].includes(event.type)) {
                server.server.sendResourceUpdated({ uri: 'tandem://page/current' }).catch(e => log.warn('sendResourceUpdated page/current failed:', e instanceof Error ? e.message : e));
                server.server.sendResourceUpdated({ uri: 'tandem://context' }).catch(e => log.warn('sendResourceUpdated context failed:', e instanceof Error ? e.message : e));
              }
              if (['tab-opened', 'tab-closed', 'tab-focused'].includes(event.type)) {
                server.server.sendResourceUpdated({ uri: 'tandem://tabs/list' }).catch(e => log.warn('sendResourceUpdated tabs/list failed:', e instanceof Error ? e.message : e));
              }
              if (['handoff-created', 'handoff-updated'].includes(event.type)) {
                server.server.sendResourceUpdated({ uri: 'tandem://handoffs/open' }).catch(e => log.warn('sendResourceUpdated handoffs/open failed:', e instanceof Error ? e.message : e));
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
