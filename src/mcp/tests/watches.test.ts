import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../api-client.js', () => ({
  apiCall: vi.fn(),
  tabHeaders: vi.fn(),
  logActivity: vi.fn(),
}));

vi.mock('../coerce.js', async (importOriginal) => importOriginal());

import { apiCall, logActivity } from '../api-client.js';
import { registerWatchTools } from '../tools/watches.js';
import { createMockServer, getHandler, expectTextContent } from './mcp-test-helper.js';

const mockApiCall = vi.mocked(apiCall);
const mockLogActivity = vi.mocked(logActivity);

describe('MCP watch tools', () => {
  const { server, tools } = createMockServer();
  registerWatchTools(server);

  beforeEach(() => { vi.clearAllMocks(); });

  it('tandem_watch_list lists watches', async () => {
    mockApiCall.mockResolvedValueOnce({ watches: [] });
    mockLogActivity.mockResolvedValueOnce(undefined);
    await getHandler(tools, 'tandem_watch_list')({});
    expect(mockApiCall).toHaveBeenCalledWith('GET', '/watch/list');
  });

  it('tandem_watch_add adds a watch', async () => {
    mockApiCall.mockResolvedValueOnce({ id: 'w1' });
    mockLogActivity.mockResolvedValueOnce(undefined);
    await getHandler(tools, 'tandem_watch_add')({ url: 'https://news.com', intervalMinutes: 60 });
    expect(mockApiCall).toHaveBeenCalledWith('POST', '/watch/add', { url: 'https://news.com', intervalMinutes: 60, diffMode: undefined });
  });

  it('tandem_watch_add forwards diff mode', async () => {
    mockApiCall.mockResolvedValueOnce({ id: 'w2' });
    mockLogActivity.mockResolvedValueOnce(undefined);
    await getHandler(tools, 'tandem_watch_add')({ url: 'https://news.com', intervalMinutes: 60, diffMode: 'title' });
    expect(mockApiCall).toHaveBeenCalledWith('POST', '/watch/add', { url: 'https://news.com', intervalMinutes: 60, diffMode: 'title' });
  });

  it('tandem_watch_remove removes a watch', async () => {
    mockApiCall.mockResolvedValueOnce({ ok: true });
    mockLogActivity.mockResolvedValueOnce(undefined);
    const result = await getHandler(tools, 'tandem_watch_remove')({ url: 'https://news.com' });
    expectTextContent(result, 'Removed watch');
  });

  it('tandem_watch_remove reports not found', async () => {
    mockApiCall.mockResolvedValueOnce({ ok: false });
    mockLogActivity.mockResolvedValueOnce(undefined);
    const result = await getHandler(tools, 'tandem_watch_remove')({ id: 'bad' });
    expectTextContent(result, 'Watch not found');
  });

  it('tandem_watch_check force-checks a watch', async () => {
    mockApiCall.mockResolvedValueOnce({ changed: true });
    mockLogActivity.mockResolvedValueOnce(undefined);
    await getHandler(tools, 'tandem_watch_check')({ url: 'https://news.com' });
    expect(mockApiCall).toHaveBeenCalledWith('POST', '/watch/check', { url: 'https://news.com' });
  });
});
