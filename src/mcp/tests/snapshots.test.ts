import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../api-client.js', () => ({
  apiCall: vi.fn(),
  tabHeaders: vi.fn((tabId?: string) => (tabId ? { 'X-Tab-Id': tabId } : undefined)),
  logActivity: vi.fn(),
}));

vi.mock('../coerce.js', async (importOriginal) => importOriginal());

import { apiCall, tabHeaders, logActivity } from '../api-client.js';
import { registerSnapshotTools } from '../tools/snapshots.js';
import { createMockServer, getHandler, expectTextContent } from './mcp-test-helper.js';

const mockApiCall = vi.mocked(apiCall);
const mockLogActivity = vi.mocked(logActivity);

describe('MCP snapshot tools', () => {
  const { server, tools } = createMockServer();
  registerSnapshotTools(server);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── tandem_snapshot ───────────────────────────────────────────────
  describe('tandem_snapshot', () => {
    const handler = getHandler(tools, 'tandem_snapshot');

    it('returns the accessibility tree', async () => {
      mockApiCall.mockResolvedValueOnce({ snapshot: '<tree>...</tree>', count: 42 });
      mockLogActivity.mockResolvedValueOnce(undefined);

      const result = await handler({});
      expectTextContent(result, '<tree>...</tree>');
      expect(mockApiCall).toHaveBeenCalledWith('GET', '/snapshot', undefined, undefined);
      expect(mockLogActivity).toHaveBeenCalledWith('snapshot', '42 nodes');
    });

    it('builds query string for compact and interactive', async () => {
      mockApiCall.mockResolvedValueOnce({ snapshot: '...', count: 5 });
      mockLogActivity.mockResolvedValueOnce(undefined);

      await handler({ compact: true, interactive: true, selector: '#app' });
      expect(mockApiCall).toHaveBeenCalledWith(
        'GET',
        expect.stringContaining('compact=true'),
        undefined,
        undefined,
      );
    });

    it('passes tabId as header', async () => {
      mockApiCall.mockResolvedValueOnce({ snapshot: '', count: 0 });
      mockLogActivity.mockResolvedValueOnce(undefined);

      await handler({ tabId: 't1' });
      expect(vi.mocked(tabHeaders)).toHaveBeenCalledWith('t1');
    });

    it('returns empty string when snapshot is missing', async () => {
      mockApiCall.mockResolvedValueOnce({ count: 0 });
      mockLogActivity.mockResolvedValueOnce(undefined);

      const result = await handler({});
      const text = expectTextContent(result);
      expect(text).toBe('');
    });
  });

  // ── tandem_snapshot_click ─────────────────────────────────────────
  describe('tandem_snapshot_click', () => {
    const handler = getHandler(tools, 'tandem_snapshot_click');

    it('clicks an element by ref', async () => {
      mockApiCall.mockResolvedValueOnce({});
      mockLogActivity.mockResolvedValueOnce(undefined);

      const result = await handler({ ref: '@e1' });
      expectTextContent(result, 'Clicked element @e1');
      expect(mockApiCall).toHaveBeenCalledWith('POST', '/snapshot/click', { ref: '@e1' }, undefined);
    });
  });

  // ── tandem_snapshot_fill ──────────────────────────────────────────
  describe('tandem_snapshot_fill', () => {
    const handler = getHandler(tools, 'tandem_snapshot_fill');

    it('fills an input by ref', async () => {
      mockApiCall.mockResolvedValueOnce({});
      mockLogActivity.mockResolvedValueOnce(undefined);

      const result = await handler({ ref: '@e3', value: 'hello' });
      expectTextContent(result, 'Filled element @e3 with "hello"');
      expect(mockApiCall).toHaveBeenCalledWith('POST', '/snapshot/fill', { ref: '@e3', value: 'hello' }, undefined);
    });
  });

  // ── tandem_snapshot_text ──────────────────────────────────────────
  describe('tandem_snapshot_text', () => {
    const handler = getHandler(tools, 'tandem_snapshot_text');

    it('returns text content of element', async () => {
      mockApiCall.mockResolvedValueOnce({ text: 'Hello World' });
      mockLogActivity.mockResolvedValueOnce(undefined);

      const result = await handler({ ref: '@e1' });
      expectTextContent(result, 'Hello World');
    });
  });

  // ── tandem_find ───────────────────────────────────────────────────
  describe('tandem_find', () => {
    const handler = getHandler(tools, 'tandem_find');

    it('finds elements by semantic locator', async () => {
      mockApiCall.mockResolvedValueOnce({ ref: '@e5', tag: 'button' });
      mockLogActivity.mockResolvedValueOnce(undefined);

      const result = await handler({ by: 'role', value: 'button' });
      expectTextContent(result);
      expect(mockApiCall).toHaveBeenCalledWith('POST', '/find', { by: 'role', value: 'button' }, undefined);
    });
  });

  // ── tandem_find_click ─────────────────────────────────────────────
  describe('tandem_find_click', () => {
    const handler = getHandler(tools, 'tandem_find_click');

    it('finds and clicks an element', async () => {
      mockApiCall.mockResolvedValueOnce({ ref: '@e7' });
      mockLogActivity.mockResolvedValueOnce(undefined);

      const result = await handler({ by: 'text', value: 'Submit' });
      expectTextContent(result, 'Clicked element found by text="Submit"');
    });
  });

  // ── tandem_find_fill ──────────────────────────────────────────────
  describe('tandem_find_fill', () => {
    const handler = getHandler(tools, 'tandem_find_fill');

    it('finds and fills an input', async () => {
      mockApiCall.mockResolvedValueOnce({ ref: '@e8' });
      mockLogActivity.mockResolvedValueOnce(undefined);

      const result = await handler({ by: 'placeholder', value: 'Email', text: 'a@b.com' });
      expectTextContent(result, 'Filled element found by placeholder="Email"');
      expect(mockApiCall).toHaveBeenCalledWith(
        'POST', '/find/fill',
        { by: 'placeholder', value: 'Email', fillValue: 'a@b.com' },
        undefined,
      );
    });
  });

  // ── tandem_find_all ───────────────────────────────────────────────
  describe('tandem_find_all', () => {
    const handler = getHandler(tools, 'tandem_find_all');

    it('finds all matching elements', async () => {
      mockApiCall.mockResolvedValueOnce({ matches: [{ ref: '@e1' }, { ref: '@e2' }] });
      mockLogActivity.mockResolvedValueOnce(undefined);

      const result = await handler({ by: 'role', value: 'link' });
      expectTextContent(result);
      expect(mockApiCall).toHaveBeenCalledWith('POST', '/find/all', { by: 'role', value: 'link' }, undefined);
    });
  });
});
