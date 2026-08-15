import type { BrowserWindow, Session } from 'electron';
import type { ConfigManager } from '../config/manager';
import type { ChromeImporter, ChromeImportStatus } from '../import/chrome-importer';
import type {
  NativeMessagingHost,
  NativeMessagingHostAccessDecision,
  NativeMessagingDetectionAdapter,
  NativeMessagingStatus,
} from '../extensions/native-messaging';
import type { PlatformId } from './errors';
import type { PlatformSupportProfile } from './capabilities';

export interface PathsAdapter {
  tandemDir(...subpath: string[]): string;
  ensureDir(dir: string): string;
}

export interface ProcessAdapter {
  platform: PlatformId;
  isMacOS(): boolean;
  isWindows(): boolean;
  isLinux(): boolean;
}

export interface ChromeImportAdapter {
  createImporter(configManager?: ConfigManager): ChromeImporter;
  getDefaultChromeBasePath(): string;
  resolveProfilePath(profileDir: string): string;
  resolveProfileDataPaths(profileDir: string): {
    profilePath: string;
    bookmarksPath: string;
    historyPath: string;
    cookiesPath: string;
    preferencesPath: string;
    extensionsPath: string;
  };
  getCookieImportSupport(): {
    encryptedStore: boolean;
    status: 'partial' | 'unsupported';
    message: string;
  };
  getUnavailableStatus(profilePath?: string): ChromeImportStatus;
}

export interface NativeMessagingAdapter {
  createDetectionAdapter(): NativeMessagingDetectionAdapter;
  createSetup(): {
    getNativeMessagingDirs(): { path: string; exists: boolean }[];
    detectHosts(): NativeMessagingHost[];
    configure(session: Session): { configured: string[]; missing: string[] };
    getStatus(): NativeMessagingStatus;
    evaluateHostAccess(hostName: string, candidateExtensionIds: Array<string | null | undefined>): NativeMessagingHostAccessDecision;
    isHostAvailable(extensionId: string): boolean;
  };
}

export interface VoiceAdapter {
  detectBackend(): 'apple' | 'whisper' | 'none';
  transcribeAudio(audioBuffer: Buffer, language?: string): Promise<{ ok: boolean; text?: string; error?: string }>;
}

export interface VideoAudioAdapter {
  createRecorder(): {
    startRecording(mode: 'application' | 'region', region?: { x: number; y: number; width: number; height: number }): { ok: boolean; id?: string; error?: string };
    writeChunk(data: Buffer): void;
    stopRecording(): Promise<{ ok: boolean; recording?: unknown; error?: string }>;
    isRecording(): boolean;
    getStatus(): { recording: boolean; id?: string; duration?: number; mode?: string };
    listRecordings(limit?: number): unknown[];
    forceStop(): void;
  };
}

export interface WindowChromeAdapter {
  getBrowserWindowOptions(): Partial<Electron.BrowserWindowConstructorOptions>;
}

export interface StealthUaAdapter {
  getUserAgent(chromeVersion?: string): string;
  getClientHintsPlatform(): string;
  getProfile(chromeVersion?: string): StealthUaProfile;
}

export interface SecretsAdapter {
  loadOrCreateInstallSecret(): string;
}

export interface UpdaterAdapter {
  isSupported(): boolean;
  checkForUpdates(options?: { mainWindow?: BrowserWindow | null }): Promise<void>;
}

export interface PlatformAdapter {
  id: PlatformId;
  capabilities: PlatformSupportProfile;
  paths: PathsAdapter;
  process: ProcessAdapter;
  chromeImport: ChromeImportAdapter;
  nativeMessaging: NativeMessagingAdapter;
  voice: VoiceAdapter;
  videoAudio: VideoAudioAdapter;
  windowChrome: WindowChromeAdapter;
  stealthUa: StealthUaAdapter;
  secrets: SecretsAdapter;
  updater: UpdaterAdapter;
}

export interface StealthUaBrandVersion {
  brand: string;
  version: string;
}

export interface StealthUaClientHints {
  brands: StealthUaBrandVersion[];
  mobile: false;
  platform: string;
  platformVersion: string;
  architecture: string;
  bitness: string;
  model: string;
  uaFullVersion: string;
  fullVersionList: StealthUaBrandVersion[];
}

export interface StealthUaRequestHeaders {
  platform: string;
  platformVersion?: string;
}

export interface StealthUaProfile {
  userAgent: string;
  chromeVersion: string;
  chromeMajor: string;
  clientHints: StealthUaClientHints;
  requestHeaders: StealthUaRequestHeaders;
}
