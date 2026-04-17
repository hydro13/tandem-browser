import * as fs from 'fs';
import * as crypto from 'crypto';
import { tandemDir } from '../utils/paths';
import { createLogger } from '../utils/logger';
import type { BrowserWindow } from 'electron';
import type { SyncManager } from '../sync/manager';
import { IpcChannels } from '../shared/ipc-channels';

const log = createLogger('WorkspaceManager');

// ─── Types ──────────────────────────────────────────────────────────

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

type LegacyWorkspace = Workspace & {
  emoji?: string;
};

interface ReconcileOptions {
  notify?: boolean;
  followFocusedTab?: boolean;
}

// ─── Storage path ───────────────────────────────────────────────────

const STORAGE_PATH = tandemDir('workspaces.json');

const DEFAULT_COLORS = ['#4285f4', '#4ecca3', '#e94560', '#f0a500', '#9b59b6', '#1abc9c', '#e67e22', '#2ecc71'];

// ─── Manager ────────────────────────────────────────────────────────

/**
 * WorkspaceManager — workspace CRUD, tab assignment, and active workspace switching.
 *
 * Persistence: ~/.tandem/workspaces.json
 * API routes:  src/api/routes/workspaces.ts
 * MCP tools:   src/mcp/tools/workspaces.ts
 */
export class WorkspaceManager {

  // === 1. Private state ===

  private workspaces: Map<string, Workspace> = new Map();
  private activeId: string = '';
  private lastModified: string | undefined;
  private mainWindow: BrowserWindow | null = null;
  private syncManager: SyncManager | null = null;
  private trackedTabIdsResolver: (() => number[]) | null = null;
  private activeTabIdResolver: (() => number | null) | null = null;
  private isReconciling = false;
  private selectionPinned = false;
  /**
   * Tabs assigned via assignTab() that have not yet been observed in the
   * runtime's tracked tab list. Reconcile refuses to strip these so we don't
   * lose newly-assigned tabs to the race between web-contents-created (when
   * main.ts calls assignTab) and TabManager.tabs.set() (when openTab
   * finishes). Cleared lazily when the tab appears in validTabIds, or on
   * explicit removeTab()/resetTabAssignments().
   */
  private pendingAssignments = new Set<number>();

  // === 2. Constructor ===

  constructor() {
    this.loadFromDisk();
  }

  // === 3. Dependency setters ===

  /** Set the main BrowserWindow for IPC workspace-switch notifications. */
  setMainWindow(win: BrowserWindow): void {
    this.mainWindow = win;
  }

  /** Wire up sync manager and merge any newer shared workspace data. */
  setSyncManager(sm: SyncManager): void {
    this.syncManager = sm;
    this.mergeFromSync();
  }

  /** Wire runtime tab resolvers so workspace state can be reconciled against real tabs. */
  setTabStateResolvers(opts: {
    listTrackedTabIds: (() => number[]) | null;
    getActiveTabId: (() => number | null) | null;
  }): void {
    this.trackedTabIdsResolver = opts.listTrackedTabIds;
    this.activeTabIdResolver = opts.getActiveTabId;
    this.reconcileWithRuntimeState();
  }

  // === 4. Public methods ===

  /** List all workspaces sorted by display order. */
  list(): Workspace[] {
    this.reconcileWithRuntimeState();
    return this.getSortedWorkspaces();
  }

  /** Get a workspace by ID, or undefined if not found. */
  get(id: string): Workspace | undefined {
    this.reconcileWithRuntimeState();
    return this.workspaces.get(id);
  }

  /** Get the currently active workspace (falls back to default). */
  getActive(): Workspace {
    this.reconcileWithRuntimeState();
    const ws = this.workspaces.get(this.activeId);
    if (!ws) return this.getDefaultWorkspace()!;
    return ws;
  }

  /** Get the ID of the active workspace. */
  getActiveId(): string {
    this.reconcileWithRuntimeState();
    return this.activeId;
  }

  /** Get whether the active workspace currently comes from an explicit selection or the focused tab. */
  getActiveSource(): 'selection' | 'focused-tab' {
    this.reconcileWithRuntimeState();
    return this.selectionPinned ? 'selection' : 'focused-tab';
  }

  /**
   * Look up which workspace a tab belongs to.
   * @param tabId - webContentsId of the tab
   * @returns workspace ID, or null if unassigned
   */
  getWorkspaceIdForTab(tabId: number): string | null {
    this.reconcileWithRuntimeState();
    return this.getWorkspaceIdForTabInternal(tabId);
  }

