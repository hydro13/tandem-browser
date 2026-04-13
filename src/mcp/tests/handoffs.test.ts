import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../api-client.js', () => ({
  apiCall: vi.fn(),
  getMcpSource: vi.fn(() => 'wingman'),
  logActivity: vi.fn(),
}));

vi.mock('../coerce.js', async (importOriginal) => importOriginal());

import { apiCall, getMcpSource, logActivity } from '../api-client.js';
import { registerHandoffTools } from '../tools/handoffs.js';
import { createMockServer, expectTextContent, getHandler } from './mcp-test-helper.js';

const mockApiCall = vi.mocked(apiCall);
const mockGetMcpSource = vi.mocked(getMcpSource);
const mockLogActivity = vi.mocked(logActivity);

describe('MCP handoff tools', () => {
  const { server, tools } = createMockServer();
  registerHandoffTools(server);

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetMcpSource.mockReturnValue('claude');
  });

  it('creates an explicit handoff', async () => {
    const handler = getHandler(tools, 'tandem_handoff_create');
    mockApiCall.mockResolvedValueOnce({ id: 'handoff-1', status: 'needs_human', title: 'Captcha detected' });
    mockLogActivity.mockResolvedValueOnce(undefined);

    const result = await handler({
      status: 'needs_human',
      title: 'Captcha detected',
      body: 'Please solve it',
      reason: 'captcha',
      tabId: 'tab-1',
    });

    expectTextContent(result, 'Handoff created: handoff-1');
    expect(mockApiCall).toHaveBeenCalledWith('POST', '/handoffs', expect.objectContaining({
      status: 'needs_human',
      title: 'Captcha detected',
      source: 'claude',
      tabId: 'tab-1',
    }));
  });

  it('lists open handoffs by default', async () => {
    const handler = getHandler(tools, 'tandem_handoff_list');
    mockApiCall.mockResolvedValueOnce({ handoffs: [{ id: 'handoff-1' }] });

    const result = await handler({});

    expectTextContent(result, 'handoff-1');
    expect(mockApiCall).toHaveBeenCalledWith('GET', '/handoffs?openOnly=true');
  });

  it('updates a handoff', async () => {
    const handler = getHandler(tools, 'tandem_handoff_update');
    mockApiCall.mockResolvedValueOnce({ id: 'handoff-1', status: 'ready_to_resume' });
    mockLogActivity.mockResolvedValueOnce(undefined);

    const result = await handler({ id: 'handoff-1', status: 'ready_to_resume', open: true });

    expectTextContent(result, 'ready_to_resume');
    expect(mockApiCall).toHaveBeenCalledWith('PATCH', '/handoffs/handoff-1', {
      status: 'ready_to_resume',
      open: true,
    });
  });

  it('resolves a handoff', async () => {
    const handler = getHandler(tools, 'tandem_handoff_resolve');
    mockApiCall.mockResolvedValueOnce({ id: 'handoff-1' });
    mockLogActivity.mockResolvedValueOnce(undefined);

    const result = await handler({ id: 'handoff-1' });

    expectTextContent(result, 'Handoff resolved: handoff-1');
    expect(mockApiCall).toHaveBeenCalledWith('POST', '/handoffs/handoff-1/resolve');
  });
});
