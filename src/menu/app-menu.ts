import type { BrowserWindow} from 'electron';
import { app, Menu, BrowserWindow as BW, shell } from 'electron';
import path from 'path';
import type { TabManager } from '../tabs/manager';
import type { PanelManager } from '../panel/manager';
import type { DrawOverlayManager } from '../draw/overlay';
import type { VoiceManager } from '../voice/recognition';
import type { PiPManager } from '../pip/manager';
import type { ConfigManager } from '../config/manager';
import type { AudioCaptureManager } from '../audio/capture';
import { createLogger } from '../utils/logger';

const log = createLogger('AppMenu');

export interface MenuDeps {
  mainWindow: BrowserWindow | null;
  tabManager: TabManager | null;
  panelManager: PanelManager | null;
  drawManager: DrawOverlayManager | null;
  voiceManager: VoiceManager | null;
  pipManager: PiPManager | null;
  configManager: ConfigManager | null;
  audioCaptureManager: AudioCaptureManager | null;
}

export function buildAppMenu(deps: MenuDeps): void {
  const send = (action: string) => deps.mainWindow?.webContents.send('shortcut', action);

  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: app.name,
      submenu: [
        {
          label: 'About Tandem Browser',
          click: () => send('show-about'),
        },
        { type: 'separator' },
        { label: 'Settings', accelerator: 'CmdOrCtrl+,', click: () => send('open-settings') },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'File',
      submenu: [
        { label: 'New Tab', accelerator: 'CmdOrCtrl+T', click: () => send('new-tab') },
        { label: 'Close Tab', accelerator: 'CmdOrCtrl+W', click: () => send('close-tab') },
        { label: 'Reopen Closed Tab', accelerator: 'CmdOrCtrl+Shift+T', click: () => {
          void deps.tabManager?.reopenClosedTab();
        }},
        { type: 'separator' },
        { label: 'Bookmark Page', accelerator: 'CmdOrCtrl+D', click: () => send('bookmark-page') },
        { label: 'Toggle Bookmarks Bar', accelerator: 'CmdOrCtrl+Shift+B', click: () => send('toggle-bookmarks-bar') },
        { label: 'Bookmark Manager', click: () => send('open-bookmarks') },
        { label: 'Find in Page', accelerator: 'CmdOrCtrl+F', click: () => send('find-in-page') },
        { label: 'History', accelerator: 'CmdOrCtrl+Y', click: () => send('open-history') },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { label: 'Zoom In', accelerator: 'CmdOrCtrl+=', click: () => send('zoom-in') },
        { label: 'Zoom Out', accelerator: 'CmdOrCtrl+-', click: () => send('zoom-out') },
        { label: 'Reset Zoom', accelerator: 'CmdOrCtrl+0', click: () => send('zoom-reset') },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: deps.configManager?.getConfig().general.agentName || 'Wingman',
      submenu: [
        { label: 'Toggle Panel', accelerator: 'CmdOrCtrl+K', click: () => {
          deps.panelManager?.togglePanel();
        }},
        { label: 'Voice Input', accelerator: 'CmdOrCtrl+Shift+M', click: () => deps.voiceManager?.toggleVoice() },
        { label: 'PiP Mode', accelerator: 'CmdOrCtrl+Shift+P', click: () => deps.pipManager?.toggle() },
        { type: 'separator' },
        { label: 'Draw Mode', accelerator: 'CmdOrCtrl+Shift+D', click: () => deps.drawManager?.toggleDrawMode() },
        { label: 'Quick Screenshot', accelerator: 'CmdOrCtrl+Shift+S', click: () => send('quick-screenshot') },
        { type: 'separator' },
        { label: 'Record Tab Audio', accelerator: 'CmdOrCtrl+R', click: () => {
          if (deps.audioCaptureManager) {
            if (deps.audioCaptureManager.isRecording()) {
              deps.audioCaptureManager.stopRecording();
              deps.mainWindow?.webContents.send('audio-recording-status', { recording: false });
            } else {
              const activeTab = deps.tabManager?.getActiveTab();
              if (activeTab) {
                deps.audioCaptureManager.startRecording(activeTab.webContentsId).then(() => {
                  deps.mainWindow?.webContents.send('audio-recording-status', { recording: true });
                }).catch((e) => log.warn('Audio capture start failed:', e.message));
              }
            }
          }
        }},
        { label: 'ClaroNote Record', accelerator: 'CmdOrCtrl+Shift+C', click: () => send('claronote-record') },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        { type: 'separator' },
        { role: 'front' },
      ],
    },
    {
      label: 'Help',
      submenu: [
        { label: 'Keyboard Shortcuts', accelerator: 'CmdOrCtrl+Shift+/', click: () => send('show-shortcuts') },
        { type: 'separator' },
        { label: 'Show Onboarding', click: () => send('show-onboarding') },
      ],
    },
  ];

  // Add Cmd+1-9 tab switching (hidden menu items)
  const tabSwitchItems: Electron.MenuItemConstructorOptions[] = [];
  for (let i = 1; i <= 9; i++) {
    tabSwitchItems.push({
      label: `Tab ${i}`,
      accelerator: `CmdOrCtrl+${i}`,
      visible: false,
      click: () => send(`focus-tab-${i - 1}`),
    });
  }
  (template[1].submenu as Electron.MenuItemConstructorOptions[]).push(
    { type: 'separator' },
    ...tabSwitchItems
  );

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
