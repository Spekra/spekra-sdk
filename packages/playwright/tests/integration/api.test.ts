import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { SpekraApiClient } from '../../src/api';
import type { ReportPayload, ResolvedConfig } from '../../src/types';

const TEST_API_URL = 'https://test.spekra.dev/api/reports';

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function createMockConfig(overrides: Partial<ResolvedConfig> = {}): ResolvedConfig {
  return {
    apiKey: 'test-api-key-12345',
    apiUrl: TEST_API_URL,
    projectName: 'test-project',
    enabled: true,
    debug: false,
    batchSize: 20,
    timeout: 5000,
    maxRetries: 3,
    retryBaseDelayMs: 100, // Fast retries for tests
    retryMaxDelayMs: 500,
    maxErrorLength: 4000,
    maxStackTraceLines: 20,
    maxBufferSize: 1000,
    onError: null,
    onMetrics: null,
    ...overrides,
  };
}

function createMockPayload(resultCount = 1): ReportPayload {
  return {
    runId: 'test-run-123',
    project: 'test-project',
    branch: 'main',
    commitSha: 'abc123',
    ciUrl: 'https://github.com/test/repo/actions/runs/123',
    shardIndex: 1,
    totalShards: 4,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    results: Array.from({ length: resultCount }, (_, i) => ({
      testFile: `test-${i}.spec.ts`,
      testTitle: `Test ${i} > should work`,
      status: 'passed' as const,
      durationMs: 100 + i,
      retry: 0,
      errorMessage: null,
    })),
  };
}

