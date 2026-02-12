import { BrowserWindow, app, webContents, clipboard, nativeImage } from 'electron';
import { execFile } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { ConfigManager } from '../config/manager';

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
  private drawMode = false;
  private screenshotDir: string;
  private picturesDir: string;
  private lastScreenshotPath: string | null = null;

  constructor(win: BrowserWindow, configManager?: ConfigManager) {
    this.win = win;
    this.configManager = configManager ?? null;
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
    this.win.webContents.send('draw-mode', { enabled: this.drawMode });
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

      // Step 4: Notify renderer of new screenshot (annotations blijven staan voor verdere bewerking)
      this.win.webContents.send('screenshot-taken', { path: filePath, filename });

      return { ok: true, path: filePath };
    } catch (e: any) {
      return { ok: false, error: e.message };
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

  /**
   * Full screenshot pipeline: capture + composite + clipboard + file save + panel notify.
   * Called from IPC 'snap-for-kees'.
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

      // Step 3: Create buffer and nativeImage
      const buffer = Buffer.from(compositeBase64, 'base64');
      const image = nativeImage.createFromBuffer(buffer);

      // Step 4: Copy to clipboard
      clipboard.writeImage(image);

      // Step 5: Save to ~/Pictures/Tandem/
      const slug = this.urlToSlug(currentUrl);
      const timestamp = Date.now();
      const filename = `tandem-${slug}-${timestamp}.png`;
      const picturesPath = path.join(this.picturesDir, filename);
      fs.writeFileSync(picturesPath, buffer);

      // Step 6: Also save to app screenshots dir
      const appPath = path.join(this.screenshotDir, filename);
      fs.writeFileSync(appPath, buffer);
      this.lastScreenshotPath = appPath;

      // Step 7: Import to Apple Photos (async, non-blocking)
      this.importToApplePhotos(picturesPath);

      // Step 8: Notify renderer of new screenshot (annotations blijven staan)
      this.win.webContents.send('screenshot-taken', {
        path: picturesPath,
        appPath,
        filename,
        base64: compositeBase64,
      });

      return { ok: true, path: picturesPath };
    } catch (e: any) {
      return { ok: false, error: e.message };
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
      const image = nativeImage.createFromBuffer(buffer);

      // Copy to clipboard
      clipboard.writeImage(image);

      // Save to ~/Pictures/Tandem/
      const slug = this.urlToSlug(currentUrl);
      const timestamp = Date.now();
      const filename = `tandem-${slug}-${timestamp}.png`;
      const picturesPath = path.join(this.picturesDir, filename);
      fs.writeFileSync(picturesPath, buffer);

      // Also save to app screenshots dir
      const appPath = path.join(this.screenshotDir, filename);
      fs.writeFileSync(appPath, buffer);
      this.lastScreenshotPath = appPath;

      // Import to Apple Photos (async, non-blocking)
      this.importToApplePhotos(picturesPath);

      // Notify renderer
      const base64 = buffer.toString('base64');
      this.win.webContents.send('screenshot-taken', {
        path: picturesPath,
        appPath,
        filename,
        base64,
      });

      return { ok: true, path: picturesPath };
    } catch (e: any) {
      return { ok: false, error: e.message };
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

    const script = `
      tell application "Photos"
        with timeout of 30 seconds
          import POSIX file "${filePath.replace(/"/g, '\\"')}"
        end timeout
      end tell
    `;

    execFile('osascript', ['-e', script], (error) => {
      if (error) {
        console.warn('📸 Apple Photos import failed:', error.message);
      } else {
        console.log('📸 Screenshot imported to Apple Photos:', path.basename(filePath));
      }
    });
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
