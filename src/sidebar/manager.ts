import * as fs from 'fs';
import * as path from 'path';
import { tandemDir, ensureDir } from '../utils/paths';
import type { SidebarConfig, SidebarItem, SidebarState } from './types';

// Sidebar items in 3 sections (similar to Opera):
// Section 1: Workspaces (top)
// Section 2: Communication — Google Calendar, Gmail, then chat apps
// Section 3: Browser utilities — Pinboards, Bookmarks, History, Downloads, Personal News
// Fixed footer (hardcoded in UI, not in items): Tips (💡) + Setup (⚙️)
const DEFAULT_CONFIG: SidebarConfig = {
  state: 'wide',
  activeItemId: null,
  panelPinned: false,
  panelWidths: {},
  items: [
    // === SECTION 1: Workspaces ===
    { id: 'workspaces', label: 'Workspaces',      icon: '', type: 'panel',   enabled: true, order: 0 },
    // === SECTION 2: Communication ===
    { id: 'calendar',   label: 'Google Calendar', icon: '', type: 'webview', enabled: true, order: 10 },
    { id: 'gmail',      label: 'Gmail',           icon: '', type: 'webview', enabled: true, order: 11 },
    { id: 'whatsapp',   label: 'WhatsApp',        icon: '', type: 'webview', enabled: true, order: 12 },
    { id: 'telegram',   label: 'Telegram',        icon: '', type: 'webview', enabled: true, order: 13 },
    { id: 'discord',    label: 'Discord',         icon: '', type: 'webview', enabled: true, order: 14 },
    { id: 'slack',      label: 'Slack',           icon: '', type: 'webview', enabled: true, order: 15 },
    { id: 'instagram',  label: 'Instagram',       icon: '', type: 'webview', enabled: true, order: 16 },
    { id: 'x',          label: 'X (Twitter)',     icon: '', type: 'webview', enabled: true, order: 17 },
    // === SECTION 3: Browser utilities ===
    { id: 'pinboards',  label: 'Pinboards',       icon: '', type: 'panel',   enabled: true, order: 20 },
    { id: 'bookmarks',  label: 'Bookmarks',       icon: '', type: 'panel',   enabled: true, order: 21 },
    { id: 'history',    label: 'History',         icon: '', type: 'panel',   enabled: true, order: 22 },
    { id: 'downloads',  label: 'Downloads',       icon: '', type: 'panel',   enabled: false, order: 23 },
    { id: 'news',       label: 'Personal News',   icon: '', type: 'panel',   enabled: false, order: 24 },
  ]
};

export class SidebarManager {
  private storageFile: string;
  private config: SidebarConfig;

  constructor() {
    this.storageFile = path.join(tandemDir(), 'sidebar-config.json');
    this.config = this.load();
  }

  getConfig(): SidebarConfig { return this.config; }

  updateConfig(partial: Partial<SidebarConfig>): SidebarConfig {
    this.config = { ...this.config, ...partial };
    this.save();
    return this.config;
  }

  toggleItem(id: string): SidebarItem | undefined {
    const item = this.config.items.find(i => i.id === id);
    if (!item) return undefined;
    item.enabled = !item.enabled;
    this.save();
    return item;
  }

  reorderItems(orderedIds: string[]): void {
    orderedIds.forEach((id, idx) => {
      const item = this.config.items.find(i => i.id === id);
      if (item) item.order = idx;
    });
    this.config.items.sort((a, b) => a.order - b.order);
    this.save();
  }

  setState(state: SidebarState): void {
    this.config.state = state;
    this.save();
  }

  setActiveItem(id: string | null): void {
    this.config.activeItemId = id;
    this.save();
  }

  private load(): SidebarConfig {
    try {
      if (fs.existsSync(this.storageFile)) {
        const raw = JSON.parse(fs.readFileSync(this.storageFile, "utf8"));
        const savedIds = new Set((raw.items || []).map((i: SidebarItem) => i.id));
        const missingItems = DEFAULT_CONFIG.items.filter(i => !savedIds.has(i.id));
        const mergedItems = [...(raw.items || []), ...missingItems];
        return { ...DEFAULT_CONFIG, ...raw, items: mergedItems };
      }
    } catch { /* use defaults */ }
    return { ...DEFAULT_CONFIG, items: [...DEFAULT_CONFIG.items] };
  }

  private save(): void {
    try {
      ensureDir(tandemDir());
      fs.writeFileSync(this.storageFile, JSON.stringify(this.config, null, 2));
    } catch { /* ignore */ }
  }

  destroy(): void { /* nothing to clean up */ }
}
