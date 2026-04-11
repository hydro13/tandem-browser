import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../api-client.js', () => ({
  apiCall: vi.fn(),
  tabHeaders: vi.fn((tabId?: string) => (tabId ? { 'X-Tab-Id': tabId } : undefined)),
  logActivity: vi.fn(),
}));

vi.mock('../coerce.js', async (importOriginal) => importOriginal());

import { apiCall, tabHeaders, logActivity } from '../api-client.js';
import { registerNavigationTools } from '../tools/navigation.js';
import { createMockServer, getHandler, expectTextContent } from './mcp-test-helper.js';

const mockApiCall = vi.mocked(apiCall);
const mockLogActivity = vi.mocked(logActivity);

describe('MCP navigation tools', () => {
  const { server, tools } = createMockServer();
  registerNavigationTools(server);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── tandem_navigate ───────────────────────────────────────────────
  describe('tandem_navigate', () => {
    const handler = getHandler(tools, 'tandem_navigate');

    it('navigates to a URL', async () => {
      mockApiCall.mockResolvedValueOnce({});
      mockLogActivity.mockResolvedValueOnce(undefined);

      const result = await handler({ url: 'https://example.com' });
      expectTextContent(result, 'Navigated to https://example.com');
      expect(mockApiCall).toHaveBeenCalledWith('POST', '/navigate', { url: 'https://example.com' }, undefined);
      expect(mockLogActivity).toHaveBeenCalledWith('navigate', 'https://example.com');
    });

    it('targets a specific tab via tabId', async () => {
      mockApiCall.mockResolvedValueOnce({});
      mockLogActivity.mockResolvedValueOnce(undefined);

      await handler({ url: 'https://a.com', tabId: 't1' });
      expect(vi.mocked(tabHeaders)).toHaveBeenCalledWith('t1');
    });
  });

  // ── tandem_go_back ────────────────────────────────────────────────
  describe('tandem_go_back', () => {
    const handler = getHandler(tools, 'tandem_go_back');

    it('calls history.back()', async () => {
      mockApiCall.mockResolvedValueOnce({});
      mockLogActivity.mockResolvedValueOnce(undefined);

      const result = await handler({});
      expectTextContent(result, 'Navigated back');
      expect(mockApiCall).toHaveBeenCalledWith('POST', '/execute-js', { code: 'window.history.back()' });
    });
  });

  // ── tandem_go_forward ─────────────────────────────────────────────
  describe('tandem_go_forward', () => {
    const handler = getHandler(tools, 'tandem_go_forward');

    it('calls history.forward()', async () => {
      mockApiCall.mockResolvedValueOnce({});
      mockLogActivity.mockResolvedValueOnce(undefined);

      const result = await handler({});
      expectTextContent(result, 'Navigated forward');
    });
  });

  // ── tandem_reload ─────────────────────────────────────────────────
  describe('tandem_reload', () => {
    const handler = getHandler(tools, 'tandem_reload');

    it('reloads the page', async () => {
      mockApiCall.mockResolvedValueOnce({});
      mockLogActivity.mockResolvedValueOnce(undefined);

      const result = await handler({});
      expectTextContent(result, 'Page reloaded');
    });
  });

  // ── tandem_click ──────────────────────────────────────────────────
  describe('tandem_click', () => {
    const handler = getHandler(tools, 'tandem_click');

    it('clicks an element by selector', async () => {
      mockApiCall.mockResolvedValueOnce({ clicked: true });
      mockLogActivity.mockResolvedValueOnce(undefined);

      const result = await handler({ selector: '#btn' });
      expectTextContent(result, 'Clicked: #btn');
      expect(mockApiCall).toHaveBeenCalledWith('POST', '/click', { selector: '#btn' }, undefined);
    });
  });

  // ── tandem_type ───────────────────────────────────────────────────
  describe('tandem_type', () => {
    const handler = getHandler(tools, 'tandem_type');

    it('types text into an input', async () => {
      mockApiCall.mockResolvedValueOnce({});
      mockLogActivity.mockResolvedValueOnce(undefined);

      const result = await handler({ selector: '#email', text: 'test@mail.com', clear: false });
      expectTextContent(result, 'Typed "test@mail.com" into #email');
      expect(mockApiCall).toHaveBeenCalledWith(
        'POST', '/type',
        { selector: '#email', text: 'test@mail.com', clear: false },
        undefined,
      );
    });
  });

  // ── tandem_scroll ─────────────────────────────────────────────────
  describe('tandem_scroll', () => {
    const handler = getHandler(tools, 'tandem_scroll');

    it('scrolls down by pixels', async () => {
      mockApiCall.mockResolvedValueOnce({});
      mockLogActivity.mockResolvedValueOnce(undefined);

      const result = await handler({ direction: 'down', amount: 300 });
      expectTextContent(result, 'Scrolled down 300px');
    });

    it('scrolls to bottom', async () => {
      mockApiCall.mockResolvedValueOnce({});
      mockLogActivity.mockResolvedValueOnce(undefined);

      const result = await handler({ direction: 'down', amount: 500, target: 'bottom' });
      expectTextContent(result, 'Scrolled bottom');
    });
  });

  // ── tandem_press_key ──────────────────────────────────────────────
  describe('tandem_press_key', () => {
    const handler = getHandler(tools, 'tandem_press_key');

    it('presses a key without modifiers', async () => {
      mockApiCall.mockResolvedValueOnce({ ok: true });
      mockLogActivity.mockResolvedValueOnce(undefined);

      const result = await handler({ key: 'Enter' });
      expectTextContent(result, 'Pressed key: Enter');
    });

    it('presses a key with modifiers', async () => {
      mockApiCall.mockResolvedValueOnce({ ok: true });
      mockLogActivity.mockResolvedValueOnce(undefined);

      const result = await handler({ key: 'c', modifiers: ['control'] });
      expectTextContent(result, 'control+c');
      expect(mockApiCall).toHaveBeenCalledWith('POST', '/press-key', { key: 'c', modifiers: ['control'] }, undefined);
    });
  });

  // ── tandem_wait_for_load ──────────────────────────────────────────
  describe('tandem_wait_for_load', () => {
    const handler = getHandler(tools, 'tandem_wait_for_load');

    it('reports success when page loads', async () => {
      mockApiCall.mockResolvedValueOnce({ timeout: false });
      mockLogActivity.mockResolvedValueOnce(undefined);

      const result = await handler({ timeout: 10000 });
      expectTextContent(result, 'Page loaded successfully');
    });

    it('reports timeout', async () => {
      mockApiCall.mockResolvedValueOnce({ timeout: true });
      mockLogActivity.mockResolvedValueOnce(undefined);

      const result = await handler({ timeout: 5000 });
      expectTextContent(result, 'timed out');
    });
  });
});
