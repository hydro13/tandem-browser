import * as fs from 'fs';
import * as crypto from 'crypto';
import { tandemDir } from '../utils/paths';
import { createLogger } from '../utils/logger';
import type { BrowserWindow } from 'electron';
import type { SyncManager } from '../sync/manager';

const log = createLogger('WorkspaceManager');

export interface Workspace {
  id: string;
  name: string;
  icon: string;
  color: string;
  order: number;
  isDefault: boolean;
  tabIds: number[];
}

interface WorkspacesFile {
  activeId: string;
  workspaces: Workspace[];
  lastModified?: string;
}

const STORAGE_PATH = tandemDir('workspaces.json');

const DEFAULT_COLORS = ['#4285f4', '#4ecca3', '#e94560', '#f0a500', '#9b59b6', '#1abc9c', '#e67e22', '#2ecc71'];

export class WorkspaceManager {
  private workspaces: Map<string, Workspace> = new Map();
  private activeId: string = '';
  private lastModified: string | undefined;
  private mainWindow: BrowserWindow | null = null;
  private syncManager: SyncManager | null = null;

  constructor() {
    this.loadFromDisk();
  }

  setMainWindow(win: BrowserWindow): void {
    this.mainWindow = win;
  }

  setSyncManager(sm: SyncManager): void {
    this.syncManager = sm;
    this.mergeFromSync();
  }

  private mergeFromSync(): void {
    if (!this.syncManager?.isConfigured()) return;
    try {
      const shared = this.syncManager.readShared<WorkspacesFile>('workspaces.json');
      if (!shared) return;
      const localTime = this.lastModified ? new Date(this.lastModified).getTime() : 0;
      const sharedTime = shared.lastModified ? new Date(shared.lastModified).getTime() : 0;
      if (sharedTime > localTime) {
        this.workspaces.clear();
        for (const ws of shared.workspaces) {
          this.workspaces.set(ws.id, ws);
        }
        this.activeId = shared.activeId;
        this.lastModified = shared.lastModified;
        if (!this.workspaces.has(this.activeId)) {
          this.activeId = this.getDefaultWorkspace()?.id || '';
        }
        this.saveToDisk();
        log.info('Workspaces loaded from sync (newer version found)');
      }
    } catch (e) {
      log.warn('mergeFromSync failed:', e instanceof Error ? e.message : e);
    }
  }

  private loadFromDisk(): void {
    try {
      if (fs.existsSync(STORAGE_PATH)) {
        const raw = fs.readFileSync(STORAGE_PATH, 'utf-8');
        const data: WorkspacesFile = JSON.parse(raw);
        this.lastModified = data.lastModified;
        for (const ws of data.workspaces) {
          // Migrate old emoji field to icon slug
          if (!ws.icon && (ws as any).emoji) {
            ws.icon = 'home';
            delete (ws as any).emoji;
          }
          this.workspaces.set(ws.id, ws);
        }
        this.activeId = data.activeId;
        // Validate activeId still exists
        if (!this.workspaces.has(this.activeId)) {
          this.activeId = this.getDefaultWorkspace()?.id || '';
        }
      }
    } catch (e) {
      log.warn('Failed to load workspaces from disk:', e instanceof Error ? e.message : e);
    }

    // Ensure default workspace exists
    if (!this.getDefaultWorkspace()) {
      const defaultWs: Workspace = {
        id: this.generateId(),
        name: 'Default',
        icon: 'home',
        color: '#4285f4',
        order: 0,
        isDefault: true,
        tabIds: [],
      };
      this.workspaces.set(defaultWs.id, defaultWs);
      this.activeId = defaultWs.id;
      this.saveToDisk();
    }

    if (!this.activeId) {
      this.activeId = this.getDefaultWorkspace()!.id;
    }
  }

  private saveToDisk(): void {
    try {
      const dir = tandemDir();
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      this.lastModified = new Date().toISOString();
      const data: WorkspacesFile = {
        activeId: this.activeId,
        workspaces: this.list(),
        lastModified: this.lastModified,
      };
      fs.writeFileSync(STORAGE_PATH, JSON.stringify(data, null, 2));
      if (this.syncManager?.isConfigured()) {
        this.syncManager.writeShared('workspaces.json', data);
      }
    } catch (e) {
      log.warn('Failed to save workspaces to disk:', e instanceof Error ? e.message : e);
    }
  }

  private generateId(): string {
    return crypto.randomBytes(8).toString('hex');
  }

