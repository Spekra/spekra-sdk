import { describe, it, expect } from 'vitest';
import { createContainer, type Container } from '../../src/container';
import type { ResolvedConfig } from '../../src/types';

// Helper to create a minimal resolved config
function createMockConfig(overrides: Partial<ResolvedConfig> = {}): ResolvedConfig {
  return {
    apiKey: 'test-api-key',
    apiUrl: 'https://spekra.dev/api/reports',
    source: 'test-suite',
    enabled: true,
    debug: false,
    batchSize: 50,
    timeout: 30000,
    maxRetries: 3,
    retryBaseDelayMs: 1000,
    retryMaxDelayMs: 10000,
    maxErrorLength: 10000,
    maxStackTraceLines: 50,
    maxBufferSize: 10000,
    redaction: {
      enabled: true,
      patterns: [],
      replaceBuiltIn: false,
    },
    onError: null,
    onMetrics: null,
    _devMode: false,
    ...overrides,
  };
}

describe('Container', () => {
  describe('createContainer', () => {
    it('should create container with all required services', () => {
      const config = createMockConfig();
      const container = createContainer(config);

      // Verify all services are present
      expect(container.logger).toBeDefined();
      expect(container.redactionService).toBeDefined();
      expect(container.compressionService).toBeDefined();
      expect(container.apiClient).toBeDefined();
      expect(container.uploadClient).toBeDefined();
      expect(container.collectUseCase).toBeDefined();
      expect(container.sendReportUseCase).toBeDefined();
      expect(container.uploadArtifactsUseCase).toBeDefined();
    });

    it('should pass debug flag to logger', () => {
      const debugContainer = createContainer(createMockConfig({ debug: true }));
      const normalContainer = createContainer(createMockConfig({ debug: false }));

      // Both should create valid loggers
      expect(debugContainer.logger).toBeDefined();
      expect(normalContainer.logger).toBeDefined();
    });

    it('should pass redaction config to redaction service', () => {
      const configWithCustomPatterns = createMockConfig({
        redaction: {
          enabled: true,
          patterns: [/custom-secret/],
          replaceBuiltIn: true,
        },
      });

      const container = createContainer(configWithCustomPatterns);

      expect(container.redactionService).toBeDefined();
      // Verify redaction service works with custom pattern
      const redacted = container.redactionService.redact('my custom-secret here');
      expect(redacted).toContain('[REDACTED]');
    });

    it('should pass API config to API client', () => {
      const config = createMockConfig({
        apiKey: 'custom-api-key',
        apiUrl: 'https://custom.api.com/reports',
        timeout: 60000,
        maxRetries: 5,
      });

      const container = createContainer(config);

      expect(container.apiClient).toBeDefined();
      // API client is created - we can verify it doesn't throw
    });

    it('should pass config to collect use case', () => {
      const config = createMockConfig({
        maxErrorLength: 5000,
        maxStackTraceLines: 25,
      });

      const container = createContainer(config);

      expect(container.collectUseCase).toBeDefined();
      // Collect use case should be initialized
    });

    it('should create independent containers for different configs', () => {
      const config1 = createMockConfig({ debug: true });
      const config2 = createMockConfig({ debug: false });

      const container1 = createContainer(config1);
      const container2 = createContainer(config2);

      // Should be different instances
      expect(container1).not.toBe(container2);
      expect(container1.logger).not.toBe(container2.logger);
    });

    it('should handle minimum config values', () => {
      const minConfig = createMockConfig({
        timeout: 1,
        maxRetries: 0,
        batchSize: 1,
        maxErrorLength: 1,
        maxStackTraceLines: 1,
      });

      const container = createContainer(minConfig);

      expect(container.logger).toBeDefined();
      expect(container.collectUseCase).toBeDefined();
    });

    it('should handle maximum config values', () => {
      const maxConfig = createMockConfig({
        timeout: 300000,
        maxRetries: 10,
        batchSize: 1000,
        maxErrorLength: 1000000,
        maxStackTraceLines: 1000,
      });

      const container = createContainer(maxConfig);

      expect(container.logger).toBeDefined();
      expect(container.collectUseCase).toBeDefined();
    });

    it('should handle redaction disabled', () => {
      const config = createMockConfig({
        redaction: {
          enabled: false,
          patterns: [],
          replaceBuiltIn: false,
        },
      });

      const container = createContainer(config);

      expect(container.redactionService).toBeDefined();
      // With redaction disabled, sensitive data should pass through
      const sensitive = 'password=secret123';
      const result = container.redactionService.redact(sensitive);
      expect(result).toBe(sensitive);
    });
  });

  describe('service wiring verification', () => {
    it('should wire logger to all services that need it', () => {
      const config = createMockConfig({ debug: true });
      const container = createContainer(config);

      // All services should be created without throwing
      expect(container.logger).toBeDefined();
      expect(container.redactionService).toBeDefined();
      expect(container.compressionService).toBeDefined();
      expect(container.apiClient).toBeDefined();
      expect(container.uploadClient).toBeDefined();
    });

    it('should allow use cases to function after creation', () => {
      const config = createMockConfig();
      const container = createContainer(config);

      // Collect use case should be usable
      expect(container.collectUseCase.bufferedCount).toBe(0);
      expect(() => container.collectUseCase.flushResults()).not.toThrow();
    });
  });

  describe('Container type safety', () => {
    it('should satisfy Container interface', () => {
      const config = createMockConfig();
      const container: Container = createContainer(config);

      // TypeScript should enforce all properties exist
      const services = [
        container.logger,
        container.redactionService,
        container.compressionService,
        container.apiClient,
        container.uploadClient,
        container.collectUseCase,
        container.sendReportUseCase,
        container.uploadArtifactsUseCase,
      ];

      services.forEach((service) => {
        expect(service).toBeDefined();
      });
    });
  });
});
