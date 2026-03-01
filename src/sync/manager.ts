import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { createLogger } from '../utils/logger';
import type { HistoryEntry } from '../history/manager';

const log = createLogger('SyncManager');

export interface SyncConfig {
  enabled: boolean;
  syncRoot: string;
  deviceName: string;
}

export interface RemoteDevice {
  name: string;
  tabs: RemoteTab[];
  lastSeen: string;
}

export interface RemoteTab {
  tabId: string;
  url: string;
  title: string;
  favicon?: string;
  workspaceId?: string;
}

interface TabsFile {
  deviceName: string;
  updatedAt: string;
  tabs: RemoteTab[];
}

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

export class SyncManager {
  private config: SyncConfig | null = null;

  /** Sanitize a hostname for use as directory name */
  static sanitizeDeviceName(name: string): string {
    return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9._-]/g, '');
  }

  /** Default device name from os.hostname() */
  static defaultDeviceName(): string {
    return SyncManager.sanitizeDeviceName(os.hostname());
  }

  init(config: SyncConfig): void {
    this.config = config;
    if (!this.isConfigured()) {
      log.info('Sync disabled or syncRoot not set');
      return;
    }

    // Create directory structure
    const devicesDir = path.join(config.syncRoot, 'devices', config.deviceName);
    const sharedDir = path.join(config.syncRoot, 'shared');
    const pinboardsDir = path.join(sharedDir, 'pinboards');

    for (const dir of [devicesDir, sharedDir, pinboardsDir]) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }

    log.info(`Sync initialized: ${config.syncRoot} (device: ${config.deviceName})`);
  }

  isConfigured(): boolean {
    return !!(this.config && this.config.enabled && this.config.syncRoot && fs.existsSync(this.config.syncRoot));
  }

  /** Publish current tabs to sync folder (atomic write) */
  publishTabs(tabs: RemoteTab[]): void {
    if (!this.isConfigured()) return;
    const filePath = path.join(this.config!.syncRoot, 'devices', this.config!.deviceName, 'tabs.json');
    const data: TabsFile = {
      deviceName: this.config!.deviceName,
      updatedAt: new Date().toISOString(),
      tabs,
    };
    this.atomicWrite(filePath, data);
  }

  /** Publish history to sync folder (last 90 days only, atomic write) */
  publishHistory(entries: HistoryEntry[]): void {
    if (!this.isConfigured()) return;
    const cutoff = new Date(Date.now() - NINETY_DAYS_MS).toISOString();
    const recent = entries.filter(e => e.lastVisitTime >= cutoff);
    const filePath = path.join(this.config!.syncRoot, 'devices', this.config!.deviceName, 'history.json');
    this.atomicWrite(filePath, { deviceName: this.config!.deviceName, updatedAt: new Date().toISOString(), entries: recent });
  }

  /** Read all remote devices (excluding own) and their tabs */
  getRemoteDevices(): RemoteDevice[] {
    if (!this.isConfigured()) return [];
    const devicesDir = path.join(this.config!.syncRoot, 'devices');
    if (!fs.existsSync(devicesDir)) return [];

    const devices: RemoteDevice[] = [];
    try {
      const dirs = fs.readdirSync(devicesDir, { withFileTypes: true });
      for (const dirent of dirs) {
        if (!dirent.isDirectory()) continue;
        if (dirent.name === this.config!.deviceName) continue;

        const tabsPath = path.join(devicesDir, dirent.name, 'tabs.json');
        if (!fs.existsSync(tabsPath)) continue;

        try {
          const raw = fs.readFileSync(tabsPath, 'utf-8');
          const data: TabsFile = JSON.parse(raw);
          devices.push({
            name: data.deviceName || dirent.name,
            tabs: data.tabs || [],
            lastSeen: data.updatedAt || '',
          });
        } catch (e) {
          log.warn(`Failed to read tabs from device "${dirent.name}":`, e instanceof Error ? e.message : String(e));
        }
      }
    } catch (e) {
      log.warn('Failed to read devices directory:', e instanceof Error ? e.message : String(e));
    }

    return devices;
  }

  /** Write data to the shared/ folder (atomic write) */
  writeShared(filename: string, data: unknown): void {
    if (!this.isConfigured()) return;
    const filePath = path.join(this.config!.syncRoot, 'shared', filename);
    this.atomicWrite(filePath, data);
  }

  /** Read data from the shared/ folder */
  readShared<T>(filename: string): T | null {
    if (!this.isConfigured()) return null;
    const filePath = path.join(this.config!.syncRoot, 'shared', filename);
    if (!fs.existsSync(filePath)) return null;
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T;
    } catch (e) {
      log.warn(`Failed to read shared file "${filename}":`, e instanceof Error ? e.message : String(e));
      return null;
    }
  }

  /** Get current sync config */
  getConfig(): SyncConfig | null {
    return this.config;
  }

  /** Atomic write: write to temp file, then rename */
  private atomicWrite(filePath: string, data: unknown): void {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const tmpPath = filePath + '.tmp';
    try {
      fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2));
      fs.renameSync(tmpPath, filePath);
    } catch (e) {
      log.warn(`Atomic write failed for "${filePath}":`, e instanceof Error ? e.message : String(e));
      // Clean up tmp file if rename failed
      try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
    }
  }

  destroy(): void {
    // nothing to clean up
  }
}
