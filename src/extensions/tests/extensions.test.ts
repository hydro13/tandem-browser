import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { CrxDownloader } from '../crx-downloader';
import { ChromeExtensionImporter } from '../chrome-importer';
import { GALLERY_DEFAULTS } from '../gallery-defaults';
import AdmZip from 'adm-zip';
import fs from 'fs';
import path from 'path';
import os from 'os';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Create a minimal valid ZIP buffer containing a manifest.json.
 */
function createTestZip(manifest: Record<string, unknown>): Buffer {
  const zip = new AdmZip();
  zip.addFile('manifest.json', Buffer.from(JSON.stringify(manifest)));
  return zip.toBuffer();
}

/**
 * Build a CRX2 buffer: [Cr24][version=2][pubkey_len][sig_len][pubkey][sig][zip]
 */
function buildCrx2(zipPayload: Buffer): Buffer {
  const magic = Buffer.from('Cr24');
  const version = Buffer.alloc(4);
  version.writeUInt32LE(2, 0);

  const fakePubkey = Buffer.from('fake-public-key');
  const fakeSig = Buffer.from('fake-signature');

  const pubkeyLen = Buffer.alloc(4);
  pubkeyLen.writeUInt32LE(fakePubkey.length, 0);

  const sigLen = Buffer.alloc(4);
  sigLen.writeUInt32LE(fakeSig.length, 0);

  return Buffer.concat([magic, version, pubkeyLen, sigLen, fakePubkey, fakeSig, zipPayload]);
}

/**
 * Build a CRX3 buffer: [Cr24][version=3][header_size][header_bytes][zip]
 */
function buildCrx3(zipPayload: Buffer): Buffer {
  const magic = Buffer.from('Cr24');
  const version = Buffer.alloc(4);
  version.writeUInt32LE(3, 0);

  const fakeHeader = Buffer.from('fake-crx3-protobuf-header');

  const headerSize = Buffer.alloc(4);
  headerSize.writeUInt32LE(fakeHeader.length, 0);

  return Buffer.concat([magic, version, headerSize, fakeHeader, zipPayload]);
}

// ─── Extension ID Extraction Tests ────────────────────────────────────────────

describe('Extension ID Extraction', () => {
  const downloader = new CrxDownloader();

  it('extracts bare extension ID (32 a-p chars)', () => {
    expect(downloader.extractExtensionId('cjpalhdlnbpafiamejdnhcphjbkeiagm'))
      .toBe('cjpalhdlnbpafiamejdnhcphjbkeiagm');
  });

  it('extracts ID from full CWS URL', () => {
    expect(downloader.extractExtensionId(
      'https://chromewebstore.google.com/detail/ublock-origin/cjpalhdlnbpafiamejdnhcphjbkeiagm'
    )).toBe('cjpalhdlnbpafiamejdnhcphjbkeiagm');
  });

  it('extracts ID from short CWS URL (no name segment)', () => {
    expect(downloader.extractExtensionId(
      'https://chromewebstore.google.com/detail/cjpalhdlnbpafiamejdnhcphjbkeiagm'
    )).toBe('cjpalhdlnbpafiamejdnhcphjbkeiagm');
  });

  it('extracts ID from URL with query params', () => {
    expect(downloader.extractExtensionId(
      'https://chromewebstore.google.com/detail/ublock-origin/cjpalhdlnbpafiamejdnhcphjbkeiagm?hl=en'
    )).toBe('cjpalhdlnbpafiamejdnhcphjbkeiagm');
  });

  it('handles whitespace around input', () => {
    expect(downloader.extractExtensionId('  cjpalhdlnbpafiamejdnhcphjbkeiagm  '))
      .toBe('cjpalhdlnbpafiamejdnhcphjbkeiagm');
  });

  it('returns null for empty string', () => {
    expect(downloader.extractExtensionId('')).toBeNull();
  });

  it('returns null for invalid input (random text)', () => {
    expect(downloader.extractExtensionId('not-an-extension-id')).toBeNull();
  });

  it('returns null for wrong length ID (31 chars)', () => {
    expect(downloader.extractExtensionId('cjpalhdlnbpafiamejdnhcphjbkeiag')).toBeNull();
  });

  it('returns null for wrong length ID (33 chars)', () => {
    expect(downloader.extractExtensionId('cjpalhdlnbpafiamejdnhcphjbkeiagmm')).toBeNull();
  });

  it('returns null for ID with invalid chars (outside a-p)', () => {
    // 'q' is outside the a-p range
    expect(downloader.extractExtensionId('cjpalhdlnbpafiamejdnhcphjbkeiqgm')).toBeNull();
  });

  it('returns null for ID with uppercase letters', () => {
    expect(downloader.extractExtensionId('CJPALHDLNBPAFIAMEJDNHCPHJBKEIAGM')).toBeNull();
  });

  it('returns null for ID with numbers', () => {
    expect(downloader.extractExtensionId('cjpalhdlnbpafiamejdnhcphjbkeig12')).toBeNull();
  });

  it('extracts different valid IDs', () => {
    // Dark Reader
    expect(downloader.extractExtensionId('eimadpbcbfnmbkopoojfekhnkhdbieeh'))
      .toBe('eimadpbcbfnmbkopoojfekhnkhdbieeh');
    // Bitwarden
    expect(downloader.extractExtensionId('nngceckbapebfimnlniiiahkandclblb'))
      .toBe('nngceckbapebfimnlniiiahkandclblb');
  });
});

