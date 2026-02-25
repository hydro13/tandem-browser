import { Session } from 'electron';
import path from 'path';
import fs from 'fs';
import os from 'os';

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

// Known native messaging hosts that extensions in our gallery depend on
const KNOWN_HOSTS: Record<string, { extensionName: string; extensionId: string }> = {
  'com.1password.1password': { extensionName: '1Password', extensionId: 'aeblfdkhhhdcdjpifhhbdiojplfjncoa' },
  'com.lastpass.nplastpass': { extensionName: 'LastPass', extensionId: 'hdokiejnpimakedhajhdlcegeplioahd' },
  'com.postman.postmanagent': { extensionName: 'Postman Interceptor', extensionId: 'aicmkgpgakddgnaphhhpliifpcfnhce' },
};

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
        break;

      case 'linux':
        // Linux: system-wide and per-user directories
        dirs.push('/etc/opt/chrome/native-messaging-hosts');
        dirs.push(path.join(os.homedir(), '.config', 'google-chrome', 'NativeMessagingHosts'));
        // Chromium
        dirs.push(path.join(os.homedir(), '.config', 'chromium', 'NativeMessagingHosts'));
        break;

      case 'win32':
        // Windows: native messaging hosts are registered in the Windows Registry.
        // We cannot read registry values from Node.js without native modules,
        // so we check common filesystem paths where hosts may also be installed.
        const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
        dirs.push(path.join(localAppData, 'Google', 'Chrome', 'User Data', 'NativeMessagingHosts'));
        break;
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
          console.log(`🔌 Native messaging: configured directory ${dir.path}`);
        } else if (!apiChecked) {
          // API not available — log once
          apiChecked = true;
          console.log('🔌 Native messaging: session.setNativeMessagingHostDirectory() not available in this Electron version');
          console.log('   Chromium may still read native messaging hosts from standard Chrome directories automatically');
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.warn(`⚠️ Native messaging: failed to configure directory ${dir.path}: ${message}`);
      }
    }

    // Check known hosts for missing native apps
    for (const [hostName, info] of Object.entries(KNOWN_HOSTS)) {
      const host = this.hosts.find(h => h.name === hostName);
      if (!host) {
        missing.push(hostName);
        console.log(`🔌 Native messaging: ${info.extensionName} requires "${hostName}" — desktop app not installed`);
      } else if (!host.binaryExists) {
        missing.push(hostName);
        console.warn(`⚠️ Native messaging: ${info.extensionName} host "${hostName}" found but binary missing at ${host.binaryPath}`);
      } else {
        console.log(`🔌 Native messaging: ${info.extensionName} host "${hostName}" — ready (binary at ${host.binaryPath})`);
      }
    }

    // Log summary of all detected hosts
    if (this.hosts.length > 0) {
      console.log(`🔌 Native messaging: ${this.hosts.length} host(s) detected, ${this.hosts.filter(h => h.binaryExists).length} with valid binaries`);
    } else {
      console.log('🔌 Native messaging: no hosts detected on this system');
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
   * Check if a specific known extension has its native messaging host available.
   */
  isHostAvailable(extensionId: string): boolean {
    for (const [hostName, info] of Object.entries(KNOWN_HOSTS)) {
      if (info.extensionId === extensionId) {
        const host = this.hosts.find(h => h.name === hostName);
        return !!host && host.binaryExists;
      }
    }
    // Extension not in known hosts list — assume no native messaging needed
    return true;
  }

  /**
   * Get known host info for a given extension ID, if any.
   */
  getHostForExtension(extensionId: string): { hostName: string; host: NativeMessagingHost | null } | null {
    for (const [hostName, info] of Object.entries(KNOWN_HOSTS)) {
      if (info.extensionId === extensionId) {
        const host = this.hosts.find(h => h.name === hostName) || null;
        return { hostName, host };
      }
    }
    return null;
  }
}
