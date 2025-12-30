import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SendReportUseCase } from '../../../src/use-cases/send-report.use-case';
import type { LoggerService } from '../../../src/infrastructure/services/logger.service';
import type { ApiClient } from '../../../src/infrastructure/clients/api.client';
import { TestResult } from '../../../src/domain/entities/test-result.entity';

// Mock logger
function createMockLogger(): LoggerService {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    verbose: vi.fn(),
  } as unknown as LoggerService;
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
    const baseMetadata = {
      runId: 'run-123',
      source: 'test-suite',
      branch: 'main',
      commitSha: 'abc123',
      ciUrl: null,
      shardIndex: null,
      totalShards: null,
      startedAt: new Date().toISOString(),
      finishedAt: null,
    };

    it('should return early success when no results to send', async () => {
      const result = await useCase.execute({
        metadata: baseMetadata,
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
      const testResult = TestResult.create({
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
      });

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
        metadata: baseMetadata,
        results: [testResult],
      });

      expect(result.success).toBe(true);
      if (!result.success) throw new Error('Expected success');
      expect(result.data.response.summary.testsReceived).toBe(1);
      expect(apiClient.sendReport).toHaveBeenCalled();
    });

    it('should handle API failure', async () => {
      const testResult = TestResult.create({
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
      });

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
        metadata: baseMetadata,
        results: [testResult],
      });

      expect(result.success).toBe(false);
      if (result.success) throw new Error('Expected failure');
      expect(result.error).toBeDefined();
    });

    it('should handle API failure with no error message', async () => {
      const testResult = TestResult.create({
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
      });

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
        metadata: baseMetadata,
        results: [testResult],
      });

      expect(result.success).toBe(false);
      if (result.success) throw new Error('Expected failure');
      expect(result.error).toBe('Failed to send report');
    });
  });
});
