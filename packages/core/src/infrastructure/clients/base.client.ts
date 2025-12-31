import { LoggerService } from '../services/logger.service';

export interface ClientConfig {
  timeout: number;
  maxRetries: number;
  retryBaseDelayMs: number;
  retryMaxDelayMs: number;
}

export interface ClientResult<T> {
  success: boolean;
  data?: T;
  error?: ClientError;
  latencyMs: number;
  retryCount: number;
}

export interface ClientError {
  type: 'network' | 'timeout' | 'api' | 'validation';
  message: string;
  statusCode?: number;
}

/**
 * Abstract base class for all HTTP clients.
 * Provides shared retry logic, timeout handling, and error wrapping.
 */
export abstract class BaseClient {
  protected readonly config: ClientConfig;
  protected readonly logger: LoggerService;

  constructor(config: ClientConfig, logger: LoggerService) {
    this.config = config;
    this.logger = logger;
  }

  /**
   * Execute a fetch request with retry logic and timeout handling
   */
  protected async fetchWithRetry<T>(
    url: string,
    options: RequestInit,
    parseResponse: (response: Response) => Promise<T>
  ): Promise<ClientResult<T>> {
    const maxAttempts = this.config.maxRetries + 1;
    const startTime = Date.now();
    let retryCount = 0;
    let lastError: ClientError | undefined;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const isLastAttempt = attempt === maxAttempts;

      try {
        const result = await this.executeSingleRequest(url, options, parseResponse);

        if (result.success) {
          return {
            success: true,
            data: result.data,
            latencyMs: Date.now() - startTime,
            retryCount,
          };
        }

        lastError = result.error;

        // Don't retry non-retriable errors
        if (!this.isRetriable(result.error)) {
          return {
            success: false,
            error: result.error,
            latencyMs: Date.now() - startTime,
            retryCount,
          };
        }
      } catch (error) {
        lastError = this.wrapError(error);

        if (!this.isRetriable(lastError)) {
          return {
            success: false,
            error: lastError,
            latencyMs: Date.now() - startTime,
            retryCount,
          };
        }
      }

      if (!isLastAttempt) {
        retryCount++;
        const delay = this.calculateBackoffDelay(attempt);
        this.logger.verbose(`Request failed, retrying in ${delay}ms`, {
          attempt,
          maxAttempts,
          error: lastError?.message,
        });
        await this.sleep(delay);
      }
    }

    return {
      success: false,
      error: lastError ?? { type: 'network', message: 'All retry attempts failed' },
      latencyMs: Date.now() - startTime,
      retryCount,
    };
  }

  private async executeSingleRequest<T>(
    url: string,
    options: RequestInit,
    parseResponse: (response: Response) => Promise<T>
  ): Promise<{ success: true; data: T } | { success: false; error: ClientError }> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        return {
          success: false,
          error: {
            type: 'api',
            message: errorText,
            statusCode: response.status,
          },
        };
      }

      const data = await parseResponse(response);
      return { success: true, data };
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  private wrapError(error: unknown): ClientError {
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        return {
          type: 'timeout',
          message: `Request timed out after ${this.config.timeout}ms`,
        };
      }
      return {
        type: 'network',
        message: error.message,
      };
    }
    return {
      type: 'network',
      message: 'Unknown error',
    };
  }

  private isRetriable(error?: ClientError): boolean {
    if (!error) return false;

    // Network and timeout errors are retriable
    if (error.type === 'network' || error.type === 'timeout') {
      return true;
    }

    // Server errors (5xx) are retriable
    if (error.type === 'api' && error.statusCode && error.statusCode >= 500) {
      return true;
    }

    return false;
  }

  private calculateBackoffDelay(attempt: number): number {
    const exponentialDelay = this.config.retryBaseDelayMs * Math.pow(2, attempt - 1);
    const cappedDelay = Math.min(exponentialDelay, this.config.retryMaxDelayMs);
    // Add jitter (±25%)
    const jitter = cappedDelay * 0.25 * (Math.random() * 2 - 1);
    return Math.max(0, Math.round(cappedDelay + jitter));
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

