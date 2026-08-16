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
import { StealthManager } from '../manager';
import { createDarwinStealthUaAdapter, createWindowsStealthUaAdapter } from '../../platform/stealth-ua';
import type { StealthUaAdapter } from '../../platform/types';

function makeMockSession() {
  return {
    getUserAgent: () => 'Electron/40',
    setUserAgent: vi.fn(),
    registerPreloadScript: vi.fn(),
  } as unknown as Electron.Session;
}

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
  return new StealthManager(makeMockSession(), stealthUa);
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

describe('getStealthScript() — no fingerprinting tricks (real fingerprint only)', () => {
  // The stealth layer must ONLY hide automation/Electron, never spoof or block
  // hardware fingerprinting. If any of these come back, the browser starts lying
  // about hardware again — which both breaks Cloudflare challenges and makes the
  // fingerprint internally inconsistent (real GPU on some sites, fake on others).

  it('does not spoof WebGL renderer/vendor', () => {
    const script = StealthManager.getStealthScript();
    expect(script).not.toContain('UNMASKED_RENDERER');
    expect(script).not.toContain('WebGLRenderingContext.prototype.getParameter');
    expect(script).not.toContain('Apple M1');
    expect(script).not.toContain('Intel(R) UHD Graphics 630');
  });

  it('does not add canvas noise', () => {
    const script = StealthManager.getStealthScript();
    expect(script).not.toContain('getImageData');
    expect(script).not.toContain('addCanvasNoise');
    expect(script).not.toContain('toDataURL');
  });

  it('does not add audio noise', () => {
    const script = StealthManager.getStealthScript();
    expect(script).not.toContain('getFloatFrequencyData');
    expect(script).not.toContain('OfflineAudioContext');
  });

  it('does not spoof screen colour depth, CPU cores, or memory', () => {
    const script = StealthManager.getStealthScript();
    expect(script).not.toContain('colorDepth');
    expect(script).not.toContain('hardwareConcurrency');
    expect(script).not.toContain('deviceMemory');
  });

  it('does not block font enumeration', () => {
    const script = StealthManager.getStealthScript();
    expect(script).not.toContain('document.fonts');
    expect(script).not.toContain('standardFonts');
  });

  it('does not patch timing (performance.now / Date.now)', () => {
    // Firefox-like performance.now precision reduction is itself a "not real
    // Chrome" signal, and Date.now jitter is trivially detectable.
    const script = StealthManager.getStealthScript();
    expect(script).not.toContain('performance.now =');
    expect(script).not.toMatch(/Date\.now\s*=\s*function/);
  });
});

describe('getStealthScript() — userAgentData GREASE brand consistency', () => {
  it('uses "Not(A:Brand" (Chrome 120+ GREASE token), not the old "Not_A Brand"', () => {
    // Cloudflare cross-checks navigator.userAgentData.brands against the
    // sec-ch-ua HTTP header. The header handler preserves Chromium's natural
    // GREASE token ("Not(A:Brand" for Chrome 120+). The injected JS must match.
    const script = StealthManager.getStealthScript();
    expect(script).toContain('Not(A:Brand');
    expect(script).not.toContain('Not_A Brand');
    expect(script).not.toContain('Not.A/Brand');
  });

  it('uses GREASE version "8", not the old "24"', () => {
    const script = StealthManager.getStealthScript();
    // The __greaseVersion variable must be '8'
    expect(script).toContain("__greaseVersion = '8'");
    expect(script).not.toMatch(/__greaseVersion\s*=\s*'24'/);
  });

  it('fullVersionList GREASE version is pinned to Chrome 120+ "8.0.0.0"', () => {
    const script = StealthManager.getStealthScript();
    // Should not hardcode the old wrong "24.0.0.0"
    expect(script).not.toContain('"24.0.0.0"');
    expect(script).not.toContain("'24.0.0.0'");
    expect(script).toContain('"8.0.0.0"');
  });

  it('includes "Google Chrome" in all brand lists', () => {
    const script = StealthManager.getStealthScript();
    // Must appear in both the low-entropy brands and the getHighEntropyValues response
    const chromeCount = (script.match(/Google Chrome/g) || []).length;
    // brands (1) + getHighEntropyValues brands (1) + fullVersionList (1) = min 3
    expect(chromeCount).toBeGreaterThanOrEqual(3);
  });

  it('uses Windows userAgentData values when given the Windows stealth adapter', () => {
    const script = StealthManager.getStealthScript(
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

    const manager = new StealthManager(session as never, createDarwinStealthUaAdapter());
    await manager.apply({ cloudflarePolicySyncChannel: 'tandem:cloudflare-policy-sync' });

    expect(session.setUserAgent).toHaveBeenCalled();
    expect(session.registerPreloadScript).toHaveBeenCalledTimes(1);
    const writeCalls = vi.mocked(fs.promises.writeFile).mock.calls;
    expect(writeCalls.length).toBeGreaterThan(0);
    expect(String(writeCalls.at(-1)?.[1])).toContain('ipcRenderer.sendSync("tandem:cloudflare-policy-sync", _url)');
  });
});
