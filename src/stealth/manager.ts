import { Session } from 'electron';

/**
 * StealthManager — Makes Tandem Browser look like a regular human browser.
 * 
 * Anti-detection measures:
 * 1. Realistic User-Agent (matches real Chrome)
 * 2. Remove automation indicators
 * 3. Consistent fingerprinting
 * 4. Realistic request headers
 */
export class StealthManager {
  private session: Session;

  // Match latest stable Chrome on macOS
  private readonly USER_AGENT = 
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

  constructor(session: Session) {
    this.session = session;
  }

  async apply(): Promise<void> {
    // Set realistic User-Agent
    this.session.setUserAgent(this.USER_AGENT);

    // Modify headers to look natural
    this.session.webRequest.onBeforeSendHeaders((details, callback) => {
      const headers = { ...details.requestHeaders };
      
      // Remove Electron/automation giveaways
      delete headers['X-Electron'];
      
      // Ensure realistic Accept-Language
      if (!headers['Accept-Language']) {
        headers['Accept-Language'] = 'nl-BE,nl;q=0.9,en-US;q=0.8,en;q=0.7';
      }

      // Ensure Sec-CH-UA matches our UA
      headers['Sec-CH-UA'] = '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"';
      headers['Sec-CH-UA-Mobile'] = '?0';
      headers['Sec-CH-UA-Platform'] = '"macOS"';

      callback({ requestHeaders: headers });
    });

    console.log('🛡️ Stealth patches applied');
  }

  /**
   * JavaScript to inject into pages to hide automation indicators
   */
  static getStealthScript(): string {
    return `
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

      // Chrome runtime (sites check this)
      if (!window.chrome) {
        window.chrome = {
          runtime: { id: undefined },
          loadTimes: function() {},
          csi: function() {},
          app: { isInstalled: false, InstallState: { DISABLED: 'disabled', INSTALLED: 'installed', NOT_INSTALLED: 'not_installed' } }
        };
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
    `;
  }
}
