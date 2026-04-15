import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { PairingManager } from '../manager';
import type { ExchangeInput } from '../manager';

// Mock fs and paths so we don't touch real disk
vi.mock('fs');
vi.mock('../../utils/paths', () => ({
  tandemDir: (...subpath: string[]) => path.join('/tmp/tandem-test', ...subpath),
  ensureDir: (dir: string) => dir,
}));
vi.mock('../../utils/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

function makeExchangeInput(overrides: Partial<ExchangeInput> = {}): ExchangeInput {
  return {
    code: 'TDM-AAAA-BBBB', // will be overridden by actual generated code
    machineId: 'machine-123',
    machineName: 'TestMachine',
    agentLabel: 'Claude Code on TestMachine',
    agentType: 'claude-code',
    bindingKind: 'local',
    transport: ['http'],
    ...overrides,
  };
}

describe('PairingManager', () => {
  let manager: PairingManager;

  beforeEach(() => {
    vi.clearAllMocks();
    // fs.existsSync returns false by default (no persisted data)
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(fs.writeFileSync).mockReturnValue(undefined);
    manager = new PairingManager();
  });

  afterEach(() => {
    manager.destroy();
  });

  // ─── Setup code generation ────────────────────

  describe('generateSetupCode', () => {
    it('generates a code with TDM prefix', () => {
      const result = manager.generateSetupCode();
      expect(result.code).toMatch(/^TDM-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    });

    it('sets expiry ~5 minutes from now', () => {
      const before = Date.now();
      const result = manager.generateSetupCode();
      const after = Date.now();

      const expectedMin = before + 5 * 60 * 1000;
      const expectedMax = after + 5 * 60 * 1000;
      expect(result.expiresAt).toBeGreaterThanOrEqual(expectedMin);
      expect(result.expiresAt).toBeLessThanOrEqual(expectedMax);
    });

    it('marks code as unconsumed', () => {
      const result = manager.generateSetupCode();
      expect(result.consumed).toBe(false);
    });

    it('cancels previous unused code when generating new one', () => {
      const first = manager.generateSetupCode();
      const second = manager.generateSetupCode();
      expect(first.code).not.toBe(second.code);

      // First code should no longer be active
      const active = manager.getActiveSetupCode();
      expect(active?.code).toBe(second.code);
    });

    it('rate limits at 10 codes per hour', () => {
      for (let i = 0; i < 10; i++) {
        manager.generateSetupCode();
      }
      expect(() => manager.generateSetupCode()).toThrow(/Too many/);
    });
  });

  // ─── getActiveSetupCode ───────────────────────

  describe('getActiveSetupCode', () => {
    it('returns null when no code generated', () => {
      expect(manager.getActiveSetupCode()).toBeNull();
    });

    it('returns the active code', () => {
      const code = manager.generateSetupCode();
      const active = manager.getActiveSetupCode();
      expect(active?.code).toBe(code.code);
    });
  });

  // ─── Token exchange ───────────────────────────

  describe('exchangeSetupCode', () => {
    it('exchanges valid code for token and binding', () => {
      const setupCode = manager.generateSetupCode();
      const input = makeExchangeInput({ code: setupCode.code });
      const result = manager.exchangeSetupCode(input);

      expect(result.token).toMatch(/^tdm_ast_/);
      expect(result.binding.state).toBe('paired');
      expect(result.binding.machineId).toBe('machine-123');
      expect(result.binding.agentLabel).toBe('Claude Code on TestMachine');
      expect(result.binding.agentType).toBe('claude-code');
    });

    it('rejects invalid code', () => {
      expect(() => manager.exchangeSetupCode(makeExchangeInput({ code: 'TDM-XXXX-YYYY' })))
        .toThrow('Invalid setup code');
    });

    it('rejects already consumed code', () => {
      const setupCode = manager.generateSetupCode();
      const input = makeExchangeInput({ code: setupCode.code });
      manager.exchangeSetupCode(input);

      expect(() => manager.exchangeSetupCode(makeExchangeInput({ code: setupCode.code })))
        .toThrow('already been used');
    });

    it('rejects expired code', () => {
      const setupCode = manager.generateSetupCode();
      // Manually expire it
      setupCode.expiresAt = Date.now() - 1000;

      expect(() => manager.exchangeSetupCode(makeExchangeInput({ code: setupCode.code })))
        .toThrow('expired');
    });

    it('re-pairs existing binding with same identity', () => {
      const code1 = manager.generateSetupCode();
      const result1 = manager.exchangeSetupCode(makeExchangeInput({ code: code1.code }));

      const code2 = manager.generateSetupCode();
      const result2 = manager.exchangeSetupCode(makeExchangeInput({ code: code2.code }));

      // Same binding ID, new token
      expect(result2.binding.id).toBe(result1.binding.id);
      expect(result2.token).not.toBe(result1.token);
      expect(result2.binding.state).toBe('paired');
    });

    it('creates separate binding for different agent identity', () => {
      const code1 = manager.generateSetupCode();
      const result1 = manager.exchangeSetupCode(makeExchangeInput({ code: code1.code }));

      const code2 = manager.generateSetupCode();
      const result2 = manager.exchangeSetupCode(makeExchangeInput({
        code: code2.code,
        agentLabel: 'OpenClaw on TestMachine',
        agentType: 'openclaw',
      }));

      expect(result2.binding.id).not.toBe(result1.binding.id);
    });

    it('normalizes code to uppercase', () => {
      const setupCode = manager.generateSetupCode();
      const lowerCode = setupCode.code.toLowerCase();
      const result = manager.exchangeSetupCode(makeExchangeInput({ code: lowerCode }));
      expect(result.token).toMatch(/^tdm_ast_/);
    });
  });

  // ─── Token validation ─────────────────────────

  describe('validateToken', () => {
    it('validates a correct token', () => {
      const setupCode = manager.generateSetupCode();
      const { token } = manager.exchangeSetupCode(makeExchangeInput({ code: setupCode.code }));

      const binding = manager.validateToken(token);
      expect(binding).not.toBeNull();
      expect(binding?.state).toBe('paired');
    });

    it('rejects invalid token', () => {
      expect(manager.validateToken('tdm_ast_invalid')).toBeNull();
    });

    it('rejects non-prefixed token', () => {
      expect(manager.validateToken('some_random_token')).toBeNull();
    });

    it('rejects token for paused binding', () => {
      const setupCode = manager.generateSetupCode();
      const { token, binding } = manager.exchangeSetupCode(makeExchangeInput({ code: setupCode.code }));

      manager.pauseBinding(binding.id);
      expect(manager.validateToken(token)).toBeNull();
    });

    it('rejects token for revoked binding', () => {
      const setupCode = manager.generateSetupCode();
      const { token, binding } = manager.exchangeSetupCode(makeExchangeInput({ code: setupCode.code }));

      manager.revokeBinding(binding.id);
      expect(manager.validateToken(token)).toBeNull();
    });

    it('updates lastUsedAt on validation', () => {
      const setupCode = manager.generateSetupCode();
      const { token, binding } = manager.exchangeSetupCode(makeExchangeInput({ code: setupCode.code }));

      // Validate updates lastUsedAt
      const result = manager.validateToken(token);
      expect(result?.lastUsedAt).toBeDefined();
      expect(new Date(result!.lastUsedAt!).getTime()).toBeGreaterThanOrEqual(
        new Date(binding.lastUsedAt!).getTime()
      );
    });
  });

  // ─── Binding management ───────────────────────

  describe('listBindings', () => {
    it('returns empty array when no bindings', () => {
      expect(manager.listBindings()).toEqual([]);
    });

    it('returns all bindings', () => {
      const code = manager.generateSetupCode();
      manager.exchangeSetupCode(makeExchangeInput({ code: code.code }));
      const bindings = manager.listBindings();
      expect(bindings).toHaveLength(1);
      expect(bindings[0].agentLabel).toBe('Claude Code on TestMachine');
    });

    it('does not include tokenHash in summary', () => {
      const code = manager.generateSetupCode();
      manager.exchangeSetupCode(makeExchangeInput({ code: code.code }));
      const bindings = manager.listBindings();
      expect((bindings[0] as any).tokenHash).toBeUndefined();
    });
  });

  describe('pauseBinding', () => {
    it('pauses a paired binding', () => {
      const code = manager.generateSetupCode();
      const { binding } = manager.exchangeSetupCode(makeExchangeInput({ code: code.code }));

      const result = manager.pauseBinding(binding.id);
      expect(result?.state).toBe('paused');
      expect(result?.pausedAt).toBeDefined();
    });

    it('returns null for non-paired binding', () => {
      const code = manager.generateSetupCode();
      const { binding } = manager.exchangeSetupCode(makeExchangeInput({ code: code.code }));

      manager.pauseBinding(binding.id);
      // Can't pause an already paused binding
      expect(manager.pauseBinding(binding.id)).toBeNull();
    });

    it('returns null for non-existent binding', () => {
      expect(manager.pauseBinding('non-existent')).toBeNull();
    });
  });

  describe('resumeBinding', () => {
    it('resumes a paused binding', () => {
      const code = manager.generateSetupCode();
      const { binding } = manager.exchangeSetupCode(makeExchangeInput({ code: code.code }));

      manager.pauseBinding(binding.id);
      const result = manager.resumeBinding(binding.id);
      expect(result?.state).toBe('paired');
      expect(result?.pausedAt).toBeNull();
    });

    it('returns null for non-paused binding', () => {
      const code = manager.generateSetupCode();
      const { binding } = manager.exchangeSetupCode(makeExchangeInput({ code: code.code }));

      expect(manager.resumeBinding(binding.id)).toBeNull();
    });
  });

  describe('revokeBinding', () => {
    it('revokes a binding', () => {
      const code = manager.generateSetupCode();
      const { binding } = manager.exchangeSetupCode(makeExchangeInput({ code: code.code }));

      const result = manager.revokeBinding(binding.id);
      expect(result?.state).toBe('revoked');
      expect(result?.revokedAt).toBeDefined();
    });

    it('returns null for already revoked binding', () => {
      const code = manager.generateSetupCode();
      const { binding } = manager.exchangeSetupCode(makeExchangeInput({ code: code.code }));

      manager.revokeBinding(binding.id);
      expect(manager.revokeBinding(binding.id)).toBeNull();
    });

    it('can revoke a paused binding', () => {
      const code = manager.generateSetupCode();
      const { binding } = manager.exchangeSetupCode(makeExchangeInput({ code: code.code }));

      manager.pauseBinding(binding.id);
      const result = manager.revokeBinding(binding.id);
      expect(result?.state).toBe('revoked');
    });
  });

  describe('removeBinding', () => {
    it('removes a binding from active list', () => {
      const code = manager.generateSetupCode();
      const { binding } = manager.exchangeSetupCode(makeExchangeInput({ code: code.code }));

      expect(manager.removeBinding(binding.id)).toBe(true);
      expect(manager.listBindings()).toHaveLength(0);
    });

    it('returns false for non-existent binding', () => {
      expect(manager.removeBinding('non-existent')).toBe(false);
    });

    it('preserves audit events after removal', () => {
      const code = manager.generateSetupCode();
      const { binding } = manager.exchangeSetupCode(makeExchangeInput({ code: code.code }));

      manager.removeBinding(binding.id);
      const events = manager.getBindingEvents(binding.id);
      expect(events.length).toBeGreaterThan(0);
      expect(events.some(e => e.eventType === 'removed')).toBe(true);
    });
  });

  describe('whoami', () => {
    it('returns binding summary for valid token', () => {
      const code = manager.generateSetupCode();
      const { token } = manager.exchangeSetupCode(makeExchangeInput({ code: code.code }));

      const result = manager.whoami(token);
      expect(result).not.toBeNull();
      expect(result?.agentLabel).toBe('Claude Code on TestMachine');
      expect((result as any).tokenHash).toBeUndefined();
    });

    it('returns null for invalid token', () => {
      expect(manager.whoami('tdm_ast_invalid')).toBeNull();
    });
  });

  // ─── Event emission ───────────────────────────

  describe('events', () => {
    it('emits setup-code-generated', () => {
      const handler = vi.fn();
      manager.on('setup-code-generated', handler);
      manager.generateSetupCode();
      expect(handler).toHaveBeenCalledOnce();
    });

    it('emits binding-changed on exchange', () => {
      const handler = vi.fn();
      manager.on('binding-changed', handler);
      const code = manager.generateSetupCode();
      manager.exchangeSetupCode(makeExchangeInput({ code: code.code }));
      expect(handler).toHaveBeenCalledOnce();
    });

    it('emits binding-changed on pause', () => {
      const handler = vi.fn();
      const code = manager.generateSetupCode();
      const { binding } = manager.exchangeSetupCode(makeExchangeInput({ code: code.code }));
      manager.on('binding-changed', handler);
      manager.pauseBinding(binding.id);
      expect(handler).toHaveBeenCalledOnce();
    });

    it('emits binding-removed on remove', () => {
      const handler = vi.fn();
      const code = manager.generateSetupCode();
      const { binding } = manager.exchangeSetupCode(makeExchangeInput({ code: code.code }));
      manager.on('binding-removed', handler);
      manager.removeBinding(binding.id);
      expect(handler).toHaveBeenCalledOnce();
    });
  });

  // ─── Persistence ──────────────────────────────

  describe('persistence', () => {
    it('saves bindings to disk after exchange', () => {
      const code = manager.generateSetupCode();
      manager.exchangeSetupCode(makeExchangeInput({ code: code.code }));

      expect(fs.writeFileSync).toHaveBeenCalled();
      const callArgs = vi.mocked(fs.writeFileSync).mock.calls;
      const lastCall = callArgs[callArgs.length - 1];
      expect(String(lastCall[0])).toContain('bindings.json');

      const data = JSON.parse(String(lastCall[1]));
      expect(data.bindings).toHaveLength(1);
      expect(data.events).toHaveLength(1);
    });

    it('loads existing bindings from disk', () => {
      const existingData = {
        bindings: [{
          id: 'existing-id',
          machineId: 'machine-1',
          machineName: 'OldMachine',
          agentLabel: 'Old Agent',
          agentType: 'openclaw',
          bindingKind: 'remote',
          transportModes: ['http'],
          tokenHash: 'abc123',
          tokenPrefix: 'tdm_ast_12345678',
          state: 'paired',
          createdAt: '2026-01-01T00:00:00Z',
          lastUsedAt: null,
          pausedAt: null,
          revokedAt: null,
        }],
        events: [],
      };

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(existingData));

      const freshManager = new PairingManager();
      const bindings = freshManager.listBindings();
      expect(bindings).toHaveLength(1);
      expect(bindings[0].agentLabel).toBe('Old Agent');
      freshManager.destroy();
    });
  });
});
