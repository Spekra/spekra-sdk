import { BaseUseCase, type UseCaseResult } from './base.use-case';
import { LoggerService } from '../infrastructure/services/logger.service';
import { ApiClient } from '../infrastructure/clients/api.client';
import type { Framework, ReportPayload, ReportResponse, TestResult } from '../types';

/**
 * Run metadata for the report
 */
export interface RunMetadata {
  runId: string;
  source: string;
  framework: Framework;
  branch: string | null;
  commitSha: string | null;
  ciUrl: string | null;
  shardIndex: number | null;
  totalShards: number | null;
  startedAt: string;
  finishedAt: string | null;
}

/**
 * Input for sending a report
 */
export interface SendReportInput {
  metadata: RunMetadata;
  results: TestResult[];
}

/**
 * Output of sending a report
 */
export interface SendReportOutput {
  response: ReportResponse;
  /** Presigned URLs for artifact upload (artifactId -> URL) */
  uploadUrls: Record<string, string>;
  /** Request metrics */
  metrics: {
    latencyMs: number;
    bytesSent: number;
    bytesUncompressed: number;
    retryCount: number;
  };
}

/**
 * Sends test run metadata and results to the Spekra API.
 * Returns presigned URLs for artifact upload.
 */
export class SendReportUseCase extends BaseUseCase<SendReportInput, SendReportOutput> {
  private readonly apiClient: ApiClient;

  constructor(logger: LoggerService, apiClient: ApiClient) {
    super(logger);
    this.apiClient = apiClient;
  }

  /**
   * Send report to Spekra API
   */
  async execute(input: SendReportInput): Promise<UseCaseResult<SendReportOutput>> {
    const { metadata, results } = input;

    if (results.length === 0) {
      this.logger.verbose('No results to send');
      return {
        success: true,
        data: {
          response: {
            success: true,
            message: 'No results to send',
            summary: {
              runId: metadata.runId,
              testsReceived: 0,
              passed: 0,
              failed: 0,
              skipped: 0,
            },
          },
          uploadUrls: {},
          metrics: {
            latencyMs: 0,
            bytesSent: 0,
            bytesUncompressed: 0,
            retryCount: 0,
          },
        },
      };
    }

    // Build payload
    const payload: ReportPayload = {
      runId: metadata.runId,
      source: metadata.source,
      framework: metadata.framework,
      branch: metadata.branch,
      commitSha: metadata.commitSha,
      ciUrl: metadata.ciUrl,
      shardIndex: metadata.shardIndex,
      totalShards: metadata.totalShards,
      startedAt: metadata.startedAt,
      finishedAt: metadata.finishedAt,
      results,
    };

    this.logger.info('Sending report', {
      runId: metadata.runId,
      results: results.length,
      framework: metadata.framework,
    });

    const sendResult = await this.apiClient.sendReport(payload);

    if (!sendResult.success) {
      const errorMessage = sendResult.error?.message ?? 'Failed to send report';
      this.logger.error('Failed to send report', new Error(errorMessage));

      return {
        success: false,
        error: errorMessage,
        code: sendResult.error?.type,
      };
    }

    const response = sendResult.data!;

    this.logger.info('Report sent', {
      runId: metadata.runId,
      testsReceived: response.summary.testsReceived,
      latencyMs: sendResult.latencyMs,
    });

    return {
      success: true,
      data: {
        response,
        uploadUrls: response.uploadUrls ?? {},
        metrics: {
          latencyMs: sendResult.latencyMs,
          bytesSent: sendResult.bytesSent,
          bytesUncompressed: sendResult.bytesUncompressed,
          retryCount: sendResult.retryCount,
        },
      },
    };
  }
}

