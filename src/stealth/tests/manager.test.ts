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
      promises: {
        ...((actual.default as { promises?: object } | undefined)?.promises ?? (actual as { promises?: object }).promises),
        writeFile: vi.fn().mockResolvedValue(undefined),
      },
      existsSync: vi.fn(),
      mkdirSync: vi.fn(),
      writeFileSync: vi.fn(),
      readFileSync: vi.fn(),
      chmodSync: vi.fn(),
    },
    promises: {
      ...((actual as { promises?: object }).promises),
      writeFile: vi.fn().mockResolvedValue(undefined),
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
import { createDarwinStealthUaAdapter, createWindowsStealthUaAdapter } from '../../platform/stealth-ua';
import type { StealthUaAdapter } from '../../platform/types';

const normalizePath = (value: unknown) => String(value).replace(/\\/g, '/');

function makeMockSession() {
  return {
    getUserAgent: () => 'Electron/40',
    setUserAgent: vi.fn(),
    registerPreloadScript: vi.fn(),
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
      (c) => normalizePath(c[0]).endsWith('/config.json')
    );
    expect(chmodCall).toBeDefined();
    expect(chmodCall![1]).toBe(0o600);
  });

  it('generates a new secret and writes config.json with mode 0o600 when config missing', () => {
    vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
      const s = normalizePath(p);
      if (s.endsWith('/config.json')) return false;
      return true; // dir exists
    });

    const secret = loadOrCreateInstallSecret();

    expect(secret).toMatch(/^[0-9a-f]{64}$/);

    const configWrite = vi.mocked(fs.writeFileSync).mock.calls.find(
      (c) => normalizePath(c[0]).endsWith('/config.json')
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
      (c) => normalizePath(c[0]).endsWith('/config.json')
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
      (c) => normalizePath(c[0]).endsWith('/config.json')
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

    const m1 = new StealthManager(makeMockSession(), 'persist:tandem', createDarwinStealthUaAdapter());
    const m2 = new StealthManager(makeMockSession(), 'persist:tandem', createDarwinStealthUaAdapter());

    expect(m1.getPartitionSeed()).toBe(m2.getPartitionSeed());
  });

  it('produces a different seed when the install secret differs (simulates a different install)', () => {
    // First install: no secret on disk → generates one
    vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
      return !normalizePath(p).endsWith('/config.json');
    });
    const m1 = new StealthManager(makeMockSession(), 'persist:tandem', createDarwinStealthUaAdapter());
    const seed1 = m1.getPartitionSeed();

    // Reset mocks — simulate a second, separate install with a different secret
    vi.clearAllMocks();
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({ stealthInstallSecret: 'b'.repeat(64) })
    );
    const m2 = new StealthManager(makeMockSession(), 'persist:tandem', createDarwinStealthUaAdapter());
    const seed2 = m2.getPartitionSeed();

    expect(seed1).not.toBe(seed2);
  });

  it('varies seed by partition within the same install', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({ stealthInstallSecret: 'c'.repeat(64) })
    );

    const m1 = new StealthManager(makeMockSession(), 'persist:tandem', createDarwinStealthUaAdapter());
    const m2 = new StealthManager(makeMockSession(), 'persist:workspace-a', createDarwinStealthUaAdapter());

    expect(m1.getPartitionSeed()).not.toBe(m2.getPartitionSeed());
  });
});

// ─── Helpers for registerWith() tests ────────────────────────────────────────

type HeaderHandler = (
  details: { url: string },
  headers: Record<string, string>
) => Record<string, string>;

/** Creates a minimal mock RequestDispatcher that captures the last registered
 *  BeforeSendHeaders handler so tests can invoke it directly. */
function makeDispatcherMock() {
  let capturedHandler: HeaderHandler | null = null;
  return {
    registerBeforeSendHeaders: vi.fn(({ handler }: { handler: HeaderHandler }) => {
      capturedHandler = handler;
    }),
    getHandler: (): HeaderHandler => {
      if (!capturedHandler) throw new Error('handler not registered');
      return capturedHandler;
    },
  };
}

