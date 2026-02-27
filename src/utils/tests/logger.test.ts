import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createLogger } from '../logger';

describe('createLogger', () => {
  const origEnv = process.env.TANDEM_LOG_LEVEL;

  beforeEach(() => {
    vi.spyOn(console, 'debug').mockImplementation(() => {});
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.env.TANDEM_LOG_LEVEL = origEnv;
  });

  it('uses [namespace] prefix', () => {
    process.env.TANDEM_LOG_LEVEL = 'debug';
    const log = createLogger('Test');
    log.info('hello');
    expect(console.info).toHaveBeenCalledWith('[Test]', 'hello');
  });

  it('defaults to info level when TANDEM_LOG_LEVEL is unset', () => {
    delete process.env.TANDEM_LOG_LEVEL;
    const log = createLogger('Test');
    log.debug('hidden');
    log.info('visible');
    expect(console.debug).not.toHaveBeenCalled();
    expect(console.info).toHaveBeenCalledWith('[Test]', 'visible');
  });

  it('respects TANDEM_LOG_LEVEL=warn', () => {
    process.env.TANDEM_LOG_LEVEL = 'warn';
    const log = createLogger('Test');
    log.info('hidden');
    log.warn('visible');
    expect(console.info).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledWith('[Test]', 'visible');
  });

  it('respects TANDEM_LOG_LEVEL=error', () => {
    process.env.TANDEM_LOG_LEVEL = 'error';
    const log = createLogger('Test');
    log.warn('hidden');
    log.error('visible');
    expect(console.warn).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith('[Test]', 'visible');
  });

  it('respects TANDEM_LOG_LEVEL=silent', () => {
    process.env.TANDEM_LOG_LEVEL = 'silent';
    const log = createLogger('Test');
    log.error('hidden');
    expect(console.error).not.toHaveBeenCalled();
  });

  it('respects TANDEM_LOG_LEVEL=debug (all levels pass)', () => {
    process.env.TANDEM_LOG_LEVEL = 'debug';
    const log = createLogger('Test');
    log.debug('d');
    log.info('i');
    log.warn('w');
    log.error('e');
    expect(console.debug).toHaveBeenCalledWith('[Test]', 'd');
    expect(console.info).toHaveBeenCalledWith('[Test]', 'i');
    expect(console.warn).toHaveBeenCalledWith('[Test]', 'w');
    expect(console.error).toHaveBeenCalledWith('[Test]', 'e');
  });

  it('falls back to info for invalid TANDEM_LOG_LEVEL', () => {
    process.env.TANDEM_LOG_LEVEL = 'invalid';
    const log = createLogger('Test');
    log.debug('hidden');
    log.info('visible');
    expect(console.debug).not.toHaveBeenCalled();
    expect(console.info).toHaveBeenCalledWith('[Test]', 'visible');
  });

  it('passes multiple arguments', () => {
    process.env.TANDEM_LOG_LEVEL = 'debug';
    const log = createLogger('Test');
    log.warn('message', 'extra', 42);
    expect(console.warn).toHaveBeenCalledWith('[Test]', 'message', 'extra', 42);
  });

  it('creates independent loggers for different namespaces', () => {
    process.env.TANDEM_LOG_LEVEL = 'debug';
    const logA = createLogger('Alpha');
    const logB = createLogger('Beta');
    logA.info('from A');
    logB.info('from B');
    expect(console.info).toHaveBeenCalledWith('[Alpha]', 'from A');
    expect(console.info).toHaveBeenCalledWith('[Beta]', 'from B');
  });
});
