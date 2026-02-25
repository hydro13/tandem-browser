import path from 'path';
import fs from 'fs';
import os from 'os';

// ─── Types ───────────────────────────────────────────────────────────────────

export type ConflictType =
  | 'dnr-overlap'
  | 'native-messaging'
  | 'content-script-broad'
  | 'keyboard-shortcut';

export interface ExtensionConflict {
  extensionId: string;
  extensionName: string;
  conflictType: ConflictType;
  severity: 'info' | 'warning' | 'critical';
  description: string;
  recommendation: string;
}

// ─── Tandem Keyboard Shortcuts ───────────────────────────────────────────────
// Registered at the BrowserWindow level via Electron Menu accelerators.
// Tandem shortcuts always win over extension shortcuts.

interface TandemShortcut {
  /** Normalized form: e.g. "Ctrl+T", "Ctrl+Shift+B" (Ctrl = Cmd on macOS) */
  key: string;
  action: string;
}

const TANDEM_SHORTCUTS: TandemShortcut[] = [
  { key: 'Ctrl+,', action: 'Settings' },
  { key: 'Ctrl+T', action: 'New Tab' },
  { key: 'Ctrl+W', action: 'Close Tab' },
  { key: 'Ctrl+Shift+T', action: 'Reopen Closed Tab' },
  { key: 'Ctrl+D', action: 'Bookmark Page' },
  { key: 'Ctrl+Shift+B', action: 'Toggle Bookmarks Bar' },
  { key: 'Ctrl+F', action: 'Find in Page' },
  { key: 'Ctrl+Y', action: 'History' },
  { key: 'Ctrl+=', action: 'Zoom In' },
  { key: 'Ctrl+-', action: 'Zoom Out' },
  { key: 'Ctrl+0', action: 'Reset Zoom' },
  { key: 'Ctrl+K', action: 'Toggle Panel (Chat)' },
  { key: 'Ctrl+L', action: 'Focus URL Bar' },
  { key: 'Ctrl+R', action: 'Record Tab Audio' },
  { key: 'Ctrl+Shift+M', action: 'Voice Input' },
  { key: 'Ctrl+Shift+P', action: 'PiP Mode' },
  { key: 'Ctrl+Shift+D', action: 'Draw Mode' },
  { key: 'Ctrl+Shift+S', action: 'Quick Screenshot' },
  { key: 'Ctrl+Shift+C', action: 'ClaroNote Record' },
  { key: 'Ctrl+Shift+/', action: 'Keyboard Shortcuts' },
  // Cmd+1-9 tab switching
  { key: 'Ctrl+1', action: 'Switch to Tab 1' },
  { key: 'Ctrl+2', action: 'Switch to Tab 2' },
  { key: 'Ctrl+3', action: 'Switch to Tab 3' },
  { key: 'Ctrl+4', action: 'Switch to Tab 4' },
  { key: 'Ctrl+5', action: 'Switch to Tab 5' },
  { key: 'Ctrl+6', action: 'Switch to Tab 6' },
  { key: 'Ctrl+7', action: 'Switch to Tab 7' },
  { key: 'Ctrl+8', action: 'Switch to Tab 8' },
  { key: 'Ctrl+9', action: 'Switch to Tab 9' },
];

// Broad content script match patterns that inject into all or nearly all pages
const BROAD_CONTENT_SCRIPT_PATTERNS = [
  '<all_urls>',
  '*://*/*',
  'http://*/*',
  'https://*/*',
];

// ─── ConflictDetector ────────────────────────────────────────────────────────

