import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../api-client.js', () => ({
  apiCall: vi.fn(),
  tabHeaders: vi.fn((tabId?: string) => (tabId ? { 'X-Tab-Id': tabId } : undefined)),
  logActivity: vi.fn(),
}));

import { apiCall, logActivity } from '../api-client.js';
import { registerTabTools } from '../tools/tabs.js';
import { createMockServer, getHandler, expectTextContent } from './mcp-test-helper.js';

const mockApiCall = vi.mocked(apiCall);
const mockLogActivity = vi.mocked(logActivity);

describe('MCP tab tools', () => {
  const { server, tools } = createMockServer();
  registerTabTools(server);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── tandem_list_tabs ──────────────────────────────────────────────
  describe('tandem_list_tabs', () => {
    const handler = getHandler(tools, 'tandem_list_tabs');

    it('lists open tabs with formatted text', async () => {
      mockApiCall.mockResolvedValueOnce({
        tabs: [
          { id: 't1', title: 'Google', url: 'https://google.com', active: true },
          { id: 't2', title: 'GitHub', url: 'https://github.com', active: false },
        ],
      });

      const result = await handler({});
      const text = expectTextContent(result, 'Open tabs (2)');
      expect(text).toContain('→ [t1] Google');
      expect(text).toContain('  [t2] GitHub');
      expect(mockApiCall).toHaveBeenCalledWith('GET', '/tabs/list');
    });

    it('handles empty tab list', async () => {
      mockApiCall.mockResolvedValueOnce({ tabs: [] });
      const result = await handler({});
      expectTextContent(result, 'Open tabs (0)');
    });

    it('handles tabs with missing title', async () => {
      mockApiCall.mockResolvedValueOnce({
        tabs: [{ id: 't1', title: '', url: 'about:blank', active: false }],
      });
      const result = await handler({});
      expectTextContent(result, '(untitled)');
    });

    it('propagates API errors', async () => {
      mockApiCall.mockRejectedValueOnce(new Error('connection refused'));
      await expect(handler({})).rejects.toThrow('connection refused');
    });
  });

  // ── tandem_open_tab ───────────────────────────────────────────────
  describe('tandem_open_tab', () => {
    const handler = getHandler(tools, 'tandem_open_tab');

    it('opens a tab with URL', async () => {
      mockApiCall.mockResolvedValueOnce({ tab: { id: 't3' } });
      mockLogActivity.mockResolvedValueOnce(undefined);

      const result = await handler({ url: 'https://example.com' });
      expectTextContent(result, 'Opened tab');
      expect(mockApiCall).toHaveBeenCalledWith('POST', '/tabs/open', {
        url: 'https://example.com',
        source: 'wingman',
      });
      expect(mockLogActivity).toHaveBeenCalledWith('open_tab', 'https://example.com');
    });

    it('opens a tab without URL', async () => {
      mockApiCall.mockResolvedValueOnce({ tab: { id: 't4' } });
      mockLogActivity.mockResolvedValueOnce(undefined);

      const result = await handler({});
      expectTextContent(result, 'new tab');
    });

    it('passes workspaceId when provided', async () => {
      mockApiCall.mockResolvedValueOnce({ tab: { id: 't5' } });
      mockLogActivity.mockResolvedValueOnce(undefined);

      await handler({ url: 'https://a.com', workspaceId: 'w1' });
      expect(mockApiCall).toHaveBeenCalledWith('POST', '/tabs/open', {
        url: 'https://a.com',
        source: 'wingman',
        workspaceId: 'w1',
      });
    });
  });

  // ── tandem_close_tab ──────────────────────────────────────────────
  describe('tandem_close_tab', () => {
    const handler = getHandler(tools, 'tandem_close_tab');

    it('closes a tab by ID', async () => {
      mockApiCall.mockResolvedValueOnce({});
      mockLogActivity.mockResolvedValueOnce(undefined);

      const result = await handler({ tabId: 't1' });
      expectTextContent(result, 'Closed tab: t1');
      expect(mockApiCall).toHaveBeenCalledWith('POST', '/tabs/close', { tabId: 't1' });
      expect(mockLogActivity).toHaveBeenCalledWith('close_tab', 't1');
    });
  });

  // ── tandem_focus_tab ──────────────────────────────────────────────
  describe('tandem_focus_tab', () => {
    const handler = getHandler(tools, 'tandem_focus_tab');

    it('focuses a tab by ID', async () => {
      mockApiCall.mockResolvedValueOnce({});
      mockLogActivity.mockResolvedValueOnce(undefined);

      const result = await handler({ tabId: 't2' });
      expectTextContent(result, 'Focused tab: t2');
      expect(mockApiCall).toHaveBeenCalledWith('POST', '/tabs/focus', { tabId: 't2' });
    });

    it('propagates API errors', async () => {
      mockApiCall.mockRejectedValueOnce(new Error('tab not found'));
      await expect(handler({ tabId: 'bad' })).rejects.toThrow('tab not found');
    });
  });
});