/** Sets up a StealthManager backed by a deterministic fake install secret. */
function makeManagerWithFixedSecret(stealthUa: StealthUaAdapter = createDarwinStealthUaAdapter()): StealthManager {
  vi.mocked(fs.existsSync).mockReturnValue(true);
  vi.mocked(fs.readFileSync).mockReturnValue(
    JSON.stringify({ stealthInstallSecret: 'a'.repeat(64) })
  );
  return new StealthManager(makeMockSession(), 'persist:tandem', stealthUa);
}

describe('stealth-ua platform adapters', () => {
  const chromeVersion = '132.0.6834.160';

  it('pins the macOS UA and UA-CH profile byte-for-byte', () => {
    const profile = createDarwinStealthUaAdapter().getProfile(chromeVersion);

    expect(profile).toMatchInlineSnapshot(`
      {
        "chromeMajor": "132",
        "chromeVersion": "132.0.6834.160",
        "clientHints": {
          "architecture": "arm",
          "bitness": "64",
          "brands": [
            {
              "brand": "Google Chrome",
              "version": "132",
            },
            {
              "brand": "Chromium",
              "version": "132",
            },
            {
              "brand": "Not(A:Brand",
              "version": "8",
            },
          ],
          "fullVersionList": [
            {
              "brand": "Google Chrome",
              "version": "132.0.6834.160",
            },
            {
              "brand": "Chromium",
              "version": "132.0.6834.160",
            },
            {
              "brand": "Not(A:Brand",
              "version": "8.0.0.0",
            },
          ],
          "mobile": false,
          "model": "",
          "platform": "macOS",
          "platformVersion": "15.3.0",
          "uaFullVersion": "132.0.6834.160",
        },
        "fingerprint": {
          "colorDepth": 30,
          "deviceMemory": 8,
          "fonts": [
            "Arial",
            "Arial Black",
            "Comic Sans MS",
            "Courier New",
            "Georgia",
            "Impact",
            "Tahoma",
            "Times New Roman",
            "Trebuchet MS",
            "Verdana",
            "Courier",
            "Helvetica",
            "Helvetica Neue",
            "Lucida Console",
            "Lucida Grande",
            "Lucida Sans Unicode",
            "Monaco",
            "Palatino",
            "Palatino Linotype",
            "Times",
            "Apple Color Emoji",
            "Apple SD Gothic Neo",
            "Avenir",
            "Avenir Next",
            "Futura",
            "Geneva",
            "Gill Sans",
            "Menlo",
            "Optima",
            "San Francisco",
            "SF Pro",
            "SF Mono",
            "System Font",
            "-apple-system",
            "BlinkMacSystemFont",
          ],
          "hardwareConcurrency": 8,
          "webglRenderer": "ANGLE (Apple, Apple M1, OpenGL 4.1)",
          "webglVendor": "Google Inc. (Apple)",
        },
        "requestHeaders": {
          "platform": ""macOS"",
        },
        "userAgent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.6834.160 Safari/537.36",
      }
    `);
  });

  it('builds a Chrome-on-Windows UA and UA-CH profile', () => {
    const profile = createWindowsStealthUaAdapter().getProfile(chromeVersion);

    expect(profile).toMatchInlineSnapshot(`
      {
        "chromeMajor": "132",
        "chromeVersion": "132.0.6834.160",
        "clientHints": {
          "architecture": "x86",
          "bitness": "64",
          "brands": [
            {
              "brand": "Google Chrome",
              "version": "132",
            },
            {
              "brand": "Chromium",
              "version": "132",
            },
            {
              "brand": "Not(A:Brand",
              "version": "8",
            },
          ],
          "fullVersionList": [
            {
              "brand": "Google Chrome",
              "version": "132.0.6834.160",
            },
            {
              "brand": "Chromium",
              "version": "132.0.6834.160",
            },
            {
              "brand": "Not(A:Brand",
              "version": "8.0.0.0",
            },
          ],
          "mobile": false,
          "model": "",
          "platform": "Windows",
          "platformVersion": "15.0.0",
          "uaFullVersion": "132.0.6834.160",
        },
        "fingerprint": {
          "colorDepth": 24,
          "deviceMemory": 8,
          "fonts": [
            "Arial",
            "Arial Black",
            "Comic Sans MS",
            "Courier New",
            "Georgia",
            "Impact",
            "Tahoma",
            "Times New Roman",
            "Trebuchet MS",
            "Verdana",
            "Bahnschrift",
            "Calibri",
            "Cambria",
            "Cambria Math",
            "Candara",
            "Consolas",
            "Constantia",
            "Corbel",
            "Ebrima",
            "Franklin Gothic Medium",
            "Gabriola",
            "Gadugi",
            "Lucida Console",
            "Lucida Sans Unicode",
            "Microsoft Sans Serif",
            "MS Gothic",
            "MV Boli",
            "Palatino Linotype",
            "Segoe Print",
            "Segoe Script",
            "Segoe UI",
            "Segoe UI Emoji",
            "Segoe UI Symbol",
            "Sylfaen",
            "Symbol",
            "Webdings",
            "Wingdings",
            "Yu Gothic",
          ],
          "hardwareConcurrency": 8,
          "webglRenderer": "ANGLE (Intel, Intel(R) UHD Graphics 630 Direct3D11 vs_5_0 ps_5_0, D3D11)",
          "webglVendor": "Google Inc. (Intel)",
        },
        "requestHeaders": {
          "platform": ""Windows"",
          "platformVersion": ""15.0.0"",
        },
        "userAgent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.6834.160 Safari/537.36",
      }
    `);
  });
});

