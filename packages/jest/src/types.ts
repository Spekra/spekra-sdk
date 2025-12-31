/**
 * Jest reporter types
 */

import type { BaseReporterOptions, SpekraError, SpekraMetrics } from '@spekra/core';

// Re-export core types
export type {
  Framework,
  TestStatus,
  TestResult,
  ReportPayload,
  SpekraError,
  SpekraMetrics,
  GitInfo,
  CIInfo,
  CIProvider,
  ShardInfo,
  RedactionPattern,
  RedactionOptions,
} from '@spekra/core';

/**
 * Jest reporter configuration options
 *
 * Extends BaseReporterOptions with Jest-specific settings.
 */
export interface SpekraJestOptions extends BaseReporterOptions {
  /**
   * Fail the Jest run if reporting fails
   * Useful for ensuring test results are always captured
   * @default false
   */
  failOnError?: boolean;
}

/**
 * Resolved Jest reporter configuration
 */
export interface ResolvedConfig {
  apiKey: string;
  source: string;
  apiUrl: string;
  enabled: boolean;
  debug: boolean;
  failOnError: boolean;
  onError: ((error: SpekraError) => void) | null;
  onMetrics: ((metrics: SpekraMetrics) => void) | null;
}

