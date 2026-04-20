import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { apiCall, logActivity } from '../api-client.js';

/**
 * Agent-trust MCP tools — let the agent request bigger trust scopes from
 * the user. Each request produces a user-approval modal with the agent's
 * domain/minutes and rationale visible, then records the grant on success.
 *
 * These calls are rate-limited per agent (5 minutes between requests) to
 * prevent approval-fatigue spam. On rate-limit the HTTP route returns 429
 * with a `retryAfterMs`; this tool surfaces that as an error string the
 * agent can read and back off from.
 *
 * See docs/superpowers/agent-trust-tiers-design.md for the full design.
 */
export function registerAgentTrustTools(server: McpServer): void {
  server.tool(
    'tandem_request_trusted_domain',
    'Ask the user to add a domain to the agent\'s permanent trusted-sites list. ' +
      'Trusted sites let the agent run scripts, register persistent scripts, and inject ' +
      'styles on that domain without per-call approval, until the user revokes. ' +
      'The user sees a modal with the domain and your rationale and decides. ' +
      'Rate-limited: max one trust-grant request per 5 minutes per agent. ' +
      'Use this when you expect repeat work on the same site (e.g., an inbox triage ' +
      'workflow on linkedin.com, or iterative UI overlays on funda.nl).',
    {
      domain: z.string().describe('The domain to request (e.g. "funda.nl" or "https://funda.nl/"). Subdomains are treated as separate entries.'),
      rationale: z.string().min(10).describe('Why you want this persistent trust. Shown to the user in the approval modal. Min 10 chars.'),
    },
    {
      destructiveHint: false,
      readOnlyHint: false,
      openWorldHint: false,
    },
    async ({ domain, rationale }) => {
      try {
        const result = await apiCall('POST', '/security/agent-trust/request-trusted-domain', { domain, rationale });
        await logActivity('trust_request_domain', `${domain}: ${rationale.slice(0, 60)}`);
        return { content: [{ type: 'text', text: `Trusted-domain grant approved for ${domain}.\n${JSON.stringify(result, null, 2)}` }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('rate limit')) {
          return { content: [{ type: 'text', text: `Rate limit: wait a few minutes before requesting another trust grant.\n${msg}` }], isError: true };
        }
        if (msg.includes('rejected')) {
          return { content: [{ type: 'text', text: `User rejected the trusted-domain request for ${domain}.` }], isError: true };
        }
        throw err;
      }
    },
  );

  server.tool(
    'tandem_request_global_window',
    'Ask the user for a temporary cross-site window (30 or 60 minutes) where the agent ' +
      'can run scripts, register persistent scripts, and inject styles on ANY domain ' +
      'without per-call approval. Auto-expires; must be requested again afterward. ' +
      'Power-user mode — use only when the task genuinely spans many sites (e.g., ' +
      'cross-site research sweep, bulk data enrichment across providers). ' +
      'Rate-limited: max one request per 5 minutes per agent. ' +
      'Security-posture-weakening endpoints (lowering trust, whitelisting) still ' +
      'require separate per-call approval even during a global window.',
    {
      minutes: z.union([z.literal(30), z.literal(60)]).describe('Duration in minutes. Only 30 or 60 accepted; no other values.'),
      rationale: z.string().min(10).describe('Why you want this window. Shown to the user. Min 10 chars.'),
    },
    {
      destructiveHint: false,
      readOnlyHint: false,
      openWorldHint: false,
    },
    async ({ minutes, rationale }) => {
      try {
        const result = await apiCall('POST', '/security/agent-trust/request-global-window', { minutes, rationale });
        await logActivity('trust_request_window', `${minutes}min: ${rationale.slice(0, 60)}`);
        return { content: [{ type: 'text', text: `Cross-site window approved for ${minutes} minutes.\n${JSON.stringify(result, null, 2)}` }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('rate limit')) {
          return { content: [{ type: 'text', text: `Rate limit: wait a few minutes before requesting another trust grant.\n${msg}` }], isError: true };
        }
        if (msg.includes('rejected')) {
          return { content: [{ type: 'text', text: `User rejected the global-window request.` }], isError: true };
        }
        throw err;
      }
    },
  );

  server.tool(
    'tandem_list_trust',
    'List the agent\'s current trust state: active per-domain windows, trusted sites, ' +
      'and the global window if any. Useful before deciding whether to request a new grant.',
    {},
    async () => {
      const data = await apiCall('GET', '/security/agent-trust');
      await logActivity('trust_list');
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    },
  );
}
