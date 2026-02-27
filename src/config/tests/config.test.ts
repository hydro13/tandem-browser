import { describe, it, expect, vi, beforeEach } from 'vitest';
import path from 'path';
import os from 'os';

// Mock fs before importing ConfigManager
vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    default: {
      ...actual,
      existsSync: vi.fn().mockReturnValue(false),
      mkdirSync: vi.fn(),
      writeFileSync: vi.fn(),
      readFileSync: vi.fn().mockReturnValue('{}'),
    },
    existsSync: vi.fn().mockReturnValue(false),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
    readFileSync: vi.fn().mockReturnValue('{}'),
  };
});

import fs from 'fs';
import { ConfigManager, type TandemConfig } from '../manager';

describe('ConfigManager', () => {
  beforeEach(() => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(fs.readFileSync).mockReturnValue('{}');
    vi.mocked(fs.writeFileSync).mockClear();
    vi.mocked(fs.mkdirSync).mockClear();
  });

  describe('default config values', () => {
    it('loads with correct general defaults', () => {
      const cm = new ConfigManager();
      const config = cm.getConfig();
      expect(config.general.startPage).toBe('copilot');
      expect(config.general.customStartUrl).toBe('');
      expect(config.general.language).toBe('en-US');
      expect(config.general.copilotPanelPosition).toBe('right');
      expect(config.general.copilotPanelDefaultOpen).toBe(false);
      expect(config.general.showBookmarksBar).toBe(true);
      expect(config.general.activeBackend).toBe('openclaw');
      expect(config.general.agentName).toBe('Copilot');
      expect(config.general.agentDisplayName).toBe('AI Copilot');
    });

    it('loads with correct screenshot defaults', () => {
      const cm = new ConfigManager();
      const config = cm.getConfig();
      expect(config.screenshots.clipboard).toBe(true);
      expect(config.screenshots.localFolder).toBe(true);
      expect(config.screenshots.localFolderPath).toBe(
        path.join(os.homedir(), 'Pictures', 'Tandem')
      );
      expect(config.screenshots.applePhotos).toBe(false);
      expect(config.screenshots.googlePhotos).toBe(false);
    });

    it('loads with correct voice defaults', () => {
      const cm = new ConfigManager();
      const config = cm.getConfig();
      expect(config.voice.inputLanguage).toBe('nl-BE');
      expect(config.voice.autoSendOnSilence).toBe(true);
      expect(config.voice.silenceTimeoutSeconds).toBe(2);
    });

    it('loads with correct stealth defaults', () => {
      const cm = new ConfigManager();
      const config = cm.getConfig();
      expect(config.stealth.userAgent).toBe('auto');
      expect(config.stealth.customUserAgent).toBe('');
      expect(config.stealth.stealthLevel).toBe('medium');
      expect(config.stealth.acceptLanguage).toBe('auto');
      expect(config.stealth.customAcceptLanguage).toBe('');
    });

    it('loads with correct autonomy defaults', () => {
      const cm = new ConfigManager();
      const config = cm.getConfig();
      expect(config.autonomy.autoApproveRead).toBe(true);
      expect(config.autonomy.autoApproveNavigate).toBe(true);
      expect(config.autonomy.autoApproveClick).toBe(false);
      expect(config.autonomy.autoApproveType).toBe(false);
      expect(config.autonomy.autoApproveForms).toBe(false);
      expect(config.autonomy.trustedSites).toEqual(['google.com', 'wikipedia.org', 'duckduckgo.com']);
    });

    it('loads with correct appearance defaults', () => {
      const cm = new ConfigManager();
      const config = cm.getConfig();
      expect(config.appearance.theme).toBe('dark');
    });

    it('loads with correct webhook defaults', () => {
      const cm = new ConfigManager();
      const config = cm.getConfig();
      expect(config.webhook.enabled).toBe(true);
      expect(config.webhook.url).toContain('127.0.0.1');
      expect(config.webhook.secret).toBe('');
      expect(config.webhook.notifyOnRobinChat).toBe(true);
      expect(config.webhook.notifyOnActivity).toBe(true);
    });

    it('onboardingComplete defaults to false', () => {
      const cm = new ConfigManager();
      const config = cm.getConfig();
      expect(config.onboardingComplete).toBe(false);
    });
  });

  describe('getConfig()', () => {
    it('returns a deep copy (mutations do not affect internal state)', () => {
      const cm = new ConfigManager();
      const config1 = cm.getConfig();
      config1.general.startPage = 'duckduckgo';
      const config2 = cm.getConfig();
      expect(config2.general.startPage).toBe('copilot');
    });
  });

  describe('updateConfig()', () => {
    it('deep merges a nested patch into config', () => {
      const cm = new ConfigManager();
      cm.updateConfig({ general: { language: 'nl-BE' } });
      const config = cm.getConfig();
      // Patched value updated
      expect(config.general.language).toBe('nl-BE');
      // Other values in the same section preserved
      expect(config.general.startPage).toBe('copilot');
      expect(config.general.showBookmarksBar).toBe(true);
    });

    it('replaces array values entirely (does not merge arrays)', () => {
      const cm = new ConfigManager();
      cm.updateConfig({ autonomy: { trustedSites: ['example.com'] } });
      const config = cm.getConfig();
      expect(config.autonomy.trustedSites).toEqual(['example.com']);
    });

    it('persists updated config to disk', () => {
      const cm = new ConfigManager();
      cm.updateConfig({ appearance: { theme: 'light' } });
      expect(fs.writeFileSync).toHaveBeenCalled();
      const lastCall = vi.mocked(fs.writeFileSync).mock.calls.at(-1);
      const written = JSON.parse(lastCall![1] as string);
      expect(written.appearance.theme).toBe('light');
    });

    it('enforces screenshots.clipboard always true', () => {
      const cm = new ConfigManager();
      cm.updateConfig({ screenshots: { clipboard: false as any } });
      const config = cm.getConfig();
      expect(config.screenshots.clipboard).toBe(true);
    });

    it('returns the updated config', () => {
      const cm = new ConfigManager();
      const result = cm.updateConfig({ behavior: { trackingEnabled: false } });
      expect(result.behavior.trackingEnabled).toBe(false);
    });

    it('handles multiple sequential updates', () => {
      const cm = new ConfigManager();
      cm.updateConfig({ general: { language: 'fr-FR' } });
      cm.updateConfig({ appearance: { theme: 'light' } });
      const config = cm.getConfig();
      expect(config.general.language).toBe('fr-FR');
      expect(config.appearance.theme).toBe('light');
    });
  });

  describe('loading from disk', () => {
    it('merges saved config with defaults when file exists', () => {
      const savedConfig = JSON.stringify({
        general: { language: 'de-DE' },
      });
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(savedConfig);

      const cm = new ConfigManager();
      const config = cm.getConfig();
      // Saved value loaded
      expect(config.general.language).toBe('de-DE');
      // Default values preserved for missing fields
      expect(config.general.startPage).toBe('copilot');
      expect(config.appearance.theme).toBe('dark');
    });

    it('uses defaults when config file is corrupted JSON', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('not valid json {{{');

      const cm = new ConfigManager();
      const config = cm.getConfig();
      expect(config.general.startPage).toBe('copilot');
    });

    it('migrates old keesPanelPosition to copilotPanelPosition', () => {
      const savedConfig = JSON.stringify({
        general: { keesPanelPosition: 'left' },
      });
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(savedConfig);

      const cm = new ConfigManager();
      const config = cm.getConfig();
      expect(config.general.copilotPanelPosition).toBe('left');
    });

    it('migrates old startPage kees to copilot', () => {
      const savedConfig = JSON.stringify({
        general: { startPage: 'kees' },
      });
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(savedConfig);

      const cm = new ConfigManager();
      const config = cm.getConfig();
      expect(config.general.startPage).toBe('copilot');
    });
  });

  describe('onChange()', () => {
    it('notifies listeners when config is updated', () => {
      const cm = new ConfigManager();
      const listener = vi.fn();
      cm.onChange(listener);

      cm.updateConfig({ appearance: { theme: 'light' } });
      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ appearance: { theme: 'light' } }),
        { appearance: { theme: 'light' } }
      );
    });

    it('notifies multiple listeners', () => {
      const cm = new ConfigManager();
      const listener1 = vi.fn();
      const listener2 = vi.fn();
      cm.onChange(listener1);
      cm.onChange(listener2);

      cm.updateConfig({ behavior: { trackingEnabled: false } });
      expect(listener1).toHaveBeenCalledTimes(1);
      expect(listener2).toHaveBeenCalledTimes(1);
    });

    it('continues notifying other listeners if one throws', () => {
      const cm = new ConfigManager();
      const badListener = vi.fn(() => { throw new Error('listener error'); });
      const goodListener = vi.fn();
      cm.onChange(badListener);
      cm.onChange(goodListener);

      // Should not throw
      cm.updateConfig({ appearance: { theme: 'light' } });
      expect(badListener).toHaveBeenCalledTimes(1);
      expect(goodListener).toHaveBeenCalledTimes(1);
    });
  });

  describe('deepMerge (via updateConfig)', () => {
    it('merges deeply nested objects', () => {
      const cm = new ConfigManager();
      cm.updateConfig({
        stealth: { stealthLevel: 'high' },
        sync: { chromeBookmarks: true },
      });
      const config = cm.getConfig();
      expect(config.stealth.stealthLevel).toBe('high');
      expect(config.stealth.userAgent).toBe('auto'); // preserved
      expect(config.sync.chromeBookmarks).toBe(true);
      expect(config.sync.chromeProfile).toBe('Default'); // preserved
    });

    it('overwrites scalar values in nested objects', () => {
      const cm = new ConfigManager();
      cm.updateConfig({ voice: { silenceTimeoutSeconds: 5 } });
      const config = cm.getConfig();
      expect(config.voice.silenceTimeoutSeconds).toBe(5);
      expect(config.voice.autoSendOnSilence).toBe(true); // preserved
    });

    it('replaces arrays rather than merging them', () => {
      const cm = new ConfigManager();
      cm.updateConfig({ autonomy: { trustedSites: ['new-site.com', 'another.com'] } });
      const config = cm.getConfig();
      expect(config.autonomy.trustedSites).toEqual(['new-site.com', 'another.com']);
      // Should NOT contain default values
      expect(config.autonomy.trustedSites).not.toContain('google.com');
    });

    it('preserves top-level keys not in the patch', () => {
      const cm = new ConfigManager();
      cm.updateConfig({ onboardingComplete: true });
      const config = cm.getConfig();
      expect(config.onboardingComplete).toBe(true);
      // All other sections should still exist
      expect(config.general).toBeDefined();
      expect(config.screenshots).toBeDefined();
      expect(config.voice).toBeDefined();
      expect(config.stealth).toBeDefined();
      expect(config.autonomy).toBeDefined();
    });
  });

  describe('directory creation', () => {
    it('creates ~/.tandem directory if it does not exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      new ConfigManager();
      expect(fs.mkdirSync).toHaveBeenCalledWith(
        expect.stringContaining('.tandem'),
        { recursive: true }
      );
    });
  });
});
