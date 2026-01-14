import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from 'vitest';
import { LoggerService } from '../../../../src/infrastructure/services/logger.service';

describe('LoggerService', () => {
  let consoleLogSpy: MockInstance;
  let consoleWarnSpy: MockInstance;
  let consoleErrorSpy: MockInstance;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('info', () => {
    it('logs message with prefix', () => {
      const logger = new LoggerService();
      logger.info('Test message');
      expect(consoleLogSpy).toHaveBeenCalledWith('[Spekra] Test message');
    });

    it('logs message with context', () => {
      const logger = new LoggerService();
      logger.info('Test message', { key: 'value' });
      expect(consoleLogSpy).toHaveBeenCalledWith('[Spekra] Test message key="value"');
    });

    it('uses custom prefix', () => {
      const logger = new LoggerService({ prefix: 'Custom' });
      logger.info('Test message');
      expect(consoleLogSpy).toHaveBeenCalledWith('[Custom] Test message');
    });

    it('handles multiple context values', () => {
      const logger = new LoggerService();
      logger.info('Test', { a: 1, b: 'two', c: true });
      expect(consoleLogSpy).toHaveBeenCalledWith('[Spekra] Test a=1 b="two" c=true');
    });

    it('handles nested object context', () => {
      const logger = new LoggerService();
      logger.info('Test', { nested: { deep: 'value' } });
      // Should stringify nested objects
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('[Spekra] Test'));
    });
  });

  describe('warn', () => {
    it('logs warning message', () => {
      const logger = new LoggerService();
      logger.warn('Warning message');
      expect(consoleWarnSpy).toHaveBeenCalledWith('[Spekra] Warning message');
    });

    it('logs warning with context', () => {
      const logger = new LoggerService();
      logger.warn('Warning message', { reason: 'test' });
      expect(consoleWarnSpy).toHaveBeenCalledWith('[Spekra] Warning message reason="test"');
    });
  });

  describe('error', () => {
    it('logs error message', () => {
      const logger = new LoggerService();
      logger.error('Error message');
      expect(consoleErrorSpy).toHaveBeenCalledWith('[Spekra] Error message');
    });

    it('logs error with Error object', () => {
      const logger = new LoggerService();
      logger.error('Error message', new Error('test error'));
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[Spekra] Error message error="test error"'
      );
    });

    it('logs error with context', () => {
      const logger = new LoggerService();
      logger.error('Error message', undefined, { code: 500 });
      expect(consoleErrorSpy).toHaveBeenCalledWith('[Spekra] Error message code=500');
    });

    it('logs error with both Error object and context', () => {
      const logger = new LoggerService();
      logger.error('Error message', new Error('test error'), { code: 500 });
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('[Spekra] Error message')
      );
    });
  });

  describe('verbose', () => {
    it('does not log when debug is disabled', () => {
      const logger = new LoggerService({ debug: false });
      logger.verbose('Debug message');
      expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    it('logs when debug is enabled', () => {
      const logger = new LoggerService({ debug: true });
      logger.verbose('Debug message');
      expect(consoleLogSpy).toHaveBeenCalledWith('[Spekra] Debug message');
    });

    it('logs with context when debug is enabled', () => {
      const logger = new LoggerService({ debug: true });
      logger.verbose('Debug message', { detail: 'info' });
      expect(consoleLogSpy).toHaveBeenCalledWith('[Spekra] Debug message detail="info"');
    });
  });

  describe('constructor options', () => {
    it('defaults to non-debug mode', () => {
      const logger = new LoggerService();
      logger.verbose('Should not appear');
      expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    it('defaults to Spekra prefix', () => {
      const logger = new LoggerService();
      logger.info('Test');
      expect(consoleLogSpy).toHaveBeenCalledWith('[Spekra] Test');
    });

    it('accepts both prefix and debug options', () => {
      const logger = new LoggerService({ prefix: 'MySDK', debug: true });
      logger.verbose('Debug');
      expect(consoleLogSpy).toHaveBeenCalledWith('[MySDK] Debug');
    });
  });
});

