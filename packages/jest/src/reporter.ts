/**
 * Jest reporter for Spekra
 *
 * Collects test results and sends them to the Spekra platform at the end of the run.
 */

import { randomUUID } from 'crypto';
import type {
  Reporter,
  ReporterOnStartOptions,
  AggregatedResult,
  TestResult as JestTestResult,
  TestContext,
  Test,
} from '@jest/reporters';

type AssertionResult = JestTestResult['testResults'][number];

import {
  LoggerService,
  ApiClient,
  CIService,
  GitService,
  RedactionService,
  normalizeTestFilePath,
  type TestResult,
  type TestStatus,
  type SpekraMetrics,
  type ReportPayload,
  type CIInfo,
  type GitInfo,
} from '@spekra/core';

import { ConfigService, DEFAULTS } from './config.service';
import type { SpekraJestOptions, ResolvedConfig, SpekraError } from './types';

// SDK version - injected at build time from package.json
declare const __SDK_VERSION__: string;
const SDK_VERSION = typeof __SDK_VERSION__ !== 'undefined' ? __SDK_VERSION__ : '0.0.0-dev';

/**
 * Jest reporter that captures test results and uploads to Spekra.
 * Sends all results at the end of the run.
 */
export default class SpekraReporter implements Reporter {
  // State
  private enabled = false;
  private config: ResolvedConfig | null = null;
  private logger: LoggerService | null = null;
  private apiClient: ApiClient | null = null;
  private redactionService: RedactionService | null = null;

  // Collected results
  private results: TestResult[] = [];

  // Run metadata
  private runId: string = '';
  private startedAt: string = '';
  private ciInfo: CIInfo | null = null;
  private gitInfo: GitInfo = { branch: null, commitSha: null };
  private gitInfoPromise: Promise<GitInfo> | null = null;

  // Metrics
  private metrics: SpekraMetrics = {
    requestsSent: 0,
    requestsFailed: 0,
    resultsReported: 0,
    resultsDropped: 0,
    totalLatencyMs: 0,
    lastRequestLatencyMs: 0,
    bytesSent: 0,
    bytesUncompressed: 0,
  };

  // Error tracking for failOnError
  private reportingError: SpekraError | null = null;

  constructor(_globalConfig: unknown, options: SpekraJestOptions = {}) {
    try {
      const configService = ConfigService.instance();
      this.config = configService.resolve(options);

      // Check readiness
      const readiness = configService.isReady(this.config);
      if (!readiness.ready) {
        if (readiness.reason && readiness.reason !== 'disabled') {
          console.warn(`[Spekra] ${readiness.reason}`);
        }
        this.enabled = false;
        return;
      }

      // Initialize services
      this.logger = new LoggerService({ debug: this.config.debug, prefix: 'Spekra' });
      configService.validate(this.config, this.logger);

      this.redactionService = new RedactionService(
        { enabled: true, patterns: [], replaceBuiltIn: false },
        this.logger
      );

      this.apiClient = new ApiClient(
        {
          apiKey: this.config.apiKey,
          apiUrl: this.config.apiUrl,
          timeout: DEFAULTS.timeout,
          maxRetries: DEFAULTS.maxRetries,
          retryBaseDelayMs: DEFAULTS.retryBaseDelayMs,
          retryMaxDelayMs: DEFAULTS.retryMaxDelayMs,
          framework: 'jest',
          sdkVersion: SDK_VERSION,
          compression: false, // Jest reporter doesn't use compression
        },
        this.logger
      );

      this.enabled = true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.warn(`[Spekra] Failed to initialize: ${errorMessage}`);
      this.enabled = false;
    }
  }

  /**
   * Called when test run starts
   */
  onRunStart(_results: AggregatedResult, _options: ReporterOnStartOptions): void {
    if (!this.enabled) return;

    this.startedAt = new Date().toISOString();

    // Get CI info synchronously
    this.ciInfo = CIService.instance().getCIInfo();

    // Start async git info fetch
    this.gitInfoPromise = GitService.instance()
      .getGitInfoAsync()
      .then((info) => {
        this.gitInfo = info;
        return info;
      })
      .catch(() => this.gitInfo);

    // Generate run ID
    this.runId = this.resolveRunId();

    this.logger?.verbose('Run started', {
      runId: this.runId,
      source: this.config?.source,
    });

    if (this.ciInfo?.provider) {
      this.logger?.verbose('CI detected', {
        provider: this.ciInfo.provider,
        url: this.ciInfo.url,
      });
    }

    this.logger?.info('Reporting enabled');
  }

  /**
   * Called when a test file completes
   */
  onTestResult(
    _test: Test,
    testResult: JestTestResult,
    _aggregatedResult: AggregatedResult
  ): void {
    if (!this.enabled) return;

    const testFile = normalizeTestFilePath(testResult.testFilePath);

    for (const assertionResult of testResult.testResults) {
      const result = this.collectTestResult(testFile, assertionResult);
      this.results.push(result);
    }

    this.logger?.verbose('Collected test results', {
      file: testFile,
      count: testResult.testResults.length,
    });
  }

  /**
   * Called when all tests complete
   */
  async onRunComplete(
    _testContexts: Set<TestContext>,
    _results: AggregatedResult
  ): Promise<void> {
    if (!this.enabled) return;

    try {
      await this.sendReport();
      this.logger?.info('Report sent successfully');
      this.notifyMetrics();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger?.error('Failed to send report', error);
      this.reportingError = {
        type: 'network',
        message: errorMessage,
        resultsAffected: this.results.length,
      };
      this.notifyError(this.reportingError);
    }
  }