  private getDefaultWorkspace(): Workspace | undefined {
    for (const ws of this.workspaces.values()) {
      if (ws.isDefault) return ws;
    }
    return undefined;
  }

  list(): Workspace[] {
    return Array.from(this.workspaces.values()).sort((a, b) => a.order - b.order);
  }

  create(opts: { name: string; icon?: string; color?: string }): Workspace {
    if (!opts.name) throw new Error('name is required');
    // Pick a default color based on current count
    const colorIndex = this.workspaces.size % DEFAULT_COLORS.length;
    const ws: Workspace = {
      id: this.generateId(),
      name: opts.name,
      icon: opts.icon || 'briefcase',
      color: opts.color || DEFAULT_COLORS[colorIndex],
      order: this.workspaces.size,
      isDefault: false,
      tabIds: [],
    };
    this.workspaces.set(ws.id, ws);
    this.saveToDisk();
    log.info(`Created workspace "${ws.name}" (${ws.id})`);
    return ws;
  }

  remove(id: string): void {
    const ws = this.workspaces.get(id);
    if (!ws) throw new Error(`Workspace ${id} not found`);
    if (ws.isDefault) throw new Error('Cannot delete the default workspace');

    // Move orphan tabs to default workspace
    const defaultWs = this.getDefaultWorkspace()!;
    for (const tabId of ws.tabIds) {
      if (!defaultWs.tabIds.includes(tabId)) {
        defaultWs.tabIds.push(tabId);
      }
    }

    this.workspaces.delete(id);

    // If the active workspace was deleted, switch to default
    if (this.activeId === id) {
      this.activeId = defaultWs.id;
      this.notifySwitch(defaultWs);
    }

    this.saveToDisk();
    log.info(`Removed workspace "${ws.name}" (${id})`);
  }

  switch(id: string): Workspace {
    const ws = this.workspaces.get(id);
    if (!ws) throw new Error(`Workspace ${id} not found`);
    this.activeId = id;
    this.saveToDisk();
    this.notifySwitch(ws);
    log.info(`Switched to workspace "${ws.name}"`);
    return ws;
  }

  getActive(): Workspace {
    const ws = this.workspaces.get(this.activeId);
    if (!ws) return this.getDefaultWorkspace()!;
    return ws;
  }

  getActiveId(): string {
    return this.activeId;
  }

  get(id: string): Workspace | undefined {
    return this.workspaces.get(id);
  }

  getWorkspaceIdForTab(tabId: number): string | null {
    for (const workspace of this.workspaces.values()) {
      if (workspace.tabIds.includes(tabId)) {
        return workspace.id;
      }
    }
    return null;
  }

  update(id: string, opts: Partial<Pick<Workspace, 'name' | 'icon' | 'color'>>): Workspace {
    const ws = this.workspaces.get(id);
    if (!ws) throw new Error(`Workspace ${id} not found`);
    if (opts.name !== undefined) ws.name = opts.name;
    if (opts.icon !== undefined) ws.icon = opts.icon;
    if (opts.color !== undefined) ws.color = opts.color;
    this.saveToDisk();
    return ws;
  }

  assignTab(tabId: number): void {
    const active = this.getActive();
    for (const workspace of this.workspaces.values()) {
      const idx = workspace.tabIds.indexOf(tabId);
      if (idx !== -1) {
        workspace.tabIds.splice(idx, 1);
      }
    }
    active.tabIds.push(tabId);
    this.saveToDisk();
  }

  removeTab(tabId: number): void {
    for (const ws of this.workspaces.values()) {
      const idx = ws.tabIds.indexOf(tabId);
      if (idx !== -1) {
        ws.tabIds.splice(idx, 1);
      }
    }
    this.saveToDisk();
  }

  moveTab(tabId: number, workspaceId: string): void {
    const target = this.workspaces.get(workspaceId);
    if (!target) throw new Error(`Workspace ${workspaceId} not found`);

    // Remove from all workspaces
    for (const ws of this.workspaces.values()) {
      const idx = ws.tabIds.indexOf(tabId);
      if (idx !== -1) ws.tabIds.splice(idx, 1);
    }

    // Add to target
    target.tabIds.push(tabId);
    this.saveToDisk();

    // Notify shell to re-filter tab bar
    this.notifySwitch(this.getActive());
  }

  resetTabAssignments(): void {
    for (const workspace of this.workspaces.values()) {
      workspace.tabIds = [];
    }
    this.saveToDisk();
  }

  private notifySwitch(ws: Workspace): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('workspace-switched', ws);
    }
  }

  destroy(): void {
    this.saveToDisk();
  }
}
