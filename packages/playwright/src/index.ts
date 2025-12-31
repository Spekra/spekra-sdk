export { SpekraReporter } from './reporter';
export type {
  CIInfo,
  CIProvider,
  Framework,
  GitInfo,
  RedactionOptions,
  RedactionPattern,
  ReportPayload,
  ShardInfo,
  TestResult,
  TestStatus,
} from '@spekra/core';

export type { SpekraReporterOptions } from './types';

// Default export for Playwright reporter configuration
export { SpekraReporter as default } from './reporter';
