import { getPlatformCapabilities, normalizePlatform } from './capabilities';
import type { PlatformId } from './errors';
import { createDarwinChromeImportAdapter, createLinuxChromeImportAdapter, createUnsupportedChromeImportAdapter, createWindowsChromeImportAdapter } from './chrome-import';
import {
  createDarwinNativeMessagingAdapter,
  createLinuxNativeMessagingAdapter,
  createUnsupportedNativeMessagingAdapter,
  createWindowsNativeMessagingAdapter,
} from './native-messaging';
import { createDarwinPathsAdapter, createLinuxPathsAdapter, createUnsupportedPathsAdapter, createWindowsPathsAdapter } from './paths';
import { createProcessAdapter } from './process';
import { createDarwinStealthUaAdapter, createUnsupportedStealthUaAdapter, createWindowsStealthUaAdapter } from './stealth-ua';
import type { PlatformAdapter } from './types';
import { createUnsupportedUpdaterAdapter, createWindowsUpdaterAdapter } from './updates';
import { createDarwinVideoAudioAdapter, createUnsupportedVideoAudioAdapter } from './video-audio';
import { createDarwinVoiceAdapter, createLinuxVoiceAdapter, createUnsupportedVoiceAdapter, createWindowsVoiceAdapter } from './voice';
import {
  createDarwinWindowChromeAdapter,
  createLinuxWindowChromeAdapter,
  createUnsupportedWindowChromeAdapter,
  createWindowsWindowChromeAdapter,
} from './window-chrome';

export type { PlatformId } from './errors';
export { NotImplementedError } from './errors';
export type {
  CapabilityStatus,
  PlatformCapabilities,
  PlatformCapability,
  PlatformSupportProfile,
} from './capabilities';
export { getPlatformCapabilities, normalizePlatform } from './capabilities';
export type { PlatformAdapter } from './types';
export {
  commandOrControlAccelerator,
  getCommandOrControlLabel,
  labelShortcutText,
} from './shortcuts';

function createDarwinPlatform(): PlatformAdapter {
  const id: PlatformId = 'darwin';
  return {
    id,
    capabilities: getPlatformCapabilities(id),
    paths: createDarwinPathsAdapter(),
    process: createProcessAdapter(id),
    chromeImport: createDarwinChromeImportAdapter(),
    nativeMessaging: createDarwinNativeMessagingAdapter(),
    voice: createDarwinVoiceAdapter(),
    videoAudio: createDarwinVideoAudioAdapter(),
    windowChrome: createDarwinWindowChromeAdapter(),
    stealthUa: createDarwinStealthUaAdapter(),
    updater: createUnsupportedUpdaterAdapter(id),
  };
}

function createStubPlatform(id: PlatformId): PlatformAdapter {
  return {
    id,
    capabilities: getPlatformCapabilities(id),
    paths: id === 'win32'
      ? createWindowsPathsAdapter()
      : id === 'linux'
        ? createLinuxPathsAdapter()
        : createUnsupportedPathsAdapter(id),
    process: createProcessAdapter(id),
    chromeImport: id === 'win32'
      ? createWindowsChromeImportAdapter()
      : id === 'linux'
        ? createLinuxChromeImportAdapter()
        : createUnsupportedChromeImportAdapter(id),
    nativeMessaging: id === 'win32'
      ? createWindowsNativeMessagingAdapter()
      : id === 'linux'
        ? createLinuxNativeMessagingAdapter()
        : createUnsupportedNativeMessagingAdapter(id),
    voice: id === 'win32'
      ? createWindowsVoiceAdapter()
      : id === 'linux'
        ? createLinuxVoiceAdapter()
        : createUnsupportedVoiceAdapter(id),
    videoAudio: createUnsupportedVideoAudioAdapter(id),
    windowChrome: id === 'win32'
      ? createWindowsWindowChromeAdapter()
      : id === 'linux'
        ? createLinuxWindowChromeAdapter()
        : createUnsupportedWindowChromeAdapter(id),
    stealthUa: id === 'win32'
      ? createWindowsStealthUaAdapter()
      : id === 'linux'
        ? createDarwinStealthUaAdapter()
        : createUnsupportedStealthUaAdapter(id),
    updater: id === 'win32'
      ? createWindowsUpdaterAdapter()
      : createUnsupportedUpdaterAdapter(id),
  };
}

export function selectPlatform(platform: NodeJS.Platform | string = process.platform): PlatformAdapter {
  const id = normalizePlatform(platform);
  if (id === 'darwin') {
    return createDarwinPlatform();
  }
  return createStubPlatform(id);
}
