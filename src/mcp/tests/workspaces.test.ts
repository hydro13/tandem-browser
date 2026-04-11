import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../api-client.js', () => ({
  apiCall: vi.fn(),
  tabHeaders: vi.fn(),
  logActivity: vi.fn(),
}));

import { apiCall, logActivity } from '../api-client.js';
import { registerWorkspaceTools } from '../tools/workspaces.js';
import { createMockServer, getHandler, expectTextContent } from './mcp-test-helper.js';

const mockApiCall = vi.mocked(apiCall);
const mockLogActivity = vi.mocked(logActivity);

describe('MCP workspace tools', () => {
  const { server, tools } = createMockServer();
  registerWorkspaceTools(server);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── tandem_workspace_list ─────────────────────────────────────────
  describe('tandem_workspace_list', () => {
    const handler = getHandler(tools, 'tandem_workspace_list');

    it('returns workspace data as JSON', async () => {
      const data = { workspaces: [{ id: 'w1', name: 'Default' }], active: 'w1' };
      mockApiCall.mockResolvedValueOnce(data);
      mockLogActivity.mockResolvedValueOnce(undefined);

      const result = await handler({});
      const text = expectTextContent(result);
      expect(JSON.parse(text)).toEqual(data);
      expect(mockApiCall).toHaveBeenCalledWith('GET', '/workspaces');
    });
  });

  // ── tandem_workspace_create ───────────────────────────────────────
  describe('tandem_workspace_create', () => {
    const handler = getHandler(tools, 'tandem_workspace_create');

    it('creates a workspace with name only', async () => {
      mockApiCall.mockResolvedValueOnce({ workspace: { id: 'w2', name: 'Dev' } });
      mockLogActivity.mockResolvedValueOnce(undefined);

      const result = await handler({ name: 'Dev' });
      expectTextContent(result, 'Created workspace');
      expect(mockApiCall).toHaveBeenCalledWith('POST', '/workspaces', { name: 'Dev' });
    });

    it('includes icon and color when provided', async () => {
      mockApiCall.mockResolvedValueOnce({ workspace: { id: 'w3', name: 'Work' } });
      mockLogActivity.mockResolvedValueOnce(undefined);

      await handler({ name: 'Work', icon: '💼', color: '#ff0000' });
      expect(mockApiCall).toHaveBeenCalledWith('POST', '/workspaces', {
        name: 'Work', icon: '💼', color: '#ff0000',
      });
    });
  });

  // ── tandem_workspace_activate ─────────────────────────────────────
  describe('tandem_workspace_activate', () => {
    const handler = getHandler(tools, 'tandem_workspace_activate');

    it('activates a workspace', async () => {
      mockApiCall.mockResolvedValueOnce({ workspace: { id: 'w1', name: 'Dev' } });
      mockLogActivity.mockResolvedValueOnce(undefined);

      const result = await handler({ id: 'w1' });
      expectTextContent(result, 'Activated workspace');
      expect(mockApiCall).toHaveBeenCalledWith('POST', '/workspaces/w1/activate');
    });
  });

  // ── tandem_workspace_delete ───────────────────────────────────────
  describe('tandem_workspace_delete', () => {
    const handler = getHandler(tools, 'tandem_workspace_delete');

    it('deletes a workspace', async () => {
      mockApiCall.mockResolvedValueOnce({});
      mockLogActivity.mockResolvedValueOnce(undefined);

      const result = await handler({ id: 'w1' });
      expectTextContent(result, 'Deleted workspace: w1');
      expect(mockApiCall).toHaveBeenCalledWith('DELETE', '/workspaces/w1');
    });

    it('propagates API errors', async () => {
      mockApiCall.mockRejectedValueOnce(new Error('not found'));
      await expect(handler({ id: 'bad' })).rejects.toThrow('not found');
    });
  });

  // ── tandem_workspace_update ───────────────────────────────────────
  describe('tandem_workspace_update', () => {
    const handler = getHandler(tools, 'tandem_workspace_update');

    it('updates workspace properties', async () => {
      mockApiCall.mockResolvedValueOnce({ workspace: { id: 'w1', name: 'New' } });
      mockLogActivity.mockResolvedValueOnce(undefined);

      const result = await handler({ id: 'w1', name: 'New', color: '#00ff00' });
      expectTextContent(result, 'Updated workspace');
    });
  });

  // ── tandem_workspace_move_tab ─────────────────────────────────────
  describe('tandem_workspace_move_tab', () => {
    const handler = getHandler(tools, 'tandem_workspace_move_tab');

    it('moves a tab to a workspace', async () => {
      mockApiCall.mockResolvedValueOnce({});
      mockLogActivity.mockResolvedValueOnce(undefined);

      const result = await handler({ id: 'w1', tabId: 't5' });
      expectTextContent(result, 'Moved tab t5 to workspace w1');
      expect(mockApiCall).toHaveBeenCalledWith('POST', '/workspaces/w1/tabs', { tabId: 't5' });
    });
  });
});
