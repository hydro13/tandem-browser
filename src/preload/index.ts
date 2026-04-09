import { contextBridge, ipcRenderer } from 'electron';
import { IpcChannels } from '../shared/ipc-channels';
import { createNavigationApi } from './navigation';
import { createContentApi } from './content';
import { createTabsApi } from './tabs';
import { createPanelApi } from './panel';
import { createDrawingApi } from './drawing';
import { createRecordingApi } from './recording';
import { createVoiceApi } from './voice';
import { createActivityApi } from './activity';
import { createBookmarksApi } from './bookmarks';
import { createExtensionsApi } from './extensions';
import { createWorkspacesApi } from './workspaces';
import { createWindowApi } from './window';

contextBridge.exposeInMainWorld('__TANDEM_TOKEN__', '');
contextBridge.exposeInMainWorld('__TANDEM_VERSION__', process.env.npm_package_version || '');

contextBridge.exposeInMainWorld('tandem', {
  getApiToken: () => ipcRenderer.invoke(IpcChannels.GET_API_TOKEN),
  ...createNavigationApi(),
  ...createContentApi(),
  ...createTabsApi(),
  ...createPanelApi(),
  ...createDrawingApi(),
  ...createRecordingApi(),
  ...createVoiceApi(),
  ...createActivityApi(),
  ...createBookmarksApi(),
  ...createExtensionsApi(),
  ...createWorkspacesApi(),
  ...createWindowApi(),
});
