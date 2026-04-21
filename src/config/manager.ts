import path from 'path';
import fs from 'fs';
import os from 'os';
import { tandemDir } from '../utils/paths';
import { WEBHOOK_PORT } from '../utils/constants';
import { createLogger } from '../utils/logger';

import { detectOpenClaw } from '../utils/openclaw-detect';
const log = createLogger('ConfigManager');

// ─── Types ───

export interface QuickLinkConfig {
  id: string;
  label: string;
  url: string;
}

/**
 * TandemConfig — All configurable settings for Tandem Browser.
 * Stored in ~/.tandem/config.json
 */
export interface TandemConfig {
  // General
  general: {
    startPage: 'wingman' | 'duckduckgo' | 'custom';
    customStartUrl: string;
    language: string;
    wingmanPanelPosition: 'left' | 'right';
    wingmanPanelDefaultOpen: boolean;
    showBookmarksBar: boolean;
    activeBackend: 'openclaw' | 'claude';
    agentName: string;
    agentDisplayName: string;
    quickLinks: QuickLinkConfig[];
    apiListenHost: string;
  };

  // Screenshots
  screenshots: {
    clipboard: true; // always on
    localFolder: boolean;
    localFolderPath: string;
    applePhotos: boolean;
    googlePhotos: boolean;
  };

  // Voice
  voice: {
    inputLanguage: string;
    autoSendOnSilence: boolean;
    silenceTimeoutSeconds: number;
  };

  // Stealth
  stealth: {
    userAgent: 'auto' | 'custom';
    customUserAgent: string;
    stealthLevel: 'low' | 'medium' | 'high';
    acceptLanguage: 'auto' | 'custom';
    customAcceptLanguage: string;
    skipHosts: string[];
  };

  // Sync (Chrome bookmarks import)
  sync: {
    chromeBookmarks: boolean;
    chromeProfile: string; // 'Default', 'Profile 1', etc.
  };

  // Device Sync — cross-device sync via shared folder (Google Drive, iCloud, etc.)
  // Configure via POST /sync/config API. Settings UI is future work.
  deviceSync: {
    enabled: boolean;
    syncRoot: string;      // e.g. "/Users/robin/Google Drive/My Drive/Tandem"
    deviceName: string;    // e.g. "macbook-air" (default: os.hostname())
  };

  // Behavioral Learning
  behavior: {
    trackingEnabled: boolean;
  };

  // Appearance
  appearance: {
    theme: 'dark' | 'light' | 'system';
  };

  // AI Autonomy
  autonomy: {
    autoApproveRead: boolean;
    autoApproveNavigate: boolean;
    autoApproveClick: boolean;
    autoApproveType: boolean;
    autoApproveForms: boolean;
    trustedSites: string[];
  };

  // Webhook — notify external systems on chat events
  webhook: {
    enabled: boolean;
    url: string;          // e.g. "http://127.0.0.1:18789"
    secret: string;       // shared secret for auth (future use)
    notifyOnRobinChat: boolean;  // fire webhook when Robin sends a message
    notifyOnActivity: boolean;   // stream activity events to OpenClaw (Wingman Vision)
  };

  // Onboarding
  onboardingComplete: boolean;
}

const DEFAULT_QUICK_LINKS: QuickLinkConfig[] = [
  { id: 'duckduckgo', label: 'DuckDuckGo', url: 'https://duckduckgo.com' },
  { id: 'google', label: 'Google', url: 'https://google.com' },
  { id: 'github', label: 'GitHub', url: 'https://github.com/hydro13' },
  { id: 'x', label: 'X', url: 'https://x.com/Robin_waslander' },
  { id: 'linkedin', label: 'LinkedIn', url: 'https://linkedin.com/in/robinwaslander' },
  { id: 'youtube', label: 'YouTube', url: 'https://youtube.com' },
];

function normalizeQuickLinkUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  const parsed = new URL(trimmed);
  parsed.hash = '';
  return parsed.toString();
}

