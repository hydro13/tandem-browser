import path from 'path';
import fs from 'fs';
import os from 'os';
import { tandemDir } from '../utils/paths';
import { WEBHOOK_PORT } from '../utils/constants';
import { createLogger } from '../utils/logger';

import { detectOpenClaw } from '../utils/openclaw-detect';
const log = createLogger('ConfigManager');

/**
 * TandemConfig — All configurable settings for Tandem Browser.
 * Stored in ~/.tandem/config.json
 */
export interface TandemConfig {
  // Algemeen
  general: {
    startPage: 'copilot' | 'duckduckgo' | 'custom';
    customStartUrl: string;
    language: string;
    copilotPanelPosition: 'left' | 'right';
    copilotPanelDefaultOpen: boolean;
    showBookmarksBar: boolean;
    activeBackend: 'openclaw' | 'claude';
    agentName: string;
    agentDisplayName: string;
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
    notifyOnActivity: boolean;   // stream activity events to OpenClaw (Copilot Vision)
  };

  // Onboarding
  onboardingComplete: boolean;
}

const DEFAULT_CONFIG: TandemConfig = {
  general: {
    startPage: 'copilot',
    customStartUrl: '',
    language: 'en-US',
    copilotPanelPosition: 'right',
    copilotPanelDefaultOpen: false,
    showBookmarksBar: true,
    activeBackend: 'openclaw',
    agentName: 'Copilot',
    agentDisplayName: 'AI Copilot',
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

/**
 * ConfigManager — Manages Tandem's configuration.
 * 
 * Loads from ~/.tandem/config.json on startup.
 * Supports partial updates via PATCH semantics.
 * Emits change callbacks for live application of settings.
 */
export class ConfigManager {
  private config: TandemConfig;
  private configPath: string;
  private changeListeners: Array<(config: TandemConfig, changed: Partial<TandemConfig>) => void> = [];

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

  /**
   * Auto-sync webhook.secret with OpenClaw hooks.token (if webhook.secret is empty).
   * Runs async during startup, does not block config load.
   */
  private async autoSyncWebhookSecret(): Promise<void> {
    if (this.config.webhook.secret && this.config.webhook.secret.trim().length > 0) {
      // Secret already set — nothing to do
      return;
    }

    log.info('🔍 webhook.secret empty — checking for OpenClaw...');
    const status = await detectOpenClaw();

    if (status.ok && status.hooksToken) {
      log.info('✅ Auto-synced webhook.secret with OpenClaw hooks.token');
      this.config.webhook.secret = status.hooksToken;
      this.save();
    } else {
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
          if (raw.general.keesPanelPosition && !raw.general.copilotPanelPosition) {
            raw.general.copilotPanelPosition = raw.general.keesPanelPosition;
          }
          if (raw.general.keesPanelDefaultOpen !== undefined && raw.general.copilotPanelDefaultOpen === undefined) {
            raw.general.copilotPanelDefaultOpen = raw.general.keesPanelDefaultOpen;
          }
          if (raw.general.startPage === 'kees') {
            raw.general.startPage = 'copilot';
          }
          delete raw.general.keesPanelPosition;
          delete raw.general.keesPanelDefaultOpen;
        }
        return this.deepMerge(DEFAULT_CONFIG as unknown as Record<string, unknown>, raw) as unknown as TandemConfig;
      }
    } catch (e) {
      log.warn('Config file corrupted, using defaults:', e instanceof Error ? e.message : String(e));
    }
    return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
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

  /** Get the full config */
  getConfig(): TandemConfig {
    return JSON.parse(JSON.stringify(this.config));
  }

  /** Partial update — deep merges the patch into config */
  updateConfig(patch: Record<string, unknown>): TandemConfig {
    const merged = this.deepMerge(this.config as unknown as Record<string, unknown>, patch) as unknown as TandemConfig;
    // Enforce clipboard always true
    merged.screenshots.clipboard = true;
    this.config = merged;
    this.save();
    this.notifyListeners(patch as Partial<TandemConfig>);
    return this.getConfig();
  }

  /** Register a change listener */
  onChange(listener: (config: TandemConfig, changed: Partial<TandemConfig>) => void): void {
    this.changeListeners.push(listener);
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
