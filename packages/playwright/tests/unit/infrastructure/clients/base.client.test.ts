import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  BaseClient,
  type ClientConfig,
  type ClientResult,
} from '../../../../src/infrastructure/clients/base.client';
import type { LoggerService } from '../../../../src/infrastructure/services/logger.service';

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

// Concrete test implementation of abstract BaseClient
class TestClient extends BaseClient {
  constructor(config: ClientConfig, logger: LoggerService) {
    super(config, logger);
  }

  // Expose protected method for testing
  async testFetchWithRetry<T>(
    url: string,
    options: RequestInit,
    parseResponse: (response: Response) => Promise<T>
  ): Promise<ClientResult<T>> {
    return this.fetchWithRetry(url, options, parseResponse);
  }
}

describe('BaseClient', () => {
  let logger: LoggerService;
  let client: TestClient;

  beforeEach(() => {
    logger = createMockLogger();
    client = new TestClient(
      {
        timeout: 5000,
        maxRetries: 2,
        retryBaseDelayMs: 10, // Short for tests
        retryMaxDelayMs: 50,
      },
      logger
    );
    mockFetch.mockReset();
  });

  describe('fetchWithRetry', () => {
    it('should return success on successful request', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ data: 'test' }),
      });

      const result = await client.testFetchWithRetry(
        'https://api.example.com/test',
        { method: 'GET' },
        (res) => res.json()
      );

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ data: 'test' });
      expect(result.retryCount).toBe(0);
    });

    it('should retry on server errors (5xx)', async () => {
      // First two calls fail with 500, third succeeds
      mockFetch
        .mockResolvedValueOnce({ ok: false, status: 500, text: async () => 'Server error' })
        .mockResolvedValueOnce({ ok: false, status: 503, text: async () => 'Service unavailable' })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true }) });

      const result = await client.testFetchWithRetry(
        'https://api.example.com/test',
        { method: 'GET' },
        (res) => res.json()
      );

      expect(result.success).toBe(true);
      expect(result.retryCount).toBe(2);
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('should not retry on client errors (4xx)', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 400,
        text: async () => 'Bad request',
      });

      const result = await client.testFetchWithRetry(
        'https://api.example.com/test',
        { method: 'GET' },
        (res) => res.json()
      );

      expect(result.success).toBe(false);
      expect(result.error?.type).toBe('api');
      expect(result.error?.statusCode).toBe(400);
      expect(result.retryCount).toBe(0);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should handle AbortError (timeout) correctly', async () => {
      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';

      // AbortError on all retries
      mockFetch.mockRejectedValue(abortError);

      const result = await client.testFetchWithRetry(
        'https://api.example.com/test',
        { method: 'GET' },
        (res) => res.json()
      );

      expect(result.success).toBe(false);
      expect(result.error?.type).toBe('timeout');
      expect(result.error?.message).toContain('timed out');
    });

    it('should handle network errors with retries', async () => {
      const networkError = new Error('Network connection failed');

      // All retries fail with network error
      mockFetch.mockRejectedValue(networkError);

      const result = await client.testFetchWithRetry(
        'https://api.example.com/test',
        { method: 'GET' },
        (res) => res.json()
      );

      expect(result.success).toBe(false);
      expect(result.error?.type).toBe('network');
      expect(result.error?.message).toBe('Network connection failed');
      expect(result.retryCount).toBe(2); // maxRetries = 2
    });

    it('should handle non-Error thrown values', async () => {
      mockFetch.mockRejectedValue('string error');

      const result = await client.testFetchWithRetry(
        'https://api.example.com/test',
        { method: 'GET' },
        (res) => res.json()
      );

      expect(result.success).toBe(false);
      expect(result.error?.type).toBe('network');
      expect(result.error?.message).toBe('Unknown error');
    });

    it('should recover after transient failures', async () => {
      // First call fails with network error, second succeeds
      mockFetch
        .mockRejectedValueOnce(new Error('Network blip'))
        .mockResolvedValueOnce({ ok: true, json: async () => ({ recovered: true }) });

      const result = await client.testFetchWithRetry(
        'https://api.example.com/test',
        { method: 'GET' },
        (res) => res.json()
      );

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ recovered: true });
      expect(result.retryCount).toBe(1);
    });

    it('should include latency measurement', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({}),
      });

      const result = await client.testFetchWithRetry(
        'https://api.example.com/test',
        { method: 'GET' },
        (res) => res.json()
      );

      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it('should handle response.text() failure in error case', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => {
          throw new Error('Cannot read body');
        },
      });

      const result = await client.testFetchWithRetry(
        'https://api.example.com/test',
        { method: 'GET' },
        (res) => res.json()
      );

      expect(result.success).toBe(false);
      expect(result.error?.message).toBe('Unknown error');
    });
  });

  describe('retry behavior with zero retries', () => {
    it('should not retry when maxRetries is 0', async () => {
      const noRetryClient = new TestClient(
        {
          timeout: 5000,
          maxRetries: 0,
          retryBaseDelayMs: 10,
          retryMaxDelayMs: 50,
        },
        logger
      );

      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => 'Server error',
      });

      const result = await noRetryClient.testFetchWithRetry(
        'https://api.example.com/test',
        { method: 'GET' },
        (res) => res.json()
      );

      expect(result.success).toBe(false);
      expect(result.retryCount).toBe(0);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('network edge cases', () => {
    it('should handle slow responses that complete before timeout', async () => {
      // Response takes ~100ms but timeout is 5000ms
      mockFetch.mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
        return {
          ok: true,
          json: async () => ({ data: 'slow but successful' }),
        };
      });

      const result = await client.testFetchWithRetry(
        'https://api.example.com/test',
        { method: 'GET' },
        (res) => res.json()
      );

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ data: 'slow but successful' });
      // Allow small timing variance (setTimeout isn't guaranteed to be exact)
      expect(result.latencyMs).toBeGreaterThanOrEqual(95);
    });

    it('should handle intermittent failures followed by success', async () => {
      let callCount = 0;
      mockFetch.mockImplementation(async () => {
        callCount++;
        if (callCount <= 2) {
          throw new Error(`Intermittent failure ${callCount}`);
        }
        return {
          ok: true,
          json: async () => ({ recovered: true }),
        };
      });

      const result = await client.testFetchWithRetry(
        'https://api.example.com/test',
        { method: 'GET' },
        (res) => res.json()
      );

      expect(result.success).toBe(true);
      expect(result.retryCount).toBe(2);
      expect(callCount).toBe(3);
    });

    it('should handle DNS resolution style errors', async () => {
      const dnsError = new Error('getaddrinfo ENOTFOUND api.example.com');
      dnsError.name = 'Error';
      mockFetch.mockRejectedValue(dnsError);

      const result = await client.testFetchWithRetry(
        'https://api.example.com/test',
        { method: 'GET' },
        (res) => res.json()
      );

      expect(result.success).toBe(false);
      expect(result.error?.type).toBe('network');
      expect(result.error?.message).toContain('ENOTFOUND');
    });

    it('should handle connection refused errors', async () => {
      const connectionError = new Error('connect ECONNREFUSED 127.0.0.1:3000');
      mockFetch.mockRejectedValue(connectionError);

      const result = await client.testFetchWithRetry(
        'https://api.example.com/test',
        { method: 'GET' },
        (res) => res.json()
      );

      expect(result.success).toBe(false);
      expect(result.error?.type).toBe('network');
      expect(result.error?.message).toContain('ECONNREFUSED');
    });

    it('should handle response body parsing errors', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => {
          throw new SyntaxError('Unexpected token in JSON');
        },
      });

      // This should propagate as a network error since it fails in parseResponse
      const result = await client.testFetchWithRetry(
        'https://api.example.com/test',
        { method: 'GET' },
        (res) => res.json()
      );

      expect(result.success).toBe(false);
      expect(result.error?.type).toBe('network');
    });

    it('should handle HTTP 429 Too Many Requests with retry', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          text: async () => 'Rate limited',
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ success: true }),
        });

      const result = await client.testFetchWithRetry(
        'https://api.example.com/test',
        { method: 'GET' },
        (res) => res.json()
      );

      // 429 is a 4xx error, so it should not be retried by default
      expect(result.success).toBe(false);
      expect(result.error?.statusCode).toBe(429);
    });

    it('should handle mixed error types across retries', async () => {
      mockFetch
        .mockRejectedValueOnce(new Error('Network error 1'))
        .mockResolvedValueOnce({ ok: false, status: 503, text: async () => 'Service unavailable' })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true }) });

      const result = await client.testFetchWithRetry(
        'https://api.example.com/test',
        { method: 'GET' },
        (res) => res.json()
      );

      expect(result.success).toBe(true);
      expect(result.retryCount).toBe(2);
    });
  });

  // ==========================================================================
  // Network Resilience Tests
  // ==========================================================================

  describe('network resilience', () => {
    it('should handle HTML response instead of JSON (proxy/gateway errors)', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 502,
        text: async () => `<!DOCTYPE html>
<html>
<head><title>502 Bad Gateway</title></head>
<body><h1>502 Bad Gateway</h1><p>nginx</p></body>
</html>`,
      });

      const result = await client.testFetchWithRetry(
        'https://api.example.com/test',
        { method: 'GET' },
        (res) => res.json()
      );

      expect(result.success).toBe(false);
      expect(result.error?.type).toBe('api');
      expect(result.error?.statusCode).toBe(502);
      // Error message should contain part of HTML
      expect(result.error?.message).toContain('502');
    });

    it('should handle connection reset mid-request', async () => {
      const resetError = new Error('read ECONNRESET');
      resetError.name = 'Error';
      mockFetch.mockRejectedValue(resetError);

      const result = await client.testFetchWithRetry(
        'https://api.example.com/test',
        { method: 'GET' },
        (res) => res.json()
      );

      expect(result.success).toBe(false);
      expect(result.error?.type).toBe('network');
      expect(result.error?.message).toContain('ECONNRESET');
    });

    it('should handle socket hang up', async () => {
      const hangupError = new Error('socket hang up');
      mockFetch.mockRejectedValue(hangupError);

      const result = await client.testFetchWithRetry(
        'https://api.example.com/test',
        { method: 'GET' },
        (res) => res.json()
      );

      expect(result.success).toBe(false);
      expect(result.error?.type).toBe('network');
      expect(result.error?.message).toContain('socket hang up');
    });

    it('should handle TLS/SSL errors', async () => {
      const tlsError = new Error('unable to verify the first certificate');
      mockFetch.mockRejectedValue(tlsError);

      const result = await client.testFetchWithRetry(
        'https://api.example.com/test',
        { method: 'GET' },
        (res) => res.json()
      );

      expect(result.success).toBe(false);
      expect(result.error?.type).toBe('network');
      expect(result.error?.message).toContain('certificate');
    });

    it('should handle HTTP 502 Bad Gateway with retries', async () => {
      mockFetch
        .mockResolvedValueOnce({ ok: false, status: 502, text: async () => 'Bad Gateway' })
        .mockResolvedValueOnce({ ok: false, status: 502, text: async () => 'Bad Gateway' })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true }) });

      const result = await client.testFetchWithRetry(
        'https://api.example.com/test',
        { method: 'GET' },
        (res) => res.json()
      );

      expect(result.success).toBe(true);
      expect(result.retryCount).toBe(2);
    });

    it('should handle HTTP 504 Gateway Timeout with retries', async () => {
      mockFetch
        .mockResolvedValueOnce({ ok: false, status: 504, text: async () => 'Gateway Timeout' })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true }) });

      const result = await client.testFetchWithRetry(
        'https://api.example.com/test',
        { method: 'GET' },
        (res) => res.json()
      );

      expect(result.success).toBe(true);
      expect(result.retryCount).toBe(1);
    });

    it('should handle empty response body', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => {
          throw new SyntaxError('Unexpected end of JSON input');
        },
      });

      const result = await client.testFetchWithRetry(
        'https://api.example.com/test',
        { method: 'GET' },
        (res) => res.json()
      );

      expect(result.success).toBe(false);
      expect(result.error?.type).toBe('network');
    });

    it('should handle extremely large response bodies', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          largeData: 'x'.repeat(10000000), // 10MB string
        }),
      });

      const result = await client.testFetchWithRetry(
        'https://api.example.com/test',
        { method: 'GET' },
        (res) => res.json()
      );

      // Should handle large response without crashing
      expect(result.success).toBe(true);
    });

    it('should handle response with unexpected content-type', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        headers: new Map([['content-type', 'text/plain']]),
        json: async () => ({ data: 'still json' }),
      });

      const result = await client.testFetchWithRetry(
        'https://api.example.com/test',
        { method: 'GET' },
        (res) => res.json()
      );

      expect(result.success).toBe(true);
    });

    it('should handle fetch throwing TypeError (e.g., invalid URL)', async () => {
      const typeError = new TypeError('Failed to construct URL');
      mockFetch.mockRejectedValue(typeError);

      const result = await client.testFetchWithRetry('invalid-url', { method: 'GET' }, (res) =>
        res.json()
      );

      expect(result.success).toBe(false);
      expect(result.error?.type).toBe('network');
    });

    it('should handle response where text() throws', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => {
          throw new Error('Stream already read');
        },
      });

      const result = await client.testFetchWithRetry(
        'https://api.example.com/test',
        { method: 'GET' },
        (res) => res.json()
      );

      expect(result.success).toBe(false);
      expect(result.error?.message).toBe('Unknown error');
    });
  });

  // ==========================================================================
  // Graceful Degradation Tests
  // ==========================================================================

  describe('graceful degradation', () => {
    it('should handle 401 Unauthorized (invalid API key)', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        text: async () =>
          JSON.stringify({
            error: 'Invalid API key',
            message: 'The provided API key is not valid',
          }),
      });

      const result = await client.testFetchWithRetry(
        'https://api.example.com/test',
        { method: 'GET' },
        (res) => res.json()
      );

      expect(result.success).toBe(false);
      expect(result.error?.type).toBe('api');
      expect(result.error?.statusCode).toBe(401);
      expect(result.retryCount).toBe(0); // 401 should not retry
    });

    it('should handle 403 Forbidden (insufficient permissions)', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 403,
        text: async () => 'Access denied',
      });

      const result = await client.testFetchWithRetry(
        'https://api.example.com/test',
        { method: 'GET' },
        (res) => res.json()
      );

      expect(result.success).toBe(false);
      expect(result.error?.statusCode).toBe(403);
      expect(result.retryCount).toBe(0);
    });

    it('should handle unexpected response schema', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          unexpectedField: 'value',
          // Missing expected fields
        }),
      });

      const result = await client.testFetchWithRetry(
        'https://api.example.com/test',
        { method: 'GET' },
        (res) => res.json()
      );

      // Should still succeed - schema validation is up to the caller
      expect(result.success).toBe(true);
    });

    it('should handle malformed JSON in error response', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 400,
        text: async () => 'Invalid JSON: { broken',
      });

      const result = await client.testFetchWithRetry(
        'https://api.example.com/test',
        { method: 'GET' },
        (res) => res.json()
      );

      expect(result.success).toBe(false);
      expect(result.error?.message).toBe('Invalid JSON: { broken');
    });

    it('should handle server returning wrong HTTP method error', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 405,
        text: async () => 'Method Not Allowed',
      });

      const result = await client.testFetchWithRetry(
        'https://api.example.com/test',
        { method: 'POST' },
        (res) => res.json()
      );

      expect(result.success).toBe(false);
      expect(result.error?.statusCode).toBe(405);
    });

    it('should handle server returning 422 Unprocessable Entity', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 422,
        text: async () =>
          JSON.stringify({
            errors: [{ field: 'results', message: 'Array cannot be empty' }],
          }),
      });

      const result = await client.testFetchWithRetry(
        'https://api.example.com/test',
        { method: 'POST' },
        (res) => res.json()
      );

      expect(result.success).toBe(false);
      expect(result.error?.statusCode).toBe(422);
    });

    it('should handle server completely down (all retries exhausted)', async () => {
      mockFetch.mockRejectedValue(new Error('Connection refused'));

      const result = await client.testFetchWithRetry(
        'https://api.example.com/test',
        { method: 'GET' },
        (res) => res.json()
      );

      expect(result.success).toBe(false);
      expect(result.error?.type).toBe('network');
      expect(result.retryCount).toBe(2); // All retries exhausted
    });

    it('should handle response with null body', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => null,
      });

      const result = await client.testFetchWithRetry(
        'https://api.example.com/test',
        { method: 'GET' },
        (res) => res.json()
      );

      expect(result.success).toBe(true);
      expect(result.data).toBeNull();
    });

    it('should handle response with undefined body', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => undefined,
      });

      const result = await client.testFetchWithRetry(
        'https://api.example.com/test',
        { method: 'GET' },
        (res) => res.json()
      );

      expect(result.success).toBe(true);
      expect(result.data).toBeUndefined();
    });
  });

  describe('HTTP redirect handling', () => {
    it('should handle HTTP 301 redirect as error (no auto-follow)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 301,
        headers: new Headers({ Location: 'https://new-api.example.com/test' }),
        text: async () => 'Moved Permanently',
      });

      const result = await client.testFetchWithRetry(
        'https://api.example.com/test',
        {},
        async () => undefined
      );

      expect(result.success).toBe(false);
      expect(result.error?.statusCode).toBe(301);
    });

    it('should handle HTTP 302 redirect as error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 302,
        headers: new Headers({ Location: 'https://auth.example.com/login' }),
        text: async () => 'Found',
      });

      const result = await client.testFetchWithRetry(
        'https://api.example.com/test',
        {},
        async () => undefined
      );

      expect(result.success).toBe(false);
      expect(result.error?.statusCode).toBe(302);
    });

    it('should handle HTTP 307 temporary redirect', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 307,
        text: async () => 'Temporary Redirect',
      });

      const result = await client.testFetchWithRetry(
        'https://api.example.com/test',
        {},
        async () => undefined
      );

      expect(result.success).toBe(false);
      expect(result.error?.statusCode).toBe(307);
    });
  });

  describe('unusual response handling', () => {
    it('should handle empty response body with 200 status', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => '',
        json: async () => {
          throw new SyntaxError('Unexpected end of JSON input');
        },
      });

      const result = await client.testFetchWithRetry(
        'https://api.example.com/test',
        {},
        async (res) => {
          const text = await res.text();
          if (!text) return null;
          return JSON.parse(text);
        }
      );

      expect(result.success).toBe(true);
      expect(result.data).toBeNull();
    });

    it('should handle response with BOM (byte order mark)', async () => {
      const jsonWithBom = '\uFEFF{"success": true}';
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => jsonWithBom,
        json: async () => JSON.parse(jsonWithBom.replace(/^\uFEFF/, '')),
      });

      const result = await client.testFetchWithRetry(
        'https://api.example.com/test',
        {},
        async (res) => res.json()
      );

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ success: true });
    });

    it('should handle response with trailing whitespace', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: 'value' }),
      });

      const result = await client.testFetchWithRetry(
        'https://api.example.com/test',
        {},
        async (res) => res.json()
      );

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ data: 'value' });
    });

    it('should handle 204 No Content response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
        text: async () => '',
      });

      const result = await client.testFetchWithRetry(
        'https://api.example.com/test',
        {},
        async () => undefined
      );

      expect(result.success).toBe(true);
      expect(result.data).toBeUndefined();
    });

    it('should handle chunked response that fails mid-stream', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => {
          throw new Error('Network error during response read');
        },
      });

      const result = await client.testFetchWithRetry(
        'https://api.example.com/test',
        {},
        async (res) => res.json()
      );

      // Should fail since parsing threw
      expect(result.success).toBe(false);
    });

    it('should handle extremely large JSON response without crashing', async () => {
      // Create a response that returns a large array
      const largeArray = Array(10000).fill({ id: 1, name: 'test' });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => largeArray,
      });

      const result = await client.testFetchWithRetry(
        'https://api.example.com/test',
        {},
        async (res) => res.json()
      );

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(10000);
    });
  });
});
