import { randomUUID } from 'crypto';
import { gzipSync } from 'zlib';
import type { ReportPayload, ResolvedConfig, SendResult, SpekraError } from './types';

// SDK version - injected at build time from package.json
declare const __SDK_VERSION__: string;
const SDK_VERSION = __SDK_VERSION__;
const USER_AGENT = `@spekra/playwright/${SDK_VERSION}`;

const COMPRESSION_THRESHOLD = 1024;

interface RequestResult {
  success: boolean;
  statusCode?: number;
  retriable: boolean;
  errorType?: SpekraError['type'];
}

function maskApiKey(key: string): string {
  if (!key || key.length < 8) return '***';
  return `${key.slice(0, 3)}...${key.slice(-4)}`;
}

function maskSensitiveData(text: string, apiKey: string): string {
  if (!apiKey || apiKey.length < 8) return text;
  // Escape special regex characters in the API key
  const escaped = apiKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return text.replace(new RegExp(escaped, 'g'), maskApiKey(apiKey));
}

export class SpekraApiClient {
  private config: ResolvedConfig;

  constructor(config: ResolvedConfig) {
    this.config = config;
  }

  async sendReport(payload: ReportPayload): Promise<SendResult> {
    const requestId = randomUUID();
    const maxAttempts = this.config.maxRetries + 1;
    const startTime = Date.now();
    let retryCount = 0;
    let bytesSent = 0;
    let bytesUncompressed = 0;
    let lastError: SpekraError | undefined;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const isLastAttempt = attempt === maxAttempts;
      const result = await this.sendSingleRequest(payload, requestId);

      if (attempt === 1) {
        bytesSent = result.bytesSent ?? 0;
        bytesUncompressed = result.bytesUncompressed ?? 0;
      }

      if (result.success) {
        this.logDebug(`Request ${requestId} succeeded with ${payload.results.length} results`);
        return {
          success: true,
          latencyMs: Date.now() - startTime,
          bytesSent,
          bytesUncompressed,
          retryCount,
          requestId,
        };
      }

      lastError = {
        type: result.errorType || 'network',
        message: result.errorMessage || 'Unknown error',
        statusCode: result.statusCode,
        requestId,
        resultsAffected: payload.results.length,
      };

      if (!result.retriable) {
        this.logWarning(`Request ${requestId} failed with non-retriable error`);
        return {
          success: false,
          latencyMs: Date.now() - startTime,
          bytesSent,
          bytesUncompressed,
          retryCount,
          requestId,
          error: lastError,
        };
      }

      if (!isLastAttempt) {
        retryCount++;
        const delay = this.calculateBackoffDelay(attempt);
        this.logDebug(
          `Request ${requestId}: attempt ${attempt}/${maxAttempts} failed, retrying in ${delay}ms...`
        );
        await this.sleep(delay);
      }
    }

    this.logWarning(`Request ${requestId}: all ${maxAttempts} attempts failed`);
    return {
      success: false,
      latencyMs: Date.now() - startTime,
      bytesSent,
      bytesUncompressed,
      retryCount,
      requestId,
      error: lastError,
    };
  }

  private async sendSingleRequest(
    payload: ReportPayload,
    requestId: string
  ): Promise<
    RequestResult & { bytesSent?: number; bytesUncompressed?: number; errorMessage?: string }
  > {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

      const jsonBody = JSON.stringify(payload);
      const bytesUncompressed = Buffer.byteLength(jsonBody, 'utf8');
      const shouldCompress = bytesUncompressed > COMPRESSION_THRESHOLD;

      let body: string | Buffer = jsonBody;
      let bytesSent = bytesUncompressed;

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.apiKey}`,
        'User-Agent': USER_AGENT,
        'X-Spekra-SDK-Version': SDK_VERSION,
        'X-Request-Id': requestId,
        Connection: 'keep-alive',
      };

      if (shouldCompress) {
        body = gzipSync(jsonBody);
        bytesSent = body.length;
        headers['Content-Encoding'] = 'gzip';
        this.logDebug(`Compressed payload: ${bytesUncompressed} -> ${bytesSent} bytes`);
      }

      const response = await fetch(this.config.apiUrl, {
        method: 'POST',
        headers,
        body,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        const safeErrorText = maskSensitiveData(errorText, this.config.apiKey);
        this.logWarning(
          `API returned ${response.status}: ${safeErrorText} (request: ${requestId})`
        );

        const retriable = response.status >= 500;
        return {
          success: false,
          statusCode: response.status,
          retriable,
          errorType: 'api',
          errorMessage: safeErrorText,
          bytesSent,
          bytesUncompressed,
        };
      }

      return { success: true, retriable: false, bytesSent, bytesUncompressed };
    } catch (error) {
      let errorType: SpekraError['type'] = 'network';
      let errorMessage = 'Unknown error';

      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          errorType = 'timeout';
          errorMessage = `Request timed out after ${this.config.timeout}ms`;
          this.logWarning(`${errorMessage} (request: ${requestId})`);
        } else {
          errorMessage = maskSensitiveData(error.message, this.config.apiKey);
          this.logWarning(`Failed to send report: ${errorMessage} (request: ${requestId})`);
        }
      } else {
        this.logWarning(`Failed to send report: Unknown error (request: ${requestId})`);
      }

      return { success: false, retriable: true, errorType, errorMessage };
    }
  }

  private calculateBackoffDelay(attempt: number): number {
    const exponentialDelay = this.config.retryBaseDelayMs * Math.pow(2, attempt - 1);
    const cappedDelay = Math.min(exponentialDelay, this.config.retryMaxDelayMs);
    const jitter = cappedDelay * 0.25 * (Math.random() * 2 - 1);
    return Math.max(0, Math.round(cappedDelay + jitter));
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private logWarning(message: string): void {
    console.warn(`[Spekra] ${message}`);
  }

  private logDebug(message: string): void {
    if (this.config.debug) {
      console.log(`[Spekra] ${message}`);
    }
  }
}