/**
 * ConflictDetector — Analyzes extension manifests for potential conflicts
 * with Tandem's security stack, keyboard shortcuts, and each other.
 *
 * Conflict types:
 * - dnr-overlap: Extension uses declarativeNetRequest (may overlap with NetworkShield)
 * - native-messaging: Extension requires a desktop companion app
 * - content-script-broad: Extension injects scripts into all pages
 * - keyboard-shortcut: Extension shortcut conflicts with Tandem shortcut
 *
 * Phase 1 DNR test result: Guardian's dispatcher still fires with DNR extensions
 * loaded (2 onBeforeRequest consumers registered). DNR may block some requests
 * before they reach webRequest hooks, but Guardian still processes requests that
 * reach Electron's network layer. Severity: 'warning' (not critical).
 *
 * ScriptGuard note: Extension content scripts bypass ScriptGuard — they are
 * injected by Electron's extension system, not via CDP. No whitelist is needed;
 * broad content script patterns are logged for security auditing only.
 */
export class ConflictDetector {
  /**
   * Analyze a single extension's manifest for conflicts.
   * @param manifestPath - Absolute path to the extension's manifest.json
   * @returns Array of detected conflicts (empty if none)
   */
  analyzeManifest(manifestPath: string): ExtensionConflict[] {
    const conflicts: ExtensionConflict[] = [];

    let manifest: Record<string, unknown>;
    try {
      manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    } catch {
      return conflicts;
    }

    const extensionId = path.basename(path.dirname(manifestPath));
    const extensionName = typeof manifest.name === 'string' ? manifest.name : extensionId;

    // Extract permissions (MV2 + MV3 formats)
    const permissions: string[] = [
      ...(Array.isArray(manifest.permissions) ? manifest.permissions : []),
      ...(Array.isArray(manifest.optional_permissions) ? manifest.optional_permissions : []),
    ].filter((p): p is string => typeof p === 'string');

    // 1. DNR overlap detection
    const hasDnrPermission = permissions.includes('declarativeNetRequest') ||
      permissions.includes('declarativeNetRequestWithHostAccess');
    const hasDnrManifestKey = manifest.declarative_net_request != null &&
      typeof manifest.declarative_net_request === 'object';

    if (hasDnrPermission || hasDnrManifestKey) {
      // Phase 1 test: Guardian still fires → severity 'warning'
      conflicts.push({
        extensionId,
        extensionName,
        conflictType: 'dnr-overlap',
        severity: 'warning',
        description: 'Uses declarativeNetRequest rules that may overlap with NetworkShield',
        recommendation: "Tandem's NetworkShield already blocks malicious domains. This extension is redundant for security but useful for ad blocking.",
      });
    }

    // 2. Native messaging dependency
    if (permissions.includes('nativeMessaging')) {
      conflicts.push({
        extensionId,
        extensionName,
        conflictType: 'native-messaging',
        severity: 'warning',
        description: 'Requires a desktop companion app via native messaging',
        recommendation: 'Ensure the companion desktop application is installed. Check GET /extensions/native-messaging/status for host detection.',
      });
    }

    // 3. Broad content script injection
    // Extension content scripts bypass ScriptGuard (injected by Electron, not CDP).
    // We detect broad patterns for security audit logging only — no whitelist needed.
    const contentScripts = Array.isArray(manifest.content_scripts) ? manifest.content_scripts : [];
    const broadPatterns: string[] = [];

    for (const cs of contentScripts) {
      if (cs && typeof cs === 'object' && Array.isArray(cs.matches)) {
        for (const pattern of cs.matches) {
          if (typeof pattern === 'string' && BROAD_CONTENT_SCRIPT_PATTERNS.includes(pattern)) {
            if (!broadPatterns.includes(pattern)) {
              broadPatterns.push(pattern);
            }
          }
        }
      }
    }

    if (broadPatterns.length > 0) {
      // Log for security audit
      console.log(`🔍 Extension "${extensionName}" (${extensionId}) has broad content scripts: ${broadPatterns.join(', ')}`);

      conflicts.push({
        extensionId,
        extensionName,
        conflictType: 'content-script-broad',
        severity: 'warning',
        description: `Injects content scripts into all pages (${broadPatterns.join(', ')})`,
        recommendation: 'Verify this extension is trusted. Its content scripts run on every page you visit.',
      });
    }

    // 4. Keyboard shortcut conflicts
    const commands = manifest.commands;
    if (commands && typeof commands === 'object' && !Array.isArray(commands)) {
      for (const [cmdName, cmdValue] of Object.entries(commands as Record<string, unknown>)) {
        if (cmdValue && typeof cmdValue === 'object') {
          const cmd = cmdValue as Record<string, unknown>;
          const suggested = typeof cmd.suggested_key === 'object' && cmd.suggested_key !== null
            ? cmd.suggested_key as Record<string, unknown>
            : null;

          // Check platform-specific keys and default
          const keysToCheck: string[] = [];
          if (suggested) {
            if (typeof suggested.default === 'string') keysToCheck.push(suggested.default);
            if (typeof suggested.mac === 'string') keysToCheck.push(suggested.mac);
            if (typeof suggested.windows === 'string') keysToCheck.push(suggested.windows);
            if (typeof suggested.linux === 'string') keysToCheck.push(suggested.linux);
          }

          for (const rawKey of keysToCheck) {
            const normalized = normalizeShortcut(rawKey);
            const tandemMatch = TANDEM_SHORTCUTS.find(s => s.key === normalized);
            if (tandemMatch) {
              conflicts.push({
                extensionId,
                extensionName,
                conflictType: 'keyboard-shortcut',
                severity: 'info',
                description: `Shortcut "${rawKey}" (${cmdName}) conflicts with Tandem's "${tandemMatch.action}"`,
                recommendation: "Tandem's shortcut takes priority (registered at BrowserWindow level). The extension shortcut will not fire.",
              });
            }
          }
        }
      }
    }

    return conflicts;
  }

