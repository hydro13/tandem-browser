import type { BrowserWindow} from 'electron';
import { Notification } from 'electron';
import { IpcChannels } from '../shared/ipc-channels';

let mainWindow: BrowserWindow | null = null;

export function setMainWindow(win: BrowserWindow | null): void {
  mainWindow = win;
}

export function wingmanAlert(title: string, body: string): void {
  if (Notification.isSupported()) {
    new Notification({ title: `🧀 ${title}`, body }).show();
  }
  mainWindow?.webContents.send(IpcChannels.WINGMAN_ALERT, { title, body });
}