  /**
   * Reconcile workspace membership against the tracked tabs and sync the active workspace
   * to the focused tab when possible.
   */
  reconcileTabState(
    tabIds: Iterable<number> | null | undefined,
    activeTabId?: number | null,
    options: ReconcileOptions = {},
  ): { changed: boolean; activeId: string } {
    const validTabIds = tabIds
      ? new Set(Array.from(tabIds).filter((tabId) => Number.isFinite(tabId)))
      : null;
    const defaultWorkspace = this.getDefaultWorkspace();
    let changed = false;

    if (validTabIds) {
      const assignedTabIds = new Set<number>();
      for (const workspace of this.getSortedWorkspaces()) {
        const nextTabIds: number[] = [];
        for (const tabId of workspace.tabIds) {
          if (!Number.isFinite(tabId) || assignedTabIds.has(tabId)) {
            changed = true;
            continue;
          }
          const isTracked = validTabIds.has(tabId);
          if (!isTracked && !this.pendingAssignments.has(tabId)) {
            changed = true;
            continue;
          }
          if (isTracked) this.pendingAssignments.delete(tabId);
          assignedTabIds.add(tabId);
          nextTabIds.push(tabId);
        }

        if (!this.haveSameTabIds(workspace.tabIds, nextTabIds)) {
          workspace.tabIds = nextTabIds;
          changed = true;
        }
      }

      if (defaultWorkspace) {
        const unassignedTabIds = Array.from(validTabIds)
          .filter((tabId) => !assignedTabIds.has(tabId))
          .sort((left, right) => left - right);
        if (unassignedTabIds.length > 0) {
          defaultWorkspace.tabIds = [...defaultWorkspace.tabIds, ...unassignedTabIds];
          changed = true;
        }
      }
    }

    const nextActiveId = this.resolveActiveWorkspaceId(activeTabId ?? null, options.followFocusedTab === true);
    if (nextActiveId !== this.activeId) {
      this.activeId = nextActiveId;
      changed = true;
    }

    if (options.followFocusedTab) {
      const focusedWorkspaceId = activeTabId != null ? this.getWorkspaceIdForTabInternal(activeTabId) : null;
      if (focusedWorkspaceId) {
        this.selectionPinned = false;
      }
    }

    if (changed) {
      this.saveToDisk();
      const activeWorkspace = this.workspaces.get(this.activeId) || this.getDefaultWorkspace();
      if (options.notify && activeWorkspace) {
        this.notifySwitch(activeWorkspace);
      }
    }

    return { changed, activeId: this.activeId };
  }

  /** Reconcile using runtime-provided tab state when available. */
  reconcileWithRuntimeState(options: ReconcileOptions = {}): { changed: boolean; activeId: string } {
    if (this.isReconciling) {
      return { changed: false, activeId: this.activeId };
    }

    this.isReconciling = true;
    try {
      return this.reconcileTabState(
        this.trackedTabIdsResolver ? this.trackedTabIdsResolver() : null,
        this.activeTabIdResolver ? this.activeTabIdResolver() : null,
        options,
      );
    } finally {
      this.isReconciling = false;
    }
  }

  /**
   * Create a new workspace.
   * @param opts - name (required), icon, and color
   * @returns the created workspace
   * @throws if name is missing
   */
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

  /**
   * Update a workspace's name, icon, or color.
   * @throws if the workspace is not found
   */
  update(id: string, opts: Partial<Pick<Workspace, 'name' | 'icon' | 'color'>>): Workspace {
    const ws = this.workspaces.get(id);
    if (!ws) throw new Error(`Workspace ${id} not found`);
    if (opts.name !== undefined) ws.name = opts.name;
    if (opts.icon !== undefined) ws.icon = opts.icon;
    if (opts.color !== undefined) ws.color = opts.color;
    this.saveToDisk();
    return ws;
  }

  /**
   * Delete a workspace, moving its tabs to the default workspace.
   * @throws if workspace not found or is the default workspace
   */
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

  /**
   * Switch the active workspace and notify the renderer.
   * @throws if workspace not found
   */
  switch(id: string): Workspace {
    const ws = this.workspaces.get(id);
    if (!ws) throw new Error(`Workspace ${id} not found`);
    this.activeId = id;
    this.selectionPinned = true;
    this.saveToDisk();
    this.notifySwitch(ws);
    log.info(`Switched to workspace "${ws.name}"`);
    return ws;
  }

  /** Assign a tab (by webContentsId) to the currently active workspace. */
  assignTab(tabId: number): void {
    this.pendingAssignments.add(tabId);
    const active = this.getActive();
    for (const workspace of this.workspaces.values()) {
      const idx = workspace.tabIds.indexOf(tabId);
      if (idx !== -1) {
        workspace.tabIds.splice(idx, 1);
      }
    }
    if (!active.tabIds.includes(tabId)) {
      active.tabIds.push(tabId);
    }
    this.saveToDisk();
  }

