import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../api-client.js', () => ({
  apiCall: vi.fn(),
  tabHeaders: vi.fn(),
  logActivity: vi.fn(),
}));

import { apiCall, logActivity } from '../api-client.js';
import { registerSessionTools } from '../tools/sessions.js';
import { createMockServer, getHandler, expectTextContent } from './mcp-test-helper.js';

const mockApiCall = vi.mocked(apiCall);
const mockLogActivity = vi.mocked(logActivity);

describe('MCP session tools', () => {
  const { server, tools } = createMockServer();
  registerSessionTools(server);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── tandem_session_list ───────────────────────────────────────────
  describe('tandem_session_list', () => {
    const handler = getHandler(tools, 'tandem_session_list');

    it('lists sessions as JSON', async () => {
      const data = { sessions: [{ name: 'default', tabs: 3 }] };
      mockApiCall.mockResolvedValueOnce(data);
      mockLogActivity.mockResolvedValueOnce(undefined);

      const result = await handler({});
      const text = expectTextContent(result);
      expect(JSON.parse(text)).toEqual(data);
      expect(mockApiCall).toHaveBeenCalledWith('GET', '/sessions/list');
    });
  });

  // ── tandem_session_create ─────────────────────────────────────────
  describe('tandem_session_create', () => {
    const handler = getHandler(tools, 'tandem_session_create');

    it('creates a session with name', async () => {
      mockApiCall.mockResolvedValueOnce({ name: 'test', partition: 'persist:test' });
      mockLogActivity.mockResolvedValueOnce(undefined);

      const result = await handler({ name: 'test' });
      expectTextContent(result, 'Created session: test');
      expect(mockApiCall).toHaveBeenCalledWith('POST', '/sessions/create', { name: 'test' });
    });

    it('includes partition when provided', async () => {
      mockApiCall.mockResolvedValueOnce({ name: 'dev', partition: 'custom' });
      mockLogActivity.mockResolvedValueOnce(undefined);

      await handler({ name: 'dev', partition: 'custom' });
      expect(mockApiCall).toHaveBeenCalledWith('POST', '/sessions/create', {
        name: 'dev', partition: 'custom',
      });
    });
  });

  // ── tandem_session_switch ─────────────────────────────────────────
  describe('tandem_session_switch', () => {
    const handler = getHandler(tools, 'tandem_session_switch');

    it('switches to a session', async () => {
      mockApiCall.mockResolvedValueOnce({ active: 'work' });
      mockLogActivity.mockResolvedValueOnce(undefined);

      const result = await handler({ name: 'work' });
      expectTextContent(result, 'Switched to session: work');
    });
  });

  // ── tandem_session_destroy ────────────────────────────────────────
  describe('tandem_session_destroy', () => {
    const handler = getHandler(tools, 'tandem_session_destroy');

    it('destroys a session', async () => {
      mockApiCall.mockResolvedValueOnce({});
      mockLogActivity.mockResolvedValueOnce(undefined);

      const result = await handler({ name: 'old' });
      expectTextContent(result, 'Destroyed session: old');
      expect(mockApiCall).toHaveBeenCalledWith('POST', '/sessions/destroy', { name: 'old' });
    });
  });

  // ── tandem_session_fetch ──────────────────────────────────────────
  describe('tandem_session_fetch', () => {
    const handler = getHandler(tools, 'tandem_session_fetch');

    it('fetches within session context', async () => {
      mockApiCall.mockResolvedValueOnce({ status: 200, body: '{}' });
      mockLogActivity.mockResolvedValueOnce(undefined);

      const result = await handler({ url: 'https://api.com/me' });
      expectTextContent(result);
      expect(mockApiCall).toHaveBeenCalledWith('POST', '/sessions/fetch', {
        url: 'https://api.com/me',
      }, undefined);
    });

    it('passes method and body', async () => {
      mockApiCall.mockResolvedValueOnce({});
      mockLogActivity.mockResolvedValueOnce(undefined);

      await handler({ url: 'https://api.com/data', method: 'POST', body: '{"a":1}' });
      expect(mockApiCall).toHaveBeenCalledWith('POST', '/sessions/fetch', {
        url: 'https://api.com/data', method: 'POST', body: '{"a":1}',
      }, undefined);
    });

    it('passes sessionName as X-Session header', async () => {
      mockApiCall.mockResolvedValueOnce({});
      mockLogActivity.mockResolvedValueOnce(undefined);

      await handler({ url: 'https://x.com', sessionName: 'work' });
      expect(mockApiCall).toHaveBeenCalledWith('POST', '/sessions/fetch', {
        url: 'https://x.com',
      }, { 'X-Session': 'work' });
    });
  });

  // ── tandem_session_state_save ─────────────────────────────────────
  describe('tandem_session_state_save', () => {
    const handler = getHandler(tools, 'tandem_session_state_save');

    it('saves session state', async () => {
      mockApiCall.mockResolvedValueOnce({ path: '/tmp/state.json' });
      mockLogActivity.mockResolvedValueOnce(undefined);

      const result = await handler({ name: 'checkpoint' });
      expectTextContent(result, 'Saved session state "checkpoint"');
    });
  });

  // ── tandem_session_state_load ─────────────────────────────────────
  describe('tandem_session_state_load', () => {
    const handler = getHandler(tools, 'tandem_session_state_load');

    it('loads session state', async () => {
      mockApiCall.mockResolvedValueOnce({ cookiesRestored: 12 });
      mockLogActivity.mockResolvedValueOnce(undefined);

      const result = await handler({ name: 'checkpoint' });
      expectTextContent(result, 'cookies restored: 12');
    });
  });

  // ── tandem_session_state_list ─────────────────────────────────────
  describe('tandem_session_state_list', () => {
    const handler = getHandler(tools, 'tandem_session_state_list');

    it('lists saved states', async () => {
      mockApiCall.mockResolvedValueOnce({ states: ['checkpoint', 'backup'] });
      mockLogActivity.mockResolvedValueOnce(undefined);

      const result = await handler({});
      expectTextContent(result);
      expect(mockApiCall).toHaveBeenCalledWith('GET', '/sessions/state/list');
    });
  });

  // ── error propagation ─────────────────────────────────────────────
  describe('error propagation', () => {
    it('propagates API errors', async () => {
      mockApiCall.mockRejectedValueOnce(new Error('session not found'));
      const handler = getHandler(tools, 'tandem_session_switch');
      await expect(handler({ name: 'nope' })).rejects.toThrow('session not found');
    });
  });
});
