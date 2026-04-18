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

    it('prefixes a warning banner when scanner attached injectionWarnings', async () => {
      mockApiCall.mockResolvedValueOnce({
        snapshot: '<tree/>',
        count: 3,
        injectionWarnings: {
          riskScore: 35,
          summary: 'Suspicious pattern',
          findings: [{ severity: 'medium', description: 'something fishy' }],
        },
      });
      mockLogActivity.mockResolvedValueOnce(undefined);
      const result = await handler({});
      const text = expectTextContent(result);
      expect(text).toContain('⚠️ **Prompt-injection warning**');
      expect(text).toContain('risk 35/100');
      expect(text).toContain('<tree/>');
    });

    it('shows block marker when scanner blocked', async () => {
      mockApiCall.mockResolvedValueOnce({ blocked: true, riskScore: 90, domain: 'bad.com' });
      mockLogActivity.mockResolvedValueOnce(undefined);
      const result = await handler({});
      const text = expectTextContent(result, 'BLOCKED BY PROMPT-INJECTION DETECTION');
      expect(text).not.toContain('<tree');
      expect(mockLogActivity).toHaveBeenCalledWith('snapshot', 'blocked by injection scanner');
    });
  });

  // ── tandem_snapshot_click ─────────────────────────────────────────
  describe('tandem_snapshot_click', () => {
    const handler = getHandler(tools, 'tandem_snapshot_click');

    it('clicks an element by ref', async () => {
      mockApiCall.mockResolvedValueOnce({ scope: { tabId: 'tab-1' }, completion: { mode: 'confirmed' } });
      mockLogActivity.mockResolvedValueOnce(undefined);

      const result = await handler({ ref: '@e1' });
      expectTextContent(result, 'Clicked element @e1 (tab tab-1; confirmed)');
      expect(mockApiCall).toHaveBeenCalledWith('POST', '/snapshot/click', { ref: '@e1' }, undefined);
    });

    it('passes tabId as header when provided', async () => {
      mockApiCall.mockResolvedValueOnce({ scope: { tabId: 'tab-2' }, completion: { mode: 'confirmed' } });
      mockLogActivity.mockResolvedValueOnce(undefined);

      await handler({ ref: '@e1', tabId: 'tab-2' });
      expect(vi.mocked(tabHeaders)).toHaveBeenCalledWith('tab-2');
    });

    it('reports dispatched mode when scope has no tabId', async () => {
      mockApiCall.mockResolvedValueOnce({ scope: {}, completion: { mode: 'dispatched' } });
      mockLogActivity.mockResolvedValueOnce(undefined);

      const result = await handler({ ref: '@e5' });
      expectTextContent(result, 'active scope; dispatched');
    });
  });

  // ── tandem_snapshot_fill ──────────────────────────────────────────
  describe('tandem_snapshot_fill', () => {
    const handler = getHandler(tools, 'tandem_snapshot_fill');

    it('fills an input by ref', async () => {
      mockApiCall.mockResolvedValueOnce({ scope: { tabId: 'tab-1' }, completion: { mode: 'confirmed' } });
      mockLogActivity.mockResolvedValueOnce(undefined);

      const result = await handler({ ref: '@e3', value: 'hello' });
      expectTextContent(result, 'Filled element @e3 with "hello" (tab tab-1; confirmed)');
      expect(mockApiCall).toHaveBeenCalledWith('POST', '/snapshot/fill', { ref: '@e3', value: 'hello' }, undefined);
    });

    it('passes tabId as header when provided', async () => {
      mockApiCall.mockResolvedValueOnce({ scope: { tabId: 'tab-3' }, completion: { mode: 'confirmed' } });
      mockLogActivity.mockResolvedValueOnce(undefined);

      await handler({ ref: '@e3', value: 'data', tabId: 'tab-3' });
      expect(vi.mocked(tabHeaders)).toHaveBeenCalledWith('tab-3');
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

    it('returns empty string when text is null', async () => {
      mockApiCall.mockResolvedValueOnce({});
      mockLogActivity.mockResolvedValueOnce(undefined);

      const result = await handler({ ref: '@e1' });
      const text = expectTextContent(result);
      expect(text).toBe('');
    });

    it('passes tabId as header when provided', async () => {
      mockApiCall.mockResolvedValueOnce({ text: 'Some text' });
      mockLogActivity.mockResolvedValueOnce(undefined);

      await handler({ ref: '@e1', tabId: 'tab-5' });
      expect(vi.mocked(tabHeaders)).toHaveBeenCalledWith('tab-5');
    });

    it('prefixes a warning banner when scanner attached injectionWarnings', async () => {
      mockApiCall.mockResolvedValueOnce({
        text: 'suspicious inner text',
        injectionWarnings: {
          riskScore: 40,
          summary: 'Pattern match',
          findings: [{ severity: 'high', description: 'Injection hint' }],
        },
      });
      mockLogActivity.mockResolvedValueOnce(undefined);
      const result = await handler({ ref: '@e1' });
      const text = expectTextContent(result);
      expect(text).toContain('⚠️ **Prompt-injection warning**');
      expect(text).toContain('suspicious inner text');
    });

    it('shows block marker when scanner blocked', async () => {
      mockApiCall.mockResolvedValueOnce({ blocked: true, riskScore: 85 });
      mockLogActivity.mockResolvedValueOnce(undefined);
      const result = await handler({ ref: '@e1' });
      expectTextContent(result, 'BLOCKED BY PROMPT-INJECTION DETECTION');
      expect(mockLogActivity).toHaveBeenCalledWith('snapshot_text', 'blocked by injection scanner');
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
      mockApiCall.mockResolvedValueOnce({ scope: { tabId: 'tab-7' }, completion: { mode: 'confirmed' } });
      mockLogActivity.mockResolvedValueOnce(undefined);

      const result = await handler({ by: 'text', value: 'Submit' });
      expectTextContent(result, 'Clicked element found by text="Submit" (tab tab-7; confirmed)');
    });
  });

  // ── tandem_find_fill ──────────────────────────────────────────────
  describe('tandem_find_fill', () => {
    const handler = getHandler(tools, 'tandem_find_fill');

    it('finds and fills an input', async () => {
      mockApiCall.mockResolvedValueOnce({ scope: { tabId: 'tab-8' }, completion: { mode: 'confirmed' } });
      mockLogActivity.mockResolvedValueOnce(undefined);

      const result = await handler({ by: 'placeholder', value: 'Email', text: 'a@b.com' });
      expectTextContent(result, 'Filled element found by placeholder="Email" with "a@b.com" (tab tab-8; confirmed)');
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
