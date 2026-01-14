/**
 * Core types shared across all Spekra reporters
 */

// ============================================================================
// Framework
// ============================================================================

/**
 * Supported test frameworks
 */
export type Framework = 'playwright' | 'jest' | 'vitest';

// ============================================================================
// Test Status
// ============================================================================

/**
 * Possible test outcome statuses
 */
export type TestStatus = 'passed' | 'failed' | 'skipped' | 'timedOut' | 'interrupted';

// ============================================================================
// Test Result
// ============================================================================

/**
 * Base test result (framework-agnostic)
 */
export interface TestResult {
  /** Relative path to test file */
  testFile: string;
  /** Full test title (describe blocks + test name, no tags) */
  fullTitle: string;
  /** Suite/describe block hierarchy */
  suitePath: string[];
  /** Test name without tags */
  testName: string;
  /** Tags extracted from annotations and inline @tag in title */
  tags: string[];
  /** Project name (Playwright project or Jest projects config), null if not applicable */
  project: string | null;
  /** Test outcome */
  status: TestStatus;
  /** Test duration in milliseconds */
  durationMs: number;
  /** Retry attempt (0 = first run) */
  retry: number;
  /** Error message if test failed */
  errorMessage: string | null;
}

// ============================================================================
// Report Payload
// ============================================================================

/**
 * Report payload sent to the Spekra API
 */
export interface ReportPayload {
  /** Unique identifier for this test run */
  runId: string;
  /** Source identifier for this reporter installation */
  source: string;
  /** Test framework that generated this report */
  framework: Framework;
  /** Git branch name */
  branch: string | null;
  /** Git commit SHA */
  commitSha: string | null;
  /** Link to CI job */
  ciUrl: string | null;
  /** Current shard index (1-based) */
  shardIndex: number | null;
  /** Total number of shards */
  totalShards: number | null;
  /** ISO timestamp when run started */
  startedAt: string;
  /** ISO timestamp when run finished (null if still running) */
  finishedAt: string | null;
  /** Test results */
  results: TestResult[];
}

// ============================================================================
// Reporter Options
// ============================================================================

/**
 * Base reporter options (shared by all reporters)
 */
export interface BaseReporterOptions {
  /**
   * Your Spekra API key
   * Can also be set via environment variable
   */
  apiKey?: string;

  /**
   * Source identifier for this reporter installation.
   * Used to group test runs from the same test suite/repo.
   *
   * Naming guidance:
   * - Use kebab-case: 'frontend-e2e', 'api-integration', 'mobile-web'
   * - Include the app/service name and test type
   * - Keep it stable - changing source creates a new grouping
   *
   * @example 'checkout-e2e'
   * @example 'api-tests'
   */
  source?: string;

  /**
   * API endpoint URL
   * @default 'https://spekra.dev/api/v1/reports'
   */
  apiUrl?: string;

  /**
   * Enable/disable reporting
   * @default true
   */
  enabled?: boolean;

  /**
   * Enable verbose logging
   * @default false
   */
  debug?: boolean;

  /**
   * Callback invoked when reporting fails (after all retries)
   */
  onError?: (error: SpekraError) => void;

  /**
   * Callback to receive reporter metrics
   */
  onMetrics?: (metrics: SpekraMetrics) => void;
}

// ============================================================================
// Error & Metrics
// ============================================================================

/**
 * Error information from the reporter
 */
export interface SpekraError {
  /** Type of error */
  type: 'network' | 'api' | 'timeout' | 'validation';
  /** Human-readable error message */
  message: string;
  /** HTTP status code (for api errors) */
  statusCode?: number;
  /** Request ID for correlation */
  requestId?: string;
  /** Number of results that failed to send */
  resultsAffected?: number;
}

/**
 * Reporter metrics
 */
export interface SpekraMetrics {
  /** Total API requests sent (including retries) */
  requestsSent: number;
  /** Requests that failed after all retries */
  requestsFailed: number;
  /** Test results successfully reported */
  resultsReported: number;
  /** Test results dropped due to buffer overflow */
  resultsDropped: number;
  /** Total time spent on API calls (ms) */
  totalLatencyMs: number;
  /** Most recent request latency (ms) */
  lastRequestLatencyMs: number;
  /** Bytes sent (compressed, if compression enabled) */
  bytesSent: number;
  /** Bytes before compression */
  bytesUncompressed: number;
}

// ============================================================================
// Git & CI Info
// ============================================================================

/**
 * Git repository information
 */
export interface GitInfo {
  branch: string | null;
  commitSha: string | null;
}

/**
 * CI provider information
 */
export interface CIInfo {
  provider: CIProvider | null;
  url: string | null;
  branch: string | null;
  commitSha: string | null;
  runId: string | null;
}

/**
 * Supported CI providers
 */
export type CIProvider =
  | 'github-actions'
  | 'gitlab-ci'
  | 'circleci'
  | 'jenkins'
  | 'azure-devops'
  | 'bitbucket-pipelines';

/**
 * Shard information for parallel test execution
 */
export interface ShardInfo {
  index: number | null;
  total: number | null;
}

// ============================================================================
// Redaction
// ============================================================================

/**
 * Redaction pattern - either a string (case-insensitive exact match) or a RegExp
 */
export type RedactionPattern = string | RegExp;

/**
 * Redaction configuration options
 */
export interface RedactionOptions {
  /**
   * Enable/disable redaction
   * @default true
   */
  enabled?: boolean;

  /**
   * Custom patterns to redact (strings or RegExp)
   * Strings are matched case-insensitively, RegExp patterns are used as-is.
   * These are ADDED to the built-in patterns (emails, tokens, API keys, etc.)
   */
  patterns?: RedactionPattern[];

  /**
   * Replace the built-in patterns instead of extending them
   * Use with caution - disables default PII protection
   * @default false
   */
  replaceBuiltIn?: boolean;
}

/**
 * Resolved redaction configuration (normalized from user input)
 */
export interface ResolvedRedactionConfig {
  enabled: boolean;
  patterns: RedactionPattern[];
  replaceBuiltIn: boolean;
}

// ============================================================================
// API Client Types
// ============================================================================

/**
 * Result from sending a report to the API
 */
export interface SendResult {
  /** Whether the send was successful */
  success: boolean;
  /** Request latency in milliseconds */
  latencyMs: number;
  /** Bytes sent (after compression if applicable) */
  bytesSent: number;
  /** Bytes before compression */
  bytesUncompressed: number;
  /** Number of retry attempts made */
  retryCount: number;
  /** Request ID for correlation */
  requestId: string;
  /** Error details if failed */
  error?: SpekraError;
}

/**
 * Report response from the API
 */
export interface ReportResponse {
  success: boolean;
  message: string;
  summary: {
    runId: string;
    testsReceived: number;
    passed: number;
    failed: number;
    skipped: number;
  };
  uploadUrls?: Record<string, string>;
}

