import type { BrowserWindow} from 'electron';
import { app, webContents, clipboard, nativeImage } from 'electron';
import { execFile, execFileSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import type { ConfigManager } from '../config/manager';
import type { GooglePhotosManager } from '../integrations/google-photos';
import { createLogger } from '../utils/logger';
import { IpcChannels } from '../shared/ipc-channels';

const log = createLogger('DrawOverlay');

/**
 * DrawOverlayManager — Manages the transparent annotation canvas overlay.
 * 
 * CRITICAL: The canvas overlay exists in the Electron SHELL layer,
 * NOT inside the webview. Websites cannot detect it.
 * 
 * Screenshots are composited: webview capture + canvas annotations → PNG.
 */
export class DrawOverlayManager {
  private win: BrowserWindow;
  private configManager: ConfigManager | null;
  private googlePhotosManager: GooglePhotosManager | null;
  private drawMode = false;
  private screenshotDir: string;
  private picturesDir: string;
  private lastScreenshotPath: string | null = null;

  constructor(win: BrowserWindow, configManager?: ConfigManager, googlePhotosManager?: GooglePhotosManager) {
    this.win = win;
    this.configManager = configManager ?? null;
    this.googlePhotosManager = googlePhotosManager ?? null;
    this.screenshotDir = path.join(app.getPath('userData'), 'screenshots');
    this.picturesDir = path.join(os.homedir(), 'Pictures', 'Tandem');
    if (!fs.existsSync(this.screenshotDir)) {
      fs.mkdirSync(this.screenshotDir, { recursive: true });
    }
    if (!fs.existsSync(this.picturesDir)) {
      fs.mkdirSync(this.picturesDir, { recursive: true });
    }
  }

  /** Toggle draw mode on/off */
  toggleDrawMode(enabled?: boolean): boolean {
    this.drawMode = enabled !== undefined ? enabled : !this.drawMode;
    this.win.webContents.send(IpcChannels.DRAW_MODE, { enabled: this.drawMode });
    return this.drawMode;
  }

  /** Is draw mode active? */
  isDrawMode(): boolean {
    return this.drawMode;
  }

  /**
   * Capture annotated screenshot.
   * 1. Capture webview via webContents.capturePage()
   * 2. Get canvas annotation data from renderer
   * 3. Composite them together (done in renderer with offscreen canvas)
   * 4. Save to screenshots dir
   */
  async captureAnnotated(activeWebContentsId: number | null): Promise<{ ok: boolean; path?: string; error?: string }> {
    try {
      if (!activeWebContentsId) {
        return { ok: false, error: 'No active tab' };
      }

      const wc = webContents.fromId(activeWebContentsId);
      if (!wc) {
        return { ok: false, error: 'WebContents not found' };
      }

      // Step 1: Capture webview
      const nativeImage = await wc.capturePage();
      const webviewBase64 = nativeImage.toPNG().toString('base64');

      // Step 2: Ask renderer to composite (overlay canvas + webview screenshot)
      const compositeBase64: string = await this.win.webContents.executeJavaScript(`
        window.__tandemDraw.compositeScreenshot(${JSON.stringify(webviewBase64)})
      `);

      // Step 3: Save to file
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `tandem-${timestamp}.png`;
      const filePath = path.join(this.screenshotDir, filename);
      const buffer = Buffer.from(compositeBase64, 'base64');
      fs.writeFileSync(filePath, buffer);

      this.lastScreenshotPath = filePath;

      // Step 4: Notify renderer of new screenshot (annotations remain for further editing)
      this.win.webContents.send(IpcChannels.SCREENSHOT_TAKEN, { path: filePath, filename });

      return { ok: true, path: filePath };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  /**
   * URL to slug for filenames.
   */
  private urlToSlug(url: string): string {
    try {
      const u = new URL(url);
      return (u.hostname + u.pathname)
        .replace(/[^a-zA-Z0-9]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .substring(0, 60);
    } catch {
      return 'unknown';
    }
  }

  private persistScreenshotBuffer(
    buffer: Buffer,
    currentUrl: string,
  ): { picturesPath: string; appPath: string; filename: string; base64: string } {
    const image = nativeImage.createFromBuffer(buffer);
    clipboard.writeImage(image);

    const slug = this.urlToSlug(currentUrl);
    const timestamp = Date.now();
    const filename = `tandem-${slug}-${timestamp}.png`;
    const picturesPath = path.join(this.picturesDir, filename);
    fs.writeFileSync(picturesPath, buffer);

    const appPath = path.join(this.screenshotDir, filename);
    fs.writeFileSync(appPath, buffer);
    this.lastScreenshotPath = appPath;

    this.importToApplePhotos(picturesPath);
    void this.importToGooglePhotos(picturesPath);

    return {
      picturesPath,
      appPath,
      filename,
      base64: buffer.toString('base64'),
    };
  }

  /**
   * Full screenshot pipeline: capture + composite + clipboard + file save + panel notify.
   * Called from IPC 'snap-for-wingman'.
   */
  async captureAnnotatedFull(activeWebContentsId: number, currentUrl: string): Promise<{ ok: boolean; path?: string; error?: string }> {
    try {
      const wc = webContents.fromId(activeWebContentsId);
      if (!wc) {
        return { ok: false, error: 'WebContents not found' };
      }

      // Step 1: Capture webview
      const nativeImg = await wc.capturePage();
      const webviewBase64 = nativeImg.toPNG().toString('base64');

      // Step 2: Composite with canvas overlay in renderer
      const compositeBase64: string = await this.win.webContents.executeJavaScript(`
        window.__tandemDraw.compositeScreenshot(${JSON.stringify(webviewBase64)})
      `);

      // Step 3: Persist + clipboard + integrations
      const buffer = Buffer.from(compositeBase64, 'base64');
      const { picturesPath, appPath, filename } = this.persistScreenshotBuffer(buffer, currentUrl);

      // Step 4: Notify renderer of new screenshot (annotations remain)
      this.win.webContents.send(IpcChannels.SCREENSHOT_TAKEN, {
        path: picturesPath,
        appPath,
        filename,
        base64: compositeBase64,
      });

      return { ok: true, path: picturesPath };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  /**
   * Quick screenshot: capture webview ONLY (no draw overlay), copy to clipboard + save.
   * Works independently of draw mode.
   */
  async captureQuickScreenshot(activeWebContentsId: number, currentUrl: string): Promise<{ ok: boolean; path?: string; error?: string }> {
    try {
      const wc = webContents.fromId(activeWebContentsId);
      if (!wc) {
        return { ok: false, error: 'WebContents not found' };
      }

      // Capture webview only
      const nativeImg = await wc.capturePage();
      const buffer = nativeImg.toPNG();
      const { picturesPath, appPath, filename, base64 } = this.persistScreenshotBuffer(buffer, currentUrl);

      // Notify renderer
      this.win.webContents.send(IpcChannels.SCREENSHOT_TAKEN, {
        path: picturesPath,
        appPath,
        filename,
        base64,
      });

      return { ok: true, path: picturesPath };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  async captureApplicationScreenshot(currentUrl: string): Promise<{ ok: boolean; path?: string; error?: string }> {
    try {
      // Use macOS screencapture for correct color profile handling.
      // Electron's capturePage().toPNG() doesn't embed the display color profile,
      // causing color shifts on P3 displays when the file is opened.
      if (process.platform === 'darwin' && typeof this.win.getMediaSourceId === 'function') {
        const mediaId = this.win.getMediaSourceId(); // "window:<CGWindowID>:0"
        const cgWindowId = mediaId.split(':')[1];
        const tmpPath = path.join(os.tmpdir(), `tandem-appcap-${Date.now()}.png`);
        try {
          execFileSync('screencapture', ['-l' + cgWindowId, '-x', '-o', tmpPath]);
          const buffer = fs.readFileSync(tmpPath);
          if (fs.existsSync(tmpPath)) {
            fs.unlinkSync(tmpPath);
          }
          const { picturesPath, appPath, filename, base64 } = this.persistScreenshotBuffer(buffer, currentUrl);
          this.win.webContents.send(IpcChannels.SCREENSHOT_TAKEN, { path: picturesPath, appPath, filename, base64 });
          return { ok: true, path: picturesPath };
        } catch (scErr) {
          log.warn('screencapture failed, falling back to capturePage:', scErr);
          if (fs.existsSync(tmpPath)) {
            fs.unlinkSync(tmpPath);
          }
          // Fall through to Electron capture below
        }
      }

      // Fallback for non-macOS or if screencapture fails
      const nativeImg = await this.win.capturePage();
      const buffer = nativeImg.toPNG();
      const { picturesPath, appPath, filename, base64 } = this.persistScreenshotBuffer(buffer, currentUrl);

      this.win.webContents.send(IpcChannels.SCREENSHOT_TAKEN, {
        path: picturesPath,
        appPath,
        filename,
        base64,
      });

      return { ok: true, path: picturesPath };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  async captureRegionScreenshot(
    region: { x: number; y: number; width: number; height: number },
    currentUrl: string,
  ): Promise<{ ok: boolean; path?: string; error?: string }> {
    try {
      const [contentWidth, contentHeight] = this.win.getContentSize();
      const normalized = {
        x: Math.max(0, Math.min(Math.round(region.x), contentWidth)),
        y: Math.max(0, Math.min(Math.round(region.y), contentHeight)),
        width: Math.max(0, Math.round(region.width)),
        height: Math.max(0, Math.round(region.height)),
      };

      normalized.width = Math.min(normalized.width, contentWidth - normalized.x);
      normalized.height = Math.min(normalized.height, contentHeight - normalized.y);

      if (normalized.width < 4 || normalized.height < 4) {
        return { ok: false, error: 'Selected region is too small' };
      }

      const nativeImg = await this.win.capturePage(normalized);
      const buffer = nativeImg.toPNG();
      const { picturesPath, appPath, filename, base64 } = this.persistScreenshotBuffer(buffer, currentUrl);

      this.win.webContents.send(IpcChannels.SCREENSHOT_TAKEN, {
        path: picturesPath,
        appPath,
        filename,
        base64,
      });

      return { ok: true, path: picturesPath };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  /**
   * Import screenshot into Apple Photos via osascript.
   * Runs async in background — never blocks the screenshot flow.
   * Only runs on macOS when config.screenshots.applePhotos is true.
   */
  private importToApplePhotos(filePath: string): void {
    if (process.platform !== 'darwin') return;
    if (!this.configManager) return;

    const config = this.configManager.getConfig();
    if (!config.screenshots.applePhotos) return;

    // Request Photos permission if needed
    try {
      const { systemPreferences } = require('electron');
      const status = (systemPreferences.getMediaAccessStatus as (mediaType: string) => string)('photos');
      if (status === 'denied') {
        log.warn('📸 Apple Photos permission denied');
        return;
      }
    } catch { /* systemPreferences.photos may not exist on older Electron */ }

    const scriptLines = [
      'on run argv',
      '  set importPath to item 1 of argv',
      '  set theFile to POSIX file importPath',
      '  tell application "Photos"',
      '    activate',
      '    with timeout of 30 seconds',
      '      import theFile',
      '    end timeout',
      '  end tell',
      'end run',
    ];

    // Small delay to ensure file is fully flushed to disk before Photos tries to import it
    setTimeout(() => {
      execFile('osascript', [...scriptLines.flatMap(line => ['-e', line]), filePath], (error) => {
        if (error) {
          log.warn('📸 Apple Photos import failed:', error.message);
        } else {
          log.info('📸 Screenshot imported to Apple Photos:', path.basename(filePath));
        }
      });
    }, 300);
  }

  private async importToGooglePhotos(filePath: string): Promise<void> {
    if (!this.googlePhotosManager) return;

    try {
      await this.googlePhotosManager.uploadScreenshot(filePath);
    } catch (error) {
      log.warn('📸 Google Photos upload failed:', error instanceof Error ? error.message : String(error));
    }
  }

  /** Get last annotated screenshot as PNG buffer */
  getLastScreenshot(): Buffer | null {
    if (!this.lastScreenshotPath || !fs.existsSync(this.lastScreenshotPath)) {
      return null;
    }
    return fs.readFileSync(this.lastScreenshotPath);
  }

  /** Get screenshot directory */
  getScreenshotDir(): string {
    return this.screenshotDir;
  }

  /** List recent screenshots */
  listScreenshots(limit: number = 10): string[] {
    if (!fs.existsSync(this.screenshotDir)) return [];
    const files = fs.readdirSync(this.screenshotDir)
      .filter(f => f.endsWith('.png'))
      .sort()
      .reverse()
      .slice(0, limit);
    return files.map(f => path.join(this.screenshotDir, f));
  }
}
