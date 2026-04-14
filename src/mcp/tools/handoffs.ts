import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { apiCall, getMcpSource, logActivity } from '../api-client.js';
import { coerceShape } from '../coerce.js';

const handoffStatusSchema = z.enum([
  'needs_human',
  'blocked',
  'waiting_approval',
  'ready_to_resume',
  'completed_review',
  'resolved',
]);

export function registerHandoffTools(server: McpServer): void {
  server.tool(
    'tandem_handoff_create',
    'Create an explicit human↔agent handoff that appears in Tandem for the user to review, approve, or resume.',
    coerceShape({
      status: handoffStatusSchema.describe('Handoff state: needs_human, blocked, waiting_approval, ready_to_resume, completed_review, or resolved'),
      title: z.string().describe('Short handoff title shown to the human'),
      body: z.string().optional().describe('Detailed handoff explanation and what the human should do next'),
      reason: z.string().optional().describe('Structured reason such as captcha, login_required, approval_required, or task_completed'),
      workspaceId: z.string().optional().describe('Optional workspace ID to point the user to'),
      tabId: z.string().optional().describe('Optional tab ID to point the user to'),
      agentId: z.string().optional().describe('Optional agent identifier'),
      actionLabel: z.string().optional().describe('Optional next-step hint such as "Solve captcha and resume"'),
      notify: z.boolean().optional().describe('Also raise a visible Wingman alert/notification'),
    }),
    async ({ status, title, body, reason, workspaceId, tabId, agentId, actionLabel, notify }) => {
      const handoff = await apiCall('POST', '/handoffs', {
        status,
        title,
        body,
        reason,
        workspaceId,
        tabId,
        agentId,
        actionLabel,
        source: getMcpSource(),
        notify,
      });

      await logActivity('handoff_create', `${handoff.id}: ${title}`);
      return {
        content: [{
          type: 'text',
          text: `Handoff created: ${handoff.id}\nStatus: ${handoff.status}\nTitle: ${handoff.title}`,
        }],
      };
    },
  );

  server.tool(
    'tandem_handoff_list',
    'List handoffs that are open or recently updated. Use this to see what needs human attention.',
    coerceShape({
      openOnly: z.boolean().optional().default(true).describe('Only return open/actionable handoffs (default: true)'),
      status: handoffStatusSchema.optional().describe('Optional status filter'),
      workspaceId: z.string().optional().describe('Optional workspace filter'),
      tabId: z.string().optional().describe('Optional tab filter'),
    }),
    async ({ openOnly, status, workspaceId, tabId }) => {
      const params = new URLSearchParams();
      if (openOnly !== false) params.set('openOnly', 'true');
      if (status) params.set('status', status);
      if (workspaceId) params.set('workspaceId', workspaceId);
      if (tabId) params.set('tabId', tabId);
      const endpoint = params.toString() ? `/handoffs?${params}` : '/handoffs';
      const data = await apiCall('GET', endpoint);
      return { content: [{ type: 'text', text: JSON.stringify(data.handoffs || [], null, 2) }] };
    },
  );

  server.tool(
    'tandem_handoff_get',
    'Get the full details for a specific handoff.',
    {
      id: z.string().describe('The handoff ID'),
    },
    async ({ id }) => {
      const handoff = await apiCall('GET', `/handoffs/${encodeURIComponent(id)}`);
      return { content: [{ type: 'text', text: JSON.stringify(handoff, null, 2) }] };
    },
  );

  server.tool(
    'tandem_handoff_update',
    'Update a handoff status or message when the agent is unblocked, waiting again, ready to resume, or done for review.',
    coerceShape({
      id: z.string().describe('The handoff ID'),
      status: handoffStatusSchema.optional().describe('Updated handoff status'),
      title: z.string().optional().describe('Optional updated title'),
      body: z.string().optional().describe('Optional updated body'),
      reason: z.string().optional().describe('Optional updated reason'),
      actionLabel: z.string().optional().describe('Optional updated next-step hint'),
      open: z.boolean().optional().describe('Override whether the handoff stays open/actionable'),
    }),
    async ({ id, ...patch }) => {
      const handoff = await apiCall('PATCH', `/handoffs/${encodeURIComponent(id)}`, patch);
      await logActivity('handoff_update', `${id}: ${handoff.status}`);
      return { content: [{ type: 'text', text: JSON.stringify(handoff, null, 2) }] };
    },
  );

  server.tool(
    'tandem_handoff_resolve',
    'Mark a handoff as resolved so it leaves the open handoff inbox.',
    {
      id: z.string().describe('The handoff ID'),
    },
    async ({ id }) => {
      const handoff = await apiCall('POST', `/handoffs/${encodeURIComponent(id)}/resolve`);
      await logActivity('handoff_resolve', id);
      return {
        content: [{
          type: 'text',
          text: `Handoff resolved: ${handoff.id}`,
        }],
      };
    },
  );

  server.tool(
    'tandem_handoff_ready',
    'Mark a human-blocked handoff as ready to resume so the linked task moves into a resumable state.',
    {
      id: z.string().describe('The handoff ID'),
    },
    async ({ id }) => {
      const handoff = await apiCall('POST', `/handoffs/${encodeURIComponent(id)}/ready`);
      await logActivity('handoff_ready', id);
      return {
        content: [{
          type: 'text',
          text: `Handoff ready: ${handoff.id}\nStatus: ${handoff.status}`,
        }],
      };
    },
  );

  server.tool(
    'tandem_handoff_resume',
    'Resume the linked agent task from a ready handoff and resolve the handoff in the inbox.',
    {
      id: z.string().describe('The handoff ID'),
    },
    async ({ id }) => {
      const handoff = await apiCall('POST', `/handoffs/${encodeURIComponent(id)}/resume`);
      await logActivity('handoff_resume', id);
      return {
        content: [{
          type: 'text',
          text: `Handoff resumed: ${handoff.id}\nStatus: ${handoff.status}`,
        }],
      };
    },
  );

  server.tool(
    'tandem_handoff_approve',
    'Approve a waiting-approval handoff and let the linked task step continue.',
    {
      id: z.string().describe('The handoff ID'),
    },
    async ({ id }) => {
      const handoff = await apiCall('POST', `/handoffs/${encodeURIComponent(id)}/approve`);
      await logActivity('handoff_approve', id);
      return {
        content: [{
          type: 'text',
          text: `Handoff approved: ${handoff.id}\nStatus: ${handoff.status}`,
        }],
      };
    },
  );

  server.tool(
    'tandem_handoff_reject',
    'Reject a waiting-approval handoff and keep the linked task paused.',
    {
      id: z.string().describe('The handoff ID'),
    },
    async ({ id }) => {
      const handoff = await apiCall('POST', `/handoffs/${encodeURIComponent(id)}/reject`);
      await logActivity('handoff_reject', id);
      return {
        content: [{
          type: 'text',
          text: `Handoff rejected: ${handoff.id}\nStatus: ${handoff.status}`,
        }],
      };
    },
  );
}
