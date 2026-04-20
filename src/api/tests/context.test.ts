import { describe, it, expect } from 'vitest';
import type { Request } from 'express';
import { agentIdFromRequest } from '../context';

function mkReq(authHeader?: string): Request {
  return { headers: authHeader === undefined ? {} : { authorization: authHeader } } as unknown as Request;
}

describe('agentIdFromRequest', () => {
  it('returns "shell" when no Authorization header is set', () => {
    expect(agentIdFromRequest(mkReq())).toBe('shell');
  });

  it('returns "shell" for empty or whitespace header', () => {
    expect(agentIdFromRequest(mkReq(''))).toBe('shell');
    expect(agentIdFromRequest(mkReq('   '))).toBe('shell');
  });

  it('returns "shell" for headers that do not start with Bearer', () => {
    expect(agentIdFromRequest(mkReq('Basic xxx'))).toBe('shell');
    expect(agentIdFromRequest(mkReq('Token abc'))).toBe('shell');
  });

  it('returns "shell" when Bearer is not followed by a whitespace separator', () => {
    // "Bearerxyz" — missing space
    expect(agentIdFromRequest(mkReq('Bearerxyz'))).toBe('shell');
  });

  it('returns "shell" for truncated headers', () => {
    expect(agentIdFromRequest(mkReq('Bear'))).toBe('shell');
    expect(agentIdFromRequest(mkReq('Bearer'))).toBe('shell');
    expect(agentIdFromRequest(mkReq('Bearer '))).toBe('shell'); // no token
  });

  it('returns "local" for a plain local api-token', () => {
    expect(agentIdFromRequest(mkReq('Bearer abc123'))).toBe('local');
    expect(agentIdFromRequest(mkReq('bearer abc123'))).toBe('local'); // case-insensitive
    expect(agentIdFromRequest(mkReq('BEARER abc123'))).toBe('local');
  });

  it('returns a deterministic per-agent id for binding tokens', () => {
    // tdm_ast_ prefix + 8-char suffix → "agent:<8char>"
    expect(agentIdFromRequest(mkReq('Bearer tdm_ast_abc12345xyz'))).toBe('agent:abc12345');
    expect(agentIdFromRequest(mkReq('Bearer tdm_ast_ABCDEFGHIJKLMN'))).toBe('agent:ABCDEFGH');
  });

  it('distinct binding tokens map to distinct agent ids', () => {
    const a = agentIdFromRequest(mkReq('Bearer tdm_ast_aaaaaaaaXXX'));
    const b = agentIdFromRequest(mkReq('Bearer tdm_ast_bbbbbbbbYYY'));
    expect(a).toBe('agent:aaaaaaaa');
    expect(b).toBe('agent:bbbbbbbb');
    expect(a).not.toBe(b);
  });

  it('rejects absurdly long headers (ReDoS sanity)', () => {
    // Even if the regex approach were still used, this is a linear
    // implementation now. Verify it does not hang on pathological input.
    const pathological = 'Bearer' + '\t'.repeat(50_000) + 'tail';
    const start = Date.now();
    const result = agentIdFromRequest(mkReq(pathological));
    const elapsed = Date.now() - start;
    // Size-guarded: header > 8192 chars → 'shell'. Either way, fast.
    expect(result).toBe('shell');
    expect(elapsed).toBeLessThan(100); // generous upper bound
  });

  it('accepts tab character as separator (RFC 7235)', () => {
    // Our linear parser honours space or tab as the single separator
    // after "Bearer", matching the HTTP Authorization spec.
    expect(agentIdFromRequest(mkReq('Bearer\tabc123'))).toBe('local');
  });
});
