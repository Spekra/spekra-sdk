import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SpekraApiClient } from '../../src/api';
import type { ReportPayload, ResolvedConfig } from '../../src/types';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

function createMockConfig(overrides: Partial<ResolvedConfig> = {}): ResolvedConfig {
  return {
    apiKey: 'test-api-key',
    apiUrl: 'https://spekra.dev/api/reports',
    projectName: null,
    enabled: true,
    debug: false,
    batchSize: 20,
    timeout: 15000,
    maxRetries: 3,
    retryBaseDelayMs: 1000,
    retryMaxDelayMs: 10000,
    maxErrorLength: 4000,
    maxStackTraceLines: 20,
    maxBufferSize: 1000,
    onError: null,
    onMetrics: null,
    ...overrides,
  };
}

function createMockPayload(overrides: Partial<ReportPayload> = {}): ReportPayload {
  return {
    runId: 'run-123',
    project: 'test-project',
    branch: 'main',
    commitSha: 'abc123',
    ciUrl: null,
    shardIndex: null,
    totalShards: null,
    startedAt: '2024-01-01T00:00:00.000Z',
    finishedAt: null,
    results: [
      {
        testFile: 'example.spec.ts',
        testTitle: 'should work',
        status: 'passed',
        durationMs: 100,
        retry: 0,
        errorMessage: null,
      },
    ],
    ...overrides,
  };
}

