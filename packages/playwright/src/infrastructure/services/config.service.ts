import type {
  RedactionOptions,
  RedactionPattern,
  ResolvedConfig,
  ResolvedRedactionConfig,
  SpekraReporterOptions,
} from '../../types';
import { LoggerService } from './logger.service';

/**
 * Default configuration values
 */
export const DEFAULTS = {
  apiUrl: 'https://spekra.dev/api/reports',
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
  uploadConcurrency: 5,
} as const;

/**
 * Resolves and validates reporter configuration from options and environment.
 */
export class ConfigService {
  private static _instance: ConfigService | null = null;

  static instance(): ConfigService {
    if (!this._instance) {
      this._instance = new ConfigService();
    }
    return this._instance;
  }

  /**
   * Resolve configuration from options and environment variables
   */
  resolve(options: SpekraReporterOptions): ResolvedConfig {
    return {
      apiKey: options.apiKey || process.env.SPEKRA_API_KEY || '',
      source: options.source || '',
      apiUrl: options.apiUrl || DEFAULTS.apiUrl,
      enabled: options.enabled ?? DEFAULTS.enabled,
      debug: options.debug ?? DEFAULTS.debug,
      redaction: this.resolveRedaction(options.redact),
      batchSize: options.batchSize ?? DEFAULTS.batchSize,
      timeout: options.timeout ?? DEFAULTS.timeout,
      maxRetries: options.maxRetries ?? DEFAULTS.maxRetries,
      retryBaseDelayMs: options.retryBaseDelayMs ?? DEFAULTS.retryBaseDelayMs,
      retryMaxDelayMs: options.retryMaxDelayMs ?? DEFAULTS.retryMaxDelayMs,
      maxErrorLength: options.maxErrorLength ?? DEFAULTS.maxErrorLength,
      maxStackTraceLines: options.maxStackTraceLines ?? DEFAULTS.maxStackTraceLines,
      maxBufferSize: options.maxBufferSize ?? DEFAULTS.maxBufferSize,
      onError: options.onError || null,
      onMetrics: options.onMetrics || null,
      _devMode: options._devMode ?? false,
    };
  }

  /**
   * Resolve redaction configuration from various input formats.
   *
   * Supported formats:
   * - undefined/true: Enable with built-in patterns
   * - false: Disable redaction
   * - RedactionPattern[]: Custom patterns added to built-in
   * - RedactionOptions: Full configuration object
   */
  private resolveRedaction(
    input: boolean | RedactionPattern[] | RedactionOptions | undefined
  ): ResolvedRedactionConfig {
    // Default: enabled with built-in patterns
    if (input === undefined || input === true) {
      return {
        enabled: true,
        patterns: [],
        replaceBuiltIn: false,
      };
    }

    // Explicitly disabled
    if (input === false) {
      return {
        enabled: false,
        patterns: [],
        replaceBuiltIn: false,
      };
    }

    // Array of patterns: enabled with custom patterns added to built-in
    if (Array.isArray(input)) {
      return {
        enabled: true,
        patterns: input,
        replaceBuiltIn: false,
      };
    }

    // Full configuration object
    return {
      enabled: input.enabled ?? true,
      patterns: input.patterns ?? [],
      replaceBuiltIn: input.replaceBuiltIn ?? false,
    };
  }

  /**
   * Validate and normalize configuration, logging warnings for invalid values
   */
  validate(config: ResolvedConfig, logger?: LoggerService): void {
    // Use Number.isFinite to catch NaN, Infinity, and -Infinity
    if (!Number.isFinite(config.batchSize) || config.batchSize <= 0 || config.batchSize > 1000) {
      logger?.warn('Invalid batchSize, using default', {
        value: config.batchSize,
        default: DEFAULTS.batchSize,
      });
      config.batchSize = DEFAULTS.batchSize;
    }

    if (!Number.isFinite(config.timeout) || config.timeout <= 0) {
      logger?.warn('Invalid timeout, using default', {
        value: config.timeout,
        default: DEFAULTS.timeout,
      });
      config.timeout = DEFAULTS.timeout;
    }

    if (!Number.isFinite(config.maxRetries) || config.maxRetries < 0) {
      logger?.warn('Invalid maxRetries, using default', {
        value: config.maxRetries,
        default: DEFAULTS.maxRetries,
      });
      config.maxRetries = DEFAULTS.maxRetries;
    }
  }

  /**
   * Check if config is enabled with valid API key and source
   */
  isReady(config: ResolvedConfig): { ready: boolean; reason?: string } {
    if (!config.enabled) {
      return { ready: false, reason: 'disabled' };
    }

    if (!config.apiKey) {
      return {
        ready: false,
        reason: 'No API key provided. Set apiKey option or SPEKRA_API_KEY environment variable.',
      };
    }

    if (!config.source) {
      return {
        ready: false,
        reason:
          "No source provided. Set source option in reporter config (e.g., source: 'frontend-e2e').",
      };
    }

    return { ready: true };
  }
}
