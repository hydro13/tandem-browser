import { BrowserWindow, session } from 'electron';
import { StealthManager } from '../stealth/manager';
import { copilotAlert } from '../notifications/alert';
import { createLogger } from '../utils/logger';

const log = createLogger('HeadlessManager');

/** Page load timeout in milliseconds */
const PAGE_LOAD_TIMEOUT_MS = 30000;

/** Captcha detection check interval in milliseconds */
const CAPTCHA_CHECK_INTERVAL_MS = 3000;

/** Known captcha selectors to detect */
const CAPTCHA_SELECTORS = [
  'iframe[src*="recaptcha"]',
  'iframe[src*="hcaptcha"]',
  '.g-recaptcha',
  '.h-captcha',
  '#captcha',
  '[class*="captcha"]',
  'iframe[src*="challenges.cloudflare.com"]',
  '#challenge-running',
  '#challenge-form',
  '.cf-browser-verification',
];

export interface HeadlessStatus {
  active: boolean;
  url: string | null;
  title: string | null;
  loading: boolean;
  visible: boolean;
  captchaDetected: boolean;
}

/**
 * HeadlessManager — Background BrowserWindow for the AI copilot to browse solo.
 * 
 * Uses the same persist:tandem partition (cookies shared).
 * Same stealth patches as main window.
 * Auto-shows on captcha detection or errors.
 */
export class HeadlessManager {
  private window: BrowserWindow | null = null;
  private captchaDetected = false;
  private captchaCheckInterval: ReturnType<typeof setInterval> | null = null;

  /** Open a URL in the background window */
  async open(url: string): Promise<{ ok: boolean; error?: string }> {
    try {
      await this.ensureWindow();

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Page load timeout')), PAGE_LOAD_TIMEOUT_MS);

        this.window!.webContents.once('did-finish-load', () => {
          clearTimeout(timeout);
          this.startCaptchaCheck();
          resolve();
        });

        this.window!.webContents.once('did-fail-load', (_event, errorCode, errorDescription) => {
          clearTimeout(timeout);
          this.showWithAlert('Laad fout', `${url}: ${errorDescription} (${errorCode})`);
          reject(new Error(`Load failed: ${errorDescription}`));
        });

        this.window!.webContents.loadURL(url).catch((err) => {
          clearTimeout(timeout);
          log.error('Headless window loadURL failed:', err.message);
          reject(err);
        });
      });

      return { ok: true };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  /** Get page content from the background window */
  async getContent(): Promise<{ ok: boolean; content?: string; error?: string }> {
    if (!this.window || this.window.isDestroyed()) {
      return { ok: false, error: 'No headless window active' };
    }

    try {
      const content = await this.window.webContents.executeJavaScript(`
        (() => {
          const title = document.title;
          const url = window.location.href;
          const meta = document.querySelector('meta[name="description"]');
          const description = meta ? meta.getAttribute('content') : '';
          const body = document.body ? document.body.innerText.replace(/\\s+/g, ' ').trim() : '';
          return JSON.stringify({ title, url, description, text: body.substring(0, 10000) });
        })()
      `);
      return { ok: true, content: JSON.parse(content) };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  /** Get status of the headless window */
  getStatus(): HeadlessStatus {
    if (!this.window || this.window.isDestroyed()) {
      return { active: false, url: null, title: null, loading: false, visible: false, captchaDetected: false };
    }

    return {
      active: true,
      url: this.window.webContents.getURL(),
      title: this.window.webContents.getTitle(),
      loading: this.window.webContents.isLoading(),
      visible: this.window.isVisible(),
      captchaDetected: this.captchaDetected,
    };
  }

  /** Make the headless window visible (Robin takes over) */
  show(): boolean {
    if (!this.window || this.window.isDestroyed()) return false;
    this.window.show();
    this.window.focus();
    return true;
  }

  /** Hide the window again */
  hide(): boolean {
    if (!this.window || this.window.isDestroyed()) return false;
    this.window.hide();
    return true;
  }

  /** Close and destroy the headless window */
  close(): void {
    this.stopCaptchaCheck();
    if (this.window && !this.window.isDestroyed()) {
      this.window.close();
    }
    this.window = null;
    this.captchaDetected = false;
  }

  /** Create or reuse the hidden window */
  private async ensureWindow(): Promise<void> {
    if (this.window && !this.window.isDestroyed()) return;

    const partition = 'persist:tandem';
    const _ses = session.fromPartition(partition);

    this.window = new BrowserWindow({
      show: false,
      width: 1400,
      height: 900,
      title: '🤖 Copilot — Background',
      webPreferences: {
        partition,
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    // Apply stealth script on every page load
    this.window.webContents.on('did-finish-load', () => {
      if (this.window && !this.window.isDestroyed()) {
        this.window.webContents.executeJavaScript(StealthManager.getStealthScript())
          .catch((e) => log.warn('Headless stealth injection failed:', e.message));
      }
    });

    // Detect unexpected redirects (e.g. login walls)
    this.window.webContents.on('did-redirect-navigation', (_event, url) => {
      // If redirected to a login page, alert
      const loginPatterns = ['/login', '/signin', '/auth', '/sso', '/accounts/'];
      if (loginPatterns.some(p => url.toLowerCase().includes(p))) {
        this.showWithAlert('Login vereist', `Omgeleid naar: ${url}`);
      }
    });

    // Detect page crashes
    this.window.webContents.on('render-process-gone', (_event, details) => {
      this.showWithAlert('Pagina gecrasht', `Reden: ${details.reason}`);
    });

    this.captchaDetected = false;
  }

  /** Show window and send copilot alert */
  private showWithAlert(title: string, body: string): void {
    if (this.window && !this.window.isDestroyed()) {
      this.window.show();
      this.window.focus();
    }
    copilotAlert(title, body);
  }

  /** Start periodic captcha detection */
  private startCaptchaCheck(): void {
    this.stopCaptchaCheck();
    this.captchaCheckInterval = setInterval(() => {
      this.detectCaptcha().catch((e) => log.warn('Captcha detection failed:', e.message));
    }, CAPTCHA_CHECK_INTERVAL_MS);
  }

  private stopCaptchaCheck(): void {
    if (this.captchaCheckInterval) {
      clearInterval(this.captchaCheckInterval);
      this.captchaCheckInterval = null;
    }
  }

  /** Check for captcha elements on the page */
  private async detectCaptcha(): Promise<void> {
    if (!this.window || this.window.isDestroyed()) return;

    try {
      const selectorsJson = JSON.stringify(CAPTCHA_SELECTORS);
      const found: boolean = await this.window.webContents.executeJavaScript(`
        (() => {
          const selectors = ${selectorsJson};
          return selectors.some(s => document.querySelector(s) !== null);
        })()
      `);

      if (found && !this.captchaDetected) {
        this.captchaDetected = true;
        this.showWithAlert('Captcha detected!', 'The AI copilot needs help — please solve the captcha.');
      } else if (!found) {
        this.captchaDetected = false;
      }
    } catch (e) { log.warn('Captcha detection check failed (window may be destroyed):', e instanceof Error ? e.message : String(e)); }
  }

  /** Destroy everything */
  destroy(): void {
    this.close();
  }
}