// ─── registerWith() — Sec-CH-UA header patching ───────────────────────────────

describe('registerWith() — Sec-CH-UA client-hints injection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('adds "Google Chrome" brand to Chromium-generated lowercase sec-ch-ua', () => {
    const mgr  = makeManagerWithFixedSecret();
    const disp = makeDispatcherMock();
    mgr.registerWith(disp as never);
    const handle = disp.getHandler();

    const result = handle(
      { url: 'https://example.com' },
      { 'sec-ch-ua': '"Not(A:Brand";v="8", "Chromium";v="132"' }
    );

    expect(result['sec-ch-ua']).toContain('Google Chrome');
  });

  it('preserves Chromium\'s natural GREASE token (does not replace "Not(A:Brand")', () => {
    const mgr  = makeManagerWithFixedSecret();
    const disp = makeDispatcherMock();
    mgr.registerWith(disp as never);
    const handle = disp.getHandler();

    const result = handle(
      { url: 'https://example.com' },
      { 'sec-ch-ua': '"Not(A:Brand";v="8", "Chromium";v="132"' }
    );

    expect(result['sec-ch-ua']).toContain('Not(A:Brand');
  });

  it('emits exactly one sec-ch-ua key (no casing duplicates)', () => {
    const mgr  = makeManagerWithFixedSecret();
    const disp = makeDispatcherMock();
    mgr.registerWith(disp as never);
    const handle = disp.getHandler();

    const result = handle(
      { url: 'https://cloudflare.com' },
      { 'sec-ch-ua': '"Not(A:Brand";v="8", "Chromium";v="132"' }
    );

    const allChUaKeys = Object.keys(result).filter(k => k.toLowerCase() === 'sec-ch-ua');
    expect(allChUaKeys).toHaveLength(1);
    expect(allChUaKeys[0]).toBe('sec-ch-ua');
  });

  it('drops any pre-existing capitalized Sec-CH-UA duplicate', () => {
    // The old code set headers['Sec-CH-UA'] without removing the lowercase
    // original.  Both would reach the network — Cloudflare reads the lowercase
    // one (no "Google Chrome") and treats the request as bot traffic.
    const mgr  = makeManagerWithFixedSecret();
    const disp = makeDispatcherMock();
    mgr.registerWith(disp as never);
    const handle = disp.getHandler();

    // Simulate a headers object that already has BOTH casings (old-code artifact)
    const result = handle(
      { url: 'https://cloudflare.com' },
      {
        'sec-ch-ua':     '"Not(A:Brand";v="8", "Chromium";v="132"',
        'Sec-CH-UA':     '"Google Chrome";v="132", "Chromium";v="132", "Not_A Brand";v="24"',
      }
    );

    // No capitalized variant should survive
    expect(result['Sec-CH-UA']).toBeUndefined();
    // The single lowercase key must contain "Google Chrome"
    expect(result['sec-ch-ua']).toContain('Google Chrome');
  });

  it('builds a correct sec-ch-ua from scratch when Chromium did not send it', () => {
    const mgr  = makeManagerWithFixedSecret();
    const disp = makeDispatcherMock();
    mgr.registerWith(disp as never);
    const handle = disp.getHandler();

    const result = handle({ url: 'https://example.com' }, {});

    expect(result['sec-ch-ua']).toContain('Google Chrome');
    expect(result['sec-ch-ua']).toContain('Chromium');
    expect(result['sec-ch-ua']).toContain('Not(A:Brand');
  });

  it('does not add sec-ch-ua-full-version-list when Chromium did not send it', () => {
    const mgr  = makeManagerWithFixedSecret();
    const disp = makeDispatcherMock();
    mgr.registerWith(disp as never);
    const handle = disp.getHandler();

    const result = handle(
      { url: 'https://example.com' },
      { 'sec-ch-ua': '"Not(A:Brand";v="8", "Chromium";v="132"' }
    );

    const fullListKeys = Object.keys(result).filter(
      k => k.toLowerCase() === 'sec-ch-ua-full-version-list'
    );
    expect(fullListKeys).toHaveLength(0);
  });

  it('enriches sec-ch-ua-full-version-list when Chromium sent it', () => {
    const mgr  = makeManagerWithFixedSecret();
    const disp = makeDispatcherMock();
    mgr.registerWith(disp as never);
    const handle = disp.getHandler();

    const result = handle(
      { url: 'https://example.com' },
      {
        'sec-ch-ua':                  '"Not(A:Brand";v="8", "Chromium";v="132"',
        'sec-ch-ua-full-version-list': '"Not(A:Brand";v="8.0.0.0", "Chromium";v="132.0.6834.160"',
      }
    );

    expect(result['sec-ch-ua-full-version-list']).toContain('Google Chrome');
    expect(result['sec-ch-ua-full-version-list']).toContain('Not(A:Brand');
  });

  it('strips sec-ch-ua headers from Google auth requests (existing behaviour unchanged)', () => {
    const mgr  = makeManagerWithFixedSecret();
    const disp = makeDispatcherMock();
    mgr.registerWith(disp as never);
    const handle = disp.getHandler();

    const result = handle(
      { url: 'https://accounts.google.com/o/oauth2/auth' },
      {
        'User-Agent':  'Mozilla/5.0 Chrome/132',
        'sec-ch-ua':   '"Not(A:Brand";v="8", "Chromium";v="132"',
        'sec-ch-ua-mobile': '?0',
      }
    );

    const chUaKeys = Object.keys(result).filter(k => k.toLowerCase().startsWith('sec-ch-ua'));
    expect(chUaKeys).toHaveLength(0);
  });

  it('uses lowercase sec-ch-ua-mobile and sec-ch-ua-platform keys', () => {
    const mgr  = makeManagerWithFixedSecret();
    const disp = makeDispatcherMock();
    mgr.registerWith(disp as never);
    const handle = disp.getHandler();

    const result = handle({ url: 'https://example.com' }, {});

    expect(result['sec-ch-ua-mobile']).toBe('?0');
    expect(result['sec-ch-ua-platform']).toBe('"macOS"');
    // Old uppercase variants must not appear
    expect(result['Sec-CH-UA-Mobile']).toBeUndefined();
    expect(result['Sec-CH-UA-Platform']).toBeUndefined();
  });

  it('keeps macOS request UA-CH headers byte-compatible by not adding platform-version', () => {
    const mgr = makeManagerWithFixedSecret(createDarwinStealthUaAdapter());
    const disp = makeDispatcherMock();
    mgr.registerWith(disp as never);
    const handle = disp.getHandler();

    const result = handle({ url: 'https://example.com' }, {});

    expect(result['sec-ch-ua-platform']).toBe('"macOS"');
    expect(result['sec-ch-ua-platform-version']).toBeUndefined();
  });

  it('emits Windows request UA-CH headers from the Windows stealth adapter', () => {
    const mgr = makeManagerWithFixedSecret(createWindowsStealthUaAdapter());
    const disp = makeDispatcherMock();
    mgr.registerWith(disp as never);
    const handle = disp.getHandler();

    const result = handle({ url: 'https://example.com' }, {});

    expect(result['sec-ch-ua']).toContain('"Google Chrome";v="132"');
    expect(result['sec-ch-ua-platform']).toBe('"Windows"');
    expect(result['sec-ch-ua-platform-version']).toBe('"15.0.0"');
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

describe('getStealthScript() — OS persona fingerprint consistency', () => {
  // Regression guard: WebGL renderer and screen colour depth must be driven by
  // the OS persona, not hardcoded. A Windows UA that reports a macOS "Apple M1"
  // GPU (or 30-bit colour) is a cross-checkable automation tell.
  it('injects the Windows profile GPU and colour depth for a Windows persona', () => {
    const win = createWindowsStealthUaAdapter();
    const script = StealthManager.getStealthScript('seed', undefined, win);
    expect(script).toContain('Intel(R) UHD Graphics 630');
    expect(script).toContain('Google Inc. (Intel)');
    expect(script).toContain('return 24'); // screen.colorDepth
    // Must NOT leak the macOS GPU into a Windows persona
    expect(script).not.toContain('Apple M1');
    expect(script).not.toContain('Google Inc. (Apple)');
  });

  it('injects the macOS profile GPU and colour depth for a macOS persona', () => {
    const mac = createDarwinStealthUaAdapter();
    const script = StealthManager.getStealthScript('seed', undefined, mac);
    expect(script).toContain('Apple M1');
    expect(script).toContain('Google Inc. (Apple)');
    expect(script).toContain('return 30'); // screen.colorDepth
    expect(script).not.toContain('Intel(R) UHD Graphics 630');
  });

  it('keeps the WebGL/colour-depth persona aligned with the User-Agent OS', () => {
    // The one invariant that matters: whatever OS the UA claims, the GPU and
    // colour depth agree with it.
    for (const ua of [createWindowsStealthUaAdapter(), createDarwinStealthUaAdapter()]) {
      const profile = ua.getProfile('132.0.0.0');
      const script = StealthManager.getStealthScript('seed', undefined, ua);
      expect(script).toContain(profile.fingerprint.webglRenderer);
      expect(script).toContain(profile.fingerprint.webglVendor);
      expect(script).toContain(`return ${profile.fingerprint.colorDepth}`);
    }
  });

  it('exposes the Windows font signature (Segoe UI) and hides macOS-only fonts', () => {
    const script = StealthManager.getStealthScript('seed', undefined, createWindowsStealthUaAdapter());
    expect(script).toContain('Segoe UI');
    expect(script).toContain('Calibri');
    expect(script).toContain('Consolas');
    // A Windows machine does not have these macOS-only fonts
    expect(script).not.toContain('San Francisco');
    expect(script).not.toContain('Helvetica Neue');
    expect(script).not.toContain('-apple-system');
  });

  it('exposes the macOS font signature and hides Windows-only fonts', () => {
    const script = StealthManager.getStealthScript('seed', undefined, createDarwinStealthUaAdapter());
    expect(script).toContain('San Francisco');
    expect(script).toContain('Helvetica Neue');
    expect(script).not.toContain('Segoe UI');
    expect(script).not.toContain('Calibri');
  });

  it('pins hardwareConcurrency and deviceMemory so the host core count cannot leak', () => {
    for (const ua of [createWindowsStealthUaAdapter(), createDarwinStealthUaAdapter()]) {
      const profile = ua.getProfile('132.0.0.0');
      const script = StealthManager.getStealthScript('seed', undefined, ua);
      expect(script).toContain('hardwareConcurrency');
      expect(script).toContain(`return ${profile.fingerprint.hardwareConcurrency}`);
      expect(script).toContain('deviceMemory');
    }
  });
});

describe('getStealthScript() — userAgentData GREASE brand consistency', () => {
  it('uses "Not(A:Brand" (Chrome 120+ GREASE token), not the old "Not_A Brand"', () => {
    // Cloudflare cross-checks navigator.userAgentData.brands against the
    // sec-ch-ua HTTP header. The header handler preserves Chromium's natural
    // GREASE token ("Not(A:Brand" for Chrome 120+). The injected JS must match.
    const script = StealthManager.getStealthScript('seed');
    expect(script).toContain('Not(A:Brand');
    expect(script).not.toContain('Not_A Brand');
    expect(script).not.toContain('Not.A/Brand');
  });

  it('uses GREASE version "8", not the old "24"', () => {
    const script = StealthManager.getStealthScript('seed');
    // The __greaseVersion variable must be '8'
    expect(script).toContain("__greaseVersion = '8'");
    expect(script).not.toMatch(/__greaseVersion\s*=\s*'24'/);
  });

  it('fullVersionList GREASE version is pinned to Chrome 120+ "8.0.0.0"', () => {
    const script = StealthManager.getStealthScript('seed');
    // Should not hardcode the old wrong "24.0.0.0"
    expect(script).not.toContain('"24.0.0.0"');
    expect(script).not.toContain("'24.0.0.0'");
    expect(script).toContain('"8.0.0.0"');
  });

  it('includes "Google Chrome" in all brand lists', () => {
    const script = StealthManager.getStealthScript('seed');
    // Must appear in both the low-entropy brands and the getHighEntropyValues response
    const chromeCount = (script.match(/Google Chrome/g) || []).length;
    // brands (1) + getHighEntropyValues brands (1) + fullVersionList (1) = min 3
    expect(chromeCount).toBeGreaterThanOrEqual(3);
  });

  it('uses Windows userAgentData values when given the Windows stealth adapter', () => {
    const script = StealthManager.getStealthScript(
      'seed',
      '132.0.6834.160',
      createWindowsStealthUaAdapter(),
    );

    expect(script).toContain('platform: "Windows"');
    expect(script).toContain('platformVersion: "15.0.0"');
    expect(script).toContain('architecture: "x86"');
    expect(script).not.toContain("platform: 'macOS'");
  });
});

// ─── getEarlyScript() ─────────────────────────────────────────────────────────
// This is the minimal script injected via CDP Page.addScriptToEvaluateOnNewDocument
// into EVERY frame including cross-origin OOPIFs (e.g. Cloudflare Turnstile).
// It must NOT contain canvas/audio/timing patches that crash sandboxed iframes.

describe('getEarlyScript() — minimal OOPIF-safe stealth', () => {
  it('uses its own idempotency guard distinct from the full stealth script', () => {
    const script = StealthManager.getEarlyScript();
    expect(script).toContain('__tandem_early_v1');
    expect(script).not.toContain('__tandem_stealth_v1');
  });

  it('includes "Google Chrome" in userAgentData brands', () => {
    const script = StealthManager.getEarlyScript();
    expect(script).toContain('Google Chrome');
    // Must appear in brands array AND fullVersionList
    const chromeCount = (script.match(/Google Chrome/g) || []).length;
    expect(chromeCount).toBeGreaterThanOrEqual(2);
  });

  it('uses "Not(A:Brand" GREASE token (Chrome 120+)', () => {
    const script = StealthManager.getEarlyScript();
    expect(script).toContain('Not(A:Brand');
    expect(script).not.toContain('Not_A Brand');
  });

  it('patches navigator.webdriver', () => {
    const script = StealthManager.getEarlyScript();
    expect(script).toContain('webdriver');
    expect(script).toContain('false');
  });

  it('includes a minimal window.chrome.runtime stub', () => {
    const script = StealthManager.getEarlyScript();
    expect(script).toContain('window.chrome');
    expect(script).toContain('chrome.runtime');
  });

  it('does NOT contain canvas fingerprint noise (getImageData crash risk in OOPIF)', () => {
    const script = StealthManager.getEarlyScript();
    expect(script).not.toContain('getImageData');
    expect(script).not.toContain('toDataURL');
    expect(script).not.toContain('toBlob');
    expect(script).not.toContain('HTMLCanvasElement');
  });

  it('does NOT contain audio fingerprint noise (not needed for Cloudflare Turnstile)', () => {
    const script = StealthManager.getEarlyScript();
    expect(script).not.toContain('AudioContext');
    expect(script).not.toContain('OfflineAudioContext');
    expect(script).not.toContain('AnalyserNode');
  });

  it('does NOT contain timing precision reduction (Firefox-like 100μs is a Cloudflare non-Chrome signal)', () => {
    const script = StealthManager.getEarlyScript();
    expect(script).not.toContain('performance.now');
    expect(script).not.toContain('origPerfNow');
  });

  it('does NOT contain WebGL parameter patching (not needed in Turnstile OOPIF)', () => {
    const script = StealthManager.getEarlyScript();
    expect(script).not.toContain('WebGLRenderingContext');
    expect(script).not.toContain('WebGL2RenderingContext');
  });

  it('accepts an optional chromeVersion parameter', () => {
    const script = StealthManager.getEarlyScript('130.0.6723.116');
    expect(script).toContain('130.0.6723.116');
    expect(script).toContain('130'); // chromeMajor
  });

  it('uses Windows userAgentData values when given the Windows stealth adapter', () => {
    const script = StealthManager.getEarlyScript('132.0.6834.160', createWindowsStealthUaAdapter());
    expect(script).toContain('platform: "Windows"');
    expect(script).toContain('platformVersion: "15.0.0"');
    expect(script).toContain('architecture: "x86"');
  });

  it('uses process.versions.chrome by default', () => {
    const script = StealthManager.getEarlyScript();
    // The test environment sets chrome to 132.0.6834.160 in beforeAll
    expect(script).toContain(process.versions.chrome);
  });
});

describe('apply() — preload policy sync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('writes a preload that queries the cloudflare policy channel when configured', async () => {
    const existing = 'd'.repeat(64);
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({ stealthInstallSecret: existing })
    );

    const session = makeMockSession() as unknown as {
      setUserAgent: ReturnType<typeof vi.fn>;
      registerPreloadScript: ReturnType<typeof vi.fn>;
    };

    const manager = new StealthManager(session as never, 'persist:tandem', createDarwinStealthUaAdapter());
    await manager.apply({ cloudflarePolicySyncChannel: 'tandem:cloudflare-policy-sync' });

    expect(session.setUserAgent).toHaveBeenCalled();
    expect(session.registerPreloadScript).toHaveBeenCalledTimes(1);
    const writeCalls = vi.mocked(fs.promises.writeFile).mock.calls;
    expect(writeCalls.length).toBeGreaterThan(0);
    expect(String(writeCalls.at(-1)?.[1])).toContain('ipcRenderer.sendSync("tandem:cloudflare-policy-sync", _url)');
  });
});
