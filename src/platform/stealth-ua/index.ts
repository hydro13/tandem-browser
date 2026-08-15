import { NotImplementedError, type PlatformId } from '../errors';
import type { StealthUaAdapter, StealthUaBrandVersion, StealthUaFingerprint, StealthUaProfile } from '../types';

function getChromeMajor(chromeVersion: string): string {
  return chromeVersion.split('.')[0];
}

function createBrandList(chromeMajor: string): StealthUaBrandVersion[] {
  return [
    { brand: 'Google Chrome', version: chromeMajor },
    { brand: 'Chromium', version: chromeMajor },
    { brand: 'Not(A:Brand', version: '8' },
  ];
}

function createFullVersionList(chromeVersion: string): StealthUaBrandVersion[] {
  return [
    { brand: 'Google Chrome', version: chromeVersion },
    { brand: 'Chromium', version: chromeVersion },
    { brand: 'Not(A:Brand', version: '8.0.0.0' },
  ];
}

function createProfile(
  chromeVersion: string,
  userAgentPlatform: string,
  clientHints: {
    platform: string;
    platformVersion: string;
    architecture: string;
    bitness: string;
  },
  requestHeaders: { platform: string; platformVersion?: string },
  fingerprint: StealthUaFingerprint,
): StealthUaProfile {
  const chromeMajor = getChromeMajor(chromeVersion);
  return {
    userAgent:
      `Mozilla/5.0 (${userAgentPlatform}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion} Safari/537.36`,
    chromeVersion,
    chromeMajor,
    clientHints: {
      brands: createBrandList(chromeMajor),
      mobile: false,
      platform: clientHints.platform,
      platformVersion: clientHints.platformVersion,
      architecture: clientHints.architecture,
      bitness: clientHints.bitness,
      model: '',
      uaFullVersion: chromeVersion,
      fullVersionList: createFullVersionList(chromeVersion),
    },
    requestHeaders,
    fingerprint,
  };
}

// Web-safe fonts present on both macOS and Windows. Listing them in both
// personas is correct — they genuinely exist on both.
const CROSS_PLATFORM_FONTS = [
  'Arial', 'Arial Black', 'Comic Sans MS', 'Courier New', 'Georgia', 'Impact',
  'Tahoma', 'Times New Roman', 'Trebuchet MS', 'Verdana',
];

// A macOS Chrome on Apple Silicon reports its GPU through ANGLE's Metal
// backend, and Retina displays report 30-bit colour. The base M1 exposes 8
// cores. These must travel with the macOS UA so the persona stays internally
// consistent.
const DARWIN_FINGERPRINT: StealthUaFingerprint = {
  webglVendor: 'Google Inc. (Apple)',
  webglRenderer: 'ANGLE (Apple, Apple M1, OpenGL 4.1)',
  colorDepth: 30,
  hardwareConcurrency: 8,
  deviceMemory: 8,
  fonts: [
    ...CROSS_PLATFORM_FONTS,
    'Courier', 'Helvetica', 'Helvetica Neue', 'Lucida Console', 'Lucida Grande',
    'Lucida Sans Unicode', 'Monaco', 'Palatino', 'Palatino Linotype', 'Times',
    'Apple Color Emoji', 'Apple SD Gothic Neo', 'Avenir', 'Avenir Next',
    'Futura', 'Geneva', 'Gill Sans', 'Menlo', 'Optima', 'San Francisco',
    'SF Pro', 'SF Mono', 'System Font', '-apple-system', 'BlinkMacSystemFont',
  ],
};

// A Windows Chrome reports its GPU through ANGLE's Direct3D11 backend and a
// 24-bit colour depth. Intel UHD 630 is one of the most common Windows GPUs,
// so it blends in rather than forming a distinctive fingerprint; it pairs with
// a mainstream 8-thread CPU, not the host's real core count. Fonts are the
// standard Windows 10/11 set, including the Segoe UI signature.
const WINDOWS_FINGERPRINT: StealthUaFingerprint = {
  webglVendor: 'Google Inc. (Intel)',
  webglRenderer: 'ANGLE (Intel, Intel(R) UHD Graphics 630 Direct3D11 vs_5_0 ps_5_0, D3D11)',
  colorDepth: 24,
  hardwareConcurrency: 8,
  deviceMemory: 8,
  fonts: [
    ...CROSS_PLATFORM_FONTS,
    'Bahnschrift', 'Calibri', 'Cambria', 'Cambria Math', 'Candara', 'Consolas',
    'Constantia', 'Corbel', 'Ebrima', 'Franklin Gothic Medium', 'Gabriola',
    'Gadugi', 'Lucida Console', 'Lucida Sans Unicode', 'Microsoft Sans Serif',
    'MS Gothic', 'MV Boli', 'Palatino Linotype', 'Segoe Print', 'Segoe Script',
    'Segoe UI', 'Segoe UI Emoji', 'Segoe UI Symbol', 'Sylfaen', 'Symbol',
    'Webdings', 'Wingdings', 'Yu Gothic',
  ],
};

function createDarwinProfile(chromeVersion: string): StealthUaProfile {
  return createProfile(
    chromeVersion,
    'Macintosh; Intel Mac OS X 10_15_7',
    {
      platform: 'macOS',
      platformVersion: '15.3.0',
      architecture: 'arm',
      bitness: '64',
    },
    { platform: '"macOS"' },
    DARWIN_FINGERPRINT,
  );
}

function createWindowsProfile(chromeVersion: string): StealthUaProfile {
  return createProfile(
    chromeVersion,
    'Windows NT 10.0; Win64; x64',
    {
      platform: 'Windows',
      platformVersion: '15.0.0',
      architecture: 'x86',
      bitness: '64',
    },
    { platform: '"Windows"', platformVersion: '"15.0.0"' },
    WINDOWS_FINGERPRINT,
  );
}

export function createDarwinStealthUaAdapter(): StealthUaAdapter {
  return {
    getUserAgent: (chromeVersion = process.versions.chrome) =>
      createDarwinProfile(chromeVersion).userAgent,
    getClientHintsPlatform: () => 'macOS',
    getProfile: (chromeVersion = process.versions.chrome) => createDarwinProfile(chromeVersion),
  };
}

export function createWindowsStealthUaAdapter(): StealthUaAdapter {
  return {
    getUserAgent: (chromeVersion = process.versions.chrome) =>
      createWindowsProfile(chromeVersion).userAgent,
    getClientHintsPlatform: () => 'Windows',
    getProfile: (chromeVersion = process.versions.chrome) => createWindowsProfile(chromeVersion),
  };
}

export function createUnsupportedStealthUaAdapter(platform: PlatformId): StealthUaAdapter {
  return {
    getUserAgent: () => {
      throw new NotImplementedError('Stealth UA', platform, 'phase-7');
    },
    getClientHintsPlatform: () => {
      throw new NotImplementedError('Stealth UA', platform, 'phase-7');
    },
    getProfile: () => {
      throw new NotImplementedError('Stealth UA', platform, 'phase-7');
    },
  };
}
