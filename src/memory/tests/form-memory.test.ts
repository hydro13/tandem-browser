import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('fs', async () => {
  const actual = await vi.importActual('fs') as Record<string, unknown>;
  const mocked = {
    existsSync: vi.fn(),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
    readFileSync: vi.fn(),
    chmodSync: vi.fn(),
  };
  return {
    ...actual,
    default: { ...actual, ...mocked },
    ...mocked,
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
import type { SecretStore } from '../../security/secret-store';
import { FormMemoryManager } from '../form-memory';

const normalizePath = (value: unknown) => String(value).replace(/\\/g, '/');
const LEGACY_KEY = 'a'.repeat(64);

interface MemorySecretStore {
  store: SecretStore;
  values: Map<string, string>;
  set: ReturnType<typeof vi.fn>;
  get: ReturnType<typeof vi.fn>;
}

function createMemorySecretStore(initial: Record<string, string> = {}): MemorySecretStore {
  const values = new Map(Object.entries(initial));
  const get = vi.fn((key: string) => values.get(key) ?? null);
  const set = vi.fn((key: string, value: string) => {
    values.set(key, value);
    return { encoding: 'safe-storage', path: `/tmp/secret-store/${key}.json` };
  });
  const store = { get, set, delete: vi.fn() } as unknown as SecretStore;
  return { store, values, set, get };
}

/** Simple in-memory filesystem for the paths form-memory touches. */
function setupVirtualFs(initialFiles: Record<string, string> = {}) {
  const files = new Map(Object.entries(initialFiles).map(([k, v]) => [normalizePath(k), v]));

  vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
    const s = normalizePath(p);
    if (files.has(s)) return true;
    // Directories "exist" when any file lives under them.
    return [...files.keys()].some((file) => file.startsWith(`${s}/`)) || s.endsWith('/forms');
  });
  vi.mocked(fs.readFileSync).mockImplementation((p: fs.PathOrFileDescriptor) => {
    const s = normalizePath(p);
    if (files.has(s)) return files.get(s) as string;
    throw Object.assign(new Error(`ENOENT: ${s}`), { code: 'ENOENT' });
  });
  vi.mocked(fs.writeFileSync).mockImplementation((p: fs.PathOrFileDescriptor, data: unknown) => {
    files.set(normalizePath(p), String(data));
  });

  return files;
}

describe('FormMemoryManager — encryption key management', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('generates a fresh key into the secret store on new installs (nothing in config.json)', () => {
    setupVirtualFs();
    const secrets = createMemorySecretStore();

    new FormMemoryManager(secrets.store);

    expect(secrets.set).toHaveBeenCalledTimes(1);
    const [key, value] = secrets.set.mock.calls[0];
    expect(key).toBe('form-memory-encryption-key');
    expect(value).toMatch(/^[0-9a-f]{64}$/i);

    // The key must never be written to config.json anymore.
    const configWrite = vi.mocked(fs.writeFileSync).mock.calls.find(
      (c) => normalizePath(c[0]).endsWith('/config.json')
    );
    expect(configWrite).toBeUndefined();
  });

  it('migrates a legacy config.json key into the secret store and removes it from config.json', () => {
    const files = setupVirtualFs({
      '/tmp/tandem-test/config.json': JSON.stringify({ formEncryptionKey: LEGACY_KEY, other: 'kept' }),
    });
    const secrets = createMemorySecretStore();

    new FormMemoryManager(secrets.store);

    expect(secrets.set).toHaveBeenCalledWith('form-memory-encryption-key', LEGACY_KEY);

    const rewritten = JSON.parse(files.get('/tmp/tandem-test/config.json')!);
    expect(rewritten.formEncryptionKey).toBeUndefined();
    expect(rewritten.other).toBe('kept');

    const configWrite = vi.mocked(fs.writeFileSync).mock.calls.find(
      (c) => normalizePath(c[0]).endsWith('/config.json')
    );
    expect(configWrite![2]).toMatchObject({ mode: 0o600 });
    const chmodCall = vi.mocked(fs.chmodSync).mock.calls.find(
      (c) => normalizePath(c[0]).endsWith('/config.json')
    );
    expect(chmodCall).toBeDefined();
    expect(chmodCall![1]).toBe(0o600);
  });

  it('keeps legacy-encrypted form data decryptable after the migration', () => {
    // 1) Old install: key in config.json, record a password field.
    const files = setupVirtualFs({
      '/tmp/tandem-test/config.json': JSON.stringify({ formEncryptionKey: LEGACY_KEY }),
    });
    const secretsBefore = createMemorySecretStore();
    const before = new FormMemoryManager(secretsBefore.store);
    before.recordForm('https://login.example/signin', [
      { name: 'user', type: 'text', id: 'u', value: 'alice' },
      { name: 'pass', type: 'password', id: 'p', value: 'hunter2' },
    ]);

    const domainFile = files.get('/tmp/tandem-test/forms/login.example.json');
    expect(domainFile).toBeDefined();
    expect(domainFile).not.toContain('hunter2'); // stored encrypted

    // 2) New session: key now only lives in the secret store.
    const secretsAfter = createMemorySecretStore({ 'form-memory-encryption-key': LEGACY_KEY });
    const after = new FormMemoryManager(secretsAfter.store);

    const data = after.getForDomain('login.example');
    expect(data).not.toBeNull();
    const passField = data!.entries[0].fields.find(f => f.name === 'pass');
    expect(passField?.value).toBe('hunter2');
  });

  it('prefers the secret-store key and leaves a differing config.json key in place', () => {
    const otherKey = 'b'.repeat(64);
    const files = setupVirtualFs({
      '/tmp/tandem-test/config.json': JSON.stringify({ formEncryptionKey: otherKey }),
    });
    const secrets = createMemorySecretStore({ 'form-memory-encryption-key': LEGACY_KEY });

    new FormMemoryManager(secrets.store);

    // No new key written, and the mismatching config key is untouched.
    expect(secrets.set).not.toHaveBeenCalled();
    const config = JSON.parse(files.get('/tmp/tandem-test/config.json')!);
    expect(config.formEncryptionKey).toBe(otherKey);
  });

  it('fails closed when the secret store is unavailable: refuses to persist form data', () => {
    setupVirtualFs();
    const broken = {
      get: vi.fn(() => { throw new Error('safeStorage unavailable'); }),
      set: vi.fn(() => { throw new Error('safeStorage unavailable'); }),
      delete: vi.fn(),
    } as unknown as SecretStore;

    const mgr = new FormMemoryManager(broken);

    expect(() => mgr.recordForm('https://login.example/signin', [
      { name: 'pass', type: 'password', id: 'p', value: 'hunter2' },
    ])).toThrow(/encryption key unavailable/);

    // Nothing may be written to the forms directory.
    const formWrite = vi.mocked(fs.writeFileSync).mock.calls.find(
      (c) => normalizePath(c[0]).includes('/forms/')
    );
    expect(formWrite).toBeUndefined();

    // Read paths must keep working.
    expect(mgr.listAll()).toEqual([]);
  });

  it('writes domain files with mode 0o600', () => {
    setupVirtualFs();
    const secrets = createMemorySecretStore();
    const mgr = new FormMemoryManager(secrets.store);

    mgr.recordForm('https://sentinel-domain-test/login', [
      { name: 'user', type: 'text', id: 'u', value: 'alice' },
    ]);

    const expectedPath = '/tmp/tandem-test/forms/sentinel-domain-test.json';
    const domainWrite = vi.mocked(fs.writeFileSync).mock.calls.find(
      (c) => normalizePath(c[0]) === expectedPath
    );
    expect(domainWrite).toBeDefined();
    expect(domainWrite![2]).toMatchObject({ mode: 0o600 });

    const chmodCall = vi.mocked(fs.chmodSync).mock.calls.find(
      (c) => normalizePath(c[0]) === expectedPath
    );
    expect(chmodCall).toBeDefined();
    expect(chmodCall![1]).toBe(0o600);
  });

  it('chmods existing config.json to 0o600 on load', () => {
    setupVirtualFs({
      '/tmp/tandem-test/config.json': JSON.stringify({}),
    });
    const secrets = createMemorySecretStore({ 'form-memory-encryption-key': LEGACY_KEY });

    new FormMemoryManager(secrets.store);

    const chmodCall = vi.mocked(fs.chmodSync).mock.calls.find(
      (c) => normalizePath(c[0]).endsWith('/config.json')
    );
    expect(chmodCall).toBeDefined();
    expect(chmodCall![1]).toBe(0o600);
  });
});