  /**
   * Analyze all installed extensions in the extensions directory.
   * @param extensionsDir - Path to ~/.tandem/extensions/
   * @returns Map of extension ID → conflicts
   */
  analyzeAll(extensionsDir?: string): Map<string, ExtensionConflict[]> {
    const dir = extensionsDir || path.join(os.homedir(), '.tandem', 'extensions');
    const result = new Map<string, ExtensionConflict[]>();

    try {
      const dirs = fs.readdirSync(dir, { withFileTypes: true })
        .filter(d => d.isDirectory());

      for (const entry of dirs) {
        const manifestPath = path.join(dir, entry.name, 'manifest.json');
        if (fs.existsSync(manifestPath)) {
          const conflicts = this.analyzeManifest(manifestPath);
          if (conflicts.length > 0) {
            result.set(entry.name, conflicts);
          }
        }
      }
    } catch {
      // Extensions directory may not exist yet
    }

    return result;
  }

  /**
   * Get a flat list of all conflicts across all extensions.
   */
  getAllConflicts(extensionsDir?: string): ExtensionConflict[] {
    const map = this.analyzeAll(extensionsDir);
    const all: ExtensionConflict[] = [];
    for (const conflicts of map.values()) {
      all.push(...conflicts);
    }
    return all;
  }

  /**
   * Get conflict summary counts.
   */
  getSummary(conflicts: ExtensionConflict[]): { info: number; warnings: number; critical: number } {
    let info = 0;
    let warnings = 0;
    let critical = 0;

    for (const c of conflicts) {
      switch (c.severity) {
        case 'info': info++; break;
        case 'warning': warnings++; break;
        case 'critical': critical++; break;
      }
    }

    return { info, warnings, critical };
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Normalize a Chrome extension keyboard shortcut to a comparable format.
 * Chrome extensions use: "Ctrl+Shift+Y", "Command+Shift+Y", "MacCtrl+Shift+Y"
 * We normalize: Ctrl/Command/MacCtrl → "Ctrl", Alt → "Alt"
 */
function normalizeShortcut(shortcut: string): string {
  return shortcut
    .replace(/Command\+/gi, 'Ctrl+')
    .replace(/MacCtrl\+/gi, 'Ctrl+')
    .replace(/Cmd\+/gi, 'Ctrl+')
    .replace(/CmdOrCtrl\+/gi, 'Ctrl+')
    .trim();
}
