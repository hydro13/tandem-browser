import type { Session } from 'electron';
import path from 'path';
import fs from 'fs';
import { ExtensionLoader } from './loader';
import type { InstallResult } from './crx-downloader';
import { CrxDownloader } from './crx-downloader';
import type { NativeMessagingStatus } from './native-messaging';
import { NativeMessagingSetup } from './native-messaging';
import { IdentityPolyfill } from './identity-polyfill';
import { ActionPolyfill } from './action-polyfill';
import type { UpdateCheckResult, UpdateResult, UpdateState, InstalledExtension } from './update-checker';
import { UpdateChecker } from './update-checker';
import type { ExtensionConflict } from './conflict-detector';
import { ConflictDetector } from './conflict-detector';
import { tandemDir } from '../utils/paths';
import { API_PORT } from '../utils/constants';
import { createLogger } from '../utils/logger';

const log = createLogger('ExtensionManager');

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ExtensionMetadata {
  id: string;
  name: string;
  version: string;
  manifestVersion: number;
  permissions: string[];
  contentScriptPatterns: string[];
  hasDeclarativeNetRequest: boolean;
  hasNativeMessaging: boolean;
  hasIdentity: boolean;
}

export type ExtensionTrustLevel = 'trusted' | 'limited' | 'unknown';

export interface ExtensionRouteAccessDecision {
  allowed: boolean;
  level: ExtensionTrustLevel;
  routePath: string;
  scope: string | null;
  reason: string;
  extensionId: string;
  runtimeId: string | null;
  storageId: string | null;
  extensionName: string | null;
  permissions: string[];
  auditLabel: string;
}

interface ExtensionRoutePolicy {
  scope: string;
  minimumLevel: Exclude<ExtensionTrustLevel, 'unknown'>;
  anyPermission?: string[];
}

interface ResolvedExtensionIdentity {
  requestedId: string;
  runtimeId: string | null;
  storageId: string;
  extensionPath: string;
  extensionName: string;
  metadata: ExtensionMetadata | null;
}

const EXTENSION_ID_RE = /^[a-p]{32}$/;
const EXTENSION_ROUTE_POLICIES: Record<string, ExtensionRoutePolicy> = {
  '/extensions/log': {
    scope: 'log-bridge',
    minimumLevel: 'limited',
  },
  '/extensions/active-tab': {
    scope: 'active-tab-read',
    minimumLevel: 'limited',
    anyPermission: ['activeTab', 'tabs'],
  },
  '/extensions/web-navigation/frames': {
    scope: 'web-navigation-read',
    minimumLevel: 'limited',
    anyPermission: ['webNavigation', 'tabs', 'activeTab'],
  },
  '/extensions/web-navigation/frame': {
    scope: 'web-navigation-read',
    minimumLevel: 'limited',
    anyPermission: ['webNavigation', 'tabs', 'activeTab'],
  },
  '/extensions/identity/auth': {
    scope: 'identity-auth',
    minimumLevel: 'trusted',
    anyPermission: ['identity'],
  },
  '/extensions/native-message': {
    scope: 'native-messaging',
    minimumLevel: 'trusted',
    anyPermission: ['nativeMessaging'],
  },
  '/extensions/native-message/ws': {
    scope: 'native-messaging',
    minimumLevel: 'trusted',
    anyPermission: ['nativeMessaging'],
  },
};

/**
 * ExtensionManager — Central extension management layer.
 *
 * Wraps ExtensionLoader (load/list) and CrxDownloader (download/verify/extract)
 * into a single interface for install, uninstall, and metadata access.
 */
export class ExtensionManager {
  private loader: ExtensionLoader;
  private downloader: CrxDownloader;
  private nativeMessaging: NativeMessagingSetup;
  private identityPolyfill: IdentityPolyfill;
  private actionPolyfill: ActionPolyfill;
  private updateChecker: UpdateChecker;
  private conflictDetector: ConflictDetector;

  constructor(apiPort: number = API_PORT) {
    this.loader = new ExtensionLoader();
    this.downloader = new CrxDownloader();
    this.nativeMessaging = new NativeMessagingSetup();
    this.identityPolyfill = new IdentityPolyfill(apiPort);
    this.actionPolyfill = new ActionPolyfill(apiPort);
    this.updateChecker = new UpdateChecker(this.downloader, this.loader);
    this.conflictDetector = new ConflictDetector();
  }

