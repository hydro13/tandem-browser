import type { Session } from 'electron';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { createLogger } from '../utils/logger';

const log = createLogger('NativeMessaging');

// ─── Types ───────────────────────────────────────────────────────────────────

export interface NativeMessagingHost {
  name: string;
  description: string;
  binaryPath: string;
  binaryExists: boolean;
  allowedExtensions: string[];
  manifestPath: string;
}

export interface NativeMessagingStatus {
  supported: boolean;
  directories: { path: string; exists: boolean }[];
  hosts: NativeMessagingHost[];
  configured: string[];
  missing: string[];
}

export interface NativeMessagingHostAccessDecision {
  allowed: boolean;
  hostName: string;
  resolvedHostName: string;
  reason: string;
}

// Host aliases used by extension variants that expect the same native helper.
const HOST_ALIASES: Record<string, string> = {
  'com.1password.1password7': 'com.1password.1password',
};

// Known native messaging hosts that extensions in our gallery depend on
const KNOWN_HOSTS: Record<string, { extensionName: string; extensionIds: string[] }> = {
  // Multiple extension IDs: official CWS ID + Tandem-extracted ID (differs because
  // Tandem loads the extension locally, which generates a different Electron ID)
  'com.1password.1password': { extensionName: '1Password', extensionIds: ['aeblfdkhhhdcdjpifhhbdiojplfjncoa', 'chdppelbdlmkldaobdpeaemleeajiodj'] },
  'com.1password.1password7': { extensionName: '1Password', extensionIds: ['aeblfdkhhhdcdjpifhhbdiojplfjncoa', 'chdppelbdlmkldaobdpeaemleeajiodj'] },
  'com.lastpass.nplastpass': { extensionName: 'LastPass', extensionIds: ['hdokiejnpimakedhajhdlcegeplioahd'] },
  'com.postman.postmanagent': { extensionName: 'Postman Interceptor', extensionIds: ['aicmkgpgakddgnaphhhpliifpcfhicfo'] },
};

function resolveHostName(hostName: string): string {
  return HOST_ALIASES[hostName] ?? hostName;
}

/**
 * NativeMessagingSetup — Detects and configures native messaging hosts.
 *
 * Native messaging allows Chrome extensions to communicate with desktop apps
 * via stdio. Desktop apps install JSON manifest files in platform-specific
 * directories. This class detects those manifests and attempts to configure
 * the Electron session to use them.
 *
 * Note: Electron 40 does not expose a public `setNativeMessagingHostDirectory()`
 * API. However, Chromium's internal extension system may read from Chrome's
 * standard native messaging host directories automatically when extensions
 * call `chrome.runtime.connectNative()`. This class detects available hosts
 * and reports status for the UI.
 */
export class NativeMessagingSetup {
  private hosts: NativeMessagingHost[] = [];
  private configuredDirs: string[] = [];
  private missingHosts: string[] = [];
  private apiSupported = false;

  /**
   * Get the platform-specific directories where native messaging host
   * manifests are installed.
   */
  getNativeMessagingDirs(): { path: string; exists: boolean }[] {
    const dirs: string[] = [];

    switch (process.platform) {
      case 'darwin':
        // macOS: system-wide and per-user directories
        dirs.push('/Library/Google/Chrome/NativeMessagingHosts');
        dirs.push(path.join(os.homedir(), 'Library', 'Application Support', 'Google', 'Chrome', 'NativeMessagingHosts'));
        // Chromium (non-Google-branded) directories
        dirs.push(path.join(os.homedir(), 'Library', 'Application Support', 'Chromium', 'NativeMessagingHosts'));
        // Tandem Browser / Electron app-specific directories
        // Electron 40 does not expose setNativeMessagingHostDirectory(); it reads from
        // the app's own userData directory. We mirror manifests there at startup.
        dirs.push(path.join(os.homedir(), 'Library', 'Application Support', 'Tandem Browser', 'NativeMessagingHosts'));
        dirs.push(path.join(os.homedir(), 'Library', 'Application Support', 'tandem-browser', 'NativeMessagingHosts'));
        dirs.push(path.join(os.homedir(), 'Library', 'Application Support', 'Electron', 'NativeMessagingHosts'));
        break;

      case 'linux':
        // Linux: system-wide and per-user directories
        dirs.push('/etc/opt/chrome/native-messaging-hosts');
        dirs.push(path.join(os.homedir(), '.config', 'google-chrome', 'NativeMessagingHosts'));
        // Chromium
        dirs.push(path.join(os.homedir(), '.config', 'chromium', 'NativeMessagingHosts'));
        break;

      case 'win32': {
        // Windows: native messaging hosts are registered in the Windows Registry.
        // We cannot read registry values from Node.js without native modules,
        // so we check common filesystem paths where hosts may also be installed.
        const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
        dirs.push(path.join(localAppData, 'Google', 'Chrome', 'User Data', 'NativeMessagingHosts'));
        break;
      }
    }

    return dirs.map(d => ({ path: d, exists: fs.existsSync(d) }));
  }

