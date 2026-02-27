import type { BrowserWindow } from 'electron';
import { Notification } from 'electron';
import path from 'path';
import os from 'os';

/**
 * DownloadItem — Tracked download entry.
 */
export interface DownloadEntry {
  id: string;
  filename: string;
  url: string;
  savePath: string;
  totalBytes: number;
  receivedBytes: number;
  status: 'progressing' | 'completed' | 'cancelled' | 'interrupted';
  startTime: string;
  endTime?: string;
  mimeType: string;
}

/**
 * DownloadManager — Hooks into Electron's download system.
 * 
 * Tracks downloads, reports progress, sends notifications on completion.
 */
export class DownloadManager {
  private downloads: Map<string, DownloadEntry> = new Map();
  private downloadFolder: string;
  private idCounter = 0;

  constructor(downloadFolder?: string) {
    this.downloadFolder = downloadFolder || path.join(os.homedir(), 'Downloads');
  }

  /** Hook into an Electron session to intercept downloads */
  hookSession(ses: Electron.Session, win?: BrowserWindow): void {
    ses.on('will-download', (_event, item) => {
      const id = `dl-${Date.now()}-${++this.idCounter}`;

      const filename = item.getFilename();
      const savePath = path.join(this.downloadFolder, filename);
      item.setSavePath(savePath);

      const entry: DownloadEntry = {
        id,
        filename,
        url: item.getURL(),
        savePath,
        totalBytes: item.getTotalBytes(),
        receivedBytes: 0,
        status: 'progressing',
        startTime: new Date().toISOString(),
        mimeType: item.getMimeType(),
      };

      this.downloads.set(id, entry);

      item.on('updated', (_event, state) => {
        entry.receivedBytes = item.getReceivedBytes();
        entry.totalBytes = item.getTotalBytes();
        if (state === 'interrupted') {
          entry.status = 'interrupted';
        }
      });

      item.once('done', (_event, state) => {
        entry.receivedBytes = item.getReceivedBytes();
        entry.totalBytes = item.getTotalBytes();
        entry.endTime = new Date().toISOString();

        if (state === 'completed') {
          entry.status = 'completed';
          // Notification
          if (Notification.isSupported()) {
            new Notification({
              title: '📥 Download voltooid',
              body: filename,
            }).show();
          }
          // Also notify renderer
          if (win && !win.isDestroyed()) {
            win.webContents.send('download-complete', { id, filename, savePath });
          }
        } else if (state === 'cancelled') {
          entry.status = 'cancelled';
        } else {
          entry.status = 'interrupted';
        }
      });
    });
  }

  /** Get all downloads */
  list(): DownloadEntry[] {
    return Array.from(this.downloads.values()).reverse();
  }

  /** Get active (progressing) downloads */
  listActive(): DownloadEntry[] {
    return Array.from(this.downloads.values()).filter(d => d.status === 'progressing');
  }

  /** Set download folder */
  setDownloadFolder(folderPath: string): void {
    this.downloadFolder = folderPath;
  }

  /** Get download folder */
  getDownloadFolder(): string {
    return this.downloadFolder;
  }
}