  /**
   * Initialize: load all existing extensions from ~/.tandem/extensions/.
   * Called once at app startup.
   */
  async init(session: Session): Promise<void> {
    // Inject chrome.action polyfill into MV3 extensions (before loading)
    // Electron does not implement chrome.action; without this, MV3 extensions crash
    // with "Cannot read properties of undefined (reading 'onClicked')"
    const patchedAction = this.actionPolyfill.injectPolyfills();
    if (patchedAction.length > 0) {
      log.info(`🎯 Action polyfill injected into ${patchedAction.length} extension(s)`);
    }

    // Inject chrome.identity polyfill into extensions that need it (before loading)
    const patchedExtensions = this.identityPolyfill.injectPolyfills();
    if (patchedExtensions.length > 0) {
      log.info(`🔑 Identity polyfill injected into ${patchedExtensions.length} extension(s)`);
    }

    // Register chromiumapp.org protocol handler for OAuth redirects
    this.identityPolyfill.registerChromiumAppHandler(session);

    const loaded = await this.loader.loadAllExtensions(session);
    if (loaded.length > 0) {
      log.info(`🧩 ExtensionManager initialized with ${loaded.length} extension(s)`);
    }

    // Detect and configure native messaging hosts
    this.nativeMessaging.detectHosts();
    this.nativeMessaging.configure(session);

    // Clean up stale temp/old directories from previous update cycles
    this.updateChecker.cleanupTempDirs();

    // Start scheduled update checks (first check after 5 min, then every 24h)
    this.updateChecker.startScheduledChecks(session);
  }

  /**
   * Install an extension from Chrome Web Store.
   * Downloads CRX, verifies format, extracts, then loads into the session.
   *
   * @param input - CWS URL or bare extension ID (32 a-p chars)
   * @param session - Electron session to load the extension into
   */
  async install(input: string, session: Session): Promise<InstallResult> {
    // Download, verify, and extract
    const result = await this.downloader.installFromCws(input);

    if (!result.success) {
      return result;
    }

    // Load into session
    try {
      const loaded = await this.loader.loadExtension(session, result.installPath);
      if (loaded) {
        // ID matching: compare assigned Electron ID with expected CWS ID
        log.info(`🧩 Extension loaded — CWS ID: ${result.extensionId}, Electron ID: ${loaded.id}`);
        if (loaded.id !== result.extensionId) {
          log.warn(`⚠️ Extension ID mismatch! CWS: ${result.extensionId}, Electron: ${loaded.id}`);
          result.warning = (result.warning ? result.warning + '; ' : '') +
            `Extension ID mismatch: CWS=${result.extensionId}, Electron=${loaded.id}`;
        }
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        ...result,
        success: false,
        error: `Extension extracted but failed to load: ${message}`,
      };
    }

    // Run conflict detection on the newly installed extension (Phase 10a)
    const manifestPath = path.join(result.installPath, 'manifest.json');
    const conflicts = this.conflictDetector.analyzeManifest(manifestPath);
    if (conflicts.length > 0) {
      (result as InstallResult & { conflicts: ExtensionConflict[] }).conflicts = conflicts;
      log.info(`⚠️ ${conflicts.length} conflict(s) detected for ${result.name}: ${conflicts.map(c => c.conflictType).join(', ')}`);
    }

    return result;
  }

  /**
   * List all extensions — both loaded and available on disk.
   */
  list(): { loaded: ReturnType<ExtensionLoader['listLoaded']>; available: ReturnType<ExtensionLoader['listAvailable']> } {
    return {
      loaded: this.loader.listLoaded(),
      available: this.loader.listAvailable(),
    };
  }

