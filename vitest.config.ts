import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'src/**/tests/**/*.test.ts',
    ],
    setupFiles: [
      'src/api/tests/setup.ts',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/tests/**',
        'node_modules',
        // Electron-dependent code — requires BrowserWindow, webContents,
        // session, CDP, or renderer process. Not testable in Vitest.
        'src/main.ts',
        'src/preload/**',
        'src/bootstrap/**',
        'src/bridge/**',
        'src/ipc/**',
        'src/menu/**',
        'src/context-menu/**',
        'src/snapshot/**',
        'src/stealth/**',
        'src/sync/**',
        'src/session/**',
        'src/sessions/**',
        'src/headless/**',
        'src/device/**',
        'src/devtools/**',
        'src/input/**',
        'src/locators/**',
        'src/pip/**',
        'src/video/**',
        'src/voice/**',
        'src/scripts/**',
        'src/import/**',
        'src/activity/**',
        'src/events/**',
        'src/notifications/**',
        'src/claronote/**',
        // Electron-dependent modules missed in first pass
        'src/behavior/observer.ts',
        'src/extensions/toolbar.ts',
        'src/mcp/server.ts',
        'src/mcp/api-client.ts',
        'src/agents/x-scout.ts',
        // Security modules that need CDP, webContents, or SQLite at runtime
        'src/security/behavior-monitor.ts',
        'src/security/security-manager.ts',
        'src/security/security-db.ts',
        'src/security/db-*.ts',
        'src/security/analyzers/**',
      ],
      reportOnFailure: true,
    },
  },
});
