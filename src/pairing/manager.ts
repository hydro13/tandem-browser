/**
 * PairingManager — setup code generation, token exchange, and binding lifecycle.
 *
 * Implements the Tandem remote agent pairing model:
 * - One-time setup codes (TDM-XXXX-XXXX, 5-minute TTL)
 * - Durable binding tokens (256-bit, hashed with SHA-256)
 * - Binding states: paired, paused, revoked
 * - Binding removal with audit trail retention
 *
 * Storage: ~/.tandem/pairing/bindings.json (persistent bindings)
 *          In-memory map (ephemeral setup codes)
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { EventEmitter } from 'events';
import { tandemDir, ensureDir } from '../utils/paths';
import { createLogger } from '../utils/logger';

const log = createLogger('PairingManager');

// ─── Constants ──────────────────────────────────────

const SETUP_CODE_PREFIX = 'TDM';
const TOKEN_PREFIX = 'tdm_ast_';
const TOKEN_BYTES = 32; // 256 bits
const SETUP_CODE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_SETUP_CODES_PER_HOUR = 10;
const SAFE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no O/0, I/1, l

// ─── Types ──────────────────────────────────────────

export type BindingState = 'paired' | 'paused' | 'revoked';

export interface AgentBinding {
  id: string;
  machineId: string;
  machineName: string;
  agentLabel: string;
  agentType: string;
  bindingKind: 'local' | 'remote';
  transportModes: Array<'http' | 'mcp'>;
  tokenHash: string;
  tokenPrefix: string;
  state: BindingState;
  createdAt: string;
  lastUsedAt: string | null;
  pausedAt: string | null;
  revokedAt: string | null;
}

export interface BindingEvent {
  id: string;
  bindingId: string;
  eventType: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  sourceIp: string | null;
}

export interface SetupCode {
  code: string;
  createdAt: number;
  expiresAt: number;
  consumed: boolean;
}

export interface ExchangeInput {
  code: string;
  machineId: string;
  machineName: string;
  agentLabel: string;
  agentType: string;
  bindingKind?: 'local' | 'remote';
  transport?: Array<'http' | 'mcp'>;
}

export interface ExchangeResult {
  token: string;
  binding: AgentBinding;
}

export interface BindingSummary {
  id: string;
  machineId: string;
  machineName: string;
  agentLabel: string;
  agentType: string;
  bindingKind: 'local' | 'remote';
  transportModes: Array<'http' | 'mcp'>;
  state: BindingState;
  createdAt: string;
  lastUsedAt: string | null;
  pausedAt: string | null;
  revokedAt: string | null;
  tokenPrefix: string;
}

// ─── Storage shape ──────────────────────────────────

interface PairingStore {
  bindings: AgentBinding[];
  events: BindingEvent[];
}

// ─── Crypto helpers ─────────────────────────────────

function randomChars(length: number): string {
  let result = '';
  for (let i = 0; i < length; i++) {
    const idx = crypto.randomInt(SAFE_CHARS.length);
    result += SAFE_CHARS[idx];
  }
  return result;
}

function generateSetupCodeString(): string {
  return `${SETUP_CODE_PREFIX}-${randomChars(4)}-${randomChars(4)}`;
}

function generateSecureToken(): string {
  const bytes = crypto.randomBytes(TOKEN_BYTES);
  return `${TOKEN_PREFIX}${bytes.toString('base64url')}`;
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function timingSafeCompare(a: string, b: string): boolean {
  try {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

// ─── PairingManager ────────────────────────────────

export class PairingManager extends EventEmitter {
  private bindings: AgentBinding[] = [];
  private events: BindingEvent[] = [];
  private setupCodes: Map<string, SetupCode> = new Map();
  private codeGenerationTimestamps: number[] = [];
  private storePath: string;
  private loaded = false;

  constructor() {
    super();
    this.storePath = path.join(tandemDir('pairing'), 'bindings.json');
  }

  // ─── Persistence ──────────────────────────────────

  private ensureLoaded(): void {
    if (this.loaded) return;
    this.loaded = true;
    try {
      if (fs.existsSync(this.storePath)) {
        const raw = fs.readFileSync(this.storePath, 'utf-8');
        const data: PairingStore = JSON.parse(raw);
        this.bindings = data.bindings ?? [];
        this.events = data.events ?? [];
      }
    } catch (e) {
      log.warn('Failed to load pairing store:', e instanceof Error ? e.message : e);
    }
  }

  private save(): void {
    try {
      ensureDir(path.dirname(this.storePath));
      const data: PairingStore = { bindings: this.bindings, events: this.events };
      fs.writeFileSync(this.storePath, JSON.stringify(data, null, 2), { mode: 0o600 });
    } catch (e) {
      log.error('Failed to save pairing store:', e instanceof Error ? e.message : e);
    }
  }

  private addEvent(bindingId: string, eventType: string, metadata: Record<string, unknown> = {}, sourceIp: string | null = null): void {
    this.events.push({
      id: crypto.randomUUID(),
      bindingId,
      eventType,
      metadata,
      createdAt: new Date().toISOString(),
      sourceIp,
    });
  }

  // ─── Setup codes ──────────────────────────────────

  /** Generate a one-time setup code. Returns the code or throws if rate-limited. */
  generateSetupCode(): SetupCode {
    this.ensureLoaded();

    // Rate limit: max N codes per hour
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    this.codeGenerationTimestamps = this.codeGenerationTimestamps.filter(ts => ts > oneHourAgo);
    if (this.codeGenerationTimestamps.length >= MAX_SETUP_CODES_PER_HOUR) {
      throw new Error('Too many setup codes generated. Please wait before trying again.');
    }

    // Cancel any existing unused codes
    for (const [key, sc] of this.setupCodes) {
      if (!sc.consumed) {
        this.setupCodes.delete(key);
      }
    }

    const code = generateSetupCodeString();
    const now = Date.now();
    const setupCode: SetupCode = {
      code,
      createdAt: now,
      expiresAt: now + SETUP_CODE_TTL_MS,
      consumed: false,
    };

    this.setupCodes.set(code, setupCode);
    this.codeGenerationTimestamps.push(now);

    log.info(`Setup code generated: ${code.substring(0, 7)}****`);
    this.emit('setup-code-generated', { code });
    return setupCode;
  }

  /** Get the current active (unconsumed, unexpired) setup code, if any. */
  getActiveSetupCode(): SetupCode | null {
    const now = Date.now();
    for (const sc of this.setupCodes.values()) {
      if (!sc.consumed && sc.expiresAt > now) {
        return sc;
      }
    }
    return null;
  }

  // ─── Token exchange ───────────────────────────────

  /** Exchange a setup code for a durable binding token. */
  exchangeSetupCode(input: ExchangeInput, sourceIp: string | null = null): ExchangeResult {
    this.ensureLoaded();
    const normalizedCode = input.code.toUpperCase().trim();

    const setupCode = this.setupCodes.get(normalizedCode);
    if (!setupCode) {
      throw new Error('Invalid setup code');
    }
    if (setupCode.consumed) {
      throw new Error('This setup code has already been used');
    }
    if (setupCode.expiresAt < Date.now()) {
      this.setupCodes.delete(normalizedCode);
      throw new Error('This setup code has expired');
    }

    // Consume the code
    setupCode.consumed = true;

    // Generate durable token
    const token = generateSecureToken();
    const tokenHashValue = hashToken(token);
    const tokenPrefix = token.substring(0, 16); // tdm_ast_ + 8 chars

    // Check for existing binding with same identity
    const existingIndex = this.bindings.findIndex(
      b => b.machineId === input.machineId
        && b.agentLabel === input.agentLabel
        && b.agentType === input.agentType,
    );

    const now = new Date().toISOString();
    let binding: AgentBinding;

    if (existingIndex >= 0) {
      // Re-pair: update token and reset state
      binding = this.bindings[existingIndex];
      binding.tokenHash = tokenHashValue;
      binding.tokenPrefix = tokenPrefix;
      binding.machineName = input.machineName;
      binding.bindingKind = input.bindingKind ?? 'local';
      binding.transportModes = input.transport ?? ['http'];
      binding.state = 'paired';
      binding.lastUsedAt = now;
      binding.pausedAt = null;
      binding.revokedAt = null;

      this.addEvent(binding.id, 're-paired', {
        machineId: input.machineId,
        agentLabel: input.agentLabel,
      }, sourceIp);
      log.info(`Binding re-paired: ${input.agentLabel} on ${input.machineName}`);
    } else {
      binding = {
        id: crypto.randomUUID(),
        machineId: input.machineId,
        machineName: input.machineName,
        agentLabel: input.agentLabel,
        agentType: input.agentType,
        bindingKind: input.bindingKind ?? 'local',
        transportModes: input.transport ?? ['http'],
        tokenHash: tokenHashValue,
        tokenPrefix,
        state: 'paired',
        createdAt: now,
        lastUsedAt: now,
        pausedAt: null,
        revokedAt: null,
      };
      this.bindings.push(binding);

      this.addEvent(binding.id, 'paired', {
        machineId: input.machineId,
        machineName: input.machineName,
        agentLabel: input.agentLabel,
        agentType: input.agentType,
      }, sourceIp);
      log.info(`New binding created: ${input.agentLabel} on ${input.machineName}`);
    }

    this.save();
    this.emit('binding-changed', binding);
    return { token, binding };
  }

  // ─── Token validation ─────────────────────────────

  /** Validate a binding token. Returns the binding if valid, null otherwise. Updates lastUsedAt. */
  validateToken(token: string): AgentBinding | null {
    this.ensureLoaded();
    if (!token.startsWith(TOKEN_PREFIX)) return null;

    const candidateHash = hashToken(token);
    const tokenPrefix = token.substring(0, 16);

    // Find binding by prefix first (fast), then verify full hash
    const binding = this.bindings.find(b =>
      b.tokenPrefix === tokenPrefix && timingSafeCompare(b.tokenHash, candidateHash),
    );

    if (!binding) return null;
    if (binding.state !== 'paired') return null;

    // Update last used
    binding.lastUsedAt = new Date().toISOString();
    this.save();
    return binding;
  }

  // ─── Binding management ───────────────────────────

  /** List all bindings (excludes removed ones, which are only in events). */
  listBindings(): BindingSummary[] {
    this.ensureLoaded();
    return this.bindings.map(b => ({
      id: b.id,
      machineId: b.machineId,
      machineName: b.machineName,
      agentLabel: b.agentLabel,
      agentType: b.agentType,
      bindingKind: b.bindingKind,
      transportModes: b.transportModes,
      state: b.state,
      createdAt: b.createdAt,
      lastUsedAt: b.lastUsedAt,
      pausedAt: b.pausedAt,
      revokedAt: b.revokedAt,
      tokenPrefix: b.tokenPrefix,
    }));
  }

  /** Get a single binding by ID. */
  getBinding(id: string): BindingSummary | null {
    this.ensureLoaded();
    const b = this.bindings.find(b => b.id === id);
    if (!b) return null;
    return {
      id: b.id,
      machineId: b.machineId,
      machineName: b.machineName,
      agentLabel: b.agentLabel,
      agentType: b.agentType,
      bindingKind: b.bindingKind,
      transportModes: b.transportModes,
      state: b.state,
      createdAt: b.createdAt,
      lastUsedAt: b.lastUsedAt,
      pausedAt: b.pausedAt,
      revokedAt: b.revokedAt,
      tokenPrefix: b.tokenPrefix,
    };
  }

  /** Pause a binding — temporarily disables auth without deleting. */
  pauseBinding(id: string): AgentBinding | null {
    this.ensureLoaded();
    const binding = this.bindings.find(b => b.id === id);
    if (!binding || binding.state !== 'paired') return null;

    binding.state = 'paused';
    binding.pausedAt = new Date().toISOString();
    this.addEvent(id, 'paused');
    this.save();
    this.emit('binding-changed', binding);
    log.info(`Binding paused: ${binding.agentLabel}`);
    return binding;
  }

  /** Resume a paused binding. */
  resumeBinding(id: string): AgentBinding | null {
    this.ensureLoaded();
    const binding = this.bindings.find(b => b.id === id);
    if (!binding || binding.state !== 'paused') return null;

    binding.state = 'paired';
    binding.pausedAt = null;
    this.addEvent(id, 'resumed');
    this.save();
    this.emit('binding-changed', binding);
    log.info(`Binding resumed: ${binding.agentLabel}`);
    return binding;
  }

  /** Revoke a binding — invalidates credential permanently. Must re-pair to connect again. */
  revokeBinding(id: string): AgentBinding | null {
    this.ensureLoaded();
    const binding = this.bindings.find(b => b.id === id);
    if (!binding || binding.state === 'revoked') return null;

    binding.state = 'revoked';
    binding.revokedAt = new Date().toISOString();
    this.addEvent(id, 'revoked');
    this.save();
    this.emit('binding-changed', binding);
    log.info(`Binding revoked: ${binding.agentLabel}`);
    return binding;
  }

  /** Remove a binding from active list. Audit events are preserved. */
  removeBinding(id: string): boolean {
    this.ensureLoaded();
    const index = this.bindings.findIndex(b => b.id === id);
    if (index < 0) return false;

    const binding = this.bindings[index];
    this.addEvent(id, 'removed', {
      agentLabel: binding.agentLabel,
      machineName: binding.machineName,
    });
    this.bindings.splice(index, 1);
    this.save();
    this.emit('binding-removed', { id, agentLabel: binding.agentLabel });
    log.info(`Binding removed: ${binding.agentLabel}`);
    return true;
  }

  /** Validate a token and return the binding info (for /pairing/whoami). */
  whoami(token: string): BindingSummary | null {
    const binding = this.validateToken(token);
    if (!binding) return null;
    return this.getBinding(binding.id);
  }

  /** Get binding events for a specific binding. */
  getBindingEvents(bindingId: string): BindingEvent[] {
    this.ensureLoaded();
    return this.events.filter(e => e.bindingId === bindingId);
  }

  /** Destroy / cleanup */
  destroy(): void {
    this.setupCodes.clear();
    this.removeAllListeners();
  }
}
