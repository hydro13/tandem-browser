import { describe, it, expect, vi, beforeEach } from 'vitest';

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

vi.mock('../../utils/security', () => ({
  resolvePathWithinRoot: (root: string, file: string) => `${root}/${file}`,
  tryParseUrl: (url: string) => { try { return new URL(url); } catch { return null; } },
}));

import fs from 'fs';
import { FormMemoryManager } from '../form-memory';

describe('FormMemoryManager — file permissions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('writes config.json with mode 0o600 when generating a new encryption key', () => {
    // forms dir exists, config.json does NOT exist → triggers key generation + config write
    vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
      const s = String(p);
      if (s.endsWith('/config.json')) return false;
      return true;
    });

    new FormMemoryManager();

    const configWrite = vi.mocked(fs.writeFileSync).mock.calls.find(
      (c) => String(c[0]).endsWith('/config.json')
    );
    expect(configWrite).toBeDefined();
    const options = configWrite![2];
    // Options may be a string encoding or an object — we expect object with mode
    expect(typeof options).toBe('object');
    expect(options).toMatchObject({ mode: 0o600 });
  });

  it('chmods existing config.json to 0o600 after writing (handles pre-existing loose mode)', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    // Config exists WITHOUT the key (pre-fix state: loose 0o644)
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ formEncryptionKey: null }));

    new FormMemoryManager();

    const chmodCall = vi.mocked(fs.chmodSync).mock.calls.find(
      (c) => String(c[0]).endsWith('/config.json')
    );
    expect(chmodCall).toBeDefined();
    expect(chmodCall![1]).toBe(0o600);
  });

  it('chmods existing config.json to 0o600 on load even when no rewrite is needed', () => {
    // Config has a valid encryption key — no write path is hit
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({ formEncryptionKey: 'a'.repeat(64) })
    );

    new FormMemoryManager();

    expect(fs.writeFileSync).not.toHaveBeenCalled();
    const chmodCall = vi.mocked(fs.chmodSync).mock.calls.find(
      (c) => String(c[0]).endsWith('/config.json')
    );
    expect(chmodCall).toBeDefined();
    expect(chmodCall![1]).toBe(0o600);
  });

  it('writes domain files with mode 0o600', () => {
    // config.json already exists (with a key), so init just loads it
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockImplementation((p: fs.PathOrFileDescriptor) => {
      const s = String(p);
      if (s.endsWith('/config.json')) {
        return JSON.stringify({ formEncryptionKey: 'a'.repeat(64) });
      }
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    });

    const mgr = new FormMemoryManager();
    // Use a sentinel domain to produce a deterministic file path —
    // /tmp/tandem-test/forms/sentinel-domain-test.json — that we can match
    // exactly without substring checks (which confuse URL-sanitization linters).
    mgr.recordForm('https://sentinel-domain-test/login', [
      { name: 'user', type: 'text', id: 'u', value: 'alice' },
    ]);

    const expectedPath = '/tmp/tandem-test/forms/sentinel-domain-test.json';

    const domainWrite = vi.mocked(fs.writeFileSync).mock.calls.find(
      (c) => c[0] === expectedPath
    );
    expect(domainWrite).toBeDefined();
    const options = domainWrite![2];
    expect(typeof options).toBe('object');
    expect(options).toMatchObject({ mode: 0o600 });

    const chmodCall = vi.mocked(fs.chmodSync).mock.calls.find(
      (c) => c[0] === expectedPath
    );
    expect(chmodCall).toBeDefined();
    expect(chmodCall![1]).toBe(0o600);
  });
});
