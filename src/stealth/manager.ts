import type { Session } from 'electron';
import crypto from 'crypto';
import type { RequestDispatcher } from '../network/dispatcher';
import { createLogger } from '../utils/logger';
import { isGoogleAuthUrl } from '../utils/security';

const log = createLogger('StealthManager');

/**
 * StealthManager — Makes Tandem Browser look like a regular human browser.
 * 
 * Anti-detection measures:
 * 1. Realistic User-Agent (matches real Chrome)
 * 2. Remove automation indicators
 * 3. Consistent fingerprinting
 * 4. Canvas/WebGL/Audio/Font/Timing fingerprint protection (Phase 5)
 * 5. Realistic request headers
 */
export class StealthManager {
  private session: Session;
  private partitionSeed: string;
  private readonly originalUserAgent: string;
  private readonly USER_AGENT: string;
  private readonly chromeMajor: string;

  constructor(session: Session, partition: string = 'persist:tandem') {
    this.session = session;
    // Store the real Electron UA before overwriting — needed for Google auth
    this.originalUserAgent = session.getUserAgent();
    // Generate a deterministic seed from the partition name for consistent noise per session
    this.partitionSeed = crypto.createHash('sha256').update(partition).digest('hex');

    // Build UA from Electron's actual Chromium version to avoid detection mismatches
    const chromeVersion = process.versions.chrome;
    this.chromeMajor = chromeVersion.split('.')[0];
    this.USER_AGENT =
      `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion} Safari/537.36`;
  }

  /** Apply stealth patches to the Electron session (User-Agent override). */
  async apply(): Promise<void> {
    // Set realistic User-Agent globally (LinkedIn etc. block "Electron" UA)
    // Google auth is excluded via the onBeforeSendHeaders handler in registerWith()
    this.session.setUserAgent(this.USER_AGENT);

    log.info('🛡️ Stealth patches applied (advanced fingerprint protection active)');
  }

  /** Register header modification as a dispatcher consumer */
  registerWith(dispatcher: RequestDispatcher): void {
    dispatcher.registerBeforeSendHeaders({
      name: 'StealthManager',
      priority: 10,
      handler: (_details, headers) => {
        // For Google auth domains: restore real Electron UA (Google blocks fake Chrome UA)
        // but keep everything else — TotalRecall V2 works with default Electron UA on Google
        const url = _details.url || '';
        if (isGoogleAuthUrl(url)) {
          // Restore the real Electron UA — deleting the header doesn't work because
          // session.setUserAgent() bakes the Chrome UA into Chromium's default headers.
          // We must overwrite it with the original Electron UA.
          headers['User-Agent'] = this.originalUserAgent;
          // Also remove fake Sec-CH-UA headers — session.setUserAgent() causes Chromium
          // to auto-send Chrome-like client hints at the session level. If we let the
          // real Electron UA through but keep Chrome Sec-CH-UA, Google detects the
          // mismatch and flags the session (CookieMismatch).
          delete headers['Sec-CH-UA'];
          delete headers['Sec-CH-UA-Mobile'];
          delete headers['Sec-CH-UA-Platform'];
          delete headers['Sec-CH-UA-Full-Version-List'];
          // Catch any other Sec-CH-UA-* variants (e.g. Sec-CH-UA-Arch, Sec-CH-UA-Model)
          for (const key of Object.keys(headers)) {
            if (key.toLowerCase().startsWith('sec-ch-ua')) {
              delete headers[key];
            }
          }
          return headers;
        }

        // Remove Electron/automation giveaways
        delete headers['X-Electron'];

        // Remove any header containing "Electron"
        for (const key of Object.keys(headers)) {
          if (typeof headers[key] === 'string' && headers[key].includes('Electron')) {
            headers[key] = headers[key].replace(/Electron\/[\d.]+\s*/g, '');
          }
        }

        // Ensure realistic Accept-Language
        if (!headers['Accept-Language']) {
          headers['Accept-Language'] = 'nl-BE,nl;q=0.9,en-US;q=0.8,en;q=0.7';
        }

        // Ensure Sec-CH-UA matches our UA (Google checks these for login)
        headers['Sec-CH-UA'] = `"Google Chrome";v="${this.chromeMajor}", "Chromium";v="${this.chromeMajor}", "Not_A Brand";v="24"`;
        headers['Sec-CH-UA-Mobile'] = '?0';
        headers['Sec-CH-UA-Platform'] = '"macOS"';
        headers['Sec-CH-UA-Full-Version-List'] = `"Google Chrome";v="${process.versions.chrome}", "Chromium";v="${process.versions.chrome}", "Not_A Brand";v="24.0.0.0"`;

        return headers;
      }
    });
  }

