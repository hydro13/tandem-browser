/**
 * AgentTrustStore — per-agent approval-tier cache.
 *
 * Solves the friction introduced by audit #34: Tandem's
 * every-call-needs-approval UX was too heavy for legitimate team-member
 * agent work (building overlays, iterating scripts). This store layers
 * four tiers on top of the existing `taskManager.requestApproval` gate:
 *
 *   T1  Default              Modal every call (current behavior)
 *   T2  Per-domain window    Modal asks once; agent free on that domain for N min
 *   T3  Trusted sites        Persistent allowlist per agent; never asks
 *   T4  Global window        30/60-min cross-site god-mode, agent-requested, user-approved
 *
 * What stays at T1 regardless (never bypassed):
 *   - /security/injection-override
 *   - /security/guardian/mode (weakening)
 *   - /security/domains/:domain/trust (raising)
 *   - /security/outbound/whitelist
 * Those endpoints still always require explicit per-call approval; raising
 * them is a meta-level capability that must not ride on cached trust.
 *
 * See docs/superpowers/agent-trust-tiers-design.md for the full design.
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';
import { createLogger } from '../utils/logger';

const log = createLogger('AgentTrust');

/** Minimum time between agent-initiated grant requests (ms). */
export const GRANT_REQUEST_COOLDOWN_MS = 5 * 60 * 1000;

/** Only these durations are valid for T4 global windows. */
export const ALLOWED_GLOBAL_WINDOW_MINUTES = [30, 60] as const;
export type AllowedGlobalWindowMinutes = (typeof ALLOWED_GLOBAL_WINDOW_MINUTES)[number];

/** T2 window duration labels. */
export const DOMAIN_WINDOW_DURATIONS = {
  '15min': 15 * 60 * 1000,
  '1hour': 60 * 60 * 1000,
  'session': 24 * 60 * 60 * 1000, // session ~= browser stays open; we cap at 24h as a safety net
} as const;
export type DomainWindowDuration = keyof typeof DOMAIN_WINDOW_DURATIONS;

interface DomainWindow {
  expiresAt: number;
  durationLabel: DomainWindowDuration;
}

interface GlobalWindow {
  expiresAt: number;
  minutes: AllowedGlobalWindowMinutes;
}

interface AgentTrustState {
  agentId: string;
  trustedDomains: Set<string>;              // T3 — persisted
  perDomainWindows: Map<string, DomainWindow>; // T2 — memory only
  globalWindow: GlobalWindow | null;         // T4 — memory only
  lastGrantRequestAt: number | null;         // for rate limiting
}

/** Snapshot shape exposed to UI / API. */
export interface AgentTrustSnapshot {
  agentId: string;
  trustedDomains: string[];
  perDomainWindows: Array<{
    domain: string;
    expiresAt: number;
    remainingMs: number;
    durationLabel: string;
  }>;
  globalWindow: {
    expiresAt: number;
    remainingMs: number;
    minutes: number;
  } | null;
}

/** Persisted file shape. */
interface PersistedState {
  version: number;
  agents: Record<string, { trustedDomains: string[] }>;
}

const PERSIST_VERSION = 1;

/**
 * Normalize a URL or hostname to a bare domain used as the cache key.
 * Strips protocol, port, and path. Lowercased. Returns empty string for
 * input that does not resolve to a recognizable HTTP(S) domain — callers
 * should treat empty string as "not trust-eligible" and fall through to T1.
 */
export function domainKeyFromUrl(input: string): string {
  if (!input || typeof input !== 'string') return '';
  const s = input.trim().toLowerCase();
  if (!s) return '';
  try {
    // If it parses as a URL, use the hostname.
    const u = new URL(s);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';
    return u.hostname;
  } catch {
    // Not a full URL — treat as bare host. Reject schemes / weird chars.
    if (/[:/\s]/.test(s)) return '';
    return s;
  }
}

export class AgentTrustStore {
  private states: Map<string, AgentTrustState> = new Map();
  private storePath: string;
  private persistInFlight: Promise<void> | null = null;

  constructor(storePath?: string) {
    this.storePath = storePath ?? path.join(os.homedir(), '.tandem', 'agent-trust.json');
  }