describe('SpekraApiClient Integration', () => {
  describe('successful requests', () => {
    it('should send report successfully', async () => {
      let receivedPayload: ReportPayload | null = null;
      let receivedHeaders: Record<string, string> = {};

      server.use(
        http.post(TEST_API_URL, async ({ request }) => {
          receivedPayload = (await request.json()) as ReportPayload;
          receivedHeaders = Object.fromEntries(request.headers.entries());
          return HttpResponse.json({ success: true });
        })
      );

      const client = new SpekraApiClient(createMockConfig());
      const payload = createMockPayload(5);
      const result = await client.sendReport(payload);

      expect(result.success).toBe(true);
      expect(result.retryCount).toBe(0);
      expect(result.requestId).toBeDefined();
      expect(result.latencyMs).toBeGreaterThan(0);

      // Verify payload was received
      expect(receivedPayload).not.toBeNull();
      expect(receivedPayload!.runId).toBe('test-run-123');
      expect(receivedPayload!.results).toHaveLength(5);

      // Verify headers
      expect(receivedHeaders['content-type']).toBe('application/json');
      expect(receivedHeaders['authorization']).toBe('Bearer test-api-key-12345');
      expect(receivedHeaders['user-agent']).toMatch(/@spekra\/playwright/);
      expect(receivedHeaders['x-spekra-sdk-version']).toBeDefined();
      expect(receivedHeaders['x-request-id']).toBeDefined();
      expect(receivedHeaders['connection']).toBe('keep-alive');
    });

    it('should compress large payloads', async () => {
      let receivedEncoding: string | null = null;

      server.use(
        http.post(TEST_API_URL, async ({ request }) => {
          receivedEncoding = request.headers.get('content-encoding');
          return HttpResponse.json({ success: true });
        })
      );

      const client = new SpekraApiClient(createMockConfig());
      // Create a payload large enough to trigger compression (>1KB)
      const payload = createMockPayload(50);
      const result = await client.sendReport(payload);

      expect(result.success).toBe(true);
      expect(receivedEncoding).toBe('gzip');
      expect(result.bytesSent).toBeLessThan(result.bytesUncompressed);
    });

    it('should not compress small payloads', async () => {
      let receivedEncoding: string | null = null;

      server.use(
        http.post(TEST_API_URL, async ({ request }) => {
          receivedEncoding = request.headers.get('content-encoding');
          return HttpResponse.json({ success: true });
        })
      );

      const client = new SpekraApiClient(createMockConfig());
      // Create a small payload
      const payload = createMockPayload(1);
      const result = await client.sendReport(payload);

      expect(result.success).toBe(true);
      expect(receivedEncoding).toBeNull();
    });
  });

  describe('retry behavior', () => {
    it('should retry on 503 and succeed', async () => {
      let attempts = 0;

      server.use(
        http.post(TEST_API_URL, () => {
          attempts++;
          if (attempts < 3) {
            return HttpResponse.json({ error: 'Service Unavailable' }, { status: 503 });
          }
          return HttpResponse.json({ success: true });
        })
      );

      const client = new SpekraApiClient(createMockConfig());
      const result = await client.sendReport(createMockPayload());

      expect(result.success).toBe(true);
      expect(attempts).toBe(3);
      expect(result.retryCount).toBe(2);
    });

    it('should retry on 500 server errors', async () => {
      let attempts = 0;

      server.use(
        http.post(TEST_API_URL, () => {
          attempts++;
          if (attempts < 2) {
            return HttpResponse.json({ error: 'Internal Server Error' }, { status: 500 });
          }
          return HttpResponse.json({ success: true });
        })
      );

      const client = new SpekraApiClient(createMockConfig());
      const result = await client.sendReport(createMockPayload());

      expect(result.success).toBe(true);
      expect(attempts).toBe(2);
    });

    it('should NOT retry on 4xx client errors', async () => {
      let attempts = 0;

      server.use(
        http.post(TEST_API_URL, () => {
          attempts++;
          return HttpResponse.json({ error: 'Bad Request' }, { status: 400 });
        })
      );

      const client = new SpekraApiClient(createMockConfig());
      const result = await client.sendReport(createMockPayload());

      expect(result.success).toBe(false);
      expect(attempts).toBe(1); // No retries for 4xx
      expect(result.error?.type).toBe('api');
      expect(result.error?.statusCode).toBe(400);
    });

    it('should NOT retry on 401 unauthorized', async () => {
      let attempts = 0;

      server.use(
        http.post(TEST_API_URL, () => {
          attempts++;
          return HttpResponse.json({ error: 'Unauthorized' }, { status: 401 });
        })
      );

      const client = new SpekraApiClient(createMockConfig());
      const result = await client.sendReport(createMockPayload());

      expect(result.success).toBe(false);
      expect(attempts).toBe(1);
      expect(result.error?.statusCode).toBe(401);
    });

    it('should fail after max retries exceeded', async () => {
      server.use(
        http.post(TEST_API_URL, () => {
          return HttpResponse.json({ error: 'Service Unavailable' }, { status: 503 });
        })
      );

      const client = new SpekraApiClient(createMockConfig({ maxRetries: 2 }));
      const result = await client.sendReport(createMockPayload());

      expect(result.success).toBe(false);
      expect(result.retryCount).toBe(2); // 2 retries after initial attempt
      expect(result.error?.type).toBe('api');
    });

    it('should respect maxRetries=0 (no retries)', async () => {
      let attempts = 0;

      server.use(
        http.post(TEST_API_URL, () => {
          attempts++;
          return HttpResponse.json({ error: 'Service Unavailable' }, { status: 503 });
        })
      );

      const client = new SpekraApiClient(createMockConfig({ maxRetries: 0 }));
      const result = await client.sendReport(createMockPayload());

      expect(result.success).toBe(false);
      expect(attempts).toBe(1);
      expect(result.retryCount).toBe(0);
    });
  });

  describe('error handling', () => {
    it('should handle network errors', async () => {
      server.use(
        http.post(TEST_API_URL, () => {
          return HttpResponse.error();
        })
      );

      const client = new SpekraApiClient(createMockConfig({ maxRetries: 0 }));
      const result = await client.sendReport(createMockPayload());

      expect(result.success).toBe(false);
      expect(result.error?.type).toBe('network');
    });

    it('should handle timeout errors', async () => {
      server.use(
        http.post(TEST_API_URL, async () => {
          // Delay longer than timeout
          await new Promise((resolve) => setTimeout(resolve, 200));
          return HttpResponse.json({ success: true });
        })
      );

      const client = new SpekraApiClient(createMockConfig({ timeout: 50, maxRetries: 0 }));
      const result = await client.sendReport(createMockPayload());

      expect(result.success).toBe(false);
      expect(result.error?.type).toBe('timeout');
    });

    it('should include request ID in error', async () => {
      server.use(
        http.post(TEST_API_URL, () => {
          return HttpResponse.json({ error: 'Bad Request' }, { status: 400 });
        })
      );

      const client = new SpekraApiClient(createMockConfig());
      const result = await client.sendReport(createMockPayload());

      expect(result.success).toBe(false);
      expect(result.error?.requestId).toBe(result.requestId);
    });

    it('should include results affected count in error', async () => {
      server.use(
        http.post(TEST_API_URL, () => {
          return HttpResponse.json({ error: 'Bad Request' }, { status: 400 });
        })
      );

      const client = new SpekraApiClient(createMockConfig());
      const payload = createMockPayload(10);
      const result = await client.sendReport(payload);

      expect(result.success).toBe(false);
      expect(result.error?.resultsAffected).toBe(10);
    });
  });

  describe('metrics tracking', () => {
    it('should track bytes sent and uncompressed', async () => {
      server.use(
        http.post(TEST_API_URL, () => {
          return HttpResponse.json({ success: true });
        })
      );

      const client = new SpekraApiClient(createMockConfig());
      const result = await client.sendReport(createMockPayload(50));

      expect(result.bytesSent).toBeGreaterThan(0);
      expect(result.bytesUncompressed).toBeGreaterThan(0);
      // Compressed should be smaller
      expect(result.bytesSent).toBeLessThan(result.bytesUncompressed);
    });

    it('should track latency', async () => {
      server.use(
        http.post(TEST_API_URL, async () => {
          await new Promise((resolve) => setTimeout(resolve, 50));
          return HttpResponse.json({ success: true });
        })
      );

      const client = new SpekraApiClient(createMockConfig());
      const result = await client.sendReport(createMockPayload());

      expect(result.latencyMs).toBeGreaterThanOrEqual(50);
    });
  });
});