  /** Get the partition seed for fingerprint noise */
  getPartitionSeed(): string {
    return this.partitionSeed;
  }

  /**
   * JavaScript to inject into pages to hide automation indicators.
   * Phase 5: includes canvas, WebGL, audio, font, and timing fingerprint protection.
   * @param seed - Deterministic seed for consistent noise per session
   */
  static getStealthScript(seed: string = 'tandem-default-seed', chromeVersion: string = process.versions.chrome): string {
    const chromeMajor = chromeVersion.split('.')[0];
    return `
      // ═══ All stealth patches in one IIFE — no globals leaked to window ═══
      (function() {
        // Seeded PRNG (mulberry32) — consistent noise per session
        var __seed = 0;
        var seedStr = '${seed}';
        for (var i = 0; i < seedStr.length; i++) {
          __seed = ((__seed << 5) - __seed + seedStr.charCodeAt(i)) | 0;
        }
        function mulberry32(s) {
          return function() {
            s |= 0; s = s + 0x6D2B79F5 | 0;
            var t = Math.imul(s ^ s >>> 15, 1 | s);
            t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
            return ((t ^ t >>> 14) >>> 0) / 4294967296;
          };
        }
        var __rng = mulberry32(__seed);
        // Noise helper: returns integer in [-range, +range] — stays in closure, NOT on window
        function __noise(range) { return Math.floor(__rng() * (range * 2 + 1)) - range; }

      // ═══ 5.1 Canvas Fingerprint Protection ═══
      (function() {
        var origToDataURL = HTMLCanvasElement.prototype.toDataURL;
        var origToBlob = HTMLCanvasElement.prototype.toBlob;

        function addCanvasNoise(canvas) {
          try {
            var ctx = canvas.getContext('2d');
            if (!ctx) return;
            var w = canvas.width, h = canvas.height;
            if (w === 0 || h === 0 || w > 1024 || h > 1024) return; // skip huge canvases
            var imageData = ctx.getImageData(0, 0, w, h);
            var data = imageData.data;
            // Add subtle noise (±2 per channel) using seeded PRNG
            for (var i = 0; i < data.length; i += 4) {
              data[i]     = Math.max(0, Math.min(255, data[i]     + __noise(2)));
              data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + __noise(2)));
              data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + __noise(2)));
              // Alpha unchanged
            }
            ctx.putImageData(imageData, 0, 0);
          } catch(e) { /* cross-origin or other issues — silently skip */ }
        }

        HTMLCanvasElement.prototype.toDataURL = function() {
          addCanvasNoise(this);
          return origToDataURL.apply(this, arguments);
        };

        HTMLCanvasElement.prototype.toBlob = function() {
          addCanvasNoise(this);
          return origToBlob.apply(this, arguments);
        };
      })();

      // ═══ 5.2 WebGL Fingerprint Masking ═══
      (function() {
        var getParamOrig = WebGLRenderingContext.prototype.getParameter;
        var debugExt = null;

        WebGLRenderingContext.prototype.getParameter = function(param) {
          // UNMASKED_VENDOR_WEBGL (0x9245) and UNMASKED_RENDERER_WEBGL (0x9246)
          // These come from the WEBGL_debug_renderer_info extension
          if (param === 0x9245) return 'Google Inc. (Apple)';
          if (param === 0x9246) return 'ANGLE (Apple, Apple M1, OpenGL 4.1)';
          return getParamOrig.call(this, param);
        };

        // Also patch WebGL2 if available
        if (typeof WebGL2RenderingContext !== 'undefined') {
          var getParam2Orig = WebGL2RenderingContext.prototype.getParameter;
          WebGL2RenderingContext.prototype.getParameter = function(param) {
            if (param === 0x9245) return 'Google Inc. (Apple)';
            if (param === 0x9246) return 'ANGLE (Apple, Apple M1, OpenGL 4.1)';
            return getParam2Orig.call(this, param);
          };
        }

        // Override getSupportedExtensions to return standard Chrome set
        var stdExtensions = [
          'ANGLE_instanced_arrays', 'EXT_blend_minmax', 'EXT_color_buffer_half_float',
          'EXT_disjoint_timer_query', 'EXT_float_blend', 'EXT_frag_depth',
          'EXT_shader_texture_lod', 'EXT_texture_compression_bptc',
          'EXT_texture_compression_rgtc', 'EXT_texture_filter_anisotropic',
          'EXT_sRGB', 'KHR_parallel_shader_compile', 'OES_element_index_uint',
          'OES_fbo_render_mipmap', 'OES_standard_derivatives', 'OES_texture_float',
          'OES_texture_float_linear', 'OES_texture_half_float',
          'OES_texture_half_float_linear', 'OES_vertex_array_object',
          'WEBGL_color_buffer_float', 'WEBGL_compressed_texture_s3tc',
          'WEBGL_compressed_texture_s3tc_srgb', 'WEBGL_debug_renderer_info',
          'WEBGL_debug_shaders', 'WEBGL_depth_texture', 'WEBGL_draw_buffers',
          'WEBGL_lose_context', 'WEBGL_multi_draw'
        ];
        WebGLRenderingContext.prototype.getSupportedExtensions = function() { return stdExtensions.slice(); };
        if (typeof WebGL2RenderingContext !== 'undefined') {
          WebGL2RenderingContext.prototype.getSupportedExtensions = function() { return stdExtensions.slice(); };
        }
      })();

      // ═══ 5.3 Font Enumeration Protection ═══
      (function() {
        var standardFonts = [
          'Arial', 'Arial Black', 'Comic Sans MS', 'Courier', 'Courier New',
          'Georgia', 'Helvetica', 'Helvetica Neue', 'Impact', 'Lucida Console',
          'Lucida Grande', 'Lucida Sans Unicode', 'Monaco', 'Palatino', 'Palatino Linotype',
          'Tahoma', 'Times', 'Times New Roman', 'Trebuchet MS', 'Verdana',
          'Apple Color Emoji', 'Apple SD Gothic Neo', 'Avenir', 'Avenir Next',
          'Futura', 'Geneva', 'Gill Sans', 'Menlo', 'Optima', 'San Francisco',
          'SF Pro', 'SF Mono', 'System Font', '-apple-system', 'BlinkMacSystemFont'
        ];
        var standardFontsLower = standardFonts.map(function(f) { return f.toLowerCase(); });

        if (document.fonts && document.fonts.check) {
          var origCheck = document.fonts.check.bind(document.fonts);
          document.fonts.check = function(font, text) {
            // Extract font family from CSS font shorthand — last part after size
            var parts = font.split(/\\s+/);
            var family = parts.length > 1 ? parts.slice(1).join(' ') : parts[0];
            family = family.replace(/['"]/g, '').trim();
            // Allow standard fonts, block exotic ones
            if (standardFontsLower.indexOf(family.toLowerCase()) === -1) {
              return false;
            }
            return origCheck(font, text);
          };
        }
      })();

      // ═══ 5.4 Audio Fingerprint Protection ═══
      (function() {
        var OrigAudioContext = window.AudioContext || window.webkitAudioContext;
        var OrigOfflineAudioContext = window.OfflineAudioContext;

        if (OrigAudioContext) {
          var origCreateOscillator = OrigAudioContext.prototype.createOscillator;
          var origCreateDynamicsCompressor = OrigAudioContext.prototype.createDynamicsCompressor;

          // Patch getFloatFrequencyData / getFloatTimeDomainData to add noise
          var origGetFloatFreq = AnalyserNode.prototype.getFloatFrequencyData;
          AnalyserNode.prototype.getFloatFrequencyData = function(array) {
            origGetFloatFreq.call(this, array);
            for (var i = 0; i < array.length; i++) {
              array[i] += __noise(1) * 0.001;
            }
          };

          var origGetFloatTime = AnalyserNode.prototype.getFloatTimeDomainData;
          AnalyserNode.prototype.getFloatTimeDomainData = function(array) {
            origGetFloatTime.call(this, array);
            for (var i = 0; i < array.length; i++) {
              array[i] += __noise(1) * 0.0001;
            }
          };
        }

        // Patch OfflineAudioContext.startRendering to add subtle noise to rendered buffer
        if (OrigOfflineAudioContext) {
          var origStartRendering = OrigOfflineAudioContext.prototype.startRendering;
          OrigOfflineAudioContext.prototype.startRendering = function() {
            return origStartRendering.call(this).then(function(buffer) {
              try {
                for (var ch = 0; ch < buffer.numberOfChannels; ch++) {
                  var data = buffer.getChannelData(ch);
                  for (var i = 0; i < data.length; i++) {
                    data[i] += __noise(1) * 0.0001;
                  }
                }
              } catch(e) { /* ignore */ }
              return buffer;
            });
          };
        }
      })();

      // ═══ 5.5 Timing Protection ═══
      (function() {
        // Reduce performance.now() precision to 100μs (like Firefox)
        var origPerfNow = performance.now.bind(performance);
        performance.now = function() {
          return Math.round(origPerfNow() * 10) / 10; // 100μs precision
        };

        // Add small jitter to Date.now() (±1ms)
        var origDateNow = Date.now;
        Date.now = function() {
          return origDateNow() + __noise(1);
        };
      })();

      // Hide webdriver flag
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
      
      // Hide Electron from plugins
      Object.defineProperty(navigator, 'plugins', {
        get: () => [
          { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer' },
          { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai' },
          { name: 'Native Client', filename: 'internal-nacl-plugin' }
        ]
      });

      // Realistic languages
      Object.defineProperty(navigator, 'languages', {
        get: () => ['nl-BE', 'nl', 'en-US', 'en']
      });

      // Chrome runtime — complete mock matching real Chrome
      if (!window.chrome) {
        window.chrome = {};
      }
      if (!window.chrome.runtime) {
        window.chrome.runtime = {
          OnInstalledReason: { CHROME_UPDATE: 'chrome_update', INSTALL: 'install', SHARED_MODULE_UPDATE: 'shared_module_update', UPDATE: 'update' },
          OnRestartRequiredReason: { APP_UPDATE: 'app_update', OS_UPDATE: 'os_update', PERIODIC: 'periodic' },
          PlatformArch: { ARM: 'arm', ARM64: 'arm64', MIPS: 'mips', MIPS64: 'mips64', X86_32: 'x86-32', X86_64: 'x86-64' },
          PlatformNaclArch: { ARM: 'arm', MIPS: 'mips', MIPS64: 'mips64', X86_32: 'x86-32', X86_64: 'x86-64' },
          PlatformOs: { ANDROID: 'android', CROS: 'cros', LINUX: 'linux', MAC: 'mac', OPENBSD: 'openbsd', WIN: 'win' },
          RequestUpdateCheckStatus: { NO_UPDATE: 'no_update', THROTTLED: 'throttled', UPDATE_AVAILABLE: 'update_available' },
          connect: function() { return { onDisconnect: { addListener: function() {} }, onMessage: { addListener: function() {} }, postMessage: function() {}, disconnect: function() {} }; },
          sendMessage: function() {},
          id: undefined,
        };
      }
      if (!window.chrome.loadTimes) {
        window.chrome.loadTimes = function() {
          return { commitLoadTime: Date.now() / 1000, connectionInfo: 'h2', finishDocumentLoadTime: Date.now() / 1000, finishLoadTime: Date.now() / 1000, firstPaintAfterLoadTime: 0, firstPaintTime: Date.now() / 1000, navigationType: 'Other', npnNegotiatedProtocol: 'h2', requestTime: Date.now() / 1000 - 0.3, startLoadTime: Date.now() / 1000 - 0.3, wasAlternateProtocolAvailable: false, wasFetchedViaSpdy: true, wasNpnNegotiated: true };
        };
      }
      if (!window.chrome.csi) {
        window.chrome.csi = function() {
          return { onloadT: Date.now(), pageT: Date.now() / 1000, startE: Date.now(), tran: 15 };
        };
      }
      if (!window.chrome.app) {
        window.chrome.app = { isInstalled: false, getDetails: function() { return null; }, getIsInstalled: function() { return false; }, installState: function() { return 'not_installed'; }, runningState: function() { return 'cannot_run'; }, InstallState: { DISABLED: 'disabled', INSTALLED: 'installed', NOT_INSTALLED: 'not_installed' }, RunningState: { CANNOT_RUN: 'cannot_run', READY_TO_RUN: 'ready_to_run', RUNNING: 'running' } };
      }

      // Remove Electron giveaways from window
      try { delete window.process; } catch(e) {}
      try { delete window.require; } catch(e) {}
      try { delete window.module; } catch(e) {}
      try { delete window.exports; } catch(e) {}
      try { delete window.Buffer; } catch(e) {}
      try { delete window.__dirname; } catch(e) {}
      try { delete window.__filename; } catch(e) {}
      // Ensure process is truly gone
      Object.defineProperty(window, 'process', { get: () => undefined, configurable: true });

      // navigator.userAgentData — ALWAYS override to match real Chrome
      // Electron exposes its own brands (Chromium/130, Not?A_Brand/99) which Google detects
      {
        var __chromeMajor = '${chromeMajor}';
        var __chromeVersion = '${chromeVersion}';
        Object.defineProperty(navigator, 'userAgentData', {
          get: () => ({
            brands: [
              { brand: 'Google Chrome', version: __chromeMajor },
              { brand: 'Chromium', version: __chromeMajor },
              { brand: 'Not_A Brand', version: '24' },
            ],
            mobile: false,
            platform: 'macOS',
            getHighEntropyValues: (hints) => Promise.resolve({
              brands: [
                { brand: 'Google Chrome', version: __chromeMajor },
                { brand: 'Chromium', version: __chromeMajor },
                { brand: 'Not_A Brand', version: '24' },
              ],
              mobile: false,
              platform: 'macOS',
              platformVersion: '15.3.0',
              architecture: 'arm',
              bitness: '64',
              model: '',
              uaFullVersion: __chromeVersion,
              fullVersionList: [
                { brand: 'Google Chrome', version: __chromeVersion },
                { brand: 'Chromium', version: __chromeVersion },
                { brand: 'Not_A Brand', version: '24.0.0.0' },
              ],
            }),
            toJSON: function() {
              return { brands: this.brands, mobile: this.mobile, platform: this.platform };
            },
          }),
          configurable: true,
        });
      }

      // Permissions API
      const originalQuery = window.navigator.permissions?.query;
      if (originalQuery) {
        window.navigator.permissions.query = (parameters) => (
          parameters.name === 'notifications' ?
            Promise.resolve({ state: Notification.permission }) :
            originalQuery(parameters)
        );
      }

      // Ensure window.Notification exists
      if (!window.Notification) {
        window.Notification = { permission: 'default' };
      }

      // ConnectionType for Network Information API
      if (navigator.connection) {
        // Already exists, fine
      }

      })(); // end of stealth IIFE — __noise and __rng are NOT exposed on window
    `;
  }
}