  /** Remove a tab from whichever workspace it belongs to. */
  removeTab(tabId: number): void {
    this.pendingAssignments.delete(tabId);
    for (const ws of this.workspaces.values()) {
      const idx = ws.tabIds.indexOf(tabId);
      if (idx !== -1) {
        ws.tabIds.splice(idx, 1);
      }
    }
    this.saveToDisk();
  }

  /**
   * Move a tab to a specific workspace and refresh the tab bar.
   * @throws if workspace not found
   */
  moveTab(tabId: number, workspaceId: string): void {
    const target = this.workspaces.get(workspaceId);
    if (!target) throw new Error(`Workspace ${workspaceId} not found`);

    // Remove from all workspaces
    for (const ws of this.workspaces.values()) {
      const idx = ws.tabIds.indexOf(tabId);
      if (idx !== -1) ws.tabIds.splice(idx, 1);
    }

    // Add to target
    if (!target.tabIds.includes(tabId)) {
      target.tabIds.push(tabId);
    }
    this.saveToDisk();

    // Notify shell to re-filter tab bar
    this.notifySwitch(this.getActive());
  }

  /** Clear all tab assignments from every workspace. */
  resetTabAssignments(): void {
    this.pendingAssignments.clear();
    for (const workspace of this.workspaces.values()) {
      workspace.tabIds = [];
    }
    this.saveToDisk();
  }

  // === 5. Sync integration ===

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
        this.reconcileWithRuntimeState();
        this.saveToDisk();
        log.info('Workspaces loaded from sync (newer version found)');
      }
    } catch (e) {
      log.warn('mergeFromSync failed:', e instanceof Error ? e.message : String(e));
    }
  }

  // === 6. Cleanup ===

  /** Persist workspace state to disk on shutdown. */
  destroy(): void {
    this.saveToDisk();
  }

  // === 7. Private I/O ===

  private loadFromDisk(): void {
    try {
      if (fs.existsSync(STORAGE_PATH)) {
        const raw = fs.readFileSync(STORAGE_PATH, 'utf-8');
        const data: WorkspacesFile = JSON.parse(raw);
        this.lastModified = data.lastModified;
        for (const ws of data.workspaces as LegacyWorkspace[]) {
          // Migrate old emoji field to icon slug
          if (!ws.icon && ws.emoji) {
            ws.icon = 'home';
            delete ws.emoji;
          }
          this.workspaces.set(ws.id, ws);
        }
        this.activeId = data.activeId;
        // Validate activeId still exists
        if (!this.workspaces.has(this.activeId)) {
          this.activeId = this.getDefaultWorkspace()?.id || '';
        }
        this.reconcileTabState(null, null);
      }
    } catch (e) {
      log.warn('Failed to load workspaces from disk:', e instanceof Error ? e.message : String(e));
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
        workspaces: this.getSortedWorkspaces(),
        lastModified: this.lastModified,
      };
      fs.writeFileSync(STORAGE_PATH, JSON.stringify(data, null, 2));
      if (this.syncManager?.isConfigured()) {
        this.syncManager.writeShared('workspaces.json', data);
      }
    } catch (e) {
      log.warn('Failed to save workspaces to disk:', e instanceof Error ? e.message : String(e));
    }
  }

  private getSortedWorkspaces(): Workspace[] {
    return Array.from(this.workspaces.values()).sort((a, b) => a.order - b.order);
  }

  private generateId(): string {
    return crypto.randomBytes(8).toString('hex');
  }

  private getWorkspaceIdForTabInternal(tabId: number): string | null {
    for (const workspace of this.workspaces.values()) {
      if (workspace.tabIds.includes(tabId)) {
        return workspace.id;
      }
    }
    return null;
  }

  private resolveActiveWorkspaceId(activeTabId: number | null, followFocusedTab: boolean): string {
    if (activeTabId !== null) {
      const workspaceId = this.getWorkspaceIdForTabInternal(activeTabId);
      if (workspaceId && (followFocusedTab || !this.selectionPinned)) {
        return workspaceId;
      }
    }

    if (this.workspaces.has(this.activeId)) {
      return this.activeId;
    }

    this.selectionPinned = false;

    if (activeTabId !== null) {
      const workspaceId = this.getWorkspaceIdForTabInternal(activeTabId);
      if (workspaceId) {
        return workspaceId;
      }
    }

    return this.getDefaultWorkspace()?.id || '';
  }

  private haveSameTabIds(left: number[], right: number[]): boolean {
    if (left.length !== right.length) {
      return false;
    }

    return left.every((tabId, index) => tabId === right[index]);
  }

  private getDefaultWorkspace(): Workspace | undefined {
    for (const ws of this.workspaces.values()) {
      if (ws.isDefault) return ws;
    }
    return undefined;
  }

  private notifySwitch(ws: Workspace): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(IpcChannels.WORKSPACE_SWITCHED, ws);
    }
  }
}
