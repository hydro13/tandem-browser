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
      reporter: ['text', 'html', 'json-summary'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/tests/**', 'node_modules'],
      reportOnFailure: true,
    },
  },
});