  /**
   * Uninstall an extension.
   * Calls session.removeExtension() to unload immediately (no restart needed),
   * then removes files from disk.
   */
  uninstall(extensionId: string, session: Session): boolean {
    try {
      // Unload from session (no restart needed)
      session.removeExtension(extensionId);
      log.info(`🧩 Extension ${extensionId} removed from session`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      log.warn(`⚠️ Failed to remove extension ${extensionId} from session: ${message}`);
      // Continue to remove from disk even if session removal fails
    }

    // Remove from disk
    const extensionsDir = tandemDir('extensions');
    const extPath = path.join(extensionsDir, extensionId);
    if (fs.existsSync(extPath)) {
      try {
        fs.rmSync(extPath, { recursive: true, force: true });
        log.info(`🧩 Extension ${extensionId} removed from disk: ${extPath}`);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        log.warn(`⚠️ Failed to remove extension files at ${extPath}: ${message}`);
        return false;
      }
    }

    return true;
  }

  /**
   * Get metadata for an installed extension by ID.
   * Reads manifest.json and extracts permissions, content scripts, API usage.
   */
  getExtensionMetadata(extensionId: string): ExtensionMetadata | null {
    const resolved = this.resolveInstalledExtension(extensionId);
    if (resolved) {
      return resolved.metadata;
    }

    const extensionsDir = tandemDir('extensions');
    const extensionPath = path.join(extensionsDir, extensionId);
    return this.readExtensionMetadata(extensionPath, extensionId);
  }

  /** Check whether the given runtime/storage extension ID resolves to an installed extension */
  isInstalledExtension(extensionId: string): boolean {
    return this.resolveInstalledExtension(extensionId) !== null;
  }

  /**
   * Evaluate whether an extension-origin API route should be available to the caller.
   * This keeps route scoping and native host checks consistent across HTTP and WebSocket paths.
   */
  evaluateApiRouteAccess(
    extensionId: string,
    routePath: string,
    requestedHost?: string | null,
  ): ExtensionRouteAccessDecision {
    const policy = EXTENSION_ROUTE_POLICIES[routePath];
    if (!policy) {
      return this.buildDeniedDecision(extensionId, routePath, null, 'unknown', [], null, null, null,
        `Denied extension API access because "${routePath}" is not an extension-scoped route`);
    }

    const resolved = this.resolveInstalledExtension(extensionId);
    if (!resolved) {
      return this.buildDeniedDecision(extensionId, routePath, policy.scope, 'unknown', [], null, null, null,
        `Denied ${policy.scope} because extension "${extensionId}" is not installed`);
    }

    const permissions = resolved.metadata?.permissions ?? [];
    const trustLevel = this.getTrustLevelForMetadata(resolved.metadata);
    const auditLabel = this.formatAuditLabel(resolved, trustLevel);

    if (trustLevel === 'unknown') {
      return this.buildDeniedDecision(extensionId, routePath, policy.scope, trustLevel, permissions,
        resolved.runtimeId, resolved.storageId, resolved.extensionName,
        `Denied ${policy.scope} for ${auditLabel} because Tandem could not resolve extension metadata`);
    }

    if (policy.minimumLevel === 'trusted' && trustLevel !== 'trusted') {
      return this.buildDeniedDecision(extensionId, routePath, policy.scope, trustLevel, permissions,
        resolved.runtimeId, resolved.storageId, resolved.extensionName,
        `Denied ${policy.scope} for ${auditLabel} because this route requires a trusted extension`);
    }

    if (policy.anyPermission && !policy.anyPermission.some((permission) => permissions.includes(permission))) {
      return this.buildDeniedDecision(extensionId, routePath, policy.scope, trustLevel, permissions,
        resolved.runtimeId, resolved.storageId, resolved.extensionName,
        `Denied ${policy.scope} for ${auditLabel} because the extension lacks one of: ${policy.anyPermission.join(', ')}`);
    }

    if (policy.scope === 'native-messaging' && requestedHost) {
      const hostDecision = this.nativeMessaging.evaluateHostAccess(requestedHost, [
        resolved.runtimeId,
        EXTENSION_ID_RE.test(resolved.storageId) ? resolved.storageId : null,
      ]);
      if (!hostDecision.allowed) {
        return this.buildDeniedDecision(extensionId, routePath, policy.scope, trustLevel, permissions,
          resolved.runtimeId, resolved.storageId, resolved.extensionName,
          `Denied ${policy.scope} for ${auditLabel}: ${hostDecision.reason}`);
      }
    }

    return {
      allowed: true,
      level: trustLevel,
      routePath,
      scope: policy.scope,
      reason: `Allowed ${policy.scope} for ${auditLabel}`,
      extensionId,
      runtimeId: resolved.runtimeId,
      storageId: resolved.storageId,
      extensionName: resolved.extensionName,
      permissions,
      auditLabel,
    };
  }

  /** Expose the underlying loader for backward compatibility */
  getLoader(): ExtensionLoader {
    return this.loader;
  }

  /** Get native messaging status for API endpoint */
  getNativeMessagingStatus(): NativeMessagingStatus {
    return this.nativeMessaging.getStatus();
  }

  /** Check if a native messaging host is available for an extension */
  isNativeHostAvailable(extensionId: string): boolean {
    return this.nativeMessaging.isHostAvailable(extensionId);
  }

  /** Get identity polyfill for API endpoint registration */
  getIdentityPolyfill(): IdentityPolyfill {
    return this.identityPolyfill;
  }

  private resolveInstalledExtension(extensionId: string): ResolvedExtensionIdentity | null {
    const { loaded, available } = this.list();
    const loadedMatch = loaded.find((extension) =>
      extension.id === extensionId || path.basename(extension.path) === extensionId
    ) ?? null;
    const availableMatch = available.find((extension) => path.basename(extension.path) === extensionId) ?? null;
    const extensionPath = loadedMatch?.path ?? availableMatch?.path;

    if (!extensionPath) {
      return null;
    }

    const storageId = path.basename(extensionPath);
    const runtimeId = loadedMatch?.id ?? (EXTENSION_ID_RE.test(extensionId) ? extensionId : null);
    const metadata = this.readExtensionMetadata(extensionPath, runtimeId ?? storageId);

    return {
      requestedId: extensionId,
      runtimeId,
      storageId,
      extensionPath,
      extensionName: metadata?.name ?? loadedMatch?.name ?? availableMatch?.name ?? storageId,
      metadata,
    };
  }

  private readExtensionMetadata(extensionPath: string, extensionId: string): ExtensionMetadata | null {
    const manifestPath = path.join(extensionPath, 'manifest.json');
    if (!fs.existsSync(manifestPath)) {
      return null;
    }

    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

      const permissions: string[] = [
        ...(Array.isArray(manifest.permissions) ? manifest.permissions : []),
        ...(Array.isArray(manifest.optional_permissions) ? manifest.optional_permissions : []),
      ].filter((permission): permission is string => typeof permission === 'string');

      const contentScriptPatterns: string[] = [];
      if (Array.isArray(manifest.content_scripts)) {
        for (const contentScript of manifest.content_scripts) {
          if (contentScript && typeof contentScript === 'object' && Array.isArray(contentScript.matches)) {
            for (const pattern of contentScript.matches) {
              if (typeof pattern === 'string' && !contentScriptPatterns.includes(pattern)) {
                contentScriptPatterns.push(pattern);
              }
            }
          }
        }
      }

      return {
        id: extensionId,
        name: manifest.name || path.basename(extensionPath),
        version: manifest.version || '0.0.0',
        manifestVersion: manifest.manifest_version || 2,
        permissions,
        contentScriptPatterns,
        hasDeclarativeNetRequest: permissions.includes('declarativeNetRequest') ||
          permissions.includes('declarativeNetRequestWithHostAccess'),
        hasNativeMessaging: permissions.includes('nativeMessaging'),
        hasIdentity: permissions.includes('identity'),
      };
    } catch {
      return null;
    }
  }

