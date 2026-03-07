import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SecurityDB } from '../security-db';

const mockedPaths = vi.hoisted(() => ({ root: '' }));

vi.mock('../../utils/paths', () => ({
  tandemDir: (...segments: string[]) => path.join(mockedPaths.root, ...segments),
}));

import { NetworkShield } from '../network-shield';

function createDbStub() {
  const setBlocklistMeta = vi.fn();
  const db = {
    getBlocklistStats: () => ({ total: 0, bySource: {}, lastUpdate: '' }),
    isDomainBlocked: () => ({ blocked: false }),
    setBlocklistMeta,
  } as unknown as SecurityDB;

  return { db, setBlocklistMeta };
}

async function waitForCondition(condition: () => boolean, timeoutMs = 1_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) {
      throw new Error('Timed out waiting for NetworkShield hydration');
    }
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}

describe('NetworkShield fast-start hydration', () => {
  afterEach(() => {
    if (mockedPaths.root && fs.existsSync(mockedPaths.root)) {
      fs.rmSync(mockedPaths.root, { recursive: true, force: true });
    }
    mockedPaths.root = '';
    vi.clearAllMocks();
  });

  it('loads the startup snapshot immediately and swaps to hydrated cache data later', async () => {
    mockedPaths.root = fs.mkdtempSync(path.join(os.tmpdir(), 'tandem-shield-'));

    const blocklistDir = path.join(mockedPaths.root, 'security', 'blocklists');
    fs.mkdirSync(blocklistDir, { recursive: true });
    fs.writeFileSync(
      path.join(blocklistDir, 'startup-snapshot.json'),
      JSON.stringify({
        version: 1,
        generatedAt: '2026-03-07T00:00:00.000Z',
        sources: ['snapshot'],
        blockedDomains: ['cached.example'],
        blockedIpOrigins: [],
      }),
      'utf-8',
    );
    fs.writeFileSync(path.join(blocklistDir, 'phishing.txt'), 'fresh.example\n', 'utf-8');
    fs.writeFileSync(path.join(blocklistDir, 'urlhaus.txt'), 'http://10.0.0.1/payload\n', 'utf-8');

    const { db, setBlocklistMeta } = createDbStub();
    const shield = new NetworkShield(db);

    expect(shield.checkDomain('cached.example').blocked).toBe(true);
    expect(shield.checkDomain('fresh.example').blocked).toBe(false);
    expect(shield.checkUrl('http://10.0.0.1/payload').blocked).toBe(false);

    shield.startBackgroundHydration();

    // reload() no longer clears the live Set before the replacement state is ready.
    expect(shield.checkDomain('cached.example').blocked).toBe(true);

    await waitForCondition(() => shield.checkDomain('fresh.example').blocked);
    await waitForCondition(() => {
      const persistedSnapshot = JSON.parse(
        fs.readFileSync(path.join(blocklistDir, 'startup-snapshot.json'), 'utf-8'),
      ) as { blockedDomains: string[] };
      return persistedSnapshot.blockedDomains.includes('fresh.example');
    });

    expect(shield.checkDomain('cached.example').blocked).toBe(false);
    expect(shield.checkDomain('fresh.example').blocked).toBe(true);
    expect(shield.checkUrl('http://10.0.0.1/payload')).toEqual({
      blocked: true,
      reason: 'IP origin in blocklist: 10.0.0.1',
      source: 'blocklist_file',
    });

    const persistedSnapshot = JSON.parse(
      fs.readFileSync(path.join(blocklistDir, 'startup-snapshot.json'), 'utf-8'),
    ) as {
      blockedDomains: string[];
      blockedIpOrigins: string[];
    };

    expect(persistedSnapshot.blockedDomains).toContain('fresh.example');
    expect(persistedSnapshot.blockedDomains).not.toContain('cached.example');
    expect(persistedSnapshot.blockedIpOrigins).toContain('10.0.0.1');
    expect(setBlocklistMeta).toHaveBeenCalledWith('snapshotGeneratedAt', expect.any(String));
    expect(setBlocklistMeta).toHaveBeenCalledWith('snapshotDomainCount', '2');
    expect(setBlocklistMeta).toHaveBeenCalledWith('snapshotIpOriginCount', '1');
  });
});
