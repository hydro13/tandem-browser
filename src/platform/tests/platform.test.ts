import { describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { getPlatformCapabilities, selectPlatform } from '..';
import { ChromeImporter } from '../../import/chrome-importer';
import { createDarwinChromeImportAdapter, createWindowsChromeImportAdapter } from '../chrome-import';
import { commandOrControlAccelerator, labelShortcutText } from '../shortcuts';
import { createDarwinVoiceAdapter, createWindowsVoiceAdapter, findWindowsWhisperBinary } from '../voice';

function writeChromeBookmarks(bookmarksPath: string): void {
  fs.writeFileSync(bookmarksPath, JSON.stringify({
    roots: {
      bookmark_bar: {
        id: '1',
        name: 'Bookmarks Bar',
        type: 'folder',
        children: [
          {
            id: '2',
            name: 'Tandem',
            type: 'url',
            url: 'https://tandem.local/',
            date_added: '13300000000000000',
          },
        ],
      },
      other: {
        id: '3',
        name: 'Other Bookmarks',
        type: 'folder',
        children: [],
      },
      synced: {
        id: '4',
        name: 'Mobile Bookmarks',
        type: 'folder',
        children: [],
      },
    },
  }), 'utf-8');
}

const chromeFixtureTime = 11644473600000000 + (Date.UTC(2026, 4, 4, 10, 0, 0) * 1000);

class FixtureChromeHistoryDatabase {
  constructor(_filename: string, _options: { readonly: boolean }) {}

  prepare(_sql: string): { all: () => unknown[] } {
    return {
      all: () => [{
        url: 'https://tandem.local/history',
        title: 'Tandem History',
        visit_count: 3,
        last_visit_time: chromeFixtureTime,
      }],
    };
  }

  close(): void {}
}

describe('selectPlatform', () => {
  it('returns the Darwin adapter', () => {
    const platform = selectPlatform('darwin');

    expect(platform.id).toBe('darwin');
    expect(platform.process.isMacOS()).toBe(true);
    expect(platform.capabilities.capabilities.appStartup.status).toBe('supported');
    expect(platform.paths.tandemDir('foo')).toBe(path.join(os.homedir(), '.tandem', 'foo'));
    expect(platform.windowChrome.getBrowserWindowOptions()).toMatchObject({
      titleBarStyle: 'hiddenInset',
    });
  });

  it('returns the Windows adapter without throwing on capability reads', () => {
    const platform = selectPlatform('win32');

    expect(platform.id).toBe('win32');
    expect(platform.process.isWindows()).toBe(true);
    expect(platform.capabilities.tier).toBe('tier1-required');
    expect(platform.capabilities.capabilities.appStartup.status).toBe('supported');
    expect(platform.capabilities.capabilities.windowChrome.status).toBe('supported');
    expect(platform.capabilities.capabilities.userDataDirectory.status).toBe('supported');
    expect(platform.capabilities.capabilities.nativeMessagingHostDetection.status).toBe('supported');
    expect(platform.capabilities.capabilities.voiceTranscription.status).toBe('partial');
    expect(platform.capabilities.capabilities.secretsAtRest.status).toBe('supported');
    expect(() => platform.chromeImport.getUnavailableStatus()).not.toThrow();
    expect(() => platform.nativeMessaging.createDetectionAdapter().getNativeMessagingDirs()).not.toThrow();
    expect(() => platform.voice.detectBackend()).not.toThrow();
    expect(platform.windowChrome.getBrowserWindowOptions()).toMatchObject({
      frame: false,
    });
  });

  it('returns the Linux stub adapter without throwing on capability reads', () => {
    const platform = selectPlatform('linux');

    expect(platform.id).toBe('linux');
    expect(platform.process.isLinux()).toBe(true);
    expect(platform.capabilities.capabilities.windowChrome.status).toBe('supported');
    expect(platform.paths.tandemDir('foo')).toBe(path.join(os.homedir(), '.tandem', 'foo'));
    expect(() => platform.chromeImport.getUnavailableStatus()).not.toThrow();
    expect(platform.windowChrome.getBrowserWindowOptions()).toMatchObject({
      frame: false,
    });
    expect(platform.stealthUa.getProfile('132.0.6834.160').clientHints.platform).toBe('macOS');
  });

  it('normalizes unknown platforms to an unsupported adapter', () => {
    const platform = selectPlatform('freebsd');

    expect(platform.id).toBe('unsupported');
    expect(platform.capabilities.tier).toBe('unsupported');
    expect(getPlatformCapabilities('freebsd').capabilities.appStartup.status).toBe('unsupported');
  });

  it('keeps existing macOS shortcut labels unchanged', () => {
    expect(labelShortcutText('New tab (Cmd+T), Bookmark (⌘D), Screenshot (⌘⇧S)', 'darwin')).toMatchInlineSnapshot('"New tab (Cmd+T), Bookmark (⌘D), Screenshot (⌘⇧S)"');
  });

  it('renders Windows shortcut labels with Ctrl', () => {
    expect(commandOrControlAccelerator('Shift+S')).toBe('CommandOrControl+Shift+S');
    expect(labelShortcutText('New tab (Cmd+T), Bookmark (⌘D), Screenshot (⌘⇧S)', 'win32')).toBe('New tab (Ctrl+T), Bookmark (Ctrl+D), Screenshot (Ctrl+Shift+S)');
  });

  it('uses APPDATA/Tandem Browser for Windows user data paths', () => {
    const originalAppData = process.env.APPDATA;
    const appData = path.join(os.tmpdir(), 'tandem-appdata-test');
    process.env.APPDATA = appData;

    try {
      const platform = selectPlatform('win32');

      expect(platform.paths.tandemDir('foo')).toBe(path.join(appData, 'Tandem Browser', 'foo'));
    } finally {
      if (originalAppData === undefined) {
        delete process.env.APPDATA;
      } else {
        process.env.APPDATA = originalAppData;
      }
    }
  });

  it('keeps the macOS Chrome profile path unchanged through the chrome-import adapter', () => {
    const adapter = createDarwinChromeImportAdapter();

    expect(adapter.getDefaultChromeBasePath()).toBe(path.join(os.homedir(), 'Library', 'Application Support', 'Google', 'Chrome'));
    expect(adapter.resolveProfilePath('Default')).toBe(path.join(os.homedir(), 'Library', 'Application Support', 'Google', 'Chrome', 'Default'));
  });

  it('imports bookmarks from a macOS fixture profile through the chrome-import adapter', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tandem-mac-chrome-import-'));
    const chromeBase = path.join(root, 'Library', 'Application Support', 'Google', 'Chrome');
    const profilePath = path.join(chromeBase, 'Default');
    const tandemDataDir = path.join(root, 'tandem');
    fs.mkdirSync(profilePath, { recursive: true });
    writeChromeBookmarks(path.join(profilePath, 'Bookmarks'));

    try {
      const importer = new ChromeImporter(undefined, createDarwinChromeImportAdapter(chromeBase), tandemDataDir);
      const result = importer.importBookmarks();
      const imported = JSON.parse(fs.readFileSync(path.join(tandemDataDir, 'bookmarks.json'), 'utf-8'));

      expect(result).toMatchObject({ ok: true, count: 1 });
      expect(imported.bookmarks[0].children[0].url).toBe('https://tandem.local/');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('detects Windows Chrome profiles under LOCALAPPDATA and imports bookmarks plus history', () => {
    const originalLocalAppData = process.env.LOCALAPPDATA;
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tandem-win-chrome-import-'));
    const localAppData = path.join(root, 'LocalAppData');
    const chromeBase = path.join(localAppData, 'Google', 'Chrome', 'User Data');
    const profilePath = path.join(chromeBase, 'Default');
    const tandemDataDir = path.join(root, 'tandem');
    fs.mkdirSync(profilePath, { recursive: true });
    fs.writeFileSync(path.join(profilePath, 'Preferences'), JSON.stringify({ profile: { name: 'Robin' } }), 'utf-8');
    writeChromeBookmarks(path.join(profilePath, 'Bookmarks'));
    fs.writeFileSync(path.join(profilePath, 'History'), 'sqlite fixture placeholder', 'utf-8');

    try {
      process.env.LOCALAPPDATA = localAppData;
      const windowsAdapter = createWindowsChromeImportAdapter();
      const importer = new ChromeImporter(undefined, windowsAdapter, tandemDataDir, FixtureChromeHistoryDatabase);
      const profiles = importer.listProfiles();
      const bookmarkResult = importer.importBookmarks();
      const historyResult = importer.importHistory();
      const importedHistory = JSON.parse(fs.readFileSync(path.join(tandemDataDir, 'history.json'), 'utf-8'));

      expect(windowsAdapter.getDefaultChromeBasePath()).toBe(path.join(localAppData, 'Google', 'Chrome', 'User Data'));
      expect(profiles).toEqual([{ name: 'Robin (Default)', path: 'Default', hasBookmarks: true }]);
      expect(bookmarkResult).toMatchObject({ ok: true, count: 1 });
      expect(historyResult).toMatchObject({ ok: true, count: 1 });
      expect(importedHistory.entries[0]).toMatchObject({
        url: 'https://tandem.local/history',
        title: 'Tandem History',
        visitCount: 3,
      });
    } finally {
      if (originalLocalAppData === undefined) {
        delete process.env.LOCALAPPDATA;
      } else {
        process.env.LOCALAPPDATA = originalLocalAppData;
      }
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('documents Windows Chrome encrypted cookie import as unsupported', () => {
    const adapter = createWindowsChromeImportAdapter('C:\\Users\\Robin\\AppData\\Local\\Google\\Chrome\\User Data');

    expect(adapter.getCookieImportSupport()).toMatchObject({
      encryptedStore: false,
      status: 'unsupported',
    });
  });

  it('keeps the Darwin voice adapter on Apple Speech when the native binary exists', () => {
    const adapter = createDarwinVoiceAdapter({
      resourcesPath: '/Applications/Tandem.app/Contents/Resources',
      existsSync: (candidate) => candidate === path.join('/Applications/Tandem.app/Contents/Resources', 'native', 'tandem-speech'),
    });

    expect(adapter.detectBackend()).toBe('apple');
  });

  it('detects whisper.exe through Windows-style PATH lookup', () => {
    const whisperPath = path.win32.join('C:\\Tools\\Whisper', 'whisper.exe');

    expect(findWindowsWhisperBinary({
      env: { Path: 'C:\\Windows\\System32;C:\\Tools\\Whisper' },
      existsSync: (candidate) => candidate === whisperPath,
    })).toBe(whisperPath);
  });

  it('returns a clear Windows voice status when whisper.exe is missing', async () => {
    const adapter = createWindowsVoiceAdapter({
      env: { Path: 'C:\\Windows\\System32' },
      existsSync: () => false,
    });

    const result = await adapter.transcribeAudio(Buffer.from('fixture'), 'nl-BE');

    expect(adapter.detectBackend()).toBe('none');
    expect(result).toMatchObject({
      ok: false,
      error: expect.stringContaining('whisper.exe on PATH'),
    });
  });
});
