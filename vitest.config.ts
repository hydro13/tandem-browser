import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'src/security/tests/**/*.test.ts',
      'src/extensions/tests/**/*.test.ts',
    ],
  },
});
