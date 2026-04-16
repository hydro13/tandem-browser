import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../api-client.js', () => ({
  apiCall: vi.fn(),
  tabHeaders: vi.fn(),
  logActivity: vi.fn(),
  truncateToWords: vi.fn((text: string) => text),
}));

import { apiCall } from '../api-client.js';
import { registerAllTools, registerAllResources } from '../register-all.js';

const mockApiCall = vi.mocked(apiCall);

describe('registerAllTools', () => {
  it('registers all tool families on the server', () => {
    const tools = new Map<string, unknown>();
    const server = {
      tool: vi.fn((...args: unknown[]) => {
        tools.set(args[0] as string, args);
      }),
    } as any;

    registerAllTools(server);

    // Should register 200+ tools across all families
    expect(server.tool).toHaveBeenCalled();
    expect(tools.size).toBeGreaterThan(200);

    // Spot-check a few tools from different families
    expect(tools.has('tandem_navigate')).toBe(true);
    expect(tools.has('tandem_list_tabs')).toBe(true);
    expect(tools.has('tandem_screenshot')).toBe(true);
    expect(tools.has('tandem_read_page')).toBe(true);
    expect(tools.has('tandem_bookmarks_list')).toBe(true);
    expect(tools.has('tandem_clipboard_read')).toBe(true);
  });
});

describe('registerAllResources', () => {
  let resources: Map<string, { name: string; uri: string; handler: () => Promise<unknown> }>;
  let server: any;

  beforeEach(() => {
    vi.clearAllMocks();
    resources = new Map();
    server = {
      resource: vi.fn((...args: unknown[]) => {
        const name = args[0] as string;
        const uri = args[1] as string;
        const handler = args[args.length - 1] as () => Promise<unknown>;
        resources.set(name, { name, uri, handler });
      }),
    };

    registerAllResources(server);
  });

  it('registers all 5 resources', () => {
    expect(server.resource).toHaveBeenCalledTimes(5);
    expect(resources.has('page-current')).toBe(true);
    expect(resources.has('tabs-list')).toBe(true);
    expect(resources.has('chat-history')).toBe(true);
    expect(resources.has('handoffs-open')).toBe(true);
    expect(resources.has('context')).toBe(true);
  });

  it('page-current resource fetches page content', async () => {
    mockApiCall.mockResolvedValueOnce({ title: 'Test Page', url: 'https://example.com', text: 'Hello world' });

    const result = await resources.get('page-current')!.handler() as any;
    expect(mockApiCall).toHaveBeenCalledWith('GET', '/page-content');
    expect(result.contents[0].uri).toBe('tandem://page/current');
    expect(result.contents[0].text).toContain('Test Page');
    expect(result.contents[0].text).toContain('https://example.com');
  });

  it('tabs-list resource fetches tab context', async () => {
    mockApiCall.mockResolvedValueOnce({
      tabs: [
        { id: 't1', title: 'Tab 1', url: 'https://a.com', active: true, workspaceName: 'WS1' },
        { id: 't2', title: 'Tab 2', url: 'https://b.com', active: false },
      ],
    });

    const result = await resources.get('tabs-list')!.handler() as any;
    expect(mockApiCall).toHaveBeenCalledWith('GET', '/active-tab/context');
    expect(result.contents[0].uri).toBe('tandem://tabs/list');
    expect(result.contents[0].text).toContain('Tab 1');
    expect(result.contents[0].text).toContain('Tab 2');
    expect(result.contents[0].text).toContain('workspace: WS1');
  });

  it('chat-history resource fetches messages', async () => {
    mockApiCall.mockResolvedValueOnce({
      messages: [
        { from: 'user', text: 'hello', timestamp: 1700000000000 },
      ],
    });

    const result = await resources.get('chat-history')!.handler() as any;
    expect(mockApiCall).toHaveBeenCalledWith('GET', '/chat?limit=50');
    expect(result.contents[0].uri).toBe('tandem://chat/history');
    expect(result.contents[0].text).toContain('user: hello');
  });

  it('handoffs-open resource fetches open handoffs', async () => {
    mockApiCall.mockResolvedValueOnce({
      handoffs: [
        { id: 'h1', status: 'needs_human', title: 'Need help', reason: 'stuck' },
      ],
    });

    const result = await resources.get('handoffs-open')!.handler() as any;
    expect(mockApiCall).toHaveBeenCalledWith('GET', '/handoffs?openOnly=true');
    expect(result.contents[0].uri).toBe('tandem://handoffs/open');
    expect(result.contents[0].text).toContain('Need help');
    expect(result.contents[0].text).toContain('reason=stuck');
  });

  it('context resource aggregates summary, tabs, and events', async () => {
    mockApiCall
      .mockResolvedValueOnce({ text: 'User is browsing' })  // /context/summary
      .mockResolvedValueOnce({                                // /active-tab/context
        activeWorkspace: { name: 'Dev', id: 'ws-1' },
        activeTab: { title: 'Docs', url: 'https://docs.com', id: 't1', source: 'user' },
      })
      .mockResolvedValueOnce({ events: [] });                 // /events/recent

    const result = await resources.get('context')!.handler() as any;
    expect(result.contents[0].uri).toBe('tandem://context');
    expect(result.contents[0].text).toContain('Active workspace: Dev');
    expect(result.contents[0].text).toContain('Active tab: Docs');
    expect(result.contents[0].text).toContain('User is browsing');
  });

  it('context resource handles missing active tab', async () => {
    mockApiCall
      .mockResolvedValueOnce({ text: '' })
      .mockResolvedValueOnce({ activeWorkspace: null, activeTab: null })
      .mockResolvedValueOnce({ events: [] });

    const result = await resources.get('context')!.handler() as any;
    expect(result.contents[0].text).toContain('Active tab: none');
  });

  it('context resource includes recent events', async () => {
    mockApiCall
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ activeTab: null })
      .mockResolvedValueOnce({
        events: [
          { type: 'navigation', tabId: 't1', context: { source: 'agent', workspace: { name: 'Dev' } } },
        ],
      });

    const result = await resources.get('context')!.handler() as any;
    expect(result.contents[0].text).toContain('Recent events:');
    expect(result.contents[0].text).toContain('navigation');
  });
});