  /**
   * Detect all native messaging host manifests in the known directories.
   * Reads each .json manifest file and checks if the referenced binary exists.
   */
  detectHosts(): NativeMessagingHost[] {
    const dirs = this.getNativeMessagingDirs();
    const hosts: NativeMessagingHost[] = [];
    const seenNames = new Set<string>();

    for (const dir of dirs) {
      if (!dir.exists) continue;

      try {
        const files = fs.readdirSync(dir.path)
          .filter(f => f.endsWith('.json'));

        for (const file of files) {
          const manifestPath = path.join(dir.path, file);
          try {
            const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

            if (!manifest.name || typeof manifest.name !== 'string') continue;
            if (seenNames.has(manifest.name)) continue;
            seenNames.add(manifest.name);

            const binaryPath = manifest.path || '';
            const binaryExists = binaryPath ? fs.existsSync(binaryPath) : false;

            const allowedExtensions: string[] = [];
            if (Array.isArray(manifest.allowed_origins)) {
              for (const origin of manifest.allowed_origins) {
                // Format: "chrome-extension://extensionid/"
                const match = typeof origin === 'string' ? origin.match(/chrome-extension:\/\/([a-p]{32})\/?/) : null;
                if (match) allowedExtensions.push(match[1]);
              }
            }
            if (Array.isArray(manifest.allowed_extensions)) {
              for (const ext of manifest.allowed_extensions) {
                if (typeof ext === 'string' && !allowedExtensions.includes(ext)) {
                  allowedExtensions.push(ext);
                }
              }
            }

            hosts.push({
              name: manifest.name,
              description: manifest.description || '',
              binaryPath,
              binaryExists,
              allowedExtensions,
              manifestPath,
            });
          } catch {
            // Invalid JSON or unreadable file — skip
          }
        }
      } catch {
        // Directory not readable — skip
      }
    }

    this.hosts = hosts;
    return hosts;
  }

