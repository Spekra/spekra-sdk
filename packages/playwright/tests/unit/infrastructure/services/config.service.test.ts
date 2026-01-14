import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ConfigService } from '../../../../src/infrastructure/services/config.service';
import type { LoggerService } from '@spekra/core';

// Mock logger
function createMockLogger(): LoggerService {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    verbose: vi.fn(),
  } as unknown as LoggerService;
}

describe('ConfigService', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    delete process.env.SPEKRA_API_KEY;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('resolve', () => {
    it('should resolve with defaults', () => {
      const configService = ConfigService.instance();
      const config = configService.resolve({ source: 'test' });

      expect(config.enabled).toBe(true);
      expect(config.debug).toBe(false);
      expect(config.batchSize).toBe(20);
      expect(config.timeout).toBe(15000);
      expect(config.maxRetries).toBe(3);
    });

    it('should use API key from options', () => {
      const configService = ConfigService.instance();
      const config = configService.resolve({ source: 'test', apiKey: 'my-key' });

      expect(config.apiKey).toBe('my-key');
    });

    it('should use API key from environment', () => {
      process.env.SPEKRA_API_KEY = 'env-key';
      const configService = ConfigService.instance();
      const config = configService.resolve({ source: 'test' });

      expect(config.apiKey).toBe('env-key');
    });

    it('should prefer options API key over environment', () => {
      process.env.SPEKRA_API_KEY = 'env-key';
      const configService = ConfigService.instance();
      const config = configService.resolve({ source: 'test', apiKey: 'options-key' });

      expect(config.apiKey).toBe('options-key');
    });
  });

  describe('validate', () => {
    it('should reset invalid batchSize to default', () => {
      const mockLogger = createMockLogger();
      const configService = ConfigService.instance();
      const config = configService.resolve({ source: 'test', batchSize: -5 });
      configService.validate(config, mockLogger);

      expect(config.batchSize).toBe(20); // default
      expect(mockLogger.warn).toHaveBeenCalled();
    });

    it('should reset batchSize over 1000 to default', () => {
      const mockLogger = createMockLogger();
      const configService = ConfigService.instance();
      const config = configService.resolve({ source: 'test', batchSize: 2000 });
      configService.validate(config, mockLogger);

      expect(config.batchSize).toBe(20); // default
    });

    it('should reset invalid timeout to default', () => {
      const mockLogger = createMockLogger();
      const configService = ConfigService.instance();
      const config = configService.resolve({ source: 'test', timeout: -100 });
      configService.validate(config, mockLogger);

      expect(config.timeout).toBe(15000); // default
      expect(mockLogger.warn).toHaveBeenCalled();
    });

    it('should reset invalid maxRetries to default', () => {
      const mockLogger = createMockLogger();
      const configService = ConfigService.instance();
      const config = configService.resolve({ source: 'test', maxRetries: -1 });
      configService.validate(config, mockLogger);

      expect(config.maxRetries).toBe(3); // default
      expect(mockLogger.warn).toHaveBeenCalled();
    });

    it('should not modify valid values', () => {
      const mockLogger = createMockLogger();
      const configService = ConfigService.instance();
      const config = configService.resolve({
        source: 'test',
        batchSize: 50,
        timeout: 30000,
        maxRetries: 5,
      });
      configService.validate(config, mockLogger);

      expect(config.batchSize).toBe(50);
      expect(config.timeout).toBe(30000);
      expect(config.maxRetries).toBe(5);
      expect(mockLogger.warn).not.toHaveBeenCalled();
    });
  });

  describe('isReady', () => {
    it('should return not ready when disabled', () => {
      const configService = ConfigService.instance();
      const config = configService.resolve({ source: 'test', enabled: false });
      const result = configService.isReady(config);

      expect(result.ready).toBe(false);
      expect(result.reason).toBe('disabled');
    });

    it('should return not ready without API key', () => {
      const configService = ConfigService.instance();
      const config = configService.resolve({ source: 'test' });
      const result = configService.isReady(config);

      expect(result.ready).toBe(false);
      expect(result.reason).toContain('API key');
    });

    it('should return not ready without source', () => {
      const configService = ConfigService.instance();
      const config = configService.resolve({ apiKey: 'key' });
      const result = configService.isReady(config);

      expect(result.ready).toBe(false);
      expect(result.reason).toContain('source');
    });

    it('should return ready with valid config', () => {
      const configService = ConfigService.instance();
      const config = configService.resolve({ source: 'test', apiKey: 'key' });
      const result = configService.isReady(config);

      expect(result.ready).toBe(true);
      expect(result.reason).toBeUndefined();
    });
  });

  describe('redaction config resolution', () => {
    it('should use default patterns when not specified', () => {
      const configService = ConfigService.instance();
      const config = configService.resolve({
        source: 'test',
        redact: {
          enabled: true,
          // patterns not specified
        },
      });

      expect(config.redaction.enabled).toBe(true);
      expect(config.redaction.patterns).toEqual([]);
      expect(config.redaction.replaceBuiltIn).toBe(false);
    });

    it('should respect custom redaction patterns', () => {
      const configService = ConfigService.instance();
      const config = configService.resolve({
        source: 'test',
        redact: {
          enabled: true,
          patterns: ['custom', /pattern/],
        },
      });

      expect(config.redaction.patterns).toHaveLength(2);
    });

    it('should handle redact: false', () => {
      const configService = ConfigService.instance();
      const config = configService.resolve({
        source: 'test',
        redact: false,
      });

      expect(config.redaction.enabled).toBe(false);
    });

    it('should handle redact as array of patterns', () => {
      const configService = ConfigService.instance();
      const config = configService.resolve({
        source: 'test',
        redact: ['pattern1', /pattern2/],
      });

      expect(config.redaction.enabled).toBe(true);
      expect(config.redaction.patterns).toHaveLength(2);
      expect(config.redaction.replaceBuiltIn).toBe(false);
    });
  });

  describe('configuration boundary cases', () => {
    it('should accept batchSize of 1', () => {
      const configService = ConfigService.instance();
      const config = configService.resolve({
        source: 'test',
        batchSize: 1,
      });

      expect(config.batchSize).toBe(1);
    });

    it('should accept batchSize of 1000 (max)', () => {
      const configService = ConfigService.instance();
      const config = configService.resolve({
        source: 'test',
        batchSize: 1000,
      });

      expect(config.batchSize).toBe(1000);
    });

    it('should accept maxRetries of 0 (no retries)', () => {
      const configService = ConfigService.instance();
      const config = configService.resolve({
        source: 'test',
        maxRetries: 0,
      });

      expect(config.maxRetries).toBe(0);
    });

    it('should accept high maxRetries value', () => {
      const configService = ConfigService.instance();
      const config = configService.resolve({
        source: 'test',
        maxRetries: 10,
      });

      expect(config.maxRetries).toBe(10);
    });

    it('should accept very short timeout', () => {
      const configService = ConfigService.instance();
      const config = configService.resolve({
        source: 'test',
        timeout: 100,
      });

      expect(config.timeout).toBe(100);
    });

    it('should accept very long timeout', () => {
      const configService = ConfigService.instance();
      const config = configService.resolve({
        source: 'test',
        timeout: 300000, // 5 minutes
      });

      expect(config.timeout).toBe(300000);
    });

    it('should accept maxErrorLength of 0', () => {
      const configService = ConfigService.instance();
      const config = configService.resolve({
        source: 'test',
        maxErrorLength: 0,
      });

      expect(config.maxErrorLength).toBe(0);
    });

    it('should accept maxStackTraceLines of 0', () => {
      const configService = ConfigService.instance();
      const config = configService.resolve({
        source: 'test',
        maxStackTraceLines: 0,
      });

      expect(config.maxStackTraceLines).toBe(0);
    });

    it('should accept maxBufferSize of 1', () => {
      const configService = ConfigService.instance();
      const config = configService.resolve({
        source: 'test',
        maxBufferSize: 1,
      });

      expect(config.maxBufferSize).toBe(1);
    });

    it('should handle all config options at once', () => {
      const configService = ConfigService.instance();
      const config = configService.resolve({
        source: 'test',
        apiKey: 'key',
        apiUrl: 'https://custom.api.com',
        enabled: true,
        debug: true,
        batchSize: 50,
        timeout: 30000,
        maxRetries: 5,
        retryBaseDelayMs: 500,
        retryMaxDelayMs: 10000,
        maxErrorLength: 5000,
        maxStackTraceLines: 20,
        maxBufferSize: 500,
        redact: {
          enabled: true,
          patterns: ['custom'],
          replaceBuiltIn: false,
        },
      });

      expect(config.source).toBe('test');
      expect(config.apiKey).toBe('key');
      expect(config.apiUrl).toBe('https://custom.api.com');
      expect(config.enabled).toBe(true);
      expect(config.debug).toBe(true);
      expect(config.batchSize).toBe(50);
      expect(config.timeout).toBe(30000);
      expect(config.maxRetries).toBe(5);
      expect(config.retryBaseDelayMs).toBe(500);
      expect(config.retryMaxDelayMs).toBe(10000);
      expect(config.maxErrorLength).toBe(5000);
      expect(config.maxStackTraceLines).toBe(20);
      expect(config.maxBufferSize).toBe(500);
      expect(config.redaction.patterns).toContain('custom');
    });
  });

  // ==========================================================================
  // Configuration Conflict Tests
  // ==========================================================================

  describe('configuration conflicts', () => {
    it('should prefer option apiKey over environment variable', () => {
      process.env.SPEKRA_API_KEY = 'env-api-key';
      const configService = ConfigService.instance();
      const config = configService.resolve({
        source: 'test',
        apiKey: 'option-api-key',
      });

      expect(config.apiKey).toBe('option-api-key');
    });

    it('should handle empty string apiKey in options (uses env)', () => {
      process.env.SPEKRA_API_KEY = 'env-api-key';
      const configService = ConfigService.instance();
      const config = configService.resolve({
        source: 'test',
        apiKey: '',
      });

      // Empty string is falsy, should fallback to env
      expect(config.apiKey).toBe('env-api-key');
    });

    it('should handle whitespace-only apiKey in options', () => {
      process.env.SPEKRA_API_KEY = 'env-api-key';
      const configService = ConfigService.instance();
      const config = configService.resolve({
        source: 'test',
        apiKey: '   ',
      });

      // Whitespace-only is truthy as string, will be used as-is
      expect(config.apiKey).toBe('   ');
    });

    it('should handle empty string source', () => {
      const configService = ConfigService.instance();
      const config = configService.resolve({
        source: '',
        apiKey: 'key',
      });

      expect(config.source).toBe('');
      // isReady should fail
      const result = configService.isReady(config);
      expect(result.ready).toBe(false);
    });

    it('should handle undefined vs missing properties differently', () => {
      const configService = ConfigService.instance();

      // undefined explicitly set
      const config1 = configService.resolve({
        source: 'test',
        batchSize: undefined,
      });
      expect(config1.batchSize).toBe(20); // default

      // property not set at all (uses default)
      const config2 = configService.resolve({
        source: 'test',
      });
      expect(config2.batchSize).toBe(20); // default
    });

    it('should handle 0 vs undefined for numeric values', () => {
      const configService = ConfigService.instance();

      // 0 explicitly set
      const config = configService.resolve({
        source: 'test',
        maxRetries: 0,
        timeout: 0,
      });

      // 0 is a valid value
      expect(config.maxRetries).toBe(0);
      // timeout: 0 should be treated as the value (though might be invalid)
      expect(config.timeout).toBe(0);
    });

    it('should handle false vs undefined for enabled', () => {
      const configService = ConfigService.instance();

      // false explicitly set
      const config1 = configService.resolve({
        source: 'test',
        enabled: false,
      });
      expect(config1.enabled).toBe(false);

      // not set (should default to true)
      const config2 = configService.resolve({
        source: 'test',
      });
      expect(config2.enabled).toBe(true);
    });

    it('should handle null values in options', () => {
      const configService = ConfigService.instance();
      const config = configService.resolve({
        source: 'test',
        // @ts-expect-error - testing runtime behavior
        batchSize: null,
      });

      // null should be treated as falsy, use default
      expect(config.batchSize).toBe(20);
    });

    it('should handle NaN for numeric values', () => {
      const mockLogger = createMockLogger();
      const configService = ConfigService.instance();
      const config = configService.resolve({
        source: 'test',
        batchSize: NaN,
      });

      // NaN should be caught by Number.isFinite check and reset to default
      configService.validate(config, mockLogger);
      expect(config.batchSize).toBe(20); // reset to default
      expect(mockLogger.warn).toHaveBeenCalled();
    });

    it('should handle Infinity for numeric values', () => {
      const mockLogger = createMockLogger();
      const configService = ConfigService.instance();
      const config = configService.resolve({
        source: 'test',
        timeout: Infinity,
      });

      // Infinity should be caught by Number.isFinite check and reset to default
      configService.validate(config, mockLogger);
      expect(config.timeout).toBe(15000); // reset to default
      expect(mockLogger.warn).toHaveBeenCalled();
    });

    it('should handle negative Infinity for numeric values', () => {
      const mockLogger = createMockLogger();
      const configService = ConfigService.instance();
      const config = configService.resolve({
        source: 'test',
        timeout: -Infinity,
      });

      // -Infinity should be caught by Number.isFinite check and reset to default
      configService.validate(config, mockLogger);
      expect(config.timeout).toBe(15000); // reset to default
      expect(mockLogger.warn).toHaveBeenCalled();
    });

    it('should handle float values for integer-expected fields', () => {
      const configService = ConfigService.instance();
      const config = configService.resolve({
        source: 'test',
        batchSize: 10.5,
        maxRetries: 2.9,
      });

      // Floats should be accepted as-is (JavaScript doesn't distinguish int/float)
      expect(config.batchSize).toBe(10.5);
      expect(config.maxRetries).toBe(2.9);
    });

    it('should handle callbacks being null', () => {
      const configService = ConfigService.instance();
      const config = configService.resolve({
        source: 'test',
        onError: null as unknown as undefined,
        onMetrics: null as unknown as undefined,
      });

      expect(config.onError).toBeNull();
      expect(config.onMetrics).toBeNull();
    });

    it('should handle redact boolean conflicts', () => {
      const configService = ConfigService.instance();

      // true
      const config1 = configService.resolve({ source: 'test', redact: true });
      expect(config1.redaction.enabled).toBe(true);

      // false
      const config2 = configService.resolve({ source: 'test', redact: false });
      expect(config2.redaction.enabled).toBe(false);
    });

    it('should handle redact array with empty array', () => {
      const configService = ConfigService.instance();
      const config = configService.resolve({
        source: 'test',
        redact: [],
      });

      // Empty array should enable redaction with no custom patterns
      expect(config.redaction.enabled).toBe(true);
      expect(config.redaction.patterns).toEqual([]);
    });

    it('should handle very long source names', () => {
      const configService = ConfigService.instance();
      const longSource = 'a'.repeat(1000);
      const config = configService.resolve({
        source: longSource,
        apiKey: 'key',
      });

      expect(config.source).toBe(longSource);
    });

    it('should handle source with special characters', () => {
      const configService = ConfigService.instance();
      const config = configService.resolve({
        source: 'test-suite@v1.0/feature#123',
        apiKey: 'key',
      });

      expect(config.source).toBe('test-suite@v1.0/feature#123');
    });

    it('should handle apiUrl with trailing slash', () => {
      const configService = ConfigService.instance();
      const config = configService.resolve({
        source: 'test',
        apiUrl: 'https://api.example.com/',
      });

      expect(config.apiUrl).toBe('https://api.example.com/');
    });

    it('should handle apiUrl without https', () => {
      const configService = ConfigService.instance();
      const config = configService.resolve({
        source: 'test',
        apiUrl: 'http://localhost:3000/api',
      });

      // Should accept HTTP for local development
      expect(config.apiUrl).toBe('http://localhost:3000/api');
    });
  });

  // ==========================================================================
  // Memory/Performance Edge Cases
  // ==========================================================================

  describe('memory and performance edge cases', () => {
    it('should handle rapid consecutive resolves', () => {
      const configService = ConfigService.instance();
      const startTime = Date.now();

      for (let i = 0; i < 1000; i++) {
        configService.resolve({
          source: `test-${i}`,
          batchSize: i % 100,
        });
      }

      const duration = Date.now() - startTime;
      // Should complete quickly
      expect(duration).toBeLessThan(1000);
    });

    it('should handle config with large patterns array', () => {
      const configService = ConfigService.instance();
      const largePatterns = Array(1000)
        .fill(0)
        .map((_, i) => new RegExp(`pattern-${i}`, 'g'));

      const config = configService.resolve({
        source: 'test',
        redact: {
          enabled: true,
          patterns: largePatterns,
        },
      });

      expect(config.redaction.patterns).toHaveLength(1000);
    });

    it('should handle config resolution with all callbacks', () => {
      const configService = ConfigService.instance();
      const callbacks = {
        onError: vi.fn(),
        onMetrics: vi.fn(),
      };

      const config = configService.resolve({
        source: 'test',
        ...callbacks,
      });

      expect(config.onError).toBe(callbacks.onError);
      expect(config.onMetrics).toBe(callbacks.onMetrics);
    });
  });
});
