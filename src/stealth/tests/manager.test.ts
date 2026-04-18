import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';

beforeAll(() => {
  // Electron-only: provide a deterministic Chromium version for tests.
  if (!process.versions.chrome) {
    Object.defineProperty(process.versions, 'chrome', {
      value: '132.0.6834.160',
      configurable: true,
    });
  }
});

vi.mock('fs', async () => {
  const actual = await vi.importActual('fs') as Record<string, unknown>;
  return {
    ...actual,
    default: {
      ...actual,
      existsSync: vi.fn(),
      mkdirSync: vi.fn(),
      writeFileSync: vi.fn(),
      readFileSync: vi.fn(),
      chmodSync: vi.fn(),
    },
    existsSync: vi.fn(),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
    readFileSync: vi.fn(),
    chmodSync: vi.fn(),
  };
});

vi.mock('../../utils/paths', () => ({
  tandemDir: vi.fn(() => '/tmp/tandem-test'),
}));

vi.mock('../../utils/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

import fs from 'fs';
import { StealthManager, deriveStealthSeed, loadOrCreateInstallSecret } from '../manager';

function makeMockSession() {
  return {
    getUserAgent: () => 'Electron/40',
    setUserAgent: vi.fn(),
  } as unknown as Electron.Session;
}

describe('deriveStealthSeed()', () => {
  it('is deterministic for the same inputs', () => {
    const a = deriveStealthSeed('install-secret-abc', 'persist:tandem');
    const b = deriveStealthSeed('install-secret-abc', 'persist:tandem');
    expect(a).toBe(b);
  });

  it('differs when installSecret differs (even with same partition)', () => {
    const a = deriveStealthSeed('install-a', 'persist:tandem');
    const b = deriveStealthSeed('install-b', 'persist:tandem');
    expect(a).not.toBe(b);
  });

  it('differs when partition differs (within same install)', () => {
    const a = deriveStealthSeed('install-a', 'persist:tandem');
    const b = deriveStealthSeed('install-a', 'persist:workspace-1');
    expect(a).not.toBe(b);
  });

  it('produces a 64-char hex string (sha256)', () => {
    const seed = deriveStealthSeed('install-a', 'persist:tandem');
    expect(seed).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('loadOrCreateInstallSecret()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('chmods existing config.json to 0o600 when writing a new secret into it (handles loose existing mode)', () => {
    // Pre-existing config with loose permissions and no secret yet
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({ formEncryptionKey: 'something' })
    );

    loadOrCreateInstallSecret();

    const chmodCall = vi.mocked(fs.chmodSync).mock.calls.find(
      (c) => String(c[0]).endsWith('/config.json')
    );
    expect(chmodCall).toBeDefined();
    expect(chmodCall![1]).toBe(0o600);
  });

  it('generates a new secret and writes config.json with mode 0o600 when config missing', () => {
    vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
      const s = String(p);
      if (s.endsWith('/config.json')) return false;
      return true; // dir exists
    });

    const secret = loadOrCreateInstallSecret();

    expect(secret).toMatch(/^[0-9a-f]{64}$/);

    const configWrite = vi.mocked(fs.writeFileSync).mock.calls.find(
      (c) => String(c[0]).endsWith('/config.json')
    );
    expect(configWrite).toBeDefined();
    expect(configWrite![2]).toMatchObject({ mode: 0o600 });

    const written = JSON.parse(String(configWrite![1]));
    expect(written.stealthInstallSecret).toBe(secret);
  });

  it('loads existing secret from config.json without rewriting', () => {
    const existing = 'f'.repeat(64);
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({ stealthInstallSecret: existing })
    );

    const secret = loadOrCreateInstallSecret();

    expect(secret).toBe(existing);
    expect(fs.writeFileSync).not.toHaveBeenCalled();
  });

  it('chmods existing config.json to 0o600 on load (migrates pre-fix installs with loose mode)', () => {
    const existing = 'e'.repeat(64);
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({ stealthInstallSecret: existing })
    );

    loadOrCreateInstallSecret();

    const chmodCall = vi.mocked(fs.chmodSync).mock.calls.find(
      (c) => String(c[0]).endsWith('/config.json')
    );
    expect(chmodCall).toBeDefined();
    expect(chmodCall![1]).toBe(0o600);
  });

  it('preserves other config fields when adding a new secret', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({ formEncryptionKey: 'preexisting' })
    );

    loadOrCreateInstallSecret();

    const configWrite = vi.mocked(fs.writeFileSync).mock.calls.find(
      (c) => String(c[0]).endsWith('/config.json')
    );
    expect(configWrite).toBeDefined();
    const written = JSON.parse(String(configWrite![1]));
    expect(written.formEncryptionKey).toBe('preexisting');
    expect(written.stealthInstallSecret).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('StealthManager — per-install seed', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('produces the same seed across instances when install secret persists', () => {
    const existing = 'a'.repeat(64);
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({ stealthInstallSecret: existing })
    );

    const m1 = new StealthManager(makeMockSession(), 'persist:tandem');
    const m2 = new StealthManager(makeMockSession(), 'persist:tandem');

    expect(m1.getPartitionSeed()).toBe(m2.getPartitionSeed());
  });

  it('produces a different seed when the install secret differs (simulates a different install)', () => {
    // First install: no secret on disk → generates one
    vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
      return !String(p).endsWith('/config.json');
    });
    const m1 = new StealthManager(makeMockSession(), 'persist:tandem');
    const seed1 = m1.getPartitionSeed();

    // Reset mocks — simulate a second, separate install with a different secret
    vi.clearAllMocks();
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({ stealthInstallSecret: 'b'.repeat(64) })
    );
    const m2 = new StealthManager(makeMockSession(), 'persist:tandem');
    const seed2 = m2.getPartitionSeed();

    expect(seed1).not.toBe(seed2);
  });

  it('varies seed by partition within the same install', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({ stealthInstallSecret: 'c'.repeat(64) })
    );

    const m1 = new StealthManager(makeMockSession(), 'persist:tandem');
    const m2 = new StealthManager(makeMockSession(), 'persist:workspace-a');

    expect(m1.getPartitionSeed()).not.toBe(m2.getPartitionSeed());
  });
});

describe('getStealthScript() — timing protection', () => {
  it('rounds performance.now to 100μs (Firefox parity)', () => {
    const script = StealthManager.getStealthScript('seed');
    expect(script).toContain('performance.now = function');
    expect(script).toContain('Math.round(origPerfNow() * 10) / 10');
  });

  it('does NOT patch Date.now — real Chrome returns the same ms for back-to-back calls', () => {
    // Regression guard: an earlier version added +/-1ms noise to every
    // Date.now call. That made Tandem trivially distinguishable from real
    // Chrome (two back-to-back calls in real Chrome always return the same
    // value; jittered calls almost never do). Keep this test red if anyone
    // re-introduces the jitter without updating the comment / test.
    const script = StealthManager.getStealthScript('seed');
    expect(script).not.toMatch(/Date\.now\s*=\s*function/);
    expect(script).not.toMatch(/origDateNow/);
  });
});
