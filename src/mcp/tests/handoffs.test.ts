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

  it('lists handoffs with explicit filters and openOnly disabled', async () => {
    const handler = getHandler(tools, 'tandem_handoff_list');
    mockApiCall.mockResolvedValueOnce({ handoffs: [{ id: 'handoff-2' }] });

    const result = await handler({
      openOnly: false,
      status: 'blocked',
      workspaceId: 'ws-1',
      tabId: 'tab-1',
    });

    expectTextContent(result, 'handoff-2');
    expect(mockApiCall).toHaveBeenCalledWith(
      'GET',
      '/handoffs?status=blocked&workspaceId=ws-1&tabId=tab-1',
    );
  });

  it('fetches a single handoff', async () => {
    const handler = getHandler(tools, 'tandem_handoff_get');
    mockApiCall.mockResolvedValueOnce({ id: 'handoff-1', status: 'needs_human' });

    const result = await handler({ id: 'handoff-1' });

    expectTextContent(result, '"id": "handoff-1"');
    expect(mockApiCall).toHaveBeenCalledWith('GET', '/handoffs/handoff-1');
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
    expect(mockLogActivity).toHaveBeenCalledWith('handoff_update', 'handoff-1: ready_to_resume');
  });

  it('resolves a handoff', async () => {
    const handler = getHandler(tools, 'tandem_handoff_resolve');
    mockApiCall.mockResolvedValueOnce({ id: 'handoff-1' });
    mockLogActivity.mockResolvedValueOnce(undefined);

    const result = await handler({ id: 'handoff-1' });

    expectTextContent(result, 'Handoff resolved: handoff-1');
    expect(mockApiCall).toHaveBeenCalledWith('POST', '/handoffs/handoff-1/resolve');
  });

  it('marks a handoff ready to resume', async () => {
    const handler = getHandler(tools, 'tandem_handoff_ready');
    mockApiCall.mockResolvedValueOnce({ id: 'handoff-1', status: 'ready_to_resume' });
    mockLogActivity.mockResolvedValueOnce(undefined);

    const result = await handler({ id: 'handoff-1' });

    expectTextContent(result, 'Handoff ready: handoff-1');
    expect(mockApiCall).toHaveBeenCalledWith('POST', '/handoffs/handoff-1/ready');
  });

  it('resumes a handoff-linked task', async () => {
    const handler = getHandler(tools, 'tandem_handoff_resume');
    mockApiCall.mockResolvedValueOnce({ id: 'handoff-1', status: 'resolved' });
    mockLogActivity.mockResolvedValueOnce(undefined);

    const result = await handler({ id: 'handoff-1' });

    expectTextContent(result, 'Handoff resumed: handoff-1');
    expect(mockApiCall).toHaveBeenCalledWith('POST', '/handoffs/handoff-1/resume');
  });

  it('approves a waiting handoff', async () => {
    const handler = getHandler(tools, 'tandem_handoff_approve');
    mockApiCall.mockResolvedValueOnce({ id: 'handoff-1', status: 'resolved' });
    mockLogActivity.mockResolvedValueOnce(undefined);

    const result = await handler({ id: 'handoff-1' });

    expectTextContent(result, 'Handoff approved: handoff-1');
    expect(mockApiCall).toHaveBeenCalledWith('POST', '/handoffs/handoff-1/approve');
  });

  it('rejects a waiting handoff', async () => {
    const handler = getHandler(tools, 'tandem_handoff_reject');
    mockApiCall.mockResolvedValueOnce({ id: 'handoff-1', status: 'resolved' });
    mockLogActivity.mockResolvedValueOnce(undefined);

    const result = await handler({ id: 'handoff-1' });

    expectTextContent(result, 'Handoff rejected: handoff-1');
    expect(mockApiCall).toHaveBeenCalledWith('POST', '/handoffs/handoff-1/reject');
  });

  it('passes notify and action hints through on create', async () => {
    const handler = getHandler(tools, 'tandem_handoff_create');
    mockApiCall.mockResolvedValueOnce({ id: 'handoff-9', status: 'waiting_approval', title: 'Need approval' });
    mockLogActivity.mockResolvedValueOnce(undefined);

    await handler({
      status: 'waiting_approval',
      title: 'Need approval',
      actionLabel: 'Approve action',
      notify: true,
      agentId: 'agent-7',
      workspaceId: 'ws-7',
    });

    expect(mockApiCall).toHaveBeenCalledWith('POST', '/handoffs', expect.objectContaining({
      actionLabel: 'Approve action',
      notify: true,
      agentId: 'agent-7',
      workspaceId: 'ws-7',
    }));
  });
});
