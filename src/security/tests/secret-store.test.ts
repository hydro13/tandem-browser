import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SecretStore, type SafeStorageProvider } from '../secret-store';

function createTempRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'tandem-secret-store-'));
}

function createSafeStorageMock(encryptionAvailable = true): SafeStorageProvider {
  return {
    isEncryptionAvailable: vi.fn(() => encryptionAvailable),
    encryptString: vi.fn((plainText: string) => Buffer.from(`encrypted:${plainText}`, 'utf-8')),
    decryptString: vi.fn((encrypted: Buffer) => {
      const value = encrypted.toString('utf-8');
      if (!value.startsWith('encrypted:')) {
        throw new Error('Invalid ciphertext');
      }
      return value.slice('encrypted:'.length);
    }),
  };
}

describe('SecretStore', () => {
  const tempRoots: string[] = [];

  afterEach(() => {
    for (const root of tempRoots.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('stores and reads encrypted records through Electron safeStorage', () => {
    const rootDir = createTempRoot();
    tempRoots.push(rootDir);
    const safeStorage = createSafeStorageMock(true);
    const store = new SecretStore({ rootDir, safeStorage });

    const result = store.set('oauth-refresh', 'refresh-token');
    const recordText = fs.readFileSync(result.path, 'utf-8');
    const record = JSON.parse(recordText) as { encoding: string; ciphertext?: string; plaintext?: string };

    expect(result.encoding).toBe('safe-storage');
    expect(record.encoding).toBe('safe-storage');
    expect(record.ciphertext).toBe(Buffer.from('encrypted:refresh-token').toString('base64'));
    expect(record.plaintext).toBeUndefined();
    expect(store.get('oauth-refresh')).toBe('refresh-token');
    expect(safeStorage.decryptString).toHaveBeenCalledOnce();
  });

  it('writes a plaintext fallback record when safeStorage is unavailable during init', () => {
    const rootDir = createTempRoot();
    tempRoots.push(rootDir);
    const safeStorage = createSafeStorageMock(false);
    const store = new SecretStore({ rootDir, safeStorage });

    const result = store.set('early-init-secret', 'bootstrap-secret');
    const record = JSON.parse(fs.readFileSync(result.path, 'utf-8')) as {
      encoding: string;
      plaintext?: string;
      fallbackReason?: string;
    };

    expect(result.encoding).toBe('plaintext-fallback-on-init');
    expect(record.encoding).toBe('plaintext-fallback-on-init');
    expect(record.plaintext).toBe('bootstrap-secret');
    expect(record.fallbackReason).toContain('safeStorage encryption was unavailable');
    expect(store.get('early-init-secret')).toBe('bootstrap-secret');
    expect(safeStorage.encryptString).not.toHaveBeenCalled();
  });

  it('deletes records by key', () => {
    const rootDir = createTempRoot();
    tempRoots.push(rootDir);
    const store = new SecretStore({ rootDir, safeStorage: createSafeStorageMock(true) });

    const result = store.set('to-delete', 'secret');
    expect(fs.existsSync(result.path)).toBe(true);

    store.delete('to-delete');
    expect(fs.existsSync(result.path)).toBe(false);
    expect(store.get('to-delete')).toBeNull();
  });

  it('re-encrypts a plaintext fallback record on get() once encryption is available', () => {
    const rootDir = createTempRoot();
    tempRoots.push(rootDir);

    const earlyStore = new SecretStore({ rootDir, safeStorage: createSafeStorageMock(false) });
    const result = earlyStore.set('early-secret', 'bootstrap-value');
    expect(result.encoding).toBe('plaintext-fallback-on-init');

    // Later in the session safeStorage works again.
    const lateStore = new SecretStore({ rootDir, safeStorage: createSafeStorageMock(true) });
    expect(lateStore.get('early-secret')).toBe('bootstrap-value');

    const upgraded = JSON.parse(fs.readFileSync(result.path, 'utf-8')) as {
      encoding: string;
      plaintext?: string;
      ciphertext?: string;
    };
    expect(upgraded.encoding).toBe('safe-storage');
    expect(upgraded.plaintext).toBeUndefined();
    expect(upgraded.ciphertext).toBe(Buffer.from('encrypted:bootstrap-value').toString('base64'));
    expect(lateStore.get('early-secret')).toBe('bootstrap-value');
  });

  it('upgradePlaintextRecords() sweeps all plaintext fallback records', () => {
    const rootDir = createTempRoot();
    tempRoots.push(rootDir);

    const earlyStore = new SecretStore({ rootDir, safeStorage: createSafeStorageMock(false) });
    earlyStore.set('secret-a', 'value-a');
    earlyStore.set('secret-b', 'value-b');

    const lateStore = new SecretStore({ rootDir, safeStorage: createSafeStorageMock(true) });
    lateStore.set('secret-c', 'value-c'); // already encrypted — must be skipped

    const upgraded = lateStore.upgradePlaintextRecords();
    expect(upgraded.sort()).toEqual(['secret-a', 'secret-b']);

    for (const key of ['secret-a', 'secret-b', 'secret-c']) {
      const record = JSON.parse(
        fs.readFileSync(lateStore.getRecordPath(key), 'utf-8')
      ) as { encoding: string };
      expect(record.encoding).toBe('safe-storage');
    }
    expect(lateStore.get('secret-a')).toBe('value-a');
    expect(lateStore.get('secret-b')).toBe('value-b');
  });

  it('upgradePlaintextRecords() is a safe no-op while encryption stays unavailable', () => {
    const rootDir = createTempRoot();
    tempRoots.push(rootDir);

    const store = new SecretStore({ rootDir, safeStorage: createSafeStorageMock(false) });
    const result = store.set('still-early', 'value');

    expect(store.upgradePlaintextRecords()).toEqual([]);
    const record = JSON.parse(fs.readFileSync(result.path, 'utf-8')) as { encoding: string };
    expect(record.encoding).toBe('plaintext-fallback-on-init');
    expect(store.get('still-early')).toBe('value');
  });

  it('rejects unsafe key names', () => {
    const rootDir = createTempRoot();
    tempRoots.push(rootDir);
    const store = new SecretStore({ rootDir, safeStorage: createSafeStorageMock(true) });

    expect(() => store.set('../escape', 'secret')).toThrow('Invalid secret key name');
    expect(() => store.get('nested/path')).toThrow('Invalid secret key name');
  });
});
