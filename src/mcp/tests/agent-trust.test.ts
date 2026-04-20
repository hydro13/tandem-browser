import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../api-client.js', () => ({
  apiCall: vi.fn(),
  logActivity: vi.fn(),
}));

import { apiCall, logActivity } from '../api-client.js';
import { registerAgentTrustTools } from '../tools/agent-trust.js';
import { createMockServer, getHandler, expectTextContent } from './mcp-test-helper.js';

const mockApiCall = vi.mocked(apiCall);
const mockLogActivity = vi.mocked(logActivity);

describe('MCP agent-trust tools', () => {
  const { server, tools } = createMockServer();
  registerAgentTrustTools(server);

  beforeEach(() => { vi.clearAllMocks(); });

  describe('tandem_request_trusted_domain', () => {
    const handler = getHandler(tools, 'tandem_request_trusted_domain');

    it('calls the HTTP route with domain + rationale', async () => {
      mockApiCall.mockResolvedValueOnce({ ok: true, agentId: 'shell', domain: 'funda.nl' });
      mockLogActivity.mockResolvedValueOnce(undefined);
      await handler({ domain: 'funda.nl', rationale: 'Iterative overlay work' });
      expect(mockApiCall).toHaveBeenCalledWith(
        'POST',
        '/security/agent-trust/request-trusted-domain',
        { domain: 'funda.nl', rationale: 'Iterative overlay work' },
      );
    });

    it('returns text confirming the grant', async () => {
      mockApiCall.mockResolvedValueOnce({ ok: true, domain: 'funda.nl' });
      mockLogActivity.mockResolvedValueOnce(undefined);
      const result = await handler({ domain: 'funda.nl', rationale: 'Iterative overlay work' });
      expectTextContent(result, 'Trusted-domain grant approved for funda.nl');
    });

    it('surfaces rate-limit as isError with a clear message', async () => {
      mockApiCall.mockRejectedValueOnce(new Error('rate limit exceeded'));
      const result = await handler({ domain: 'a.com', rationale: 'second request burst' });
      expect(result.isError).toBe(true);
      expectTextContent(result, 'Rate limit');
    });

    it('surfaces rejection as isError with a clear message', async () => {
      mockApiCall.mockRejectedValueOnce(new Error('User rejected trust-grant request'));
      const result = await handler({ domain: 'a.com', rationale: 'Valid rationale here' });
      expect(result.isError).toBe(true);
      expectTextContent(result, 'rejected');
    });

    it('propagates unexpected errors', async () => {
      mockApiCall.mockRejectedValueOnce(new Error('network down'));
      await expect(handler({ domain: 'a.com', rationale: 'Valid rationale here' })).rejects.toThrow('network down');
    });
  });

  describe('tandem_request_global_window', () => {
    const handler = getHandler(tools, 'tandem_request_global_window');

    it('calls HTTP route with minutes + rationale (30)', async () => {
      mockApiCall.mockResolvedValueOnce({ ok: true, minutes: 30 });
      mockLogActivity.mockResolvedValueOnce(undefined);
      await handler({ minutes: 30, rationale: 'Cross-site sweep across providers' });
      expect(mockApiCall).toHaveBeenCalledWith(
        'POST',
        '/security/agent-trust/request-global-window',
        { minutes: 30, rationale: 'Cross-site sweep across providers' },
      );
    });

    it('calls HTTP route with minutes=60', async () => {
      mockApiCall.mockResolvedValueOnce({ ok: true, minutes: 60 });
      mockLogActivity.mockResolvedValueOnce(undefined);
      await handler({ minutes: 60, rationale: 'Longer cross-site research' });
      expect(mockApiCall).toHaveBeenCalledWith(
        'POST',
        '/security/agent-trust/request-global-window',
        { minutes: 60, rationale: 'Longer cross-site research' },
      );
    });

    it('returns text confirming the grant', async () => {
      mockApiCall.mockResolvedValueOnce({ ok: true, minutes: 30 });
      mockLogActivity.mockResolvedValueOnce(undefined);
      const result = await handler({ minutes: 30, rationale: 'Cross-site sweep across providers' });
      expectTextContent(result, 'Cross-site window approved for 30 minutes');
    });

    it('surfaces rate-limit errors', async () => {
      mockApiCall.mockRejectedValueOnce(new Error('rate limit exceeded'));
      const result = await handler({ minutes: 30, rationale: 'Cross-site sweep across providers' });
      expect(result.isError).toBe(true);
      expectTextContent(result, 'Rate limit');
    });

    it('surfaces rejection', async () => {
      mockApiCall.mockRejectedValueOnce(new Error('User rejected global-window request'));
      const result = await handler({ minutes: 30, rationale: 'Cross-site sweep across providers' });
      expect(result.isError).toBe(true);
      expectTextContent(result, 'rejected');
    });
  });

  describe('tandem_list_trust', () => {
    const handler = getHandler(tools, 'tandem_list_trust');

    it('fetches GET /security/agent-trust and returns JSON', async () => {
      const snapshot = {
        agents: [{ agentId: 'claude', trustedDomains: ['funda.nl'], perDomainWindows: [], globalWindow: null }],
      };
      mockApiCall.mockResolvedValueOnce(snapshot);
      mockLogActivity.mockResolvedValueOnce(undefined);
      const result = await handler({});
      expect(mockApiCall).toHaveBeenCalledWith('GET', '/security/agent-trust');
      expectTextContent(result, '"trustedDomains"');
      expectTextContent(result, 'funda.nl');
    });
  });
});
