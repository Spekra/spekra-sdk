export { SpekraReporter } from './reporter';
export type {
  CIInfo,
  CIProvider,
  GitInfo,
  RedactionOptions,
  RedactionPattern,
  ReportPayload,
  ShardInfo,
  SpekraReporterOptions,
  TestResult,
  TestStatus,
} from './types';

// Default export for Playwright reporter configuration
export { SpekraReporter as default } from './reporter';
