import { BrowserWindow, screen } from 'electron';
import path from 'path';

/**
 * PiPManager — Picture-in-Picture always-on-top mini window.
 * 
 * A small frameless BrowserWindow that stays on top of everything.
 * Communicates with the main app via localhost API (not IPC).
 * Loads shell/pip.html as its UI.
 */
export class PiPManager {
  private pipWindow: BrowserWindow | null = null;
  private visible = false;

  constructor() {}

  /** Toggle the PiP window on/off */
  toggle(forceState?: boolean): boolean {
    const shouldShow = forceState !== undefined ? forceState : !this.visible;

    if (shouldShow) {
      this.show();
    } else {
      this.hide();
    }

    return this.visible;
  }

  /** Show the PiP window (create if needed) */
  private show(): void {
    if (this.pipWindow && !this.pipWindow.isDestroyed()) {
      this.pipWindow.show();
      this.visible = true;
      return;
    }

    // Position: bottom-right of primary display
    const display = screen.getPrimaryDisplay();
    const { width, height } = display.workAreaSize;

    this.pipWindow = new BrowserWindow({
      width: 350,
      height: 250,
      x: width - 370,
      y: height - 270,
      alwaysOnTop: true,
      frame: false,
      transparent: false,
      resizable: false,
      skipTaskbar: true,
      hasShadow: true,
      backgroundColor: '#1a1a2e',
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    const pipHtmlPath = path.join(__dirname, '..', '..', 'shell', 'pip.html');
    void this.pipWindow.loadFile(pipHtmlPath);

    this.pipWindow.on('closed', () => {
      this.pipWindow = null;
      this.visible = false;
    });

    this.visible = true;
  }

  /** Hide the PiP window */
  private hide(): void {
    if (this.pipWindow && !this.pipWindow.isDestroyed()) {
      this.pipWindow.hide();
    }
    this.visible = false;
  }

  /** Get current PiP status */
  getStatus(): { visible: boolean } {
    return {
      visible: this.visible && !!this.pipWindow && !this.pipWindow.isDestroyed(),
    };
  }

  /** Destroy the PiP window */
  destroy(): void {
    if (this.pipWindow && !this.pipWindow.isDestroyed()) {
      this.pipWindow.close();
    }
    this.pipWindow = null;
    this.visible = false;
  }
}