  /**
   * Configure the Electron session for native messaging.
   *
   * Attempts to call session.setNativeMessagingHostDirectory() if available.
   * This API is not part of Electron's public TypeScript definitions but may
   * exist at runtime in some builds. Falls back to logging host status if
   * the API is not available.
   */
  configure(session: Session): { configured: string[]; missing: string[] } {
    const dirs = this.getNativeMessagingDirs();
    const configured: string[] = [];
    const missing: string[] = [];

    // Detect hosts first
    if (this.hosts.length === 0) {
      this.detectHosts();
    }

    // Mirror manifests from Chrome/Chromium dirs into Tandem's own userData dir.
    // Electron 40 does not expose setNativeMessagingHostDirectory(); it reads native
    // messaging host manifests from its own app userData path, NOT Chrome's directory.
    // Actual Tandem userData: ~/Library/Application Support/Tandem Browser/
    // We copy every manifest found in Chrome/Chromium dirs into the Tandem dir so
    // that Electron's internal Chromium code finds them automatically.
    this.mirrorManifestsToTandemDir();

    // Attempt to configure each existing directory
    let apiChecked = false;
    for (const dir of dirs) {
      if (!dir.exists) continue;

      try {
        // Try the API at runtime — it may exist even if not in TypeScript defs
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const ses = session as any;
        if (typeof ses.setNativeMessagingHostDirectory === 'function') {
          ses.setNativeMessagingHostDirectory(dir.path);
          configured.push(dir.path);
          this.apiSupported = true;
          log.info(`🔌 Native messaging: configured directory ${dir.path}`);
        } else if (!apiChecked) {
          // API not available — log once, and dump available native-messaging-related session properties
          apiChecked = true;
          log.info('🔌 Native messaging: session.setNativeMessagingHostDirectory() not available in Electron 40');
          log.info('   Manifests mirrored to Tandem Browser/NativeMessagingHosts/ for Chromium auto-discovery');
          // Debug: find any native/messaging-related properties on session
          try {
            const allKeys: string[] = [];
            let obj: object | null = ses;
            while (obj && obj !== Object.prototype) {
              allKeys.push(...Object.getOwnPropertyNames(obj));
              obj = Object.getPrototypeOf(obj) as object | null;
            }
            const interesting = allKeys.filter(k =>
              /native|messaging|host|extension/i.test(k)
            );
            log.info(`🔌 Session props matching native/messaging/host/extension: ${interesting.join(', ')}`);
            // Also check ses.extensions sub-object
            if (ses.extensions && typeof ses.extensions === 'object') {
              const extKeys: string[] = [];
              let eObj: object | null = ses.extensions as object;
              while (eObj && eObj !== Object.prototype) {
                extKeys.push(...Object.getOwnPropertyNames(eObj));
                eObj = Object.getPrototypeOf(eObj) as object | null;
              }
              const extInteresting = extKeys.filter(k =>
                /native|messaging|host|extension|load/i.test(k)
              );
              log.info(`🔌 session.extensions props: ${extInteresting.join(', ')}`);
            }
          } catch (_e) {
            log.info('🔌 Could not enumerate session properties');
          }
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        log.warn(`⚠️ Native messaging: failed to configure directory ${dir.path}: ${message}`);
      }
    }

    // Check known hosts for missing native apps
    for (const [hostName, info] of Object.entries(KNOWN_HOSTS)) {
      const canonicalHostName = resolveHostName(hostName);
      const host = this.hosts.find(h => h.name === hostName || h.name === canonicalHostName);
      if (!host) {
        missing.push(hostName);
        log.info(`🔌 Native messaging: ${info.extensionName} requires "${hostName}" — desktop app not installed`);
      } else if (!host.binaryExists) {
        missing.push(hostName);
        log.warn(`⚠️ Native messaging: ${info.extensionName} host "${hostName}" found but binary missing at ${host.binaryPath}`);
      } else {
        log.info(`🔌 Native messaging: ${info.extensionName} host "${hostName}" — ready (binary at ${host.binaryPath})`);
      }
    }

    // Log summary of all detected hosts
    if (this.hosts.length > 0) {
      log.info(`🔌 Native messaging: ${this.hosts.length} host(s) detected, ${this.hosts.filter(h => h.binaryExists).length} with valid binaries`);
    } else {
      log.info('🔌 Native messaging: no hosts detected on this system');
    }

    this.configuredDirs = configured;
    this.missingHosts = missing;

    return { configured, missing };
  }

  /**
   * Get the current native messaging status for the API endpoint.
   */
  getStatus(): NativeMessagingStatus {
    return {
      supported: this.apiSupported,
      directories: this.getNativeMessagingDirs(),
      hosts: this.hosts,
      configured: this.configuredDirs,
      missing: this.missingHosts,
    };
  }

  /**
   * Check whether a host manifest explicitly allows one of the candidate extension IDs.
   * Runtime-assigned IDs may differ from the Chrome Web Store ID, so callers can pass both.
   */
  evaluateHostAccess(
    hostName: string,
    candidateExtensionIds: Array<string | null | undefined>,
  ): NativeMessagingHostAccessDecision {
    if (this.hosts.length === 0) {
      this.detectHosts();
    }

    const resolvedHostName = resolveHostName(hostName);
    const host = this.hosts.find((entry) => entry.name === hostName || entry.name === resolvedHostName);
    if (!host) {
      return {
        allowed: false,
        hostName,
        resolvedHostName,
        reason: `native messaging host "${hostName}" is not installed`,
      };
    }

    if (!host.binaryExists) {
      return {
        allowed: false,
        hostName,
        resolvedHostName,
        reason: `native messaging host "${host.name}" exists but its binary is missing`,
      };
    }

    const extensionIds = [...new Set(candidateExtensionIds.filter((id): id is string => typeof id === 'string' && id.length > 0))];
    if (extensionIds.length === 0) {
      return {
        allowed: false,
        hostName,
        resolvedHostName,
        reason: `native messaging host "${host.name}" requires an explicit extension identity`,
      };
    }

    const allowedExtensionIds = new Set(host.allowedExtensions);
    for (const [knownHostName, info] of Object.entries(KNOWN_HOSTS)) {
      if (knownHostName === host.name || resolveHostName(knownHostName) === resolvedHostName) {
        for (const extensionId of info.extensionIds) {
          allowedExtensionIds.add(extensionId);
        }
      }
    }

    if (allowedExtensionIds.size === 0) {
      return {
        allowed: false,
        hostName,
        resolvedHostName,
        reason: `native messaging host "${host.name}" does not declare any allowed extensions`,
      };
    }

    if (!extensionIds.some((id) => allowedExtensionIds.has(id))) {
      return {
        allowed: false,
        hostName,
        resolvedHostName,
        reason: `host "${host.name}" does not allow extension IDs: ${extensionIds.join(', ')}`,
      };
    }

    return {
      allowed: true,
      hostName,
      resolvedHostName,
      reason: `host "${host.name}" explicitly allows the extension`,
    };
  }

  /**
   * Check if a specific known extension has its native messaging host available.
   */
  isHostAvailable(extensionId: string): boolean {
    for (const [hostName, info] of Object.entries(KNOWN_HOSTS)) {
      if (info.extensionIds.includes(extensionId)) {
        const canonicalHostName = resolveHostName(hostName);
        const host = this.hosts.find(h => h.name === hostName || h.name === canonicalHostName);
        return !!host && host.binaryExists;
      }
    }
    // Extension not in known hosts list — assume no native messaging needed
    return true;
  }

  /**
   * Mirror native messaging host manifests from Chrome/Chromium directories into
   * the Tandem Browser userData directory so Electron's Chromium finds them.
   *
   * Electron 40 reads native messaging manifests from the app userData path
   * (~/Library/Application Support/Tandem Browser/NativeMessagingHosts/) rather
   * than Chrome's directory. This method copies manifests at startup so the
   * extension's chrome.runtime.connectNative() calls succeed.
   */
  private mirrorManifestsToTandemDir(): void {
    const tandemDir = path.join(os.homedir(), 'Library', 'Application Support', 'Tandem Browser', 'NativeMessagingHosts');

    // Source directories (Chrome/Chromium) — skip Tandem dirs themselves
    const sourceDirs = [
      path.join(os.homedir(), 'Library', 'Application Support', 'Google', 'Chrome', 'NativeMessagingHosts'),
      '/Library/Google/Chrome/NativeMessagingHosts',
      path.join(os.homedir(), 'Library', 'Application Support', 'Chromium', 'NativeMessagingHosts'),
    ].filter(d => d !== tandemDir && fs.existsSync(d));

    if (sourceDirs.length === 0) return;

    try {
      fs.mkdirSync(tandemDir, { recursive: true });
    } catch {
      log.warn('⚠️ Native messaging: failed to create Tandem NativeMessagingHosts directory');
      return;
    }

    let mirrored = 0;
    for (const srcDir of sourceDirs) {
      try {
        const files = fs.readdirSync(srcDir).filter(f => f.endsWith('.json'));
        for (const file of files) {
          const src = path.join(srcDir, file);
          const dst = path.join(tandemDir, file);
          try {
            const srcStat = fs.statSync(src);
            let needsCopy = true;
            try {
              const dstStat = fs.statSync(dst);
              // Only copy if source is newer
              needsCopy = srcStat.mtimeMs > dstStat.mtimeMs;
            } catch {
              // dst doesn't exist — copy
            }
            if (needsCopy) {
              fs.copyFileSync(src, dst);
              mirrored++;
            }
          } catch {
            // Skip unreadable files
          }
        }
      } catch {
        // Skip unreadable dirs
      }
    }

    if (mirrored > 0) {
      log.info(`🔌 Native messaging: mirrored ${mirrored} manifest(s) to ${tandemDir}`);
    }
  }

  /**
   * Get known host info for a given extension ID, if any.
   */
  getHostForExtension(extensionId: string): { hostName: string; host: NativeMessagingHost | null } | null {
    for (const [hostName, info] of Object.entries(KNOWN_HOSTS)) {
      if (info.extensionIds.includes(extensionId)) {
        const canonicalHostName = resolveHostName(hostName);
        const host = this.hosts.find(h => h.name === hostName || h.name === canonicalHostName) || null;
        return { hostName, host };
      }
    }
    return null;
  }
}