  /**
   * Get exit code (used for failOnError)
   */
  getLastError(): Error | undefined {
    if (this.config?.failOnError && this.reportingError) {
      return new Error(`Spekra reporting failed: ${this.reportingError.message}`);
    }
    return undefined;
  }

  // ============================================================================
  // Private: Result Collection
  // ============================================================================

  private collectTestResult(testFile: string, assertion: AssertionResult): TestResult {
    // Parse suite path from ancestor titles
    const suitePath = assertion.ancestorTitles || [];
    const testName = assertion.title;
    const fullTitle = [...suitePath, testName].join(' > ');

    // Map Jest status to our status
    const status = this.mapStatus(assertion.status);

    // Calculate retry (invocations - 1)
    const retry = Math.max(0, (assertion.invocations ?? 1) - 1);

    // Get redacted error message
    let errorMessage: string | null = null;
    if (assertion.failureMessages && assertion.failureMessages.length > 0) {
      // Take first line of first failure message
      const firstError = assertion.failureMessages[0];
      const firstLine = this.extractFirstErrorLine(firstError);
      errorMessage = this.redactionService?.redact(firstLine) ?? firstLine;
    }

    return {
      testFile,
      fullTitle,
      suitePath,
      testName,
      tags: [], // Jest doesn't have native tag support
      project: null, // Will be populated from Jest projects config if available
      status,
      durationMs: assertion.duration ?? 0,
      retry,
      errorMessage,
    };
  }

  private mapStatus(jestStatus: AssertionResult['status']): TestStatus {
    const statusMap: Record<string, TestStatus> = {
      passed: 'passed',
      failed: 'failed',
      skipped: 'skipped',
      pending: 'skipped', // Jest 'pending' = skipped
      todo: 'skipped', // Jest 'todo' = skipped
      disabled: 'skipped', // Jest 'disabled' = skipped
    };
    return statusMap[jestStatus] ?? 'failed';
  }

  private extractFirstErrorLine(error: string): string {
    // Strip ANSI escape codes
    const cleaned = error.replace(
      // eslint-disable-next-line no-control-regex
      /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g,
      ''
    );

    // Get first meaningful line (skip empty lines)
    const lines = cleaned.split('\n').filter((line) => line.trim().length > 0);
    const firstLine = lines[0] || error;

    // Truncate if too long
    const maxLength = 500;
    if (firstLine.length > maxLength) {
      return firstLine.substring(0, maxLength) + '...';
    }

    return firstLine;
  }

  // ============================================================================
  // Private: Sending
  // ============================================================================

  private async sendReport(): Promise<void> {
    if (!this.apiClient || !this.config) return;

    // Wait for git info
    try {
      await this.gitInfoPromise;
    } catch {
      // Git info is optional
    }

    if (this.results.length === 0) {
      this.logger?.verbose('No results to send');
      return;
    }

    // Build payload
    const payload: ReportPayload = {
      runId: this.runId,
      source: this.config.source,
      framework: 'jest',
      branch: this.getBranch(),
      commitSha: this.getCommitSha(),
      ciUrl: this.ciInfo?.url ?? null,
      shardIndex: null, // Jest sharding not supported initially
      totalShards: null,
      startedAt: this.startedAt,
      finishedAt: new Date().toISOString(),
      results: this.results,
    };

    this.logger?.info('Sending report', {
      runId: this.runId,
      results: this.results.length,
    });

    const sendResult = await this.apiClient.sendReport(payload);

    if (!sendResult.success) {
      const errorMessage = sendResult.error?.message ?? 'Failed to send report';
      this.metrics.requestsFailed++;

      throw new Error(errorMessage);
    }

    // Update metrics
    this.metrics.requestsSent++;
    this.metrics.resultsReported += this.results.length;
    this.metrics.totalLatencyMs += sendResult.latencyMs;
    this.metrics.lastRequestLatencyMs = sendResult.latencyMs;
    this.metrics.bytesSent += sendResult.bytesSent;
    this.metrics.bytesUncompressed += sendResult.bytesUncompressed;

    this.logger?.verbose('Report sent', {
      testsReceived: sendResult.data?.summary.testsReceived,
      latencyMs: sendResult.latencyMs,
    });
  }

  // ============================================================================
  // Private: Run ID & Git Info
  // ============================================================================

  private resolveRunId(): string {
    // Explicit override
    if (process.env.TEST_RUN_ID) {
      return process.env.TEST_RUN_ID;
    }

    // CI-provided run ID
    if (this.ciInfo?.runId) {
      return `ci-${this.ciInfo.runId}`;
    }

    // Generate random
    return `run-${randomUUID()}`;
  }

  private getBranch(): string | null {
    return this.ciInfo?.branch || this.gitInfo.branch;
  }

  private getCommitSha(): string | null {
    return this.ciInfo?.commitSha || this.gitInfo.commitSha;
  }

  // ============================================================================
  // Private: Callbacks
  // ============================================================================

  private notifyError(error: SpekraError): void {
    if (this.config?.onError) {
      try {
        this.config.onError(error);
      } catch (e) {
        this.logger?.warn('onError callback threw', {
          error: e instanceof Error ? e.message : 'Unknown',
        });
      }
    }
  }

  private notifyMetrics(): void {
    if (this.config?.onMetrics) {
      try {
        this.config.onMetrics({ ...this.metrics });
      } catch (e) {
        this.logger?.warn('onMetrics callback threw', {
          error: e instanceof Error ? e.message : 'Unknown',
        });
      }
    }
  }
}

