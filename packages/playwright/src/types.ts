export interface SpekraReporterOptions {
  /**
   * Your Spekra API key
   * Can also be set via SPEKRA_API_KEY environment variable
   */
  apiKey?: string;

  /**
   * API endpoint URL
   * @default 'https://spekra.dev/api/reports'
   */
  apiUrl?: string;

  /**
   * Override project name (defaults to Playwright project name)
   */
  projectName?: string;

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

export interface ResolvedConfig {
  apiKey: string;
  apiUrl: string;
  projectName: string | null;
  enabled: boolean;
  debug: boolean;
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
  /** Full test title including describe blocks */
  testTitle: string;
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
  /** Playwright project name */
  project: string;
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
