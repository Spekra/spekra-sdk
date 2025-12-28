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
   *
   * @example ['password', 'secret', /my-api-key-\d+/]
   */
  patterns?: RedactionPattern[];

  /**
   * Replace the built-in patterns instead of extending them
   * Use with caution - disables default PII protection
   * @default false
   */
  replaceBuiltIn?: boolean;
}

export interface SpekraReporterOptions {
  /**
   * Your Spekra API key
   * Can also be set via SPEKRA_API_KEY environment variable
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
   * @default 'https://spekra.dev/api/reports'
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
   * Callback invoked when reporting fails (after all retries)
   */
  onError?: (error: SpekraError) => void;

  /**
   * Callback to receive reporter metrics
   */
  onMetrics?: (metrics: SpekraMetrics) => void;

  /**
   * Internal development mode for SDK debugging.
   * Logs raw Playwright data structures to help debug title parsing.
   * Not intended for end-user debugging - use `debug` for that.
   * @internal
   */
  _devMode?: boolean;
}

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

/**
 * Resolved redaction configuration (normalized from user input)
 */
export interface ResolvedRedactionConfig {
  enabled: boolean;
  patterns: RedactionPattern[];
  replaceBuiltIn: boolean;
}

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

export interface GitInfo {
  branch: string | null;
  commitSha: string | null;
}

export interface CIInfo {
  provider: CIProvider | null;
  url: string | null;
  branch: string | null;
  commitSha: string | null;
  runId: string | null;
}

export type CIProvider =
  | 'github-actions'
  | 'gitlab-ci'
  | 'circleci'
  | 'jenkins'
  | 'azure-devops'
  | 'bitbucket-pipelines';

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
  /** Playwright project name */
  project: string;
  /** Test outcome */
  status: TestStatus;
  /** Test duration in milliseconds */
  durationMs: number;
  /** Retry attempt (0 = first run) */
  retry: number;
  /** Error message if test failed */
  errorMessage: string | null;
}

export type TestStatus = 'passed' | 'failed' | 'skipped' | 'timedOut' | 'interrupted';

export interface ReportPayload {
  /** Unique identifier for this test run */
  runId: string;
  /** Source identifier for this reporter installation */
  source: string;
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

export interface ShardInfo {
  index: number | null;
  total: number | null;
}

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
