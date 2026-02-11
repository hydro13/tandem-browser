import { app, BrowserWindow, session, ipcMain, Notification } from 'electron';
import path from 'path';
import { TandemAPI } from './api/server';
import { StealthManager } from './stealth/manager';

const IS_DEV = process.argv.includes('--dev');
const API_PORT = 8765;

let mainWindow: BrowserWindow | null = null;
let api: TandemAPI | null = null;

async function createWindow(): Promise<BrowserWindow> {
  // Persistent session — cookies survive restart
  const partition = 'persist:tandem';
  const ses = session.fromPartition(partition);

  // Apply stealth patches to the session
  const stealth = new StealthManager(ses);
  await stealth.apply();

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    title: 'Tandem Browser',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      partition,
      webviewTag: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Load the browser shell UI
  mainWindow.loadFile(path.join(__dirname, '..', 'shell', 'index.html'));

  if (IS_DEV) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  return mainWindow;
}

async function startAPI(win: BrowserWindow): Promise<void> {
  api = new TandemAPI(win, API_PORT);
  await api.start();
  console.log(`🧠 Tandem API running on http://localhost:${API_PORT}`);
}

// Copilot alert — notify Robin when Kees needs help
export function copilotAlert(title: string, body: string): void {
  if (Notification.isSupported()) {
    new Notification({ title: `🧀 ${title}`, body }).show();
  }
  // Also send to renderer for in-browser notification
  mainWindow?.webContents.send('copilot-alert', { title, body });
}

app.whenReady().then(async () => {
  const win = await createWindow();
  await startAPI(win);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow().then(w => startAPI(w));
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