  private getTrustLevelForMetadata(metadata: ExtensionMetadata | null): ExtensionTrustLevel {
    if (!metadata) {
      return 'unknown';
    }

    if (metadata.hasNativeMessaging || metadata.hasIdentity) {
      return 'trusted';
    }

    return 'limited';
  }

  private formatAuditLabel(
    resolved: Pick<ResolvedExtensionIdentity, 'runtimeId' | 'storageId' | 'extensionName'>,
    trustLevel: ExtensionTrustLevel,
  ): string {
    const idParts = [
      resolved.runtimeId ? `runtime=${resolved.runtimeId}` : null,
      resolved.storageId ? `storage=${resolved.storageId}` : null,
    ].filter(Boolean);
    return `${resolved.extensionName} [${trustLevel}${idParts.length > 0 ? `; ${idParts.join(', ')}` : ''}]`;
  }

  private buildDeniedDecision(
    extensionId: string,
    routePath: string,
    scope: string | null,
    level: ExtensionTrustLevel,
    permissions: string[],
    runtimeId: string | null,
    storageId: string | null,
    extensionName: string | null,
    reason: string,
  ): ExtensionRouteAccessDecision {
    const labelBase = extensionName ?? extensionId;
    const idParts = [
      runtimeId ? `runtime=${runtimeId}` : null,
      storageId ? `storage=${storageId}` : null,
    ].filter(Boolean);

    return {
      allowed: false,
      level,
      routePath,
      scope,
      reason,
      extensionId,
      runtimeId,
      storageId,
      extensionName,
      permissions,
      auditLabel: `${labelBase} [${level}${idParts.length > 0 ? `; ${idParts.join(', ')}` : ''}]`,
    };
  }

