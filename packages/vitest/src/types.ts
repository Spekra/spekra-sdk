/**
 * Vitest reporter types
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
 * Vitest reporter configuration options
 *
 * Extends BaseReporterOptions with Vitest-specific settings.
 */
export interface SpekraVitestOptions extends BaseReporterOptions {
  /**
   * Fail the Vitest run if reporting fails
   * Useful for ensuring test results are always captured
   * @default false
   */
  failOnError?: boolean;
}

/**
 * Resolved Vitest reporter configuration
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
