import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ExtensionManager } from '../manager';

describe('ExtensionManager extension trust', () => {
  let manager: ExtensionManager;

  beforeEach(() => {
    manager = new ExtensionManager();
  });

  function mockResolvedExtension(opts: {
    runtimeId: string | null;
    storageId: string;
    extensionName: string;
    permissions: string[];
    hasNativeMessaging?: boolean;
    hasIdentity?: boolean;
  }) {
    vi.spyOn(manager as unknown as {
      resolveInstalledExtension: (extensionId: string) => unknown;
    }, 'resolveInstalledExtension').mockImplementation((extensionId: string) => ({
      requestedId: extensionId,
      runtimeId: opts.runtimeId,
      storageId: opts.storageId,
      extensionPath: `/tmp/extensions/${opts.storageId}`,
      extensionName: opts.extensionName,
      metadata: {
        id: opts.runtimeId ?? opts.storageId,
        name: opts.extensionName,
        version: '1.0.0',
        manifestVersion: 3,
        permissions: opts.permissions,
        contentScriptPatterns: [],
        hasDeclarativeNetRequest: false,
        hasNativeMessaging: opts.hasNativeMessaging ?? false,
        hasIdentity: opts.hasIdentity ?? false,
      },
    }));
  }

  it('allows limited extensions to use active-tab helpers when they have tab permissions', () => {
    mockResolvedExtension({
      runtimeId: 'runtime-ext',
      storageId: 'helper-ext',
      extensionName: 'Helper',
      permissions: ['tabs'],
    });

    const decision = manager.evaluateApiRouteAccess('runtime-ext', '/extensions/active-tab');

    expect(decision.allowed).toBe(true);
    expect(decision.level).toBe('limited');
    expect(decision.scope).toBe('active-tab-read');
  });

  it('denies limited extensions access to native messaging helpers', () => {
    mockResolvedExtension({
      runtimeId: 'runtime-ext',
      storageId: 'helper-ext',
      extensionName: 'Helper',
      permissions: ['tabs'],
    });

    const decision = manager.evaluateApiRouteAccess('runtime-ext', '/extensions/native-message', 'com.example.host');

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain('requires a trusted extension');
  });

  it('requires the host manifest to allow the extension for native messaging', () => {
    mockResolvedExtension({
      runtimeId: 'runtime-ext',
      storageId: 'abcdefghijklmnopabcdefghijklmnop',
      extensionName: 'Helper',
      permissions: ['nativeMessaging'],
      hasNativeMessaging: true,
    });
    (manager as unknown as {
      nativeMessaging: {
        evaluateHostAccess: (host: string, extensionIds: Array<string | null | undefined>) => {
          allowed: boolean;
          hostName: string;
          resolvedHostName: string;
          reason: string;
        };
      };
    }).nativeMessaging = {
      evaluateHostAccess: vi.fn().mockReturnValue({
        allowed: false,
        hostName: 'com.example.host',
        resolvedHostName: 'com.example.host',
        reason: 'host "com.example.host" does not allow extension IDs: runtime-ext, abcdefghijklmnopabcdefghijklmnop',
      }),
    };

    const decision = manager.evaluateApiRouteAccess('runtime-ext', '/extensions/native-message', 'com.example.host');

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain('does not allow extension IDs');
  });
});