  // ─── Update Methods (Phase 9) ──────────────────────────────────────────

  /** Get the update checker instance */
  getUpdateChecker(): UpdateChecker {
    return this.updateChecker;
  }

  /** Check all installed extensions for updates (batch protocol) */
  async checkForUpdates(): Promise<UpdateCheckResult[]> {
    const installed = this.updateChecker.getInstalledExtensions();
    return this.updateChecker.checkAll(installed);
  }

  /** Apply update for a single extension */
  async applyUpdate(extensionId: string, session: Session): Promise<UpdateResult> {
    return this.updateChecker.updateOne(extensionId, session);
  }

  /** Apply all available updates */
  async applyAllUpdates(session: Session): Promise<UpdateResult[]> {
    return this.updateChecker.updateAll(session);
  }

  /** Get current update state */
  getUpdateState(): UpdateState {
    return this.updateChecker.getState();
  }

  /** Get next scheduled check time */
  getNextScheduledCheck(): string | null {
    return this.updateChecker.getNextScheduledCheck();
  }

  /** Get installed extensions list (for update checking) */
  getInstalledExtensions(): InstalledExtension[] {
    return this.updateChecker.getInstalledExtensions();
  }

  /** Get disk usage for all extensions */
  getDiskUsage(): { totalBytes: number; extensions: Array<{ id: string; name: string; sizeBytes: number }> } {
    return this.updateChecker.getDiskUsage();
  }

  /** Stop update checker and clean up */
  destroyUpdateChecker(): void {
    this.updateChecker.destroy();
  }

  // ─── Conflict Detection Methods (Phase 10a) ──────────────────────────

  /** Get the conflict detector instance */
  getConflictDetector(): ConflictDetector {
    return this.conflictDetector;
  }

  /** Analyze a single extension's manifest for conflicts */
  getConflictsForExtension(extensionId: string): ExtensionConflict[] {
    const extensionsDir = tandemDir('extensions');
    const manifestPath = path.join(extensionsDir, extensionId, 'manifest.json');
    return this.conflictDetector.analyzeManifest(manifestPath);
  }

  /** Get all conflicts across all installed extensions */
  getAllConflicts(): { conflicts: ExtensionConflict[]; summary: { info: number; warnings: number; critical: number } } {
    const conflicts = this.conflictDetector.getAllConflicts();
    const summary = this.conflictDetector.getSummary(conflicts);
    return { conflicts, summary };
  }

  // ─── Isolated Session Loading (Phase 10a Foundation) ──────────────────

  /**
   * Load all installed extensions into a given Electron session.
   *
   * This is the foundation for loading extensions in isolated sessions
   * (persist:session-{name}). Currently NOT wired into SessionManager —
   * that requires careful consideration of:
   * - Security stack: isolated sessions also need a RequestDispatcher + Guardian
   * - Performance: loading 10+ extensions per session has startup cost
   * - User preference: not all users want extensions in isolated sessions
   *
   * Future integration point: SessionManager.create() could call this method
   * after setting up the security stack for the new session.
   *
   * @param session - The Electron session to load extensions into
   * @returns Array of loaded extension names
   */
  async loadInSession(session: Session): Promise<string[]> {
    const extensionsDir = tandemDir('extensions');
    const loaded: string[] = [];

    try {
      const dirs = fs.readdirSync(extensionsDir, { withFileTypes: true })
        .filter(d => d.isDirectory());

      for (const dir of dirs) {
        const extPath = path.join(extensionsDir, dir.name);
        const manifestPath = path.join(extPath, 'manifest.json');

        if (!fs.existsSync(manifestPath)) continue;

        try {
          const ext = await session.extensions.loadExtension(extPath, { allowFileAccess: true });
          loaded.push(ext.name || dir.name);
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          log.warn(`⚠️ Failed to load extension ${dir.name} into session: ${message}`);
        }
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      log.warn(`⚠️ Could not read extensions directory for session loading: ${message}`);
    }

    if (loaded.length > 0) {
      log.info(`🧩 Loaded ${loaded.length} extension(s) into session: ${loaded.join(', ')}`);
    }

    return loaded;
  }
}
