import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../api-client.js', () => ({
  apiCall: vi.fn(),
  tabHeaders: vi.fn((tabId?: string) => (tabId ? { 'X-Tab-Id': tabId } : undefined)),
  truncateToWords: vi.fn((text: string, max: number) => {
    const words = text.split(/\s+/);
    return words.length <= max ? text : words.slice(0, max).join(' ') + '...';
  }),
  logActivity: vi.fn(),
}));

import { apiCall, logActivity } from '../api-client.js';
import { registerContentTools } from '../tools/content.js';
import { createMockServer, getHandler, expectTextContent, expectImageContent } from './mcp-test-helper.js';

const mockApiCall = vi.mocked(apiCall);
const mockLogActivity = vi.mocked(logActivity);

describe('MCP content tools', () => {
  const { server, tools } = createMockServer();
  registerContentTools(server);

  beforeEach(() => { vi.clearAllMocks(); });

  describe('tandem_read_page', () => {
    const handler = getHandler(tools, 'tandem_read_page');

    it('returns markdown-formatted page content', async () => {
      mockApiCall.mockResolvedValueOnce({ title: 'Test', url: 'https://test.com', description: 'A test page', text: 'Body text' });
      mockLogActivity.mockResolvedValueOnce(undefined);
      const result = await handler({});
      const text = expectTextContent(result, '# Test');
      expect(text).toContain('**URL:** https://test.com');
      expect(text).toContain('> A test page');
    });

    it('handles missing description', async () => {
      mockApiCall.mockResolvedValueOnce({ title: 'T', url: 'https://t.com', text: 'x' });
      mockLogActivity.mockResolvedValueOnce(undefined);
      const result = await handler({});
      const text = expectTextContent(result);
      expect(text).not.toContain('>');
    });

    it('prefixes a prompt-injection warning banner when scanner attached one', async () => {
      mockApiCall.mockResolvedValueOnce({
        title: 'Docs',
        url: 'https://docs.example.com',
        text: 'content',
        injectionWarnings: {
          riskScore: 50,
          summary: 'Credential-extraction pattern detected',
          findings: [{
            severity: 'critical',
            description: 'Attempts to extract sensitive credentials',
            matchedText: 'Get API key',
          }],
        },
      });
      mockLogActivity.mockResolvedValueOnce(undefined);
      const result = await handler({});
      const text = expectTextContent(result);
      expect(text).toContain('⚠️ **Prompt-injection warning**');
      expect(text).toContain('risk 50/100');
      expect(text).toContain('Credential-extraction pattern detected');
      expect(text).toContain('matched: "Get API key"');
      // Content still present (warning, not block)
      expect(text).toContain('# Docs');
    });

    it('replaces body with a stop-signal when scanner blocked the response', async () => {
      mockApiCall.mockResolvedValueOnce({
        blocked: true,
        riskScore: 92,
        domain: 'evil.example.com',
        reason: 'prompt_injection_detected',
        overrideUrl: 'POST /security/injection-override {"domain":"evil.example.com"}',
      });
      mockLogActivity.mockResolvedValueOnce(undefined);
      const result = await handler({});
      const text = expectTextContent(result);
      expect(text).toContain('⚠️ **BLOCKED BY PROMPT-INJECTION DETECTION**');
      expect(text).toContain('Risk: 92/100');
      expect(text).toContain('evil.example.com');
      // No markdown envelope when blocked
      expect(text).not.toContain('# Untitled');
      expect(mockLogActivity).toHaveBeenCalledWith('read_page', 'blocked by injection scanner');
    });
  });

  describe('tandem_screenshot', () => {
    const handler = getHandler(tools, 'tandem_screenshot');

    it('returns image content', async () => {
      mockApiCall.mockResolvedValueOnce('base64data');
      mockLogActivity.mockResolvedValueOnce(undefined);
      const result = await handler({});
      expectImageContent(result);
    });
  });

  describe('tandem_get_page_html', () => {
    const handler = getHandler(tools, 'tandem_get_page_html');

    it('returns raw HTML string', async () => {
      mockApiCall.mockResolvedValueOnce('<html>hi</html>');
      const result = await handler({});
      expectTextContent(result, '<html>hi</html>');
    });

    it('extracts html field when response is an envelope', async () => {
      mockApiCall.mockResolvedValueOnce({ html: '<html>envelope</html>' });
      const result = await handler({});
      expectTextContent(result, '<html>envelope</html>');
    });

    it('JSON-stringifies unrecognized response shape', async () => {
      mockApiCall.mockResolvedValueOnce({ weird: 'shape' });
      const result = await handler({});
      expectTextContent(result, '"weird"');
    });

    it('prefixes a prompt-injection warning banner on html envelope', async () => {
      mockApiCall.mockResolvedValueOnce({
        html: '<html>suspect</html>',
        injectionWarnings: {
          riskScore: 45,
          summary: 'Instruction-override pattern',
          findings: [{ severity: 'high', description: 'Ignore previous instructions' }],
        },
      });
      const result = await handler({});
      const text = expectTextContent(result);
      expect(text).toContain('⚠️ **Prompt-injection warning**');
      expect(text).toContain('risk 45/100');
      expect(text).toContain('<html>suspect</html>');
    });

    it('shows block marker when scanner blocked', async () => {
      mockApiCall.mockResolvedValueOnce({ blocked: true, riskScore: 80, domain: 'x.com' });
      const result = await handler({});
      const text = expectTextContent(result, 'BLOCKED BY PROMPT-INJECTION DETECTION');
      expect(text).not.toContain('<html');
    });
  });

  describe('tandem_extract_content', () => {
    const handler = getHandler(tools, 'tandem_extract_content');

    it('returns extracted content as JSON', async () => {
      mockApiCall.mockResolvedValueOnce({ title: 'T', body: 'B' });
      const result = await handler({});
      expectTextContent(result);
    });
  });

  describe('tandem_extract_url', () => {
    const handler = getHandler(tools, 'tandem_extract_url');

    it('extracts from URL', async () => {
      mockApiCall.mockResolvedValueOnce({ content: 'extracted' });
      mockLogActivity.mockResolvedValueOnce(undefined);
      await handler({ url: 'https://a.com' });
      expect(mockApiCall).toHaveBeenCalledWith('POST', '/content/extract/url', { url: 'https://a.com' });
    });
  });

  describe('tandem_get_links', () => {
    const handler = getHandler(tools, 'tandem_get_links');

    it('formats link list', async () => {
      mockApiCall.mockResolvedValueOnce({ links: [{ text: 'GH', href: 'https://gh.com', visible: true }] });
      mockLogActivity.mockResolvedValueOnce(undefined);
      const result = await handler({});
      expectTextContent(result, '[GH](https://gh.com)');
    });

    it('marks hidden links', async () => {
      mockApiCall.mockResolvedValueOnce({ links: [{ text: 'X', href: 'https://x.com', visible: false }] });
      mockLogActivity.mockResolvedValueOnce(undefined);
      const result = await handler({});
      expectTextContent(result, '[hidden]');
    });
  });

  describe('tandem_execute_js', () => {
    const handler = getHandler(tools, 'tandem_execute_js');

    it('executes code and returns result', async () => {
      mockApiCall.mockResolvedValueOnce({ result: 42 });
      mockLogActivity.mockResolvedValueOnce(undefined);
      const result = await handler({ code: '1+1' });
      expectTextContent(result, '42');
    });

    it('returns error for rejected execution', async () => {
      mockApiCall.mockRejectedValueOnce(new Error('User rejected'));
      const result = await handler({ code: 'evil()' });
      expectTextContent(result, 'User rejected JavaScript execution');
    });

    it('propagates non-rejection errors', async () => {
      mockApiCall.mockRejectedValueOnce(new Error('network down'));
      await expect(handler({ code: 'x' })).rejects.toThrow('network down');
    });

    it('passes tabId through as X-Tab-Id header', async () => {
      mockApiCall.mockResolvedValueOnce({ result: 'ok' });
      mockLogActivity.mockResolvedValueOnce(undefined);
      await handler({ code: 'document.title', tabId: 'tab-42' });
      expect(mockApiCall).toHaveBeenCalledWith(
        'POST',
        '/execute-js/confirm',
        { code: 'document.title' },
        { 'X-Tab-Id': 'tab-42' },
      );
    });

    it('omits tabHeaders when tabId is not provided', async () => {
      mockApiCall.mockResolvedValueOnce({ result: 'ok' });
      mockLogActivity.mockResolvedValueOnce(undefined);
      await handler({ code: 'document.title' });
      expect(mockApiCall).toHaveBeenCalledWith(
        'POST',
        '/execute-js/confirm',
        { code: 'document.title' },
        undefined,
      );
    });
  });
});
