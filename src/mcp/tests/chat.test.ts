import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../api-client.js', () => ({
  apiCall: vi.fn(),
  tabHeaders: vi.fn(),
  logActivity: vi.fn(),
}));

vi.mock('../coerce.js', async (importOriginal) => importOriginal());

import { apiCall, logActivity } from '../api-client.js';
import { registerChatTools } from '../tools/chat.js';
import { createMockServer, getHandler, expectTextContent } from './mcp-test-helper.js';

const mockApiCall = vi.mocked(apiCall);
const mockLogActivity = vi.mocked(logActivity);

describe('MCP chat tools', () => {
  const { server, tools } = createMockServer();
  registerChatTools(server);

  beforeEach(() => { vi.clearAllMocks(); });

  describe('tandem_send_message', () => {
    const handler = getHandler(tools, 'tandem_send_message');

    it('sends a message', async () => {
      mockApiCall.mockResolvedValueOnce({});
      const result = await handler({ text: 'Hello Robin' });
      expectTextContent(result, 'Message sent: "Hello Robin"');
      expect(mockApiCall).toHaveBeenCalledWith('POST', '/chat', { text: 'Hello Robin', from: 'claude' });
    });
  });

  describe('tandem_get_chat_history', () => {
    const handler = getHandler(tools, 'tandem_get_chat_history');

    it('returns formatted chat history', async () => {
      mockApiCall.mockResolvedValueOnce({
        messages: [{ from: 'user', text: 'hi', timestamp: 1700000000000 }],
      });
      const result = await handler({ limit: 20 });
      const text = expectTextContent(result, 'Chat history (1 messages)');
      expect(text).toContain('user: hi');
    });

    it('handles empty chat', async () => {
      mockApiCall.mockResolvedValueOnce({ messages: [] });
      const result = await handler({ limit: 10 });
      expectTextContent(result, '(0 messages)');
    });
  });

  describe('tandem_get_context', () => {
    const handler = getHandler(tools, 'tandem_get_context');

    it('returns browser context overview', async () => {
      mockApiCall.mockResolvedValueOnce({ title: 'Google', url: 'https://google.com', loading: false });
      mockApiCall.mockResolvedValueOnce({ tabs: [{ id: 't1', title: 'Google', url: 'https://google.com', active: true }] });
      mockApiCall.mockResolvedValueOnce({ messages: [{ from: 'claude', text: 'hi' }] });

      const result = await handler({});
      const text = expectTextContent(result, 'Browser Context');
      expect(text).toContain('Active tab: Google');
      expect(text).toContain('Open tabs (1)');
      expect(text).toContain('Recent chat');
    });
  });

  describe('tandem_wingman_alert', () => {
    const handler = getHandler(tools, 'tandem_wingman_alert');

    it('sends an alert', async () => {
      mockApiCall.mockResolvedValueOnce({});
      mockLogActivity.mockResolvedValueOnce(undefined);
      const result = await handler({ message: 'Watch out!', level: 'warning' });
      expectTextContent(result, 'Alert sent: [warning] Watch out!');
      expect(mockApiCall).toHaveBeenCalledWith('POST', '/wingman-alert', { title: 'Warning', body: 'Watch out!' });
    });

    it('defaults to info level', async () => {
      mockApiCall.mockResolvedValueOnce({});
      mockLogActivity.mockResolvedValueOnce(undefined);
      const result = await handler({ message: 'FYI' });
      expectTextContent(result, '[info]');
    });
  });
});
