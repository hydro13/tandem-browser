import path from 'path';
import fs from 'fs';
import os from 'os';

/**
 * TandemConfig — All configurable settings for Tandem Browser.
 * Stored in ~/.tandem/config.json
 */
export interface TandemConfig {
  // Algemeen
  general: {
    startPage: 'kees' | 'duckduckgo' | 'custom';
    customStartUrl: string;
    language: string;
    keesPanelPosition: 'left' | 'right';
    keesPanelDefaultOpen: boolean;
    showBookmarksBar: boolean;
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

  // Sync
  sync: {
    chromeBookmarks: boolean;
    chromeProfile: string; // 'Default', 'Profile 1', etc.
  };

  // Behavioral Learning
  behavior: {
    trackingEnabled: boolean;
  };

  // Appearance
  appearance: {
    theme: 'dark' | 'light' | 'system';
  };

  // Onboarding
  onboardingComplete: boolean;
}

const DEFAULT_CONFIG: TandemConfig = {
  general: {
    startPage: 'kees',
    customStartUrl: '',
    language: 'nl-BE',
    keesPanelPosition: 'right',
    keesPanelDefaultOpen: false,
    showBookmarksBar: true,
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
  behavior: {
    trackingEnabled: true,
  },
  appearance: {
    theme: 'dark',
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
    const tandemDir = path.join(os.homedir(), '.tandem');
    if (!fs.existsSync(tandemDir)) {
      fs.mkdirSync(tandemDir, { recursive: true });
    }
    this.configPath = path.join(tandemDir, 'config.json');
    this.config = this.load();
  }

  /** Load config from disk, merging with defaults */
  private load(): TandemConfig {
    try {
      if (fs.existsSync(this.configPath)) {
        const raw = JSON.parse(fs.readFileSync(this.configPath, 'utf-8'));
        return this.deepMerge(DEFAULT_CONFIG, raw);
      }
    } catch (e: any) {
      console.warn('Config file corrupted, using defaults:', e.message);
    }
    return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
  }

  /** Save config to disk */
  private save(): void {
    try {
      fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
    } catch (e: any) {
      console.warn('Config save failed:', e.message);
    }
  }

  /** Deep merge source into target (returns new object) */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private deepMerge(target: any, source: any): any {
    const result = { ...target };
    for (const key of Object.keys(source)) {
      if (
        source[key] &&
        typeof source[key] === 'object' &&
        !Array.isArray(source[key]) &&
        target[key] &&
        typeof target[key] === 'object' &&
        !Array.isArray(target[key])
      ) {
        result[key] = this.deepMerge(target[key], source[key]);
      } else {
        result[key] = source[key];
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
    const merged = this.deepMerge(this.config, patch) as TandemConfig;
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
      } catch (e: any) {
        console.warn('Config change listener error:', e.message);
      }
    }
  }
}
