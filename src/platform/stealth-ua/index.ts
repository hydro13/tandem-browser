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

// A macOS Chrome on Apple Silicon reports its GPU through ANGLE's Metal
// backend, and Retina displays report 30-bit colour. These must travel with
// the macOS UA so the persona stays internally consistent.
const DARWIN_FINGERPRINT: StealthUaFingerprint = {
  webglVendor: 'Google Inc. (Apple)',
  webglRenderer: 'ANGLE (Apple, Apple M1, OpenGL 4.1)',
  colorDepth: 30,
};

// A Windows Chrome reports its GPU through ANGLE's Direct3D11 backend and a
// 24-bit colour depth. Intel UHD 630 is one of the most common Windows GPUs,
// so it blends in rather than forming a distinctive fingerprint.
const WINDOWS_FINGERPRINT: StealthUaFingerprint = {
  webglVendor: 'Google Inc. (Intel)',
  webglRenderer: 'ANGLE (Intel, Intel(R) UHD Graphics 630 Direct3D11 vs_5_0 ps_5_0, D3D11)',
  colorDepth: 24,
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
