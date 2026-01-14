import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ConfigService, DEFAULTS } from '../../src/config.service';
import { LoggerService } from '@spekra/core';

describe('ConfigService', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    // Clear all Spekra env vars
    Object.keys(process.env).forEach((key) => {
      if (key.startsWith('SPEKRA_')) {
        delete process.env[key];
      }
    });
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('resolve', () => {
    it('uses option values over env vars', () => {
      process.env.SPEKRA_JEST_API_KEY = 'env-key';
      process.env.SPEKRA_JEST_SOURCE = 'env-source';

      const config = ConfigService.instance().resolve({
        apiKey: 'option-key',
        source: 'option-source',
      });

      expect(config.apiKey).toBe('option-key');
      expect(config.source).toBe('option-source');
    });

    it('uses SPEKRA_JEST_* env vars', () => {
      process.env.SPEKRA_JEST_API_KEY = 'jest-key';
      process.env.SPEKRA_JEST_SOURCE = 'jest-source';
      process.env.SPEKRA_JEST_API_URL = 'https://custom.api.com';

      const config = ConfigService.instance().resolve({});

      expect(config.apiKey).toBe('jest-key');
      expect(config.source).toBe('jest-source');
      expect(config.apiUrl).toBe('https://custom.api.com');
    });

    it('falls back to SPEKRA_* env vars', () => {
      process.env.SPEKRA_API_KEY = 'fallback-key';
      process.env.SPEKRA_SOURCE = 'fallback-source';

      const config = ConfigService.instance().resolve({});

      expect(config.apiKey).toBe('fallback-key');
      expect(config.source).toBe('fallback-source');
    });

    it('prefers SPEKRA_JEST_* over SPEKRA_*', () => {
      process.env.SPEKRA_API_KEY = 'fallback-key';
      process.env.SPEKRA_JEST_API_KEY = 'jest-key';

      const config = ConfigService.instance().resolve({});

      expect(config.apiKey).toBe('jest-key');
    });

    it('uses defaults for missing values', () => {
      const config = ConfigService.instance().resolve({});

      expect(config.apiUrl).toBe(DEFAULTS.apiUrl);
      expect(config.enabled).toBe(DEFAULTS.enabled);
      expect(config.debug).toBe(DEFAULTS.debug);
      expect(config.failOnError).toBe(DEFAULTS.failOnError);
    });

    it('resolves boolean from env var string', () => {
      process.env.SPEKRA_JEST_ENABLED = 'false';
      process.env.SPEKRA_JEST_DEBUG = 'true';

      const config = ConfigService.instance().resolve({});

      expect(config.enabled).toBe(false);
      expect(config.debug).toBe(true);
    });

    it('resolves boolean 0 as false', () => {
      process.env.SPEKRA_JEST_ENABLED = '0';

      const config = ConfigService.instance().resolve({});

      expect(config.enabled).toBe(false);
    });
  });

  describe('isReady', () => {
    it('returns not ready when disabled', () => {
      const config = ConfigService.instance().resolve({ enabled: false });
      const result = ConfigService.instance().isReady(config);

      expect(result.ready).toBe(false);
      expect(result.reason).toBe('disabled');
    });

    it('returns not ready when API key missing', () => {
      const config = ConfigService.instance().resolve({ source: 'test-source' });
      const result = ConfigService.instance().isReady(config);

      expect(result.ready).toBe(false);
      expect(result.reason).toContain('Missing API key');
    });

    it('returns not ready when source missing', () => {
      const config = ConfigService.instance().resolve({ apiKey: 'test-key' });
      const result = ConfigService.instance().isReady(config);

      expect(result.ready).toBe(false);
      expect(result.reason).toContain('Missing source');
    });

    it('returns ready when all required values present', () => {
      const config = ConfigService.instance().resolve({
        apiKey: 'test-key',
        source: 'test-source',
      });
      const result = ConfigService.instance().isReady(config);

      expect(result.ready).toBe(true);
      expect(result.reason).toBeUndefined();
    });
  });

  describe('validate', () => {
    it('warns on placeholder source', () => {
      const mockLogger = { warn: vi.fn(), verbose: vi.fn(), info: vi.fn(), error: vi.fn() } as unknown as LoggerService;
      const config = ConfigService.instance().resolve({
        apiKey: 'key',
        source: 'test-placeholder',
      });

      ConfigService.instance().validate(config, mockLogger);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('looks like a placeholder')
      );
    });

    it('warns on non-HTTPS API URL when not in debug mode', () => {
      const mockLogger = { warn: vi.fn(), verbose: vi.fn(), info: vi.fn(), error: vi.fn() } as unknown as LoggerService;
      const config = ConfigService.instance().resolve({
        apiKey: 'key',
        source: 'my-app-tests',
        apiUrl: 'http://localhost:3000',
        debug: false,
      });

      ConfigService.instance().validate(config, mockLogger);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('not using HTTPS')
      );
    });
  });
});

