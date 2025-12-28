import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LoggerService } from '../../../../src/infrastructure/services/logger.service';

describe('LoggerService', () => {
  let logger: LoggerService;

  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should log warn without context', () => {
    logger = new LoggerService({ debug: true });
    logger.warn('Warning message');

    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('Warning message'));
  });

  it('should log error without context', () => {
    logger = new LoggerService({ debug: true });
    logger.error('Error message');

    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Error message'));
  });

  it('should log info without context', () => {
    logger = new LoggerService({ debug: true });
    logger.info('Info message');

    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Info message'));
  });

  it('should log with context object', () => {
    logger = new LoggerService({ debug: true });
    logger.info('Message', { key: 'value' });

    // When context is provided, it's included in the same log line
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Message'));
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('key'));
  });

  it('should not log verbose when debug is false', () => {
    logger = new LoggerService({ debug: false });
    logger.verbose('Verbose message');

    expect(console.log).not.toHaveBeenCalled();
  });

  it('should log verbose when debug is true', () => {
    logger = new LoggerService({ debug: true });
    logger.verbose('Verbose message');

    expect(console.log).toHaveBeenCalled();
  });

  it('should use default prefix when not provided', () => {
    logger = new LoggerService({});
    logger.info('Test message');

    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('[Spekra]'));
  });

  it('should use custom prefix when provided', () => {
    logger = new LoggerService({ prefix: 'CustomPrefix' });
    logger.info('Test message');

    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('[CustomPrefix]'));
  });
});