const DEFAULT_CONFIG: TandemConfig = {
  general: {
    startPage: 'wingman',
    customStartUrl: '',
    language: 'en-US',
    wingmanPanelPosition: 'right',
    wingmanPanelDefaultOpen: false,
    showBookmarksBar: true,
    activeBackend: 'openclaw',
    agentName: 'Wingman',
    agentDisplayName: 'AI Wingman',
    quickLinks: DEFAULT_QUICK_LINKS,
    apiListenHost: '0.0.0.0',
  },
  screenshots: {
    clipboard: true,
    localFolder: true,
    localFolderPath: path.join(os.homedir(), 'Pictures', 'Tandem'),
    applePhotos: false,
    googlePhotos: false,
  },
  voice: {
    inputLanguage: 'nl-BE',
    autoSendOnSilence: true,
    silenceTimeoutSeconds: 2,
  },
  stealth: {
    userAgent: 'auto',
    customUserAgent: '',
    stealthLevel: 'medium',
    acceptLanguage: 'auto',
    customAcceptLanguage: '',
    skipHosts: ['x.com', 'twitter.com', 'abs.twimg.com'],
  },
  sync: {
    chromeBookmarks: false,
    chromeProfile: 'Default',
  },
  deviceSync: {
    enabled: false,
    syncRoot: '',
    deviceName: os.hostname().toLowerCase().replace(/\s+/g, '-'),
  },
  behavior: {
    trackingEnabled: true,
  },
  appearance: {
    theme: 'dark',
  },
  autonomy: {
    autoApproveRead: true,
    autoApproveNavigate: true,
    autoApproveClick: false,
    autoApproveType: false,
    autoApproveForms: false,
    trustedSites: ['google.com', 'wikipedia.org', 'duckduckgo.com'],
  },
  webhook: {
    enabled: true,
    url: `http://127.0.0.1:${WEBHOOK_PORT}`,
    secret: '',
    notifyOnRobinChat: true,
    notifyOnActivity: true,
  },
  onboardingComplete: false,
};

// ─── Manager ───

/**
 * ConfigManager — Manages Tandem's configuration.
 *
 * Loads from ~/.tandem/config.json on startup.
 * Supports partial updates via PATCH semantics.
 * Emits change callbacks for live application of settings.
 */
export class ConfigManager {
  // === 1. Private state ===
  private config: TandemConfig;
  private configPath: string;
  private changeListeners: Array<(config: TandemConfig, changed: Partial<TandemConfig>) => void> = [];

  // === 2. Constructor ===
  constructor() {
    const baseDir = tandemDir();
    if (!fs.existsSync(baseDir)) {
      fs.mkdirSync(baseDir, { recursive: true });
    }
    this.configPath = path.join(baseDir, 'config.json');
    this.config = this.load();

    // Auto-sync webhook.secret with OpenClaw hooks.token if empty
    void this.autoSyncWebhookSecret();
  }

  // === 4. Public methods ===

  /** Get the full config */
  getConfig(): TandemConfig {
    return JSON.parse(JSON.stringify(this.config));
  }

  /** Partial update — deep merges the patch into config */
  updateConfig(patch: Record<string, unknown>): TandemConfig {
    const merged = this.deepMerge(this.config as unknown as Record<string, unknown>, patch) as unknown as TandemConfig;
    // Enforce clipboard always true
    merged.screenshots.clipboard = true;
    this.config = this.normalizeConfig(merged);
    this.save();
    this.notifyListeners(patch as Partial<TandemConfig>);
    return this.getConfig();
  }

  isQuickLink(url: string): boolean {
    try {
      const normalizedUrl = normalizeQuickLinkUrl(url);
      return this.config.general.quickLinks.some((link) => {
        try {
          return normalizeQuickLinkUrl(link.url) === normalizedUrl;
        } catch {
          return false;
        }
      });
    } catch {
      return false;
    }
  }

  addQuickLink(label: string, url: string): TandemConfig {
    const normalizedLabel = label.trim();
    const normalizedUrl = normalizeQuickLinkUrl(url);
    const existing = this.config.general.quickLinks.filter((link) => {
      try {
        return normalizeQuickLinkUrl(link.url) !== normalizedUrl;
      } catch {
        return true;
      }
    });

    return this.updateConfig({
      general: {
        quickLinks: [
          ...existing,
          {
            label: normalizedLabel,
            url: normalizedUrl,
          },
        ],
      },
    });
  }

  removeQuickLink(url: string): TandemConfig {
    const normalizedUrl = normalizeQuickLinkUrl(url);
    return this.updateConfig({
      general: {
        quickLinks: this.config.general.quickLinks.filter((link) => {
          try {
            return normalizeQuickLinkUrl(link.url) !== normalizedUrl;
          } catch {
            return true;
          }
        }),
      },
    });
  }

  /** Register a change listener */
  onChange(listener: (config: TandemConfig, changed: Partial<TandemConfig>) => void): void {
    this.changeListeners.push(listener);
  }

  // === 7. Private helpers ===

