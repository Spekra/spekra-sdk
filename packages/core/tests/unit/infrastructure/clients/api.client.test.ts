import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApiClient } from '../../../../src/infrastructure/clients/api.client';
import type { LoggerService } from '../../../../src/infrastructure/services/logger.service';
import type { ReportPayload, TestResult } from '../../../../src/types';

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock logger
function createMockLogger(): LoggerService {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    verbose: vi.fn(),
  } as unknown as LoggerService;
}

describe('ApiClient', () => {
  let logger: LoggerService;
  let client: ApiClient;

  beforeEach(() => {
    logger = createMockLogger();
    client = new ApiClient(
      {
        apiKey: 'test-api-key',
        apiUrl: 'https://api.spekra.dev/reports',
        timeout: 5000,
        maxRetries: 1,
        retryBaseDelayMs: 100,
        retryMaxDelayMs: 500,
        framework: 'playwright',
        sdkVersion: '1.0.0',
      },
      logger
    );
    mockFetch.mockReset();
  });

  describe('confirmUploads', () => {
    it('should send confirm uploads request', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ confirmed: 3, success: true }),
      });

      const result = await client.confirmUploads(['artifact-1', 'artifact-2', 'artifact-3']);

      expect(result.success).toBe(true);
      expect(result.data?.confirmed).toBe(3);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.spekra.dev/reports/confirm-uploads',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('artifact-1'),
        })
      );
    });

    it('should handle confirm uploads failure', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => JSON.stringify({ error: 'Server error' }),
      });

      const result = await client.confirmUploads(['artifact-1']);

      expect(result.success).toBe(false);
    });

    it('should include proper headers', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ confirmed: 1, success: true }),
      });

      await client.confirmUploads(['artifact-1']);

      const fetchCall = mockFetch.mock.calls[0];
      const options = fetchCall[1] as RequestInit;
      const headers = options.headers as Record<string, string>;

      expect(headers['Content-Type']).toBe('application/json');
      expect(headers['Authorization']).toBe('Bearer test-api-key');
      expect(headers['X-Request-Id']).toBeDefined();
    });
  });

  describe('sendReport', () => {
    const createTestPayload = (): ReportPayload => ({
      runId: 'run-123',
      source: 'test-suite',
      framework: 'playwright',
      branch: 'main',
      commitSha: 'abc123',
      ciUrl: null,
      shardIndex: null,
      totalShards: null,
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      results: [
        {
          testFile: 'test.spec.ts',
          fullTitle: 'Test Suite > Test Case',
          suitePath: ['Test Suite'],
          testName: 'Test Case',
          tags: [],
          project: 'chromium',
          status: 'passed',
          durationMs: 100,
          retry: 0,
          errorMessage: null,
        } as TestResult,
      ],
    });

    it('should send report successfully', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          message: 'OK',
          summary: {
            runId: 'run-123',
            testsReceived: 1,
            passed: 1,
            failed: 0,
            skipped: 0,
          },
          uploadUrls: {},
        }),
      });

      const result = await client.sendReport(createTestPayload());

      expect(result.success).toBe(true);
      expect(result.data?.summary.testsReceived).toBe(1);
      expect(mockFetch).toHaveBeenCalled();
    });

    it('should handle API errors gracefully', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 400,
        text: async () => JSON.stringify({ error: 'Bad request' }),
      });

      const result = await client.sendReport({
        runId: 'run-123',
        source: 'test-suite',
        framework: 'playwright',
        branch: null,
        commitSha: null,
        ciUrl: null,
        shardIndex: null,
        totalShards: null,
        startedAt: new Date().toISOString(),
        finishedAt: null,
        results: [],
      });

      expect(result.success).toBe(false);
    });

    it('should include SDK version and User-Agent in headers', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          message: 'OK',
          summary: {
            runId: 'run-123',
            testsReceived: 1,
            passed: 1,
            failed: 0,
            skipped: 0,
          },
          uploadUrls: {},
        }),
      });

      await client.sendReport(createTestPayload());

      const fetchCall = mockFetch.mock.calls[0];
      const options = fetchCall[1] as RequestInit;
      const headers = options.headers as Record<string, string>;

      expect(headers['X-Spekra-SDK-Version']).toBe('1.0.0');
      expect(headers['User-Agent']).toContain('@spekra/playwright');
    });

    it('should include compression headers for large payloads', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          message: 'OK',
          summary: {
            runId: 'run-123',
            testsReceived: 1,
            passed: 1,
            failed: 0,
            skipped: 0,
          },
          uploadUrls: {},
        }),
      });

      const largePayload = createTestPayload();
      // Make payload large enough to trigger compression (> 1024 bytes)
      largePayload.results[0].fullTitle = 'A'.repeat(2000);

      await client.sendReport(largePayload);

      const fetchCall = mockFetch.mock.calls[0];
      const options = fetchCall[1] as RequestInit;
      const headers = options.headers as Record<string, string>;

      // Should have compression-related headers for large payloads
      expect(headers['Content-Encoding']).toBe('gzip');
    });

    it('should NOT compress small payloads', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          message: 'OK',
          summary: {
            runId: 'run-123',
            testsReceived: 1,
            passed: 1,
            failed: 0,
            skipped: 0,
          },
          uploadUrls: {},
        }),
      });

      // Small payload
      const smallPayload = createTestPayload();

      await client.sendReport(smallPayload);

      const fetchCall = mockFetch.mock.calls[0];
      const options = fetchCall[1] as RequestInit;
      const headers = options.headers as Record<string, string>;

      // Small payloads should not be compressed
      expect(headers['Content-Encoding']).toBeUndefined();
    });

    it('should return upload URLs from response', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          message: 'OK',
          summary: {
            runId: 'run-123',
            testsReceived: 1,
            passed: 1,
            failed: 0,
            skipped: 0,
          },
          uploadUrls: {
            'artifact-1': 'https://storage.example.com/upload/artifact-1',
            'artifact-2': 'https://storage.example.com/upload/artifact-2',
          },
        }),
      });

      const result = await client.sendReport(createTestPayload());

      expect(result.success).toBe(true);
      expect(result.data?.uploadUrls).toEqual({
        'artifact-1': 'https://storage.example.com/upload/artifact-1',
        'artifact-2': 'https://storage.example.com/upload/artifact-2',
      });
    });

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const result = await client.sendReport(createTestPayload());

      expect(result.success).toBe(false);
      expect(result.error?.type).toBe('network');
    });

    it('should handle timeout errors', async () => {
      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';
      mockFetch.mockRejectedValue(abortError);

      const result = await client.sendReport(createTestPayload());

      expect(result.success).toBe(false);
      expect(result.error?.type).toBe('timeout');
    });
  });

  describe('constructor validation', () => {
    it('should use provided configuration', () => {
      const customClient = new ApiClient(
        {
          apiKey: 'custom-key',
          apiUrl: 'https://custom.api.com/v2/reports',
          timeout: 10000,
          maxRetries: 5,
          retryBaseDelayMs: 200,
          retryMaxDelayMs: 2000,
          framework: 'jest',
          sdkVersion: '2.0.0',
        },
        logger
      );

      // Client should be created without errors
      expect(customClient).toBeDefined();
    });

    it('should handle different frameworks', () => {
      const jestClient = new ApiClient(
        {
          apiKey: 'test-key',
          apiUrl: 'https://api.spekra.dev/reports',
          timeout: 5000,
          maxRetries: 1,
          retryBaseDelayMs: 100,
          retryMaxDelayMs: 500,
          framework: 'jest',
          sdkVersion: '1.0.0',
        },
        logger
      );

      const vitestClient = new ApiClient(
        {
          apiKey: 'test-key',
          apiUrl: 'https://api.spekra.dev/reports',
          timeout: 5000,
          maxRetries: 1,
          retryBaseDelayMs: 100,
          retryMaxDelayMs: 500,
          framework: 'vitest',
          sdkVersion: '1.0.0',
        },
        logger
      );

      expect(jestClient).toBeDefined();
      expect(vitestClient).toBeDefined();
    });
  });

  describe('request ID generation', () => {
    it('should generate unique request IDs', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ confirmed: 1, success: true }),
      });

      await client.confirmUploads(['artifact-1']);
      await client.confirmUploads(['artifact-2']);

      const firstCall = mockFetch.mock.calls[0];
      const secondCall = mockFetch.mock.calls[1];

      const firstRequestId = (firstCall[1] as RequestInit).headers as Record<string, string>;
      const secondRequestId = (secondCall[1] as RequestInit).headers as Record<string, string>;

      expect(firstRequestId['X-Request-Id']).toBeDefined();
      expect(secondRequestId['X-Request-Id']).toBeDefined();
      expect(firstRequestId['X-Request-Id']).not.toBe(secondRequestId['X-Request-Id']);
    });
  });

  describe('byte tracking', () => {
    it('should track bytes sent and uncompressed', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          message: 'OK',
          summary: {
            runId: 'run-123',
            testsReceived: 1,
            passed: 1,
            failed: 0,
            skipped: 0,
          },
          uploadUrls: {},
        }),
      });

      const payload = {
        runId: 'run-123',
        source: 'test-suite',
        framework: 'playwright' as const,
        branch: null,
        commitSha: null,
        ciUrl: null,
        shardIndex: null,
        totalShards: null,
        startedAt: new Date().toISOString(),
        finishedAt: null,
        results: [],
      };

      const result = await client.sendReport(payload);

      expect(result.bytesSent).toBeGreaterThan(0);
      expect(result.bytesUncompressed).toBeGreaterThan(0);
    });

    it('should show compression ratio for large payloads', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          message: 'OK',
          summary: {
            runId: 'run-123',
            testsReceived: 1,
            passed: 1,
            failed: 0,
            skipped: 0,
          },
          uploadUrls: {},
        }),
      });

      const payload = {
        runId: 'run-123',
        source: 'test-suite',
        framework: 'playwright' as const,
        branch: null,
        commitSha: null,
        ciUrl: null,
        shardIndex: null,
        totalShards: null,
        startedAt: new Date().toISOString(),
        finishedAt: null,
        results: [
          {
            testFile: 'test.spec.ts',
            fullTitle: 'A'.repeat(5000), // Large enough to trigger compression
            suitePath: [],
            testName: 'test',
            tags: [],
            project: 'chromium',
            status: 'passed' as const,
            durationMs: 100,
            retry: 0,
            errorMessage: null,
          },
        ],
      };

      const result = await client.sendReport(payload);

      // Compressed size should be less than uncompressed
      expect(result.bytesSent).toBeLessThan(result.bytesUncompressed);
    });
  });
});
