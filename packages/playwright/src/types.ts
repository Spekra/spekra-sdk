/**
 * Playwright reporter types
 *
 * Re-exports core types and adds Playwright-specific extensions
 */

// ============================================================================
// Playwright-specific Types
// ============================================================================

import type {
  BaseReporterOptions,
  RedactionPattern,
  RedactionOptions,
  ResolvedRedactionConfig,
  SpekraError,
  SpekraMetrics,
} from '@spekra/core';

/**
 * Playwright reporter configuration options
 *
 * Extends BaseReporterOptions with Playwright-specific settings for
 * batching, retries, redaction, and error handling.
 */
export interface SpekraReporterOptions extends BaseReporterOptions {
  /**
   * PII/secrets redaction configuration.
   * Redaction happens CLIENT-SIDE before any data is sent to Spekra.
   *
   * Can be:
   * - `true` (default): Enable with built-in patterns
   * - `false`: Disable redaction entirely (not recommended)
   * - `RedactionPattern[]`: Custom patterns to add to built-in patterns
   * - `RedactionOptions`: Full configuration object
   *
   * Built-in patterns include: emails, JWT tokens, API keys, credit cards,
   * SSNs, phone numbers, AWS keys, GitHub tokens, and URL credentials.
   *
   * @example
   * // Add custom patterns
   * redact: ['password', 'secret', /my-api-key-\d+/]
   *
   * @example
   * // Full configuration
   * redact: {
   *   enabled: true,
   *   patterns: ['internal-token', /company-secret-\w+/],
   *   replaceBuiltIn: false
   * }
   *
   * @default true
   */
  redact?: boolean | RedactionPattern[] | RedactionOptions;

  /**
   * Number of results to batch before sending
   * @default 20
   */
  batchSize?: number;

  /**
   * API request timeout in milliseconds
   * @default 15000
   */
  timeout?: number;

  /**
   * Maximum number of retry attempts on failure
   * Set to 0 to disable retries
   * @default 3
   */
  maxRetries?: number;

  /**
   * Base delay in milliseconds for exponential backoff
   * @default 1000
   */
  retryBaseDelayMs?: number;

  /**
   * Maximum delay (ceiling) in milliseconds for exponential backoff
   * @default 10000
   */
  retryMaxDelayMs?: number;

  /**
   * Maximum length of error messages in characters
   * Longer messages will be truncated
   * @default 4000
   */
  maxErrorLength?: number;

  /**
   * Maximum number of stack trace lines to include
   * @default 20
   */
  maxStackTraceLines?: number;

  /**
   * Maximum number of test results to buffer in memory
   * @default 1000
   */
  maxBufferSize?: number;

  /**
   * Internal development mode for SDK debugging.
   * Logs raw Playwright data structures to help debug title parsing.
   * Not intended for end-user debugging - use `debug` for that.
   * @internal
   */
  _devMode?: boolean;
}

/**
 * Resolved Playwright reporter configuration
 */
export interface ResolvedConfig {
  apiKey: string;
  source: string;
  apiUrl: string;
  enabled: boolean;
  debug: boolean;
  redaction: ResolvedRedactionConfig;
  batchSize: number;
  timeout: number;
  maxRetries: number;
  retryBaseDelayMs: number;
  retryMaxDelayMs: number;
  maxErrorLength: number;
  maxStackTraceLines: number;
  maxBufferSize: number;
  onError: ((error: SpekraError) => void) | null;
  onMetrics: ((metrics: SpekraMetrics) => void) | null;
  _devMode: boolean;
}
