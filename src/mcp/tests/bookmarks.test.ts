import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../api-client.js', () => ({
  apiCall: vi.fn(),
  tabHeaders: vi.fn(),
  logActivity: vi.fn(),
}));

import { apiCall, logActivity } from '../api-client.js';
import { registerBookmarkTools } from '../tools/bookmarks.js';
import { createMockServer, getHandler, expectTextContent } from './mcp-test-helper.js';

const mockApiCall = vi.mocked(apiCall);
const mockLogActivity = vi.mocked(logActivity);

describe('MCP bookmark tools', () => {
  const { server, tools } = createMockServer();
  registerBookmarkTools(server);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── tandem_bookmarks_list ─────────────────────────────────────────
  describe('tandem_bookmarks_list', () => {
    const handler = getHandler(tools, 'tandem_bookmarks_list');

    it('returns the full bookmark tree', async () => {
      const tree = { children: [{ name: 'GitHub', url: 'https://github.com' }] };
      mockApiCall.mockResolvedValueOnce(tree);

      const result = await handler({});
      const text = expectTextContent(result);
      expect(JSON.parse(text)).toEqual(tree);
      expect(mockApiCall).toHaveBeenCalledWith('GET', '/bookmarks');
    });
  });

  // ── tandem_bookmark_add ───────────────────────────────────────────
  describe('tandem_bookmark_add', () => {
    const handler = getHandler(tools, 'tandem_bookmark_add');

    it('adds a bookmark with title', async () => {
      mockApiCall.mockResolvedValueOnce({ bookmark: { name: 'My Site' } });
      mockLogActivity.mockResolvedValueOnce(undefined);

      const result = await handler({ url: 'https://my.site', title: 'My Site' });
      expectTextContent(result, 'Bookmark added: My Site');
      expect(mockApiCall).toHaveBeenCalledWith('POST', '/bookmarks/add', {
        name: 'My Site', url: 'https://my.site', parentId: undefined,
      });
    });

    it('uses URL as fallback title', async () => {
      mockApiCall.mockResolvedValueOnce({ bookmark: { name: 'https://x.com' } });
      mockLogActivity.mockResolvedValueOnce(undefined);

      await handler({ url: 'https://x.com' });
      expect(mockApiCall).toHaveBeenCalledWith('POST', '/bookmarks/add', {
        name: 'https://x.com', url: 'https://x.com', parentId: undefined,
      });
    });

    it('passes folderId as parentId', async () => {
      mockApiCall.mockResolvedValueOnce({ bookmark: { name: 'A' } });
      mockLogActivity.mockResolvedValueOnce(undefined);

      await handler({ url: 'https://a.com', folderId: 'f1' });
      expect(mockApiCall).toHaveBeenCalledWith('POST', '/bookmarks/add', {
        name: 'https://a.com', url: 'https://a.com', parentId: 'f1',
      });
    });
  });

  // ── tandem_bookmark_delete ────────────────────────────────────────
  describe('tandem_bookmark_delete', () => {
    const handler = getHandler(tools, 'tandem_bookmark_delete');

    it('deletes a bookmark', async () => {
      mockApiCall.mockResolvedValueOnce({ ok: true });
      mockLogActivity.mockResolvedValueOnce(undefined);

      const result = await handler({ id: 'bm1' });
      expectTextContent(result, 'Deleted bookmark: bm1');
    });

    it('reports when bookmark not found', async () => {
      mockApiCall.mockResolvedValueOnce({ ok: false });
      mockLogActivity.mockResolvedValueOnce(undefined);

      const result = await handler({ id: 'missing' });
      expectTextContent(result, 'Bookmark not found: missing');
    });
  });

  // ── tandem_bookmark_update ────────────────────────────────────────
  describe('tandem_bookmark_update', () => {
    const handler = getHandler(tools, 'tandem_bookmark_update');

    it('updates a bookmark', async () => {
      mockApiCall.mockResolvedValueOnce({ bookmark: { name: 'Updated' } });
      mockLogActivity.mockResolvedValueOnce(undefined);

      const result = await handler({ id: 'bm1', title: 'Updated', url: 'https://new.url' });
      expectTextContent(result, 'Updated bookmark: Updated');
      expect(mockApiCall).toHaveBeenCalledWith('PUT', '/bookmarks/update', {
        id: 'bm1', name: 'Updated', url: 'https://new.url',
      });
    });
  });

  // ── tandem_bookmark_folder_add ────────────────────────────────────
  describe('tandem_bookmark_folder_add', () => {
    const handler = getHandler(tools, 'tandem_bookmark_folder_add');

    it('creates a folder', async () => {
      mockApiCall.mockResolvedValueOnce({ folder: { name: 'Work' } });
      mockLogActivity.mockResolvedValueOnce(undefined);

      const result = await handler({ name: 'Work' });
      expectTextContent(result, 'Created folder: Work');
    });
  });

  // ── tandem_bookmark_move ──────────────────────────────────────────
  describe('tandem_bookmark_move', () => {
    const handler = getHandler(tools, 'tandem_bookmark_move');

    it('moves a bookmark to a folder', async () => {
      mockApiCall.mockResolvedValueOnce({ ok: true });
      mockLogActivity.mockResolvedValueOnce(undefined);

      const result = await handler({ id: 'bm1', folderId: 'f2' });
      expectTextContent(result, 'Moved bm1 to folder f2');
    });

    it('reports failure', async () => {
      mockApiCall.mockResolvedValueOnce({ ok: false });
      mockLogActivity.mockResolvedValueOnce(undefined);

      const result = await handler({ id: 'bm1', folderId: 'f2' });
      expectTextContent(result, 'Failed to move bookmark bm1');
    });
  });

  // ── tandem_bookmark_check ─────────────────────────────────────────
  describe('tandem_bookmark_check', () => {
    const handler = getHandler(tools, 'tandem_bookmark_check');

    it('reports bookmarked URL', async () => {
      mockApiCall.mockResolvedValueOnce({ bookmarked: true, bookmark: { name: 'GH' } });

      const result = await handler({ url: 'https://github.com' });
      expectTextContent(result, 'Yes');
    });

    it('reports non-bookmarked URL', async () => {
      mockApiCall.mockResolvedValueOnce({ bookmarked: false });

      const result = await handler({ url: 'https://unknown.com' });
      expectTextContent(result, 'No');
    });
  });

  // ── tandem_search_bookmarks ───────────────────────────────────────
  describe('tandem_search_bookmarks', () => {
    const handler = getHandler(tools, 'tandem_search_bookmarks');

    it('returns search results', async () => {
      mockApiCall.mockResolvedValueOnce({
        results: [{ name: 'GitHub', url: 'https://github.com' }],
      });

      const result = await handler({ query: 'git' });
      const text = expectTextContent(result, 'Bookmark results for "git"');
      expect(text).toContain('[GitHub](https://github.com)');
    });

    it('handles empty results', async () => {
      mockApiCall.mockResolvedValueOnce({ results: [] });

      const result = await handler({ query: 'nope' });
      expectTextContent(result, '(0)');
    });
  });
});