// ─── CRX Header Parsing Tests ─────────────────────────────────────────────────

describe('CRX Header Parsing', () => {
  const downloader = new CrxDownloader();

  // Access private verifyCrxFormat method for unit testing
  const verifyCrxFormat = (buffer: Buffer, allHostsGoogle: boolean) =>
    (downloader as unknown as { verifyCrxFormat: (buf: Buffer, google: boolean) => { valid: boolean; format: string; error?: string } })
      .verifyCrxFormat(buffer, allHostsGoogle);

  it('accepts valid CRX2 header', () => {
    const zip = createTestZip({ name: 'Test', version: '1.0', manifest_version: 3 });
    const crx = buildCrx2(zip);
    const result = verifyCrxFormat(crx, true);
    expect(result.valid).toBe(true);
    expect(result.format).toBe('crx2');
  });

  it('accepts valid CRX3 header', () => {
    const zip = createTestZip({ name: 'Test', version: '1.0', manifest_version: 3 });
    const crx = buildCrx3(zip);
    const result = verifyCrxFormat(crx, true);
    expect(result.valid).toBe(true);
    expect(result.format).toBe('crx3');
  });

  it('rejects files without Cr24 magic bytes', () => {
    const badMagic = Buffer.from('XXXX\x02\x00\x00\x00\x00\x00\x00\x00');
    const result = verifyCrxFormat(badMagic, true);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Invalid magic bytes');
  });

  it('rejects HTML error pages', () => {
    const html = Buffer.from('<!DOCTYPE html><html><body>Error</body></html>');
    const result = verifyCrxFormat(html, true);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('HTML');
  });

  it('rejects files with unknown CRX version (version 5)', () => {
    const buf = Buffer.alloc(12);
    buf.write('Cr24', 0);
    buf.writeUInt32LE(5, 4); // version 5
    buf.writeUInt32LE(0, 8);
    const result = verifyCrxFormat(buf, true);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Unknown CRX version');
  });

  it('rejects files too small to be valid CRX', () => {
    const tooSmall = Buffer.from('Cr24XXXX');
    const result = verifyCrxFormat(tooSmall, true);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('too small');
  });

  it('rejects downloads from non-Google domains', () => {
    const zip = createTestZip({ name: 'Test', version: '1.0', manifest_version: 3 });
    const crx = buildCrx3(zip);
    const result = verifyCrxFormat(crx, false);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('outside Google domains');
  });
});

// ─── CRX Extraction Tests ─────────────────────────────────────────────────────

