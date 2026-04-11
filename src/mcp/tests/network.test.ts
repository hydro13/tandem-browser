import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../api-client.js', () => ({
  apiCall: vi.fn(),
  tabHeaders: vi.fn((tabId?: string) => (tabId ? { 'X-Tab-Id': tabId } : undefined)),
  logActivity: vi.fn(),
}));

vi.mock('../coerce.js', async (importOriginal) => importOriginal());

import { apiCall, tabHeaders } from '../api-client.js';
import { registerNetworkTools } from '../tools/network.js';
import { createMockServer, getHandler, expectTextContent } from './mcp-test-helper.js';

const mockApiCall = vi.mocked(apiCall);

describe('MCP network tools', () => {
  const { server, tools } = createMockServer();
  registerNetworkTools(server);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── tandem_network_log ────────────────────────────────────────────
  describe('tandem_network_log', () => {
    const handler = getHandler(tools, 'tandem_network_log');

    it('returns network log as JSON', async () => {
      const data = { entries: [{ url: 'https://api.com/data' }] };
      mockApiCall.mockResolvedValueOnce(data);

      const result = await handler({});
      const text = expectTextContent(result);
      expect(JSON.parse(text)).toEqual(data);
      expect(mockApiCall).toHaveBeenCalledWith('GET', '/network/log', undefined, undefined);
    });

    it('builds query string with filters', async () => {
      mockApiCall.mockResolvedValueOnce({});

      await handler({ domain: 'api.com', type: 'xhr', limit: 10 });
      const endpoint = mockApiCall.mock.calls[0][1] as string;
      expect(endpoint).toContain('domain=api.com');
      expect(endpoint).toContain('type=xhr');
      expect(endpoint).toContain('limit=10');
    });

    it('passes tabId as header', async () => {
      mockApiCall.mockResolvedValueOnce({});

      await handler({ tabId: 't1' });
      expect(vi.mocked(tabHeaders)).toHaveBeenCalledWith('t1');
    });
  });

  // ── tandem_network_apis ───────────────────────────────────────────
  describe('tandem_network_apis', () => {
    const handler = getHandler(tools, 'tandem_network_apis');

    it('returns API summary', async () => {
      mockApiCall.mockResolvedValueOnce({ apis: ['/v1/users'] });

      const result = await handler({});
      expectTextContent(result);
      expect(mockApiCall).toHaveBeenCalledWith('GET', '/network/apis');
    });
  });

  // ── tandem_network_domains ────────────────────────────────────────
  describe('tandem_network_domains', () => {
    const handler = getHandler(tools, 'tandem_network_domains');

    it('returns domain list', async () => {
      mockApiCall.mockResolvedValueOnce({ domains: { 'api.com': 15 } });
      const result = await handler({});
      expectTextContent(result);
    });
  });

  // ── tandem_network_mock ───────────────────────────────────────────
  describe('tandem_network_mock', () => {
    const handler = getHandler(tools, 'tandem_network_mock');

    it('creates a mock rule', async () => {
      mockApiCall.mockResolvedValueOnce({ ok: true });

      const result = await handler({
        url: 'https://api.com/*',
        method: 'GET',
        status: 200,
        body: '{"mock": true}',
      });
      expectTextContent(result);
      expect(mockApiCall).toHaveBeenCalledWith('POST', '/network/mock', {
        pattern: 'https://api.com/*',
        method: 'GET',
        status: 200,
        body: '{"mock": true}',
      });
    });

    it('sends only required fields when optionals omitted', async () => {
      mockApiCall.mockResolvedValueOnce({ ok: true });

      await handler({ url: 'https://x.com' });
      expect(mockApiCall).toHaveBeenCalledWith('POST', '/network/mock', {
        pattern: 'https://x.com',
      });
    });
  });

  // ── tandem_network_unmock ─────────────────────────────────────────
  describe('tandem_network_unmock', () => {
    const handler = getHandler(tools, 'tandem_network_unmock');

    it('removes a mock rule', async () => {
      mockApiCall.mockResolvedValueOnce({ ok: true });

      await handler({ url: 'https://api.com/*' });
      expect(mockApiCall).toHaveBeenCalledWith('POST', '/network/unmock', { pattern: 'https://api.com/*' });
    });
  });

  // ── tandem_network_clear ──────────────────────────────────────────
  describe('tandem_network_clear', () => {
    const handler = getHandler(tools, 'tandem_network_clear');

    it('clears the network log', async () => {
      mockApiCall.mockResolvedValueOnce({ ok: true });

      const result = await handler({});
      expectTextContent(result);
      expect(mockApiCall).toHaveBeenCalledWith('DELETE', '/network/clear');
    });
  });

  // ── tandem_network_mock_clear ─────────────────────────────────────
  describe('tandem_network_mock_clear', () => {
    const handler = getHandler(tools, 'tandem_network_mock_clear');

    it('clears all mock rules', async () => {
      mockApiCall.mockResolvedValueOnce({ ok: true });

      const result = await handler({});
      expectTextContent(result);
      expect(mockApiCall).toHaveBeenCalledWith('POST', '/network/mock-clear');
    });
  });

  // ── error propagation ─────────────────────────────────────────────
  describe('error propagation', () => {
    it('propagates errors from apiCall', async () => {
      mockApiCall.mockRejectedValueOnce(new Error('server error'));
      const handler = getHandler(tools, 'tandem_network_har');
      await expect(handler({})).rejects.toThrow('server error');
    });
  });
});
