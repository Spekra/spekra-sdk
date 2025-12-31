import { gzipSync } from 'zlib';
import { BaseClient, type ClientConfig, type ClientResult } from './base.client';
import { LoggerService } from '../services/logger.service';
import type { ReportPayload, ReportResponse, Framework } from '../../types';

/**
 * Compression threshold in bytes
 * Only compress payloads larger than this
 */
const COMPRESSION_THRESHOLD = 1024;

/**
 * API client configuration
 */
export interface ApiClientConfig extends ClientConfig {
  apiKey: string;
  apiUrl: string;
  /** The framework name for the User-Agent header */
  framework: Framework;
  /** SDK version for headers */
  sdkVersion: string;
  /** Whether to enable compression */
  compression?: boolean;
}

/**
 * Result of sending a report
 */
export interface SendReportResult extends ClientResult<ReportResponse> {
  requestId: string;
  bytesSent: number;
  bytesUncompressed: number;
}

/**
 * Confirm uploads payload
 */
export interface ConfirmUploadsPayload {
  artifactIds: string[];
}

/**
 * Confirm uploads response
 */
export interface ConfirmUploadsResponse {
  success: boolean;
  confirmed: number;
}

/**
 * Result of confirming uploads
 */
export interface ConfirmUploadsResult extends ClientResult<ConfirmUploadsResponse> {
  requestId: string;
}

/**
 * HTTP client for the Spekra API.
 * Handles POST /reports with metadata and artifact manifest.
 */
export class ApiClient extends BaseClient {
  private readonly apiKey: string;
  private readonly apiUrl: string;
  private readonly framework: Framework;
  private readonly sdkVersion: string;
  private readonly compression: boolean;

  constructor(config: ApiClientConfig, logger: LoggerService) {
    super(config, logger);
    this.apiKey = config.apiKey;
    this.apiUrl = config.apiUrl;
    this.framework = config.framework;
    this.sdkVersion = config.sdkVersion;
    this.compression = config.compression ?? true;
  }

  private get userAgent(): string {
    return `@spekra/${this.framework}/${this.sdkVersion}`;
  }

  /**
   * Send a report to the Spekra API
   */
  async sendReport(payload: ReportPayload): Promise<SendReportResult> {
    const requestId = crypto.randomUUID();

    const jsonBody = JSON.stringify(payload);
    const bytesUncompressed = Buffer.byteLength(jsonBody, 'utf8');
    const shouldCompress = this.compression && bytesUncompressed > COMPRESSION_THRESHOLD;

    let body: string | Buffer = jsonBody;
    let bytesSent = bytesUncompressed;

    const headers = this.buildCommonHeaders(requestId);

    if (shouldCompress) {
      body = gzipSync(jsonBody);
      bytesSent = body.length;
      headers['Content-Encoding'] = 'gzip';
      this.logger.verbose('Compressed payload', {
        original: bytesUncompressed,
        compressed: bytesSent,
      });
    }

    const result = await this.fetchWithRetry<ReportResponse>(
      this.apiUrl,
      {
        method: 'POST',
        headers,
        body,
      },
      async (response) => response.json() as Promise<ReportResponse>
    );

    return {
      ...result,
      requestId,
      bytesSent,
      bytesUncompressed,
    };
  }

  /**
   * Confirm successful artifact uploads
   */
  async confirmUploads(artifactIds: string[]): Promise<ConfirmUploadsResult> {
    const requestId = crypto.randomUUID();

    const payload: ConfirmUploadsPayload = { artifactIds };
    const body = JSON.stringify(payload);

    // Build URL for confirm-uploads endpoint
    const confirmUrl = this.apiUrl.replace(/\/reports\/?$/, '/reports/confirm-uploads');

    const result = await this.fetchWithRetry<ConfirmUploadsResponse>(
      confirmUrl,
      {
        method: 'POST',
        headers: this.buildCommonHeaders(requestId),
        body,
      },
      async (response) => response.json() as Promise<ConfirmUploadsResponse>
    );

    return {
      ...result,
      requestId,
    };
  }

  private buildCommonHeaders(requestId: string): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.apiKey}`,
      'User-Agent': this.userAgent,
      'X-Spekra-SDK-Version': this.sdkVersion,
      'X-Request-Id': requestId,
    };
  }
}

