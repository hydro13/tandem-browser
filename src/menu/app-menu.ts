import type { BrowserWindow } from 'electron';
import { Menu } from 'electron';
import type { TabManager } from '../tabs/manager';
import type { PanelManager } from '../panel/manager';
import type { DrawOverlayManager } from '../draw/overlay';
import type { VoiceManager } from '../voice/recognition';
import type { PiPManager } from '../pip/manager';
import type { ConfigManager } from '../config/manager';
import type { VideoRecorderManager } from '../video/recorder';

export interface MenuDeps {
  mainWindow: BrowserWindow | null;
  tabManager: TabManager | null;
  panelManager: PanelManager | null;
  drawManager: DrawOverlayManager | null;
  voiceManager: VoiceManager | null;
  pipManager: PiPManager | null;
  configManager: ConfigManager | null;
  videoRecorderManager: VideoRecorderManager | null;
}

export function buildAppMenu(deps: MenuDeps): void {
  const send = (action: string) => deps.mainWindow?.webContents.send('shortcut', action);

  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'Tandem Browser',
      submenu: [
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
        { type: 'separator' },
        { label: 'Draw Mode', accelerator: 'CmdOrCtrl+Shift+D', click: () => deps.drawManager?.toggleDrawMode() },
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
      label: 'Help',
      submenu: [
        { label: 'Keyboard Shortcuts', accelerator: 'CmdOrCtrl+Shift+/', click: () => send('show-shortcuts') },
        { type: 'separator' },
        { label: 'Show Onboarding', click: () => send('show-onboarding') },
        { type: 'separator' },
        { label: 'About Tandem Browser', click: () => send('show-about') },
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
