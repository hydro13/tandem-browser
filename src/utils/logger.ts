/**
 * Logger utility for Tandem Browser.
 *
 * Usage:
 *   const log = createLogger('MyModule');
 *   log.info('initialized');
 *   log.warn('retrying:', err.message);
 *
 * Minimum level is controlled by the TANDEM_LOG_LEVEL environment variable.
 * Valid values: debug | info | warn | error | silent  (default: info)
 */
/* eslint-disable no-console -- console is the logger backend by design */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

const LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  silent: 4,
};

function minLevel(): LogLevel {
  const v = process.env.TANDEM_LOG_LEVEL as LogLevel;
  return v && v in LEVELS ? v : 'info';
}

export interface Logger {
  debug(...args: unknown[]): void;
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
}

export function createLogger(namespace: string): Logger {
  const prefix = `[${namespace}]`;
  const shouldLog = (level: LogLevel): boolean =>
    LEVELS[level] >= LEVELS[minLevel()];

  return {
    debug: (...args) => {
      if (shouldLog('debug')) {
        console.debug(prefix, ...args);
      }
    },
    info: (...args) => {
      if (shouldLog('info')) {
        console.info(prefix, ...args);
      }
    },
    warn: (...args) => {
      if (shouldLog('warn')) {
        console.warn(prefix, ...args);
      }
    },
    error: (...args) => {
      if (shouldLog('error')) {
        console.error(prefix, ...args);
      }
    },
  };
}
