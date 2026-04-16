/**
 * Bootstrap/discovery routes — agent-facing surface for a running Tandem instance.
 *
 * These routes let any agent discover what this Tandem instance supports,
 * how to pair, and what version-matched capabilities are available.
 * The bootstrap surface is public (no auth required) because it contains
 * no sensitive data — only version info, pairing instructions, and capability families.
 */

import type { Router, Request, Response } from 'express';
import { app } from 'electron';
import type { RouteContext } from '../context';

/** Capability families exposed by Tandem, grouped for agent discovery. */
const CAPABILITY_FAMILIES = [
  'browser',
  'tabs',
  'navigation',
  'snapshots',
  'devtools',
  'network',
  'sessions',
  'agents',
  'content',
  'media',
  'extensions',
  'data',
  'handoffs',
  'sidebar',
  'workspaces',
  'sync',
  'pinboards',
  'previews',
  'awareness',
  'clipboard',
  'security',
];

export function registerBootstrapRoutes(router: Router, _ctx: RouteContext): void {
  const getVersion = (): string => {
    try { return app.getVersion(); } catch { return 'unknown'; }
  };

  /** Derive base URL from the incoming request's Host header. */
  const getBaseUrl = (req: Request): string => {
    const host = req.headers.host ?? 'localhost:8765';
    return `http://${host}`;
  };

  // ═══════════════════════════════════════════════
  // GET /agent — human-readable bootstrap page
  // ═══════════════════════════════════════════════

  router.get('/agent', (req: Request, res: Response) => {
    const version = getVersion();
    const baseUrl = getBaseUrl(req);
    res.type('text/markdown').send(`# Tandem Browser — Agent Bootstrap

**Version:** ${version}
**Base URL:** \`${baseUrl}\`
**Auth:** Bearer token (via pairing or local api-token)

## How to connect

### On the same machine as Tandem
Read the local API token from \`~/.tandem/api-token\` and use it as:
\`\`\`
Authorization: Bearer <token>
\`\`\`

### On a different machine (Tailscale only)
Remote connections are supported only over a private Tailscale network.
Both machines must be members of the same tailnet.

1. The Tandem user generates a one-time setup code in Settings
2. Exchange the code for a durable token:
   \`POST ${baseUrl}/pairing/exchange\`
   with body: \`{ "code": "TDM-XXXX-XXXX", "machineId": "...", "machineName": "...", "agentLabel": "...", "agentType": "..." }\`
3. Use the returned token as: \`Authorization: Bearer <token>\`
4. The token is permanent until the user revokes it

Tandem is never exposed to the public internet.

## Using Tandem after connecting

Once you have a Bearer token (from local api-token or from pairing), use the HTTP API:
\`\`\`
Authorization: Bearer <your-token>
\`\`\`

All Tandem capabilities are available as HTTP endpoints. Key starting points:

### Browser status and navigation
- \`GET ${baseUrl}/status\` — browser ready state, active tab, viewport
- \`POST ${baseUrl}/navigate\` — navigate to a URL (body: \`{ "url": "..." }\`)
- \`GET ${baseUrl}/page-content\` — extract page text content
- \`GET ${baseUrl}/page-html\` — get page HTML

### Tabs
- \`GET ${baseUrl}/tabs/list\` — list all open tabs
- \`POST ${baseUrl}/tabs/open\` — open a new tab (body: \`{ "url": "..." }\`)
- \`POST ${baseUrl}/tabs/close\` — close a tab (body: \`{ "tabId": "..." }\`)
- \`POST ${baseUrl}/tabs/focus\` — switch to a tab (body: \`{ "tabId": "..." }\`)

### Interaction (use snapshots for reliable element targeting)
- \`GET ${baseUrl}/snapshot\` — accessibility tree with ref IDs
- \`POST ${baseUrl}/snapshot/click\` — click element by ref (body: \`{ "ref": "@e1" }\`)
- \`POST ${baseUrl}/snapshot/fill\` — fill input by ref (body: \`{ "ref": "@e2", "value": "..." }\`)
- \`POST ${baseUrl}/execute-js\` — run JavaScript in the page

### Screenshots and content
- \`GET ${baseUrl}/screenshot\` — capture screenshot (returns base64 PNG)
- \`POST ${baseUrl}/content/extract\` — structured content extraction

### Background tab targeting
Add \`X-Tab-Id: <tabId>\` header to target a specific tab instead of the active one.

## MCP access
Tandem provides an MCP server with 250+ tools.

### Local agents (same machine) — stdio transport
\`\`\`json
{
  "mcpServers": {
    "tandem": {
      "command": "node",
      "args": ["<path-to-tandem>/dist/mcp/server.js"]
    }
  }
}
\`\`\`

### Remote agents (Tailscale) — Streamable HTTP transport
Pair first using the setup code flow above, then configure your MCP client:
\`\`\`json
{
  "mcpServers": {
    "tandem": {
      "type": "streamable-http",
      "url": "${baseUrl}/mcp",
      "headers": {
        "Authorization": "Bearer <your-binding-token>"
      }
    }
  }
}
\`\`\`
Both transports provide the same 250+ tools with full parity.

## Discovery
- \`GET ${baseUrl}/agent/manifest\` — full machine-readable manifest with all endpoints (JSON)
- \`GET ${baseUrl}/agent/version\` — version and capability summary (JSON)
- \`GET ${baseUrl}/skill\` — version-matched usage guide

## Capability families
${CAPABILITY_FAMILIES.map(f => `- ${f}`).join('\n')}

## Complete endpoint reference
See \`GET ${baseUrl}/agent/manifest\` for the full list of 300+ endpoints.
`);
  });

  // ═══════════════════════════════════════════════
  // GET /agent/version — minimal version + capability summary
  // ═══════════════════════════════════════════════

  router.get('/agent/version', (_req: Request, res: Response) => {
    res.json({
      name: 'tandem-browser',
      version: getVersion(),
      capabilityFamilies: CAPABILITY_FAMILIES,
      transports: {
        http: { available: true, local: true, remote: true },
        mcp: {
          available: true,
          local: true,
          remote: true,
          localTransport: 'stdio',
          remoteTransport: 'streamable-http',
          remoteEndpoint: '/mcp',
          note: 'Local: stdio. Remote: Streamable HTTP at /mcp with Bearer auth.',
        },
      },
      authMethods: ['bearer-token'],
      pairingSupported: true,
    });
  });

  // ═══════════════════════════════════════════════
  // GET /agent/manifest — full machine-readable manifest
  // ═══════════════════════════════════════════════

  router.get('/agent/manifest', (req: Request, res: Response) => {
    const version = getVersion();
    const baseUrl = getBaseUrl(req);
    res.json({
      name: 'tandem-browser',
      version,
      baseUrl,
      transports: {
        http: { available: true, local: true, remote: true },
        mcp: {
          available: true,
          local: true,
          remote: true,
          localTransport: 'stdio',
          remoteTransport: 'streamable-http',
          remoteEndpoint: '/mcp',
          note: 'Local: stdio. Remote: Streamable HTTP at /mcp with Bearer auth.',
        },
      },
      mcp: {
        endpoint: '/mcp',
        transport: 'streamable-http',
        auth: 'bearer-token',
        sessionHeader: 'Mcp-Session-Id',
        capabilities: ['tools', 'resources'],
      },
      authMethods: ['bearer-token'],
      pairingSupported: true,
      pairing: {
        setupCodeFormat: 'TDM-XXXX-XXXX',
        setupCodeTtlSeconds: 300,
        exchangeEndpoint: '/pairing/exchange',
        whoamiEndpoint: '/pairing/whoami',
        tokenPrefix: 'tdm_ast_',
      },
      capabilityFamilies: CAPABILITY_FAMILIES,
      endpoints: {
        bootstrap: {
          agent: { method: 'GET', path: '/agent', description: 'Human-readable bootstrap page' },
          version: { method: 'GET', path: '/agent/version', description: 'Version and capability summary' },
          manifest: { method: 'GET', path: '/agent/manifest', description: 'This manifest' },
          skill: { method: 'GET', path: '/skill', description: 'Version-matched usage guide' },
        },
        pairing: {
          generateCode: { method: 'POST', path: '/pairing/setup-code', description: 'Generate one-time setup code', auth: 'required' },
          activeCode: { method: 'GET', path: '/pairing/setup-code/active', description: 'Get active setup code', auth: 'required' },
          exchange: { method: 'POST', path: '/pairing/exchange', description: 'Exchange setup code for durable token', auth: 'none' },
          whoami: { method: 'GET', path: '/pairing/whoami', description: 'Validate token and return binding info', auth: 'binding-token' },
          listBindings: { method: 'GET', path: '/pairing/bindings', description: 'List connected agents', auth: 'required' },
          pauseBinding: { method: 'POST', path: '/pairing/bindings/:id/pause', description: 'Pause a binding', auth: 'required' },
          resumeBinding: { method: 'POST', path: '/pairing/bindings/:id/resume', description: 'Resume a paused binding', auth: 'required' },
          revokeBinding: { method: 'POST', path: '/pairing/bindings/:id/revoke', description: 'Revoke a binding', auth: 'required' },
          removeBinding: { method: 'DELETE', path: '/pairing/bindings/:id', description: 'Remove binding from active list', auth: 'required' },
        },
        browser: {
          status: { method: 'GET', path: '/status', description: 'Browser ready state, active tab, viewport', auth: 'none' },
          navigate: { method: 'POST', path: '/navigate', description: 'Navigate to URL' },
          pageContent: { method: 'GET', path: '/page-content', description: 'Extract page text content' },
          pageHtml: { method: 'GET', path: '/page-html', description: 'Get page HTML' },
          screenshot: { method: 'GET', path: '/screenshot', description: 'Capture screenshot (base64 PNG)' },
          executeJs: { method: 'POST', path: '/execute-js', description: 'Run JavaScript in the page' },
          click: { method: 'POST', path: '/click', description: 'Click element' },
          type: { method: 'POST', path: '/type', description: 'Type text' },
          scroll: { method: 'POST', path: '/scroll', description: 'Scroll page' },
          pressKey: { method: 'POST', path: '/press-key', description: 'Press key' },
          pressKeyCombo: { method: 'POST', path: '/press-key-combo', description: 'Press key combination' },
          wait: { method: 'POST', path: '/wait', description: 'Wait for page element' },
          links: { method: 'GET', path: '/links', description: 'Get all page links' },
          forms: { method: 'GET', path: '/forms', description: 'Get all page forms' },
          cookies: { method: 'GET', path: '/cookies', description: 'Get page cookies' },
          reload: { method: 'POST', path: '/reload', description: 'Reload page' },
          goBack: { method: 'POST', path: '/go-back', description: 'Navigate back' },
          goForward: { method: 'POST', path: '/go-forward', description: 'Navigate forward' },
        },
        tabs: {
          list: { method: 'GET', path: '/tabs/list', description: 'List all open tabs' },
          open: { method: 'POST', path: '/tabs/open', description: 'Open new tab' },
          close: { method: 'POST', path: '/tabs/close', description: 'Close tab' },
          focus: { method: 'POST', path: '/tabs/focus', description: 'Switch to tab' },
          setEmoji: { method: 'POST', path: '/tabs/:id/emoji', description: 'Set tab emoji badge' },
          clearEmoji: { method: 'DELETE', path: '/tabs/:id/emoji', description: 'Remove tab emoji badge' },
        },
        snapshots: {
          get: { method: 'GET', path: '/snapshot', description: 'Accessibility tree with element refs' },
          click: { method: 'POST', path: '/snapshot/click', description: 'Click element by @ref' },
          fill: { method: 'POST', path: '/snapshot/fill', description: 'Fill input by @ref' },
          text: { method: 'GET', path: '/snapshot/text', description: 'Get text of element by @ref' },
        },
        find: {
          find: { method: 'POST', path: '/find', description: 'Find element by role/text/label' },
          findAll: { method: 'POST', path: '/find/all', description: 'Find all matching elements' },
          findClick: { method: 'POST', path: '/find/click', description: 'Find and click element' },
          findFill: { method: 'POST', path: '/find/fill', description: 'Find and fill element' },
        },
        devtools: {
          status: { method: 'GET', path: '/devtools/status', description: 'DevTools connection status' },
          console: { method: 'GET', path: '/devtools/console', description: 'Console log entries' },
          consoleErrors: { method: 'GET', path: '/devtools/console/errors', description: 'Console errors only' },
          network: { method: 'GET', path: '/devtools/network', description: 'Network requests via CDP' },
          domQuery: { method: 'POST', path: '/devtools/dom/query', description: 'Query DOM by CSS selector' },
          domXpath: { method: 'POST', path: '/devtools/dom/xpath', description: 'Query DOM by XPath' },
          evaluate: { method: 'POST', path: '/devtools/evaluate', description: 'Evaluate JS via CDP' },
          cdp: { method: 'POST', path: '/devtools/cdp', description: 'Raw CDP command' },
          storage: { method: 'GET', path: '/devtools/storage', description: 'Cookies, localStorage, sessionStorage' },
          performance: { method: 'GET', path: '/devtools/performance', description: 'Performance metrics' },
        },
        network: {
          log: { method: 'GET', path: '/network/log', description: 'Network request log' },
          domains: { method: 'GET', path: '/network/domains', description: 'Request domains' },
          apis: { method: 'GET', path: '/network/apis', description: 'Detected API endpoints' },
          har: { method: 'GET', path: '/network/har', description: 'Export as HAR' },
          mock: { method: 'POST', path: '/network/mock', description: 'Add mock rule' },
          unmock: { method: 'POST', path: '/network/unmock', description: 'Remove mock rule' },
          mocks: { method: 'GET', path: '/network/mocks', description: 'List active mocks' },
        },
        sessions: {
          list: { method: 'GET', path: '/sessions/list', description: 'List sessions' },
          create: { method: 'POST', path: '/sessions/create', description: 'Create session' },
          switch: { method: 'POST', path: '/sessions/switch', description: 'Switch session' },
          destroy: { method: 'POST', path: '/sessions/destroy', description: 'Destroy session' },
          fetch: { method: 'POST', path: '/sessions/fetch', description: 'Fetch with session credentials' },
        },
        content: {
          extract: { method: 'POST', path: '/content/extract', description: 'Structured content extraction' },
          extractUrl: { method: 'POST', path: '/content/extract/url', description: 'Extract content from URL' },
        },
        media: {
          screenshotAnnotated: { method: 'GET', path: '/screenshot/annotated', description: 'Get annotated screenshot' },
          captureAnnotated: { method: 'POST', path: '/screenshot/annotated', description: 'Capture annotated screenshot' },
          captureApplication: { method: 'POST', path: '/screenshot/application', description: 'Capture application window' },
          captureRegion: { method: 'POST', path: '/screenshot/region', description: 'Capture region' },
          screenshots: { method: 'GET', path: '/screenshots', description: 'List saved screenshots' },
          audioStatus: { method: 'GET', path: '/audio/status', description: 'Audio recording status' },
          audioStart: { method: 'POST', path: '/audio/start', description: 'Start audio recording' },
          audioStop: { method: 'POST', path: '/audio/stop', description: 'Stop audio recording' },
        },
        agents: {
          tasks: { method: 'GET', path: '/tasks', description: 'List tasks' },
          createTask: { method: 'POST', path: '/tasks', description: 'Create task' },
          getTask: { method: 'GET', path: '/tasks/:id', description: 'Get task details' },
          emergencyStop: { method: 'POST', path: '/emergency-stop', description: 'Stop all running tasks' },
          autonomy: { method: 'GET', path: '/autonomy', description: 'Agent autonomy settings' },
          updateAutonomy: { method: 'PATCH', path: '/autonomy', description: 'Update autonomy' },
          tabLocks: { method: 'GET', path: '/tab-locks', description: 'List tab locks' },
        },
        handoffs: {
          list: { method: 'GET', path: '/handoffs', description: 'List handoffs' },
          create: { method: 'POST', path: '/handoffs', description: 'Create handoff' },
          get: { method: 'GET', path: '/handoffs/:id', description: 'Get handoff details' },
          approve: { method: 'POST', path: '/handoffs/:id/approve', description: 'Approve handoff' },
          reject: { method: 'POST', path: '/handoffs/:id/reject', description: 'Reject handoff' },
          resolve: { method: 'POST', path: '/handoffs/:id/resolve', description: 'Resolve handoff' },
        },
        awareness: {
          digest: { method: 'GET', path: '/awareness/digest', description: 'Smart activity summary' },
          focus: { method: 'GET', path: '/awareness/focus', description: 'Current activity type' },
          activityLog: { method: 'GET', path: '/activity-log', description: 'Raw activity log' },
          activeTabContext: { method: 'GET', path: '/active-tab/context', description: 'Active tab context' },
          eventsRecent: { method: 'GET', path: '/events/recent', description: 'Recent events' },
        },
        clipboard: {
          read: { method: 'GET', path: '/clipboard', description: 'Read clipboard' },
          writeText: { method: 'POST', path: '/clipboard/text', description: 'Set clipboard text' },
          writeImage: { method: 'POST', path: '/clipboard/image', description: 'Set clipboard image' },
        },
        bookmarks: {
          list: { method: 'GET', path: '/bookmarks', description: 'List bookmarks' },
          add: { method: 'POST', path: '/bookmarks/add', description: 'Add bookmark' },
          search: { method: 'GET', path: '/bookmarks/search', description: 'Search bookmarks' },
        },
        history: {
          list: { method: 'GET', path: '/history', description: 'Browsing history' },
          search: { method: 'GET', path: '/history/search', description: 'Search history' },
        },
        workspaces: {
          list: { method: 'GET', path: '/workspaces', description: 'List workspaces' },
          create: { method: 'POST', path: '/workspaces', description: 'Create workspace' },
          activate: { method: 'POST', path: '/workspaces/:id/activate', description: 'Activate workspace' },
        },
        pinboards: {
          list: { method: 'GET', path: '/pinboards', description: 'List pinboards' },
          create: { method: 'POST', path: '/pinboards', description: 'Create pinboard' },
          get: { method: 'GET', path: '/pinboards/:id', description: 'Get pinboard' },
          items: { method: 'GET', path: '/pinboards/:id/items', description: 'Get pinboard items' },
          addItem: { method: 'POST', path: '/pinboards/:id/items', description: 'Add item to pinboard' },
        },
        previews: {
          list: { method: 'GET', path: '/previews', description: 'List previews' },
          create: { method: 'POST', path: '/preview', description: 'Create live HTML preview' },
          get: { method: 'GET', path: '/preview/:id', description: 'View preview' },
          update: { method: 'PUT', path: '/preview/:id', description: 'Update preview (live refresh)' },
          delete: { method: 'DELETE', path: '/preview/:id', description: 'Delete preview' },
        },
        config: {
          get: { method: 'GET', path: '/config', description: 'Get full configuration' },
          update: { method: 'PATCH', path: '/config', description: 'Update configuration' },
        },
        data: {
          export: { method: 'GET', path: '/data/export', description: 'Export all user data' },
          import: { method: 'POST', path: '/data/import', description: 'Import data' },
        },
        headless: {
          open: { method: 'POST', path: '/headless/open', description: 'Open URL in headless' },
          content: { method: 'GET', path: '/headless/content', description: 'Get headless page content' },
          status: { method: 'GET', path: '/headless/status', description: 'Headless status' },
          close: { method: 'POST', path: '/headless/close', description: 'Close headless' },
        },
        watch: {
          add: { method: 'POST', path: '/watch/add', description: 'Watch a page for changes' },
          list: { method: 'GET', path: '/watch/list', description: 'List watched pages' },
          check: { method: 'POST', path: '/watch/check', description: 'Check watched page now' },
          remove: { method: 'DELETE', path: '/watch/remove', description: 'Stop watching' },
          liveWs: { method: 'WS', path: '/watch/live', description: 'WebSocket stream of watch events' },
        },
        workflows: {
          list: { method: 'GET', path: '/workflows', description: 'List workflows' },
          create: { method: 'POST', path: '/workflows', description: 'Create workflow' },
          run: { method: 'POST', path: '/workflow/run', description: 'Run workflow' },
          status: { method: 'GET', path: '/workflow/status/:executionId', description: 'Execution status' },
          stop: { method: 'POST', path: '/workflow/stop', description: 'Stop workflow' },
        },
        siteMemory: {
          sites: { method: 'GET', path: '/memory/sites', description: 'List sites with stored memory' },
          site: { method: 'GET', path: '/memory/site/:domain', description: 'Get memory for domain' },
          search: { method: 'POST', path: '/memory/search', description: 'Search across site memory' },
        },
        auth: {
          states: { method: 'GET', path: '/auth/states', description: 'Detected auth states' },
          state: { method: 'GET', path: '/auth/state/:domain', description: 'Auth state for domain' },
          check: { method: 'POST', path: '/auth/check', description: 'Check for login form' },
        },
        localOnly: {
          _note: 'These endpoints require local context (Electron window, extension origin, or local filesystem access) and are not available to remote agents.',
          pickFolder: { method: 'POST', path: '/dialog/pick-folder', description: 'Open native folder picker (requires local window)' },
          extensionNativeMessage: { method: 'POST', path: '/extensions/native-message', description: 'Extension native messaging (requires chrome-extension:// origin)' },
          extensionNativeMessageWs: { method: 'WS', path: '/extensions/native-message/ws', description: 'Extension native messaging WebSocket (requires chrome-extension:// origin)' },
        },
        remoteNotes: {
          _note: 'Some endpoints return local filesystem paths in response bodies (e.g. screenshot save path). These operations execute on the Tandem host and succeed remotely, but the returned path is only meaningful on the Tandem machine. Use GET /screenshot (without ?save) to receive screenshot data directly.',
        },
      },
    });
  });

  // ═══════════════════════════════════════════════
  // GET /skill — version-matched skill/instructions
  // ═══════════════════════════════════════════════

  router.get('/skill', (req: Request, res: Response) => {
    const version = getVersion();
    const baseUrl = getBaseUrl(req);
    res.type('text/markdown').send(`# Tandem Browser Skill — v${version}

Tandem Browser is a live human-AI browser. Use its API at \`${baseUrl}\`
to inspect, browse, and interact with the user's real browser context.

## Key principles
- Prefer targeted tabs and sessions over global operations
- Use snapshot refs (\`GET ${baseUrl}/snapshot\`) before raw DOM or JS — snapshots give you
  stable element references like \`@e1\`, \`@e2\` that you can click or fill
- Verify action completion explicitly
- Leave durable handoffs instead of retrying blindly

## Auth
All requests require: \`Authorization: Bearer <your-token>\`

## Quick start workflow
1. \`GET ${baseUrl}/status\` — check Tandem is ready, see active tab
2. \`GET ${baseUrl}/snapshot\` — get accessibility tree with clickable refs
3. \`POST ${baseUrl}/snapshot/click\` with \`{ "ref": "@e1" }\` — click an element
4. \`POST ${baseUrl}/snapshot/fill\` with \`{ "ref": "@e2", "value": "text" }\` — type into an input
5. \`GET ${baseUrl}/page-content\` — read page text
6. \`POST ${baseUrl}/navigate\` with \`{ "url": "https://..." }\` — go to a URL

## Tab management
- \`GET ${baseUrl}/tabs/list\` — see all tabs
- \`POST ${baseUrl}/tabs/open\` with \`{ "url": "..." }\` — open new tab
- \`POST ${baseUrl}/tabs/focus\` with \`{ "tabId": "..." }\` — switch tabs
- Use \`X-Tab-Id: <id>\` header to target a background tab

## Screenshots
- \`GET ${baseUrl}/screenshot\` — capture the visible page (base64 PNG)

## MCP
MCP (250+ tools) is available via:
- **Local agents:** stdio transport (\`node dist/mcp/server.js\`)
- **Remote agents:** Streamable HTTP at \`${baseUrl}/mcp\` with \`Authorization: Bearer <token>\`

## Full reference
\`GET ${baseUrl}/agent/manifest\` returns all 300+ endpoints as structured JSON.
\`GET ${baseUrl}/agent\` has a more detailed getting-started guide.
`);
  });
}