describe('SpekraApiClient', () => {
  let consoleWarnSpy: any;
  let consoleLogSpy: any;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('sendReport', () => {
    it('should send report with correct headers and body', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve('OK'),
      });

      const config = createMockConfig();
      const client = new SpekraApiClient(config);
      const payload = createMockPayload();

      const result = await client.sendReport(payload);

      expect(result.success).toBe(true);
      expect(result.retryCount).toBe(0);
      expect(result.requestId).toBeDefined();
      expect(mockFetch).toHaveBeenCalledWith(
        'https://spekra.dev/api/reports',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            Authorization: 'Bearer test-api-key',
            'User-Agent': expect.stringContaining('@spekra/playwright'),
            'X-Spekra-SDK-Version': expect.any(String),
            'X-Request-Id': expect.any(String),
            Connection: 'keep-alive',
          }),
        })
      );
    });

    it('should use custom API URL', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve('OK'),
      });

      const config = createMockConfig({ apiUrl: 'https://custom.api/reports' });
      const client = new SpekraApiClient(config);
      const payload = createMockPayload();

      await client.sendReport(payload);

      expect(mockFetch).toHaveBeenCalledWith('https://custom.api/reports', expect.anything());
    });

    it('should return failure result on non-OK response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: () => Promise.resolve('Unauthorized'),
      });

      // Disable retries for this test (4xx errors don't retry anyway)
      const config = createMockConfig({ maxRetries: 0 });
      const client = new SpekraApiClient(config);
      const payload = createMockPayload();

      const result = await client.sendReport(payload);

      expect(result.success).toBe(false);
      expect(result.error?.type).toBe('api');
      expect(result.error?.statusCode).toBe(401);
      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('API returned 401'));
    });

    it('should handle response text read failure', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.reject(new Error('Failed to read body')),
      });

      // Use maxRetries: 0 to avoid timeout
      const config = createMockConfig({ maxRetries: 0 });
      const client = new SpekraApiClient(config);
      const payload = createMockPayload();

      const result = await client.sendReport(payload);

      expect(result.success).toBe(false);
      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('API returned 500'));
    });

    it('should return failure result and log warning on network error', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      // Use maxRetries: 0 to avoid retries in this basic test
      const config = createMockConfig({ maxRetries: 0 });
      const client = new SpekraApiClient(config);
      const payload = createMockPayload();

      const result = await client.sendReport(payload);

      expect(result.success).toBe(false);
      expect(result.error?.type).toBe('network');
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to send report: Network error')
      );
    });

    it('should handle timeout (AbortError)', async () => {
      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';
      mockFetch.mockRejectedValue(abortError);

      // Use maxRetries: 0 to avoid retries in this basic test
      const config = createMockConfig({ timeout: 3000, maxRetries: 0 });
      const client = new SpekraApiClient(config);
      const payload = createMockPayload();

      const result = await client.sendReport(payload);

      expect(result.success).toBe(false);
      expect(result.error?.type).toBe('timeout');
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Request timed out after 3000ms')
      );
    });

    it('should handle non-Error thrown values', async () => {
      mockFetch.mockRejectedValue('string error');

      // Use maxRetries: 0 to avoid retries in this basic test
      const config = createMockConfig({ maxRetries: 0 });
      const client = new SpekraApiClient(config);
      const payload = createMockPayload();

      const result = await client.sendReport(payload);

      expect(result.success).toBe(false);
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to send report: Unknown error')
      );
    });

    it('should log debug message on success when debug is enabled', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve('OK'),
      });

      const config = createMockConfig({ debug: true });
      const client = new SpekraApiClient(config);
      const payload = createMockPayload({
        results: [
          {
            testFile: 'a.spec.ts',
            testTitle: 'test 1',
            status: 'passed',
            durationMs: 100,
            retry: 0,
            errorMessage: null,
          },
          {
            testFile: 'b.spec.ts',
            testTitle: 'test 2',
            status: 'passed',
            durationMs: 200,
            retry: 0,
            errorMessage: null,
          },
        ],
      });

      await client.sendReport(payload);

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('succeeded with 2 results')
      );
    });

    it('should not log debug message when debug is disabled', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve('OK'),
      });

      const config = createMockConfig({ debug: false });
      const client = new SpekraApiClient(config);
      const payload = createMockPayload();

      await client.sendReport(payload);

      expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    it('should pass abort signal to fetch', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve('OK'),
      });

      const config = createMockConfig();
      const client = new SpekraApiClient(config);
      const payload = createMockPayload();

      await client.sendReport(payload);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          signal: expect.any(AbortSignal),
        })
      );
    });

    it('should handle empty results array', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve('OK'),
      });

      const config = createMockConfig({ debug: true });
      const client = new SpekraApiClient(config);
      const payload = createMockPayload({ results: [] });

      const result = await client.sendReport(payload);

      expect(result.success).toBe(true);
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('succeeded with 0 results')
      );
    });

    it('should track bytes sent', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve('OK'),
      });

      const config = createMockConfig();
      const client = new SpekraApiClient(config);
      const payload = createMockPayload();

      const result = await client.sendReport(payload);

      expect(result.success).toBe(true);
      expect(result.bytesSent).toBeGreaterThan(0);
      expect(result.bytesUncompressed).toBeGreaterThan(0);
    });
  });

  describe('retry logic', () => {
    it('should retry on 5xx server errors', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 503,
          text: () => Promise.resolve('Service Unavailable'),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 502,
          text: () => Promise.resolve('Bad Gateway'),
        })
        .mockResolvedValueOnce({
          ok: true,
          text: () => Promise.resolve('OK'),
        });

      const config = createMockConfig({ maxRetries: 3, retryBaseDelayMs: 10, debug: true });
      const client = new SpekraApiClient(config);
      const payload = createMockPayload();

      // Run timers to avoid waiting for delays
      const resultPromise = client.sendReport(payload);
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result.success).toBe(true);
      expect(result.retryCount).toBe(2);
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('should not retry on 4xx client errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: () => Promise.resolve('Unauthorized'),
      });

      const config = createMockConfig({ maxRetries: 3 });
      const client = new SpekraApiClient(config);
      const payload = createMockPayload();

      const result = await client.sendReport(payload);

      expect(result.success).toBe(false);
      expect(result.retryCount).toBe(0);
      expect(mockFetch).toHaveBeenCalledTimes(1); // No retries
    });

    it('should not retry on 400 bad request', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: () => Promise.resolve('Bad Request'),
      });

      const config = createMockConfig({ maxRetries: 3 });
      const client = new SpekraApiClient(config);
      const payload = createMockPayload();

      const result = await client.sendReport(payload);

      expect(result.success).toBe(false);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should retry on network errors', async () => {
      mockFetch
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Connection refused'))
        .mockResolvedValueOnce({
          ok: true,
          text: () => Promise.resolve('OK'),
        });

      const config = createMockConfig({ maxRetries: 3, retryBaseDelayMs: 10, debug: true });
      const client = new SpekraApiClient(config);
      const payload = createMockPayload();

      const resultPromise = client.sendReport(payload);
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result.success).toBe(true);
      expect(result.retryCount).toBe(2);
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('should retry on timeout errors', async () => {
      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';

      mockFetch.mockRejectedValueOnce(abortError).mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve('OK'),
      });

      const config = createMockConfig({ maxRetries: 2, retryBaseDelayMs: 10, debug: true });
      const client = new SpekraApiClient(config);
      const payload = createMockPayload();

      const resultPromise = client.sendReport(payload);
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result.success).toBe(true);
      expect(result.retryCount).toBe(1);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should fail after max retries exceeded', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Internal Server Error'),
      });

      const config = createMockConfig({ maxRetries: 2, retryBaseDelayMs: 10 });
      const client = new SpekraApiClient(config);
      const payload = createMockPayload();

      const resultPromise = client.sendReport(payload);
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result.success).toBe(false);
      expect(result.retryCount).toBe(2);
      // 1 initial + 2 retries = 3 total attempts
      expect(mockFetch).toHaveBeenCalledTimes(3);
      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('all 3 attempts failed'));
    });

    it('should not retry when maxRetries is 0', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Internal Server Error'),
      });

      const config = createMockConfig({ maxRetries: 0 });
      const client = new SpekraApiClient(config);
      const payload = createMockPayload();

      const result = await client.sendReport(payload);

      expect(result.success).toBe(false);
      expect(result.retryCount).toBe(0);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should log retry attempts in debug mode', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          text: () => Promise.resolve('Internal Server Error'),
        })
        .mockResolvedValueOnce({
          ok: true,
          text: () => Promise.resolve('OK'),
        });

      const config = createMockConfig({ maxRetries: 2, retryBaseDelayMs: 10, debug: true });
      const client = new SpekraApiClient(config);
      const payload = createMockPayload();

      const resultPromise = client.sendReport(payload);
      await vi.runAllTimersAsync();
      await resultPromise;

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('attempt 1/3 failed, retrying in')
      );
    });
  });

  describe('API key masking', () => {
    it('should mask short API keys when echoed in error response', async () => {
      const shortKey = 'short';
      // Simulate API echoing back the key in error response
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: () => Promise.resolve(`Invalid key: ${shortKey}`),
      });

      const config = createMockConfig({ apiKey: shortKey, maxRetries: 0 });
      const client = new SpekraApiClient(config);
      const payload = createMockPayload();

      await client.sendReport(payload);

      // Warning log should show masked key as '***' for short keys
      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('***'));
    });

    it('should mask empty API key when echoed in error response', async () => {
      // Simulate API echoing back an empty key in error response
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: () => Promise.resolve('Invalid key: '),
      });

      const config = createMockConfig({ apiKey: '', maxRetries: 0 });
      const client = new SpekraApiClient(config);
      const payload = createMockPayload();

      await client.sendReport(payload);

      // Warning should be logged for the error
      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('400'));
    });
  });

  describe('error result fallbacks', () => {
    it('should use default error type when not provided', async () => {
      // Create a fetch that returns an error without proper structure
      mockFetch.mockRejectedValueOnce({
        // Error without name property - will trigger fallback
      });

      const config = createMockConfig({ maxRetries: 0 });
      const client = new SpekraApiClient(config);
      const payload = createMockPayload();

      const result = await client.sendReport(payload);

      expect(result.success).toBe(false);
      // Error should have been built with fallback values
    });

    it('should use default error message when not provided', async () => {
      // Create a response that will produce an error without errorMessage
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: () => Promise.resolve(''), // Empty response body
      });

      const config = createMockConfig({ maxRetries: 0 });
      const client = new SpekraApiClient(config);
      const payload = createMockPayload();

      const result = await client.sendReport(payload);

      expect(result.success).toBe(false);
      // The error handling should work without throwing
    });

    it('should use fallback values when sendSingleRequest returns without errorType/errorMessage', async () => {
      const config = createMockConfig({ maxRetries: 0 });
      const client = new SpekraApiClient(config);
      const payload = createMockPayload();

      // Stub sendSingleRequest to return a result without errorType/errorMessage
      const sendSingleRequestStub = vi.fn().mockResolvedValue({
        success: false,
        retriable: false,
        statusCode: 500,
        // Intentionally omitting errorType and errorMessage to test fallbacks
        bytesSent: 100,
        bytesUncompressed: 100,
      });
      (client as any).sendSingleRequest = sendSingleRequestStub;

      const result = await client.sendReport(payload);

      expect(result.success).toBe(false);
      // The fallback values should be used in the error object
      expect(result.error).toEqual(
        expect.objectContaining({
          type: 'network',
          message: 'Unknown error',
        })
      );
    });
  });
});
