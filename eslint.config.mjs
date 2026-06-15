import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

// Browser globals for shell renderer scripts. Declared inline because the
// `globals` package is not a (transitive) dependency and adding one for a
// static list is not worth it.
const browserGlobals = {
  window: 'readonly',
  document: 'readonly',
  navigator: 'readonly',
  location: 'readonly',
  history: 'readonly',
  screen: 'readonly',
  localStorage: 'readonly',
  sessionStorage: 'readonly',
  console: 'readonly',
  fetch: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
  setInterval: 'readonly',
  clearInterval: 'readonly',
  queueMicrotask: 'readonly',
  requestAnimationFrame: 'readonly',
  cancelAnimationFrame: 'readonly',
  URL: 'readonly',
  URLSearchParams: 'readonly',
  WebSocket: 'readonly',
  XMLHttpRequest: 'readonly',
  AbortController: 'readonly',
  Event: 'readonly',
  CustomEvent: 'readonly',
  KeyboardEvent: 'readonly',
  MouseEvent: 'readonly',
  Notification: 'readonly',
  Audio: 'readonly',
  AudioContext: 'readonly',
  Image: 'readonly',
  FileReader: 'readonly',
  Blob: 'readonly',
  File: 'readonly',
  FormData: 'readonly',
  MediaRecorder: 'readonly',
  MutationObserver: 'readonly',
  ResizeObserver: 'readonly',
  IntersectionObserver: 'readonly',
  BroadcastChannel: 'readonly',
  DOMParser: 'readonly',
  HTMLElement: 'readonly',
  Element: 'readonly',
  Node: 'readonly',
  getComputedStyle: 'readonly',
  matchMedia: 'readonly',
  Request: 'readonly',
  Response: 'readonly',
  Headers: 'readonly',
  NodeFilter: 'readonly',
  MediaStream: 'readonly',
  // UMD guard in shell/lgl-integration.js
  module: 'readonly',
  alert: 'readonly',
  confirm: 'readonly',
  prompt: 'readonly',
  btoa: 'readonly',
  atob: 'readonly',
  crypto: 'readonly',
  performance: 'readonly',
  structuredClone: 'readonly',
  globalThis: 'readonly',
};

export default tseslint.config(
  {
    ignores: ['dist/**', 'scripts/**', 'shell/vendor/**'],
  },
  {
    files: ['**/*.ts'],
    extends: [eslint.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      parserOptions: {
        project: './tsconfig.eslint.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      'no-console': 'warn',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
      }],
      // Downgraded from recommended: project has ~16 intentional `any` usages
      '@typescript-eslint/no-explicit-any': 'warn',
      // Electron apps legitimately use require() for native modules
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  {
    files: ['src/**/*.test.ts', 'src/**/tests/**/*.ts', 'src/api/tests/helpers.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      'no-console': 'off',
    },
  },
  // Shell renderer scripts — plain browser JS, a mix of classic scripts
  // (IIFEs) and ES modules. sourceType 'module' parses both here.
  {
    files: ['shell/**/*.js'],
    extends: [eslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: browserGlobals,
    },
    rules: {
      'no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        // The shell's house style is `catch (e) { /* best effort */ }`
        caughtErrors: 'none',
      }],
      // The shell frequently uses `try { ... } catch {}` for best-effort UI work
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
  {
    files: ['shell/tests/**/*.test.js'],
    languageOptions: {
      globals: { process: 'readonly' },
    },
    rules: {
      'no-console': 'off',
    },
  },
);