  /**
   * Check whether the agent is currently approved to act on `domain`
   * without a new user-approval modal. Returns true iff any of T2/T3/T4
   * matches. Does not mutate state (expired windows are NOT removed here;
   * reaped by housekeeping or on next mutation).
   */
  isApproved(agentId: string, domain: string): boolean {
    if (!agentId || !domain) return false;
    const state = this.states.get(agentId);
    if (!state) return false;

    const now = Date.now();

    // T4 — global window
    if (state.globalWindow && state.globalWindow.expiresAt > now) {
      return true;
    }

    // T3 — persistent trusted domains
    if (state.trustedDomains.has(domain)) {
      return true;
    }

    // T2 — per-domain windows
    const window = state.perDomainWindows.get(domain);
    if (window && window.expiresAt > now) {
      return true;
    }

    return false;
  }

  /** Grant or extend a T2 window for the given agent+domain. */
  grantDomainWindow(
    agentId: string,
    domain: string,
    durationLabel: DomainWindowDuration,
  ): void {
    if (!agentId || !domain) return;
    const state = this.ensureState(agentId);
    const durationMs = DOMAIN_WINDOW_DURATIONS[durationLabel];
    if (!durationMs) return;
    state.perDomainWindows.set(domain, {
      expiresAt: Date.now() + durationMs,
      durationLabel,
    });
    log.info(`T2 grant: ${agentId} on ${domain} for ${durationLabel}`);
  }

  /** Grant a T3 trusted domain (persistent). Schedules a persist. */
  grantTrustedDomain(agentId: string, domain: string): void {
    if (!agentId || !domain) return;
    const state = this.ensureState(agentId);
    if (state.trustedDomains.has(domain)) return; // already granted
    state.trustedDomains.add(domain);
    log.info(`T3 grant: ${agentId} always trusts ${domain}`);
    this.schedulePersist();
  }

  /** Grant T4 global window. `minutes` must be 30 or 60. */
  grantGlobalWindow(agentId: string, minutes: AllowedGlobalWindowMinutes): void {
    if (!agentId) return;
    if (!ALLOWED_GLOBAL_WINDOW_MINUTES.includes(minutes)) return;
    const state = this.ensureState(agentId);
    state.globalWindow = {
      expiresAt: Date.now() + minutes * 60 * 1000,
      minutes,
    };
    log.info(`T4 grant: ${agentId} global window ${minutes}min`);
  }

  revokeDomainWindow(agentId: string, domain: string): void {
    const state = this.states.get(agentId);
    if (!state) return;
    if (state.perDomainWindows.delete(domain)) {
      log.info(`T2 revoke: ${agentId} on ${domain}`);
    }
  }

  revokeTrustedDomain(agentId: string, domain: string): void {
    const state = this.states.get(agentId);
    if (!state) return;
    if (state.trustedDomains.delete(domain)) {
      log.info(`T3 revoke: ${agentId} on ${domain}`);
      this.schedulePersist();
    }
  }

  revokeGlobalWindow(agentId: string): void {
    const state = this.states.get(agentId);
    if (!state || !state.globalWindow) return;
    state.globalWindow = null;
    log.info(`T4 revoke: ${agentId} global window`);
  }

  revokeAll(agentId: string): void {
    const state = this.states.get(agentId);
    if (!state) return;
    state.perDomainWindows.clear();
    const hadTrusted = state.trustedDomains.size > 0;
    state.trustedDomains.clear();
    state.globalWindow = null;
    log.info(`revokeAll: ${agentId}`);
    if (hadTrusted) this.schedulePersist();
  }

  /**
   * Rate-limit check for agent-initiated grant requests
   * (tandem_request_trusted_domain / tandem_request_global_window).
   * Records the timestamp on success so next call within cooldown fails.
   */
  canRequestGrant(agentId: string): { ok: true } | { ok: false; retryAfterMs: number } {
    const state = this.ensureState(agentId);
    const now = Date.now();
    if (state.lastGrantRequestAt !== null) {
      const elapsed = now - state.lastGrantRequestAt;
      if (elapsed < GRANT_REQUEST_COOLDOWN_MS) {
        return { ok: false, retryAfterMs: GRANT_REQUEST_COOLDOWN_MS - elapsed };
      }
    }
    state.lastGrantRequestAt = now;
    return { ok: true };
  }

