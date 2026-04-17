import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';

// We mock the paths module so tests don't touch a real home dir.
vi.mock('../../utils/paths', () => ({
  tandemDir: () => '/tmp/tandem-io-test',
}));

import { readConfigFileSync } from '../io';

const DIR = '/tmp/tandem-io-test';
const FILE = path.join(DIR, 'config.json');

describe('readConfigFileSync', () => {
  beforeEach(() => {
    try { fs.rmSync(DIR, { recursive: true, force: true }); } catch { /* ignore */ }
    fs.mkdirSync(DIR, { recursive: true });
  });

  afterEach(() => {
    try { fs.rmSync(DIR, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('returns null when config.json is missing', () => {
    expect(readConfigFileSync()).toBe(null);
  });

  it('returns parsed config when file exists', () => {
    fs.writeFileSync(FILE, JSON.stringify({ appearance: { theme: 'light' } }));
    const cfg = readConfigFileSync();
    expect(cfg?.appearance?.theme).toBe('light');
  });

  it('returns null on invalid JSON', () => {
    fs.writeFileSync(FILE, 'not json');
    expect(readConfigFileSync()).toBe(null);
  });

  it('returns null on non-object JSON', () => {
    fs.writeFileSync(FILE, '42');
    expect(readConfigFileSync()).toBe(null);
  });
});
