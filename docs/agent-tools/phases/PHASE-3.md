# Phase 3: Device Emulation

## Goal

Tandem draait altijd in desktop Chromium formaat. Na deze phase kan Kees schakelen naar
een mobiel apparaat — iPhone 15, Samsung Galaxy, iPad — met echte viewport, touch events,
pixel density en user-agent. Emulatie overleeft navigatie (re-applied op did-finish-load)
en is instelbaar via API of via preset device profielen.

## Prerequisites

- **Phase 1 + 2 MUST be COMPLETED** — check STATUS.md
- Lees `src/main.ts` — begrijp hoe ScriptInjector (Phase 1) is aangesloten op did-finish-load
  Device emulator volgt exact hetzelfde patroon
- Lees Electron docs: `webContents.enableDeviceEmulation(parameters)` en `disableDeviceEmulation()`
  Dit is een native Electron API — we gebruiken GEEN CDP `Emulation.*` commands
- Lees `src/api/server.ts` — hoe `getSessionWC(req)` werkt

## Deliverables

### 1. `src/device/emulator.ts` — DeviceEmulator

```typescript
import { WebContents } from 'electron';

export interface DeviceProfile {
  name: string;
  width: number;
  height: number;
  deviceScaleFactor: number;
  mobile: boolean;
  touch: boolean;
  userAgent: string;
}

// Ingebouwde device profielen
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

  // ─── Emulatie activeren ───────────────────────

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
    // Reset user agent naar Electron default
    wc.setUserAgent(wc.session.getUserAgent());
    this.state = { active: false };
  }

  // ─── Persistentie: re-apply na navigatie ─────

  /**
   * Geroepen vanuit main.ts na did-finish-load.
   * Re-applyt de huidige emulatie als die actief is.
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

  // ─── Intern ───────────────────────────────────

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

    // User agent instellen
    wc.setUserAgent(profile.userAgent);

    // Touch events activeren via JS (Electron enableDeviceEmulation doet dit niet altijd zelf)
    if (profile.touch) {
      await wc.executeJavaScript(`
        // Simuleer touch support voor sites die erop controleren
        Object.defineProperty(navigator, 'maxTouchPoints', {
          get: () => 5, configurable: true
        });
      `).catch(() => {}); // Silently fail als page nog niet klaar is
    }
  }
}
```

### 2. `src/main.ts` — Wire DeviceEmulator aan did-finish-load

Volg exact hetzelfde patroon als ScriptInjector (Phase 1):

```typescript
import { DeviceEmulator } from './device/emulator';
const deviceEmulator = new DeviceEmulator();

// In startAPI() meegeven
startAPI({
  // ... bestaande opties
  scriptInjector,
  deviceEmulator,  // ← nieuw
});

// In de activity-webview-event IPC handler, NAAST de scriptInjector call:
if (data.type === 'did-finish-load') {
  const tab = tabManager.getTab(data.tabId);
  if (tab?.webContents && !tab.webContents.isDestroyed()) {
    scriptInjector.reloadIntoTab(tab.webContents).catch(() => {});
    deviceEmulator.reloadIntoTab(tab.webContents).catch(() => {}); // ← nieuw
  }
}
```

### 3. `src/api/server.ts` — Routes registreren

Voeg `DeviceEmulator` toe aan `TandemAPIOptions` en registreer:

```
GET    /device/profiles              —                               → {profiles: [...]}
GET    /device/status                —                               → EmulationState
POST   /device/emulate               body: {device: "iPhone 15"}    → {ok, profile}
                                  OF body: {width, height, ...}     → {ok}
POST   /device/reset                 —                               → {ok}
```

Implementatie:

```typescript
// GET /device/profiles
this.app.get('/device/profiles', (_req: Request, res: Response) => {
  res.json({ profiles: this.deviceEmulator.getProfiles() });
});

// GET /device/status
this.app.get('/device/status', (_req: Request, res: Response) => {
  res.json(this.deviceEmulator.getStatus());
});

// POST /device/emulate
this.app.post('/device/emulate', async (req: Request, res: Response) => {
  try {
    const wc = await this.getSessionWC(req);
    if (!wc) { res.status(500).json({ error: 'No active tab' }); return; }

    const { device, width, height, deviceScaleFactor, mobile, userAgent } = req.body;

    if (device) {
      // Preset profiel
      const profile = await this.deviceEmulator.emulateDevice(wc, device);
      res.json({ ok: true, profile });
    } else if (width && height) {
      // Custom dimensies
      await this.deviceEmulator.emulateCustom(wc, {
        width: Number(width),
        height: Number(height),
        deviceScaleFactor: deviceScaleFactor ? Number(deviceScaleFactor) : undefined,
        mobile: Boolean(mobile),
        userAgent,
      });
      res.json({ ok: true });
    } else {
      res.status(400).json({ error: '"device" or "width"+"height" required' });
    }
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// POST /device/reset
this.app.post('/device/reset', async (req: Request, res: Response) => {
  try {
    const wc = await this.getSessionWC(req);
    if (!wc) { res.status(500).json({ error: 'No active tab' }); return; }
    await this.deviceEmulator.reset(wc);
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});
```

