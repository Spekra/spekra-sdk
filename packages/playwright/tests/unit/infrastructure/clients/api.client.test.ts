import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApiClient } from '../../../../src/infrastructure/clients/api.client';
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
        json: async () => ({ confirmed: 3 }),
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
        json: async () => ({ error: 'Server error' }),
      });

      const result = await client.confirmUploads(['artifact-1']);

      expect(result.success).toBe(false);
    });

    it('should include proper headers', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ confirmed: 1 }),
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
    it('should send report with compression for large payloads', async () => {
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

      const largePayload = {
        runId: 'run-123',
        source: 'test-suite',
        branch: 'main',
        commitSha: 'abc123',
        ciUrl: null,
        shardIndex: null,
        totalShards: null,
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        results: [
          {
            id: 'result-1',
            testFile: 'test.spec.ts',
            fullTitle: 'A'.repeat(2000), // Large enough to trigger compression
            suitePath: [] as string[],
            testName: 'test',
            tags: [] as string[],
            project: 'chromium',
            status: 'passed' as const,
            durationMs: 100,
            retry: 0,
            errorMessage: null,
            artifacts: [] as [],
            steps: [] as [],
            stdout: [] as string[],
            stderr: [] as string[],
          },
        ],
      };

      const result = await client.sendReport(largePayload);

      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalled();
    });

    it('should handle API errors gracefully', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ error: 'Bad request' }),
      });

      const result = await client.sendReport({
        runId: 'run-123',
        source: 'test-suite',
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
  });
});
