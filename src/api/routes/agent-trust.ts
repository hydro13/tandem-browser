/**
 * HTTP routes for the agent trust-tier system (T2 windows, T3 trusted
 * domains, T4 global windows).
 *
 * See docs/superpowers/agent-trust-tiers-design.md for the design.
 *
 * All mutation routes are local-automation-authenticated (same middleware
 * as the rest of the API). User-initiated grants (from the shell UI) hit
 * these routes directly. Agent-initiated grants (requesting persistent
 * trust or a global window) arrive via `/security/agent-trust/request-*`
 * and always require user approval via `taskManager.requestApproval`
 * before the grant lands.
 */

import type { Router, Request, Response } from 'express';
import type { RouteContext } from '../context';
import { agentIdFromRequest } from '../context';
import { handleRouteError } from '../../utils/errors';
import { DEFAULT_TIMEOUT_MS } from '../../utils/constants';
import {
  ALLOWED_GLOBAL_WINDOW_MINUTES,
  DOMAIN_WINDOW_DURATIONS,
  domainKeyFromUrl,
  type AllowedGlobalWindowMinutes,
  type DomainWindowDuration,
} from '../../security/agent-trust';

export function registerAgentTrustRoutes(router: Router, ctx: RouteContext): void {

  // ─── Read state ──────────────────────────────────────────────
  router.get('/security/agent-trust', (req: Request, res: Response) => {
    try {
      const byAgent = ctx.agentTrust.listAgentIds().map((id) => ctx.agentTrust.snapshot(id));
      // Also include the requesting agent's own bucket even if empty,
      // so UIs can bootstrap against it.
      const selfId = agentIdFromRequest(req);
      if (!byAgent.some((s) => s.agentId === selfId)) {
        byAgent.push(ctx.agentTrust.snapshot(selfId));
      }
      res.json({ agents: byAgent });
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  // ─── Direct grants (user-initiated from shell) ───────────────
  router.post('/security/agent-trust/grant-domain-window', (req: Request, res: Response) => {
    try {
      const { agentId, domain, durationLabel } = req.body as {
        agentId?: string; domain?: string; durationLabel?: string;
      };
      if (!agentId || typeof agentId !== 'string') { res.status(400).json({ error: 'agentId required' }); return; }
      const normalized = domainKeyFromUrl(domain ?? '');
      if (!normalized) { res.status(400).json({ error: 'valid http/https domain required' }); return; }
      if (!durationLabel || !(durationLabel in DOMAIN_WINDOW_DURATIONS)) {
        res.status(400).json({ error: `durationLabel must be one of ${Object.keys(DOMAIN_WINDOW_DURATIONS).join(', ')}` });
        return;
      }
      ctx.agentTrust.grantDomainWindow(agentId, normalized, durationLabel as DomainWindowDuration);
      res.json({ ok: true, snapshot: ctx.agentTrust.snapshot(agentId) });
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  router.post('/security/agent-trust/grant-trusted-domain', (req: Request, res: Response) => {
    try {
      const { agentId, domain } = req.body as { agentId?: string; domain?: string };
      if (!agentId || typeof agentId !== 'string') { res.status(400).json({ error: 'agentId required' }); return; }
      const normalized = domainKeyFromUrl(domain ?? '');
      if (!normalized) { res.status(400).json({ error: 'valid http/https domain required' }); return; }
      ctx.agentTrust.grantTrustedDomain(agentId, normalized);
      res.json({ ok: true, snapshot: ctx.agentTrust.snapshot(agentId) });
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  router.post('/security/agent-trust/grant-global-window', (req: Request, res: Response) => {
    try {
      const { agentId, minutes } = req.body as { agentId?: string; minutes?: number };
      if (!agentId || typeof agentId !== 'string') { res.status(400).json({ error: 'agentId required' }); return; }
      if (!ALLOWED_GLOBAL_WINDOW_MINUTES.includes(minutes as AllowedGlobalWindowMinutes)) {
        res.status(400).json({ error: `minutes must be one of ${ALLOWED_GLOBAL_WINDOW_MINUTES.join(', ')}` });
        return;
      }
      ctx.agentTrust.grantGlobalWindow(agentId, minutes as AllowedGlobalWindowMinutes);
      res.json({ ok: true, snapshot: ctx.agentTrust.snapshot(agentId) });
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  // ─── Direct revokes (user-initiated from shell) ──────────────
  router.post('/security/agent-trust/revoke-domain-window', (req: Request, res: Response) => {
    try {
      const { agentId, domain } = req.body as { agentId?: string; domain?: string };
      if (!agentId || !domain) { res.status(400).json({ error: 'agentId and domain required' }); return; }
      ctx.agentTrust.revokeDomainWindow(agentId, String(domain).toLowerCase());
      res.json({ ok: true, snapshot: ctx.agentTrust.snapshot(agentId) });
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  router.post('/security/agent-trust/revoke-trusted-domain', (req: Request, res: Response) => {
    try {
      const { agentId, domain } = req.body as { agentId?: string; domain?: string };
      if (!agentId || !domain) { res.status(400).json({ error: 'agentId and domain required' }); return; }
      ctx.agentTrust.revokeTrustedDomain(agentId, String(domain).toLowerCase());
      res.json({ ok: true, snapshot: ctx.agentTrust.snapshot(agentId) });
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  router.post('/security/agent-trust/revoke-global-window', (req: Request, res: Response) => {
    try {
      const { agentId } = req.body as { agentId?: string };
      if (!agentId) { res.status(400).json({ error: 'agentId required' }); return; }
      ctx.agentTrust.revokeGlobalWindow(agentId);
      res.json({ ok: true, snapshot: ctx.agentTrust.snapshot(agentId) });
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  router.post('/security/agent-trust/revoke-all', (req: Request, res: Response) => {
    try {
      const { agentId } = req.body as { agentId?: string };
      if (!agentId) { res.status(400).json({ error: 'agentId required' }); return; }
      ctx.agentTrust.revokeAll(agentId);
      res.json({ ok: true, snapshot: ctx.agentTrust.snapshot(agentId) });
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  // ─── Agent-initiated requests (require user approval) ────────

  // T3 request: agent asks to add a domain to its persistent trusted list.
  // Rate-limited per agent to prevent approval-fatigue spam.
  router.post('/security/agent-trust/request-trusted-domain', async (req: Request, res: Response) => {
    try {
      const { domain, rationale } = req.body as { domain?: string; rationale?: string };
      const agentId = agentIdFromRequest(req);
      const normalized = domainKeyFromUrl(domain ?? '');
      if (!normalized) { res.status(400).json({ error: 'valid http/https domain required' }); return; }
      if (!rationale || typeof rationale !== 'string' || rationale.length < 10) {
        res.status(400).json({ error: 'rationale (min 10 chars) required — what is this trust for?' });
        return;
      }

      const canRequest = ctx.agentTrust.canRequestGrant(agentId);
      if (!canRequest.ok) {
        res.status(429).json({
          error: 'rate limit exceeded',
          retryAfterMs: canRequest.retryAfterMs,
        });
        return;
      }

      const description =
        `Agent "${agentId}" asks to add ${normalized} to trusted sites.\n` +
        `Reason: ${rationale.slice(0, 240)}`;
      const task = ctx.taskManager.createTask(
        description,
        'claude', 'claude',
        [{ description, action: { type: 'trust_grant', params: { tier: 'T3', domain: normalized } }, riskLevel: 'high', requiresApproval: true }],
      );
      const approved = await Promise.race([
        ctx.taskManager.requestApproval(task, 0),
        new Promise<boolean>((resolve) => setTimeout(() => resolve(false), DEFAULT_TIMEOUT_MS)),
      ]);
      if (!approved) {
        res.status(403).json({ error: 'User rejected trust-grant request', rejected: true });
        return;
      }

      ctx.agentTrust.grantTrustedDomain(agentId, normalized);
      res.json({ ok: true, agentId, domain: normalized, snapshot: ctx.agentTrust.snapshot(agentId) });
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  // T4 request: agent asks for cross-site god-mode for 30 or 60 minutes.
  router.post('/security/agent-trust/request-global-window', async (req: Request, res: Response) => {
    try {
      const { minutes, rationale } = req.body as { minutes?: number; rationale?: string };
      const agentId = agentIdFromRequest(req);
      if (!ALLOWED_GLOBAL_WINDOW_MINUTES.includes(minutes as AllowedGlobalWindowMinutes)) {
        res.status(400).json({ error: `minutes must be one of ${ALLOWED_GLOBAL_WINDOW_MINUTES.join(', ')}` });
        return;
      }
      if (!rationale || typeof rationale !== 'string' || rationale.length < 10) {
        res.status(400).json({ error: 'rationale (min 10 chars) required — what is this window for?' });
        return;
      }

      const canRequest = ctx.agentTrust.canRequestGrant(agentId);
      if (!canRequest.ok) {
        res.status(429).json({
          error: 'rate limit exceeded',
          retryAfterMs: canRequest.retryAfterMs,
        });
        return;
      }

      const description =
        `Agent "${agentId}" asks for ${minutes}-minute cross-site access.\n` +
        `Reason: ${rationale.slice(0, 240)}`;
      const task = ctx.taskManager.createTask(
        description,
        'claude', 'claude',
        [{ description, action: { type: 'trust_grant', params: { tier: 'T4', minutes } }, riskLevel: 'high', requiresApproval: true }],
      );
      const approved = await Promise.race([
        ctx.taskManager.requestApproval(task, 0),
        new Promise<boolean>((resolve) => setTimeout(() => resolve(false), DEFAULT_TIMEOUT_MS)),
      ]);
      if (!approved) {
        res.status(403).json({ error: 'User rejected global-window request', rejected: true });
        return;
      }

      ctx.agentTrust.grantGlobalWindow(agentId, minutes as AllowedGlobalWindowMinutes);
      res.json({ ok: true, agentId, minutes, snapshot: ctx.agentTrust.snapshot(agentId) });
    } catch (e) {
      handleRouteError(res, e);
    }
  });
}