## Verificatie Checklist

```bash
TOKEN=$(cat ~/.tandem/api-token)
H="Authorization: Bearer $TOKEN"

# Profielen bekijken
curl -s -H "$H" http://127.0.0.1:8765/device/profiles | jq '.profiles[].name'
# → "iPhone 15", "iPhone SE", "Samsung Galaxy S24", ...

# Status: inactief
curl -s -H "$H" http://127.0.0.1:8765/device/status | jq .
# → {"active":false}

# iPhone 15 activeren
curl -s -X POST -H "$H" -H "Content-Type: application/json" \
  -d '{"device":"iPhone 15"}' http://127.0.0.1:8765/device/emulate | jq .
# → {"ok":true,"profile":{"name":"iPhone 15","width":393,"height":852,...}}

# Status: actief
curl -s -H "$H" http://127.0.0.1:8765/device/status | jq .
# → {"active":true,"profile":{"name":"iPhone 15",...}}

# Controleer user agent
curl -s -X POST -H "$H" -H "Content-Type: application/json" \
  -d '{"code":"navigator.userAgent"}' http://127.0.0.1:8765/execute-js | jq .result
# → "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)..."

# Controleer viewport
curl -s -X POST -H "$H" -H "Content-Type: application/json" \
  -d '{"code":"window.innerWidth + \"x\" + window.innerHeight"}' \
  http://127.0.0.1:8765/execute-js | jq .result
# → "393x852"

# Screenshot op mobiele dimensies
curl -s -H "$H" http://127.0.0.1:8765/screenshot -o /tmp/mobile.png
# Open /tmp/mobile.png — moet 393x852 (of 1179x2556 met 3x scale) zijn

# Navigeer — emulatie moet blijven
curl -s -X POST -H "$H" -H "Content-Type: application/json" \
  -d '{"url":"https://m.google.com"}' http://127.0.0.1:8765/navigate
sleep 2
curl -s -X POST -H "$H" -H "Content-Type: application/json" \
  -d '{"code":"navigator.userAgent"}' http://127.0.0.1:8765/execute-js | jq .result
# → Nog steeds iPhone UA

# Custom dimensies
curl -s -X POST -H "$H" -H "Content-Type: application/json" \
  -d '{"width":800,"height":600}' http://127.0.0.1:8765/device/emulate | jq .

# Reset
curl -s -X POST -H "$H" http://127.0.0.1:8765/device/reset | jq .
# → {"ok":true}

curl -s -H "$H" http://127.0.0.1:8765/device/status | jq .
# → {"active":false}

# TypeScript check
npx tsc --noEmit
# 0 errors

# Regressie Phase 1
curl -s -H "$H" http://127.0.0.1:8765/scripts | jq .
curl -s -H "$H" http://127.0.0.1:8765/styles | jq .

# Regressie Phase 2
curl -s -X POST -H "$H" -H "Content-Type: application/json" \
  -d '{"by":"role","value":"link"}' http://127.0.0.1:8765/find | jq .
```

## Commit Convention

```bash
git add src/device/ src/main.ts src/api/server.ts
git commit -m "feat(agent-tools): Phase 3 — device emulation

- Add DeviceEmulator (src/device/emulator.ts)
- 6 built-in profiles: iPhone 15, iPhone SE, Galaxy S24, iPad Pro, iPad Mini, Pixel 7
- POST /device/emulate (preset or custom), GET /device/profiles, /device/status
- POST /device/reset restores desktop UA and viewport
- Emulation re-applied after navigation (did-finish-load hook)
- Uses Electron native enableDeviceEmulation() API

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
git push origin main
```

## Scope (1 Claude Code sessie)

- `src/device/emulator.ts` — nieuw bestand
- `src/main.ts` — DeviceEmulator init + did-finish-load hook (naast ScriptInjector)
- `src/api/server.ts` — TandemAPIOptions + 4 routes
- TypeScript check + verificatie + commit
