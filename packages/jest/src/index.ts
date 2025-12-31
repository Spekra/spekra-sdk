/**
 * @spekra/jest
 *
 * Jest test reporter for Spekra.
 * Sends test results to the Spekra platform for flake detection and test analytics.
 */

export { default as SpekraReporter } from './reporter';
export type { SpekraJestOptions } from './types';

// Re-export useful core types
export type {
  TestResult,
  TestStatus,
  Framework,
  SpekraError,
  SpekraMetrics,
} from '@spekra/core';

// Default export for Jest config
export { default } from './reporter';