  /**
   * Auto-sync webhook.secret with OpenClaw hooks.token.
   * Runs async during startup, does not block config load.
   * Always syncs — not just when empty — so token rotations are picked up automatically.
   */
  private async autoSyncWebhookSecret(): Promise<void> {
    const status = await detectOpenClaw();

    if (status.ok && status.hooksToken) {
      if (this.config.webhook.secret !== status.hooksToken) {
        log.info('✅ Auto-synced webhook.secret with OpenClaw hooks.token');
        this.config.webhook.secret = status.hooksToken;
        this.save();
      }
    } else if (!this.config.webhook.secret) {
      log.debug('OpenClaw not detected — webhook.secret remains empty');
    }
  }

  /** Load config from disk, merging with defaults */
  private load(): TandemConfig {
    try {
      if (fs.existsSync(this.configPath)) {
        const raw = JSON.parse(fs.readFileSync(this.configPath, 'utf-8'));
        // Backward compat: migrate old kees* config keys
        if (raw.general) {
          if (raw.general.keesPanelPosition && !raw.general.wingmanPanelPosition) {
            raw.general.wingmanPanelPosition = raw.general.keesPanelPosition;
          }
          if (raw.general.keesPanelDefaultOpen !== undefined && raw.general.wingmanPanelDefaultOpen === undefined) {
            raw.general.wingmanPanelDefaultOpen = raw.general.keesPanelDefaultOpen;
          }
          if (raw.general.startPage === 'kees') {
            raw.general.startPage = 'wingman';
          }
          // Migrate apiListenHost: old default was 127.0.0.1 which blocks remote agent pairing.
          // New default is 0.0.0.0 (local + remote simultaneously).
          if (raw.general.apiListenHost === '127.0.0.1') {
            raw.general.apiListenHost = '0.0.0.0';
          }
          delete raw.general.keesPanelPosition;
          delete raw.general.keesPanelDefaultOpen;
        }
        const merged = this.deepMerge(DEFAULT_CONFIG as unknown as Record<string, unknown>, raw) as unknown as TandemConfig;
        return this.normalizeConfig(merged);
      }
    } catch (e) {
      log.warn('Config file corrupted, using defaults:', e instanceof Error ? e.message : String(e));
    }
    return this.normalizeConfig(JSON.parse(JSON.stringify(DEFAULT_CONFIG)) as TandemConfig);
  }

  /** Save config to disk */
  private save(): void {
    try {
      fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
    } catch (e) {
      log.warn('Config save failed:', e instanceof Error ? e.message : String(e));
    }
  }

  /** Deep merge source into target (returns new object) */
  private deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
    const result = { ...target };
    for (const key of Object.keys(source)) {
      const sourceVal = source[key];
      const targetVal = target[key];
      if (
        sourceVal &&
        typeof sourceVal === 'object' &&
        !Array.isArray(sourceVal) &&
        targetVal &&
        typeof targetVal === 'object' &&
        !Array.isArray(targetVal)
      ) {
        result[key] = this.deepMerge(targetVal as Record<string, unknown>, sourceVal as Record<string, unknown>);
      } else {
        result[key] = sourceVal;
      }
    }
    return result;
  }

  private normalizeConfig(config: TandemConfig): TandemConfig {
    return {
      ...config,
      general: {
        ...config.general,
        quickLinks: this.normalizeQuickLinks(config.general.quickLinks),
      },
    };
  }

  private normalizeQuickLinks(rawLinks: unknown): QuickLinkConfig[] {
    if (!Array.isArray(rawLinks)) {
      return DEFAULT_QUICK_LINKS.map((link) => ({ ...link }));
    }

    return rawLinks
      .map((link, index) => this.normalizeQuickLink(link, index))
      .filter((link): link is QuickLinkConfig => link !== null);
  }

  private normalizeQuickLink(rawLink: unknown, index: number): QuickLinkConfig | null {
    if (!rawLink || typeof rawLink !== 'object') {
      return null;
    }

    const candidate = rawLink as Partial<QuickLinkConfig>;
    const label = typeof candidate.label === 'string' ? candidate.label.trim() : '';
    const url = typeof candidate.url === 'string' ? candidate.url.trim() : '';

    if (!label || !url) {
      return null;
    }

    const id = typeof candidate.id === 'string' && candidate.id.trim()
      ? candidate.id.trim()
      : `quick-link-${index + 1}`;

    try {
      return { id, label, url: normalizeQuickLinkUrl(url) };
    } catch {
      return null;
    }
  }

  /** Notify all change listeners */
  private notifyListeners(changed: Partial<TandemConfig>): void {
    for (const listener of this.changeListeners) {
      try {
        listener(this.config, changed);
      } catch (e) {
        log.warn('Config change listener error:', e instanceof Error ? e.message : String(e));
      }
    }
  }
}
