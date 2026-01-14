import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SendReportUseCase } from '../../../src/use-cases/send-report.use-case';
import type { LoggerService } from '../../../src/infrastructure/services/logger.service';
import type { ApiClient } from '../../../src/infrastructure/clients/api.client';
import type { TestResult, Framework } from '../../../src/types';

// Mock logger
function createMockLogger(): LoggerService {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    verbose: vi.fn(),
  } as unknown as LoggerService;
}

// Helper to create test results
function createTestResult(overrides: Partial<TestResult> = {}): TestResult {
  return {
    testFile: 'test.spec.ts',
    fullTitle: 'My Test',
    suitePath: [],
    testName: 'My Test',
    tags: [],
    project: 'chromium',
    status: 'passed',
    durationMs: 100,
    retry: 0,
    errorMessage: null,
    ...overrides,
  };
}

describe('SendReportUseCase', () => {
  let logger: LoggerService;
  let apiClient: ApiClient;
  let useCase: SendReportUseCase;

  beforeEach(() => {
    logger = createMockLogger();
    apiClient = {
      sendReport: vi.fn(),
    } as unknown as ApiClient;
    useCase = new SendReportUseCase(logger, apiClient);
  });

  describe('execute', () => {
    const createBaseMetadata = (framework: Framework = 'playwright') => ({
      runId: 'run-123',
      source: 'test-suite',
      framework,
      branch: 'main',
      commitSha: 'abc123',
      ciUrl: null,
      shardIndex: null,
      totalShards: null,
      startedAt: new Date().toISOString(),
      finishedAt: null,
    });

    it('should return early success when no results to send', async () => {
      const result = await useCase.execute({
        metadata: createBaseMetadata(),
        results: [],
      });

      expect(result.success).toBe(true);
      if (!result.success) throw new Error('Expected success');
      expect(result.data.response.summary.testsReceived).toBe(0);
      expect(result.data.metrics.latencyMs).toBe(0);
      expect(apiClient.sendReport).not.toHaveBeenCalled();
      expect(logger.verbose).toHaveBeenCalledWith('No results to send');
    });

    it('should send report with results', async () => {
      const testResult = createTestResult();

      vi.mocked(apiClient.sendReport).mockResolvedValue({
        success: true,
        data: {
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
        },
        latencyMs: 50,
        retryCount: 0,
        requestId: 'req-123',
        bytesSent: 500,
        bytesUncompressed: 1000,
      });

      const result = await useCase.execute({
        metadata: createBaseMetadata(),
        results: [testResult],
      });

      expect(result.success).toBe(true);
      if (!result.success) throw new Error('Expected success');
      expect(result.data.response.summary.testsReceived).toBe(1);
      expect(apiClient.sendReport).toHaveBeenCalled();
    });

    it('should handle API failure', async () => {
      const testResult = createTestResult();

      vi.mocked(apiClient.sendReport).mockResolvedValue({
        success: false,
        error: { type: 'api' as const, message: 'Server error', statusCode: 500 },
        latencyMs: 50,
        retryCount: 0,
        requestId: 'req-123',
        bytesSent: 500,
        bytesUncompressed: 1000,
      });

      const result = await useCase.execute({
        metadata: createBaseMetadata(),
        results: [testResult],
      });

      expect(result.success).toBe(false);
      if (result.success) throw new Error('Expected failure');
      expect(result.error).toBeDefined();
    });

    it('should handle API failure with no error message', async () => {
      const testResult = createTestResult();

      vi.mocked(apiClient.sendReport).mockResolvedValue({
        success: false,
        error: undefined, // No error object
        latencyMs: 50,
        retryCount: 0,
        requestId: 'req-123',
        bytesSent: 500,
        bytesUncompressed: 1000,
      });

      const result = await useCase.execute({
        metadata: createBaseMetadata(),
        results: [testResult],
      });

      expect(result.success).toBe(false);
      if (result.success) throw new Error('Expected failure');
      expect(result.error).toBe('Failed to send report');
    });

    it('should include framework in payload', async () => {
      const testResult = createTestResult();

      vi.mocked(apiClient.sendReport).mockResolvedValue({
        success: true,
        data: {
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
        },
        latencyMs: 50,
        retryCount: 0,
        requestId: 'req-123',
        bytesSent: 500,
        bytesUncompressed: 1000,
      });

      await useCase.execute({
        metadata: createBaseMetadata('jest'),
        results: [testResult],
      });

      const payload = vi.mocked(apiClient.sendReport).mock.calls[0][0];
      expect(payload.framework).toBe('jest');
    });

    it('should return upload URLs from response', async () => {
      const testResult = createTestResult();

      vi.mocked(apiClient.sendReport).mockResolvedValue({
        success: true,
        data: {
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
            'artifact-1': 'https://storage.example.com/artifact-1',
          },
        },
        latencyMs: 50,
        retryCount: 0,
        requestId: 'req-123',
        bytesSent: 500,
        bytesUncompressed: 1000,
      });

      const result = await useCase.execute({
        metadata: createBaseMetadata(),
        results: [testResult],
      });

      expect(result.success).toBe(true);
      if (!result.success) throw new Error('Expected success');
      expect(result.data.uploadUrls).toEqual({
        'artifact-1': 'https://storage.example.com/artifact-1',
      });
    });

    it('should include metrics from API response', async () => {
      const testResult = createTestResult();

      vi.mocked(apiClient.sendReport).mockResolvedValue({
        success: true,
        data: {
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
        },
        latencyMs: 150,
        retryCount: 2,
        requestId: 'req-123',
        bytesSent: 500,
        bytesUncompressed: 1500,
      });

      const result = await useCase.execute({
        metadata: createBaseMetadata(),
        results: [testResult],
      });

      expect(result.success).toBe(true);
      if (!result.success) throw new Error('Expected success');
      expect(result.data.metrics).toEqual({
        latencyMs: 150,
        bytesSent: 500,
        bytesUncompressed: 1500,
        retryCount: 2,
      });
    });

    it('should log info before and after sending', async () => {
      const testResult = createTestResult();

      vi.mocked(apiClient.sendReport).mockResolvedValue({
        success: true,
        data: {
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
        },
        latencyMs: 50,
        retryCount: 0,
        requestId: 'req-123',
        bytesSent: 500,
        bytesUncompressed: 1000,
      });

      await useCase.execute({
        metadata: createBaseMetadata(),
        results: [testResult],
      });

      expect(logger.info).toHaveBeenCalledWith(
        'Sending report',
        expect.objectContaining({ runId: 'run-123', results: 1 })
      );
      expect(logger.info).toHaveBeenCalledWith(
        'Report sent',
        expect.objectContaining({ runId: 'run-123', testsReceived: 1 })
      );
    });

    it('should log error on failure', async () => {
      const testResult = createTestResult();

      vi.mocked(apiClient.sendReport).mockResolvedValue({
        success: false,
        error: { type: 'api' as const, message: 'Server error', statusCode: 500 },
        latencyMs: 50,
        retryCount: 0,
        requestId: 'req-123',
        bytesSent: 500,
        bytesUncompressed: 1000,
      });

      await useCase.execute({
        metadata: createBaseMetadata(),
        results: [testResult],
      });

      expect(logger.error).toHaveBeenCalledWith(
        'Failed to send report',
        expect.any(Error)
      );
    });

    it('should handle multiple test results', async () => {
      const results = [
        createTestResult({ testName: 'Test 1', status: 'passed' }),
        createTestResult({ testName: 'Test 2', status: 'failed' }),
        createTestResult({ testName: 'Test 3', status: 'skipped' }),
      ];

      vi.mocked(apiClient.sendReport).mockResolvedValue({
        success: true,
        data: {
          success: true,
          message: 'OK',
          summary: {
            runId: 'run-123',
            testsReceived: 3,
            passed: 1,
            failed: 1,
            skipped: 1,
          },
          uploadUrls: {},
        },
        latencyMs: 50,
        retryCount: 0,
        requestId: 'req-123',
        bytesSent: 500,
        bytesUncompressed: 1000,
      });

      const result = await useCase.execute({
        metadata: createBaseMetadata(),
        results,
      });

      expect(result.success).toBe(true);
      if (!result.success) throw new Error('Expected success');
      expect(result.data.response.summary.testsReceived).toBe(3);
    });

    it('should pass metadata correctly to API client', async () => {
      const testResult = createTestResult();
      const metadata = {
        runId: 'custom-run-id',
        source: 'my-ci',
        framework: 'playwright' as Framework,
        branch: 'feature/test',
        commitSha: 'deadbeef',
        ciUrl: 'https://ci.example.com/build/123',
        shardIndex: 1,
        totalShards: 4,
        startedAt: '2024-01-01T00:00:00Z',
        finishedAt: '2024-01-01T00:01:00Z',
      };

      vi.mocked(apiClient.sendReport).mockResolvedValue({
        success: true,
        data: {
          success: true,
          message: 'OK',
          summary: {
            runId: 'custom-run-id',
            testsReceived: 1,
            passed: 1,
            failed: 0,
            skipped: 0,
          },
          uploadUrls: {},
        },
        latencyMs: 50,
        retryCount: 0,
        requestId: 'req-123',
        bytesSent: 500,
        bytesUncompressed: 1000,
      });

      await useCase.execute({ metadata, results: [testResult] });

      const payload = vi.mocked(apiClient.sendReport).mock.calls[0][0];
      expect(payload.runId).toBe('custom-run-id');
      expect(payload.source).toBe('my-ci');
      expect(payload.branch).toBe('feature/test');
      expect(payload.commitSha).toBe('deadbeef');
      expect(payload.ciUrl).toBe('https://ci.example.com/build/123');
      expect(payload.shardIndex).toBe(1);
      expect(payload.totalShards).toBe(4);
      expect(payload.startedAt).toBe('2024-01-01T00:00:00Z');
      expect(payload.finishedAt).toBe('2024-01-01T00:01:00Z');
    });

    it('should return error code from API response', async () => {
      const testResult = createTestResult();

      vi.mocked(apiClient.sendReport).mockResolvedValue({
        success: false,
        error: { type: 'timeout' as const, message: 'Request timed out' },
        latencyMs: 5000,
        retryCount: 3,
        requestId: 'req-123',
        bytesSent: 500,
        bytesUncompressed: 1000,
      });

      const result = await useCase.execute({
        metadata: createBaseMetadata(),
        results: [testResult],
      });

      expect(result.success).toBe(false);
      if (result.success) throw new Error('Expected failure');
      expect(result.code).toBe('timeout');
    });
  });
});