  /** Snapshot for UI consumption (expired windows are filtered out). */
  snapshot(agentId: string): AgentTrustSnapshot {
    const state = this.states.get(agentId);
    if (!state) {
      return {
        agentId,
        trustedDomains: [],
        perDomainWindows: [],
        globalWindow: null,
      };
    }

    const now = Date.now();

    const perDomainWindows: AgentTrustSnapshot['perDomainWindows'] = [];
    for (const [domain, win] of state.perDomainWindows) {
      if (win.expiresAt <= now) continue;
      perDomainWindows.push({
        domain,
        expiresAt: win.expiresAt,
        remainingMs: win.expiresAt - now,
        durationLabel: win.durationLabel,
      });
    }

    let globalWindow: AgentTrustSnapshot['globalWindow'] = null;
    if (state.globalWindow && state.globalWindow.expiresAt > now) {
      globalWindow = {
        expiresAt: state.globalWindow.expiresAt,
        remainingMs: state.globalWindow.expiresAt - now,
        minutes: state.globalWindow.minutes,
      };
    }

    return {
      agentId,
      trustedDomains: Array.from(state.trustedDomains).sort(),
      perDomainWindows: perDomainWindows.sort((a, b) => a.domain.localeCompare(b.domain)),
      globalWindow,
    };
  }

  /** List all agentIds we've tracked (for UI aggregation). */
  listAgentIds(): string[] {
    return Array.from(this.states.keys()).sort();
  }

  /**
   * Load persisted state from disk. Malformed JSON or missing file →
   * empty state, no crash. Should be called at boot.
   */
  async load(): Promise<void> {
    try {
      const raw = await fs.readFile(this.storePath, 'utf8');
      const parsed = JSON.parse(raw) as PersistedState;
      if (!parsed || parsed.version !== PERSIST_VERSION || !parsed.agents) {
        log.warn(`agent-trust.json has unknown shape; starting empty`);
        return;
      }
      for (const [agentId, entry] of Object.entries(parsed.agents)) {
        const state = this.ensureState(agentId);
        if (Array.isArray(entry?.trustedDomains)) {
          for (const d of entry.trustedDomains) {
            if (typeof d === 'string') state.trustedDomains.add(d);
          }
        }
      }
      log.info(`loaded agent-trust state for ${this.states.size} agent(s) from ${this.storePath}`);
    } catch (e) {
      const err = e as NodeJS.ErrnoException;
      if (err.code === 'ENOENT') {
        log.info(`no existing agent-trust.json; starting empty`);
        return;
      }
      log.warn(`agent-trust load failed:`, err.message);
    }
  }

  /**
   * Persist the T3 state to disk. If a persist is already in flight, wait
   * for it to finish and THEN write again — because new mutations may
   * have arrived during the previous write and we must not lose them.
   * Writes with mode 0o600 (user-only read/write).
   */
  async persist(): Promise<void> {
    // Wait for any in-flight write to finish. Don't early-return — the
    // in-flight write snapshotted state at its own start, so subsequent
    // mutations still need to be flushed.
    if (this.persistInFlight) {
      try { await this.persistInFlight; } catch { /* logged inside */ }
    }
    this.persistInFlight = this.doPersist().finally(() => {
      this.persistInFlight = null;
    });
    await this.persistInFlight;
  }

  private async doPersist(): Promise<void> {
    const agents: PersistedState['agents'] = {};
    for (const [agentId, state] of this.states) {
      // Only persist agents that have T3 state worth saving.
      if (state.trustedDomains.size === 0) continue;
      agents[agentId] = { trustedDomains: Array.from(state.trustedDomains).sort() };
    }
    const body: PersistedState = { version: PERSIST_VERSION, agents };
    const dir = path.dirname(this.storePath);
    try {
      await fs.mkdir(dir, { recursive: true });
      // Write atomically via temp + rename so a crash mid-write can't truncate.
      const tmp = this.storePath + '.tmp';
      await fs.writeFile(tmp, JSON.stringify(body, null, 2), { mode: 0o600 });
      await fs.rename(tmp, this.storePath);
    } catch (e) {
      log.warn(`agent-trust persist failed:`, (e as Error).message);
    }
  }

  private schedulePersist(): void {
    // Fire and forget; errors logged inside doPersist.
    this.persist().catch(() => { /* already logged */ });
  }

  private ensureState(agentId: string): AgentTrustState {
    let state = this.states.get(agentId);
    if (!state) {
      state = {
        agentId,
        trustedDomains: new Set(),
        perDomainWindows: new Map(),
        globalWindow: null,
        lastGrantRequestAt: null,
      };
      this.states.set(agentId, state);
    }
    return state;
  }
}