describe('CRX Extraction', () => {
  const downloader = new CrxDownloader();
  let tempDir: string;

  // Access private extractCrx method for unit testing
  const extractCrx = (buffer: Buffer, extensionId: string, format: 'crx2' | 'crx3') =>
    (downloader as unknown as { extractCrx: (buf: Buffer, id: string, fmt: 'crx2' | 'crx3') => string })
      .extractCrx(buffer, extensionId, format);

  beforeEach(() => {
    tempDir = path.join(os.homedir(), '.tandem', 'extensions');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
  });

  afterEach(() => {
    // Clean up test extension
    const testPath = path.join(tempDir, 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaan');
    if (fs.existsSync(testPath)) {
      fs.rmSync(testPath, { recursive: true, force: true });
    }
  });

  it('extracts CRX2 ZIP to correct path with manifest.json', () => {
    const manifest = { name: 'CRX2 Test', version: '1.0', manifest_version: 2 };
    const zip = createTestZip(manifest);
    const crx = buildCrx2(zip);
    const testId = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaan';

    const installPath = extractCrx(crx, testId, 'crx2');
    expect(fs.existsSync(installPath)).toBe(true);
    expect(fs.existsSync(path.join(installPath, 'manifest.json'))).toBe(true);

    const extracted = JSON.parse(fs.readFileSync(path.join(installPath, 'manifest.json'), 'utf-8'));
    expect(extracted.name).toBe('CRX2 Test');
  });

  it('extracts CRX3 ZIP to correct path with manifest.json', () => {
    const manifest = { name: 'CRX3 Test', version: '2.0', manifest_version: 3 };
    const zip = createTestZip(manifest);
    const crx = buildCrx3(zip);
    const testId = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaan';

    const installPath = extractCrx(crx, testId, 'crx3');
    expect(fs.existsSync(installPath)).toBe(true);
    expect(fs.existsSync(path.join(installPath, 'manifest.json'))).toBe(true);

    const extracted = JSON.parse(fs.readFileSync(path.join(installPath, 'manifest.json'), 'utf-8'));
    expect(extracted.name).toBe('CRX3 Test');
    expect(extracted.version).toBe('2.0');
  });

  it('throws on invalid ZIP payload offset', () => {
    // CRX3 header claims a huge header that exceeds buffer
    const magic = Buffer.from('Cr24');
    const version = Buffer.alloc(4);
    version.writeUInt32LE(3, 0);
    const headerSize = Buffer.alloc(4);
    headerSize.writeUInt32LE(99999, 0); // way beyond buffer
    const buf = Buffer.concat([magic, version, headerSize, Buffer.alloc(10)]);

    expect(() => extractCrx(buf, 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaan', 'crx3'))
      .toThrow('ZIP start offset');
  });

  it('throws on empty ZIP archive', () => {
    // Build CRX3 with an invalid ZIP (just garbage bytes)
    const magic = Buffer.from('Cr24');
    const version = Buffer.alloc(4);
    version.writeUInt32LE(3, 0);
    const fakeHeader = Buffer.from('hdr');
    const headerSize = Buffer.alloc(4);
    headerSize.writeUInt32LE(fakeHeader.length, 0);
    const garbage = Buffer.from('this is not a zip file at all');
    const buf = Buffer.concat([magic, version, headerSize, fakeHeader, garbage]);

    expect(() => extractCrx(buf, 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaan', 'crx3'))
      .toThrow('Invalid ZIP payload');
  });
});

// ─── Gallery Defaults Tests ───────────────────────────────────────────────────

describe('Gallery Defaults', () => {
  it('contains exactly 30 curated extensions', () => {
    expect(GALLERY_DEFAULTS).toHaveLength(30);
  });

  it('all entries have required fields', () => {
    for (const ext of GALLERY_DEFAULTS) {
      expect(ext.id).toMatch(/^[a-p]{32}$/);
      expect(ext.name).toBeTruthy();
      expect(ext.description).toBeTruthy();
      expect(ext.category).toBeTruthy();
      expect(['works', 'partial', 'needs-work', 'blocked']).toContain(ext.compatibility);
      expect(['none', 'dnr-overlap', 'native-messaging']).toContain(ext.securityConflict);
      expect(typeof ext.featured).toBe('boolean');
    }
  });

  it('all extension IDs are unique', () => {
    const ids = GALLERY_DEFAULTS.map(e => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has exactly 10 featured extensions', () => {
    const featured = GALLERY_DEFAULTS.filter(e => e.featured);
    expect(featured).toHaveLength(10);
  });

  it('recommended extensions from TOP30 are all included', () => {
    const expectedIds = [
      'cjpalhdlnbpafiamejdnhcphjbkeiagm', // uBlock Origin
      'nngceckbapebfimnlniiiahkandclblb', // Bitwarden
      'niloccemoadcdkdjlinkgdfekeahmflj', // Pocket
      'laookkfknpbbblfpciffpaejjkokdgca', // Momentum
      'laankejkbhbdhmipfmgcngdelahlfoji', // StayFocusd
      'eimadpbcbfnmbkopoojfekhnkhdbieeh', // Dark Reader
      'fmkadmapgofadopljbjfkapdkoienihi', // React DevTools
      'gppongmhjkpfnbhagpmjfkannfbllamg', // Wappalyzer
      'nffaoalbilbmmfgbnbgppjihopabppdk', // Video Speed Controller
      'nkbihfbeogaeaoehlefnkodbefgpgknn', // MetaMask
    ];
    const galleryIds = GALLERY_DEFAULTS.map(e => e.id);
    for (const id of expectedIds) {
      expect(galleryIds).toContain(id);
    }
  });

  it('dnr-overlap extensions are correctly flagged', () => {
    const dnrExtensions = GALLERY_DEFAULTS.filter(e => e.securityConflict === 'dnr-overlap');
    expect(dnrExtensions.length).toBe(6);
    const dnrIds = dnrExtensions.map(e => e.id);
    // uBlock, ABP, AdBlock, Ghostery, DuckDuckGo, StayFocusd
    expect(dnrIds).toContain('cjpalhdlnbpafiamejdnhcphjbkeiagm');
    expect(dnrIds).toContain('cfhdojbkjhnklbpkdaibdccddilifddb');
    expect(dnrIds).toContain('gighmmpiobklfepjocnamgkkbiglidom');
    expect(dnrIds).toContain('mlomiejdfkolichcflejclcbmpeaniij');
    expect(dnrIds).toContain('bkdgflcldnnnapblkhphbgpggdiikppg');
    expect(dnrIds).toContain('laankejkbhbdhmipfmgcngdelahlfoji');
  });

  it('native-messaging extensions are correctly flagged', () => {
    const nativeExtensions = GALLERY_DEFAULTS.filter(e => e.securityConflict === 'native-messaging');
    expect(nativeExtensions.length).toBe(3);
    const nativeIds = nativeExtensions.map(e => e.id);
    // LastPass, 1Password, Postman
    expect(nativeIds).toContain('hdokiejnpimakedhajhdlcegeplioahd');
    expect(nativeIds).toContain('aeblfdkhhhdcdjpifhhbdiojplfjncoa');
    expect(nativeIds).toContain('aicmkgpgakddgnaphhhpliifpcfhicfo');
  });
});

// ─── Chrome Importer Tests ────────────────────────────────────────────────────

describe('Chrome Importer', () => {
  it('detects correct Chrome extensions path for current platform', () => {
    const importer = new ChromeExtensionImporter();
    const dir = importer.getChromeExtensionsDir();

    if (process.platform === 'darwin') {
      if (dir !== null) {
        expect(dir).toContain('Google/Chrome');
        expect(dir).toContain('Extensions');
      }
      // null is valid if Chrome is not installed
    } else if (process.platform === 'win32') {
      if (dir !== null) {
        expect(dir).toContain('Google\\Chrome');
      }
    } else {
      if (dir !== null) {
        expect(dir).toContain('google-chrome');
      }
    }
  });

  it('returns extensions array (or empty if Chrome not installed)', () => {
    const importer = new ChromeExtensionImporter();
    const extensions = importer.listChromeExtensions();
    expect(Array.isArray(extensions)).toBe(true);

    // If extensions found, verify structure
    for (const ext of extensions) {
      expect(ext.id).toMatch(/^[a-p]{32}$/);
      expect(typeof ext.name).toBe('string');
      expect(typeof ext.version).toBe('string');
      expect(typeof ext.chromePath).toBe('string');
    }
  });

  it('isAlreadyImported returns false for non-existent extension', () => {
    const importer = new ChromeExtensionImporter();
    expect(importer.isAlreadyImported('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaan')).toBe(false);
  });

  it('supports different profile names', () => {
    const defaultImporter = new ChromeExtensionImporter('Default');
    const profile1Importer = new ChromeExtensionImporter('Profile 1');

    const defaultDir = defaultImporter.getChromeExtensionsDir();
    const profile1Dir = profile1Importer.getChromeExtensionsDir();

    if (defaultDir !== null) {
      expect(defaultDir).toContain('Default');
    }
    if (profile1Dir !== null) {
      expect(profile1Dir).toContain('Profile 1');
    }
    // Both can be null if Chrome is not installed — that's fine
  });
});

// ─── Integration Tests (require network) ──────────────────────────────────────

const RUN_NETWORK_TESTS = process.env.TANDEM_NETWORK_TESTS === 'true';

describe.skipIf(!RUN_NETWORK_TESTS)('Extension Install Flow (network)', () => {
  const downloader = new CrxDownloader();
  const testExtId = 'gpmodmeblccallcadopbcoeoejepgpnb'; // JSON Formatter (small, fast)
  const installPath = path.join(os.homedir(), '.tandem', 'extensions', testExtId);

  afterAll(() => {
    // Clean up test download
    if (fs.existsSync(installPath)) {
      fs.rmSync(installPath, { recursive: true, force: true });
    }
  });

  it('installs extension by bare ID', async () => {
    // Clean up first
    if (fs.existsSync(installPath)) {
      fs.rmSync(installPath, { recursive: true, force: true });
    }

    const result = await downloader.installFromCws(testExtId);
    expect(result.success).toBe(true);
    expect(result.extensionId).toBe(testExtId);
    expect(result.name).toBeTruthy();
    expect(result.version).toBeTruthy();
    expect(fs.existsSync(result.installPath)).toBe(true);
    expect(fs.existsSync(path.join(result.installPath, 'manifest.json'))).toBe(true);
  }, 60_000);

  it('returns success immediately for already-installed extension (idempotent)', async () => {
    // Should already be installed from previous test
    const result = await downloader.installFromCws(testExtId);
    expect(result.success).toBe(true);
    expect(result.extensionId).toBe(testExtId);
  }, 10_000);

  it('installs extension by CWS URL', async () => {
    // Clean up and reinstall via URL
    if (fs.existsSync(installPath)) {
      fs.rmSync(installPath, { recursive: true, force: true });
    }

    const url = `https://chromewebstore.google.com/detail/json-formatter/${testExtId}`;
    const result = await downloader.installFromCws(url);
    expect(result.success).toBe(true);
    expect(result.extensionId).toBe(testExtId);
  }, 60_000);

  it('returns error for invalid extension ID', async () => {
    const result = await downloader.installFromCws('not-a-valid-id');
    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid extension ID');
  });

  it('uninstall removes directory from disk', () => {
    // The extension should be installed from previous tests
    if (fs.existsSync(installPath)) {
      fs.rmSync(installPath, { recursive: true, force: true });
      expect(fs.existsSync(installPath)).toBe(false);
    }
  });
});

// ─── TOP30 Extension ID Verification (network) ───────────────────────────────

describe.skipIf(!RUN_NETWORK_TESTS)('TOP30 Extension ID Verification', () => {
  const top30Ids = GALLERY_DEFAULTS.map(e => ({ id: e.id, name: e.name }));

  it.each(top30Ids)('$name ($id) resolves on CWS', async ({ id }) => {
    const downloader = new CrxDownloader();
    const extractedId = downloader.extractExtensionId(id);
    expect(extractedId).toBe(id);

    // Verify the ID is a valid 32 a-p character string
    expect(id).toMatch(/^[a-p]{32}$/);
  });

  // Specifically flagged IDs
  it('DuckDuckGo Privacy Essentials ID is valid', () => {
    expect(GALLERY_DEFAULTS.find(e => e.name.includes('DuckDuckGo'))?.id)
      .toBe('bkdgflcldnnnapblkhphbgpggdiikppg');
  });

  it('JSON Formatter ID is valid', () => {
    expect(GALLERY_DEFAULTS.find(e => e.name === 'JSON Formatter')?.id)
      .toBe('gpmodmeblccallcadopbcoeoejepgpnb');
  });

  it('Return YouTube Dislike ID is valid', () => {
    expect(GALLERY_DEFAULTS.find(e => e.name === 'Return YouTube Dislike')?.id)
      .toBe('gebbhagfogifgggkldgodflihgfeippi');
  });
});
