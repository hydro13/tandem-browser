import { WebContents } from 'electron';
import { createLogger } from '../utils/logger';

const log = createLogger('DeviceEmulator');

export interface DeviceProfile {
  name: string;
  width: number;
  height: number;
  deviceScaleFactor: number;
  mobile: boolean;
  touch: boolean;
  userAgent: string;
}

// Built-in device profiles
export const DEVICE_PROFILES: Record<string, DeviceProfile> = {
  'iPhone 15': {
    name: 'iPhone 15',
    width: 393,
    height: 852,
    deviceScaleFactor: 3,
    mobile: true,
    touch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  },
  'iPhone SE': {
    name: 'iPhone SE',
    width: 375,
    height: 667,
    deviceScaleFactor: 2,
    mobile: true,
    touch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  },
  'Samsung Galaxy S24': {
    name: 'Samsung Galaxy S24',
    width: 360,
    height: 780,
    deviceScaleFactor: 3,
    mobile: true,
    touch: true,
    userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
  },
  'iPad Pro 12.9': {
    name: 'iPad Pro 12.9',
    width: 1024,
    height: 1366,
    deviceScaleFactor: 2,
    mobile: false,
    touch: true,
    userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  },
  'iPad Mini': {
    name: 'iPad Mini',
    width: 768,
    height: 1024,
    deviceScaleFactor: 2,
    mobile: false,
    touch: true,
    userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  },
  'Pixel 7': {
    name: 'Pixel 7',
    width: 412,
    height: 915,
    deviceScaleFactor: 2.625,
    mobile: true,
    touch: true,
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
  },
};

export interface EmulationState {
  active: boolean;
  profile?: DeviceProfile;
  custom?: {
    width: number;
    height: number;
    deviceScaleFactor?: number;
    mobile?: boolean;
    userAgent?: string;
  };
}

export class DeviceEmulator {
  private state: EmulationState = { active: false };

  // ─── Enable emulation ─────────────────────────

  async emulateDevice(wc: WebContents, deviceName: string): Promise<DeviceProfile> {
    const profile = DEVICE_PROFILES[deviceName];
    if (!profile) {
      const available = Object.keys(DEVICE_PROFILES).join(', ');
      throw new Error(`Unknown device "${deviceName}". Available: ${available}`);
    }
    await this.applyProfile(wc, profile);
    this.state = { active: true, profile };
    return profile;
  }

  async emulateCustom(wc: WebContents, params: {
    width: number;
    height: number;
    deviceScaleFactor?: number;
    mobile?: boolean;
    userAgent?: string;
  }): Promise<void> {
    const profile: DeviceProfile = {
      name: 'custom',
      width: params.width,
      height: params.height,
      deviceScaleFactor: params.deviceScaleFactor ?? 1,
      mobile: params.mobile ?? false,
      touch: params.mobile ?? false,
      userAgent: params.userAgent ?? wc.getUserAgent(),
    };
    await this.applyProfile(wc, profile);
    this.state = { active: true, custom: params };
  }

  async reset(wc: WebContents): Promise<void> {
    wc.disableDeviceEmulation();
    // Reset user agent to Electron default
    wc.setUserAgent(wc.session.getUserAgent());
    this.state = { active: false };
  }

  // ─── Persistence: re-apply after navigation ──

  /**
   * Called from main.ts after did-finish-load.
   * Re-applies the current emulation if active.
   */
  async reloadIntoTab(wc: WebContents): Promise<void> {
    if (!this.state.active) return;

    if (this.state.profile) {
      await this.applyProfile(wc, this.state.profile);
    } else if (this.state.custom) {
      await this.emulateCustom(wc, this.state.custom);
    }
  }

  // ─── Status ───────────────────────────────────

  getStatus(): EmulationState {
    return { ...this.state };
  }

  getProfiles(): DeviceProfile[] {
    return Object.values(DEVICE_PROFILES);
  }

  // ─── Internal ────────────────────────────────

  private async applyProfile(wc: WebContents, profile: DeviceProfile): Promise<void> {
    // Electron native device emulation API
    wc.enableDeviceEmulation({
      screenPosition: profile.mobile ? 'mobile' : 'desktop',
      screenSize: { width: profile.width, height: profile.height },
      viewPosition: { x: 0, y: 0 },
      deviceScaleFactor: profile.deviceScaleFactor,
      viewSize: { width: profile.width, height: profile.height },
      scale: 1,
    });

    // Set user agent
    wc.setUserAgent(profile.userAgent);

    // Enable touch events via JS (Electron enableDeviceEmulation doesn't always do this itself)
    if (profile.touch) {
      await wc.executeJavaScript(`
        // Simulate touch support for sites that check for it
        Object.defineProperty(navigator, 'maxTouchPoints', {
          get: () => 5, configurable: true
        });
      `).catch(e => log.warn('touch event injection failed (page may not be ready):', e instanceof Error ? e.message : e));
    }
  }
}
