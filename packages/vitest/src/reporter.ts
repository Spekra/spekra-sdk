/**
 * Vitest reporter for Spekra
 *
 * Collects test results and sends them to the Spekra platform at the end of the run.
 */

import { randomUUID } from 'crypto';
import type { Reporter, Vitest, File, Task, TaskResultPack } from 'vitest';

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
import type { SpekraVitestOptions, ResolvedConfig, SpekraError } from './types';

// SDK version - injected at build time from package.json
declare const __SDK_VERSION__: string;
const SDK_VERSION = typeof __SDK_VERSION__ !== 'undefined' ? __SDK_VERSION__ : '0.0.0-dev';

/**
 * Vitest reporter that captures test results and uploads to Spekra.
 * Sends all results at the end of the run.
 */
export default class SpekraReporter implements Reporter {
  // State
  private enabled = false;
  private config: ResolvedConfig | null = null;
  private logger: LoggerService | null = null;
  private apiClient: ApiClient | null = null;
  private redactionService: RedactionService | null = null;
  private vitest: Vitest | null = null;

  // Collected results
  private results: TestResult[] = [];

  // Run metadata
  private runId: string = '';
  private startedAt: string = '';
  private ciInfo: CIInfo | null = null;
  private gitInfo: GitInfo = { branch: null, commitSha: null };
  private gitInfoPromise: Promise<GitInfo> | null = null;

  // Shard info
  private shardIndex: number | null = null;
  private totalShards: number | null = null;

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

  // Options passed via reporter config
  private options: SpekraVitestOptions;

  constructor(options: SpekraVitestOptions = {}) {
    this.options = options;
  }

  /**
   * Called when Vitest is initiated
   */
  onInit(vitest: Vitest): void {
    this.vitest = vitest;

    // Skip if in watch mode
    if (vitest.config.watch) {
      this.enabled = false;
      return;
    }

    try {
      const configService = ConfigService.instance();
      this.config = configService.resolve(this.options);

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
          framework: 'vitest',
          sdkVersion: SDK_VERSION,
          compression: false, // Vitest reporter doesn't use compression
        },
        this.logger
      );

      // Extract shard info from Vitest config
      this.extractShardInfo(vitest);

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
      this.enabled = true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.warn(`[Spekra] Failed to initialize: ${errorMessage}`);
      this.enabled = false;
    }
  }

  /**
   * Called when tasks are updated (tests complete)
   */
  onTaskUpdate(packs: TaskResultPack[]): void {
    if (!this.enabled) return;

    for (const pack of packs) {
      const [taskId, result] = pack;

      // Skip if no result yet
      if (!result) continue;

      // Find the task by ID
      const task = this.findTaskById(taskId);
      if (!task) continue;

      // Only collect test results, not suites
      if (task.type !== 'test') continue;

      // Skip todo tests entirely
      if (result.state === 'todo') continue;

      const testResult = this.collectTestResult(task, result);
      this.results.push(testResult);
    }
  }

  /**
   * Called when all tests complete
   */
  async onFinished(_files?: File[], _errors?: unknown[]): Promise<void> {
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

      // If failOnError is enabled, throw to fail the test run
      if (this.config?.failOnError) {
        throw new Error(`Spekra reporting failed: ${errorMessage}`);
      }
    }
  }

  // ============================================================================
  // Private: Task Finding
  // ============================================================================

  private findTaskById(taskId: string): Task | undefined {
    if (!this.vitest?.state) return undefined;

    const files = this.vitest.state.getFiles();
    for (const file of files) {
      const task = this.findTaskInTree(file, taskId);
      if (task) return task;
    }
    return undefined;
  }

  private findTaskInTree(task: Task, taskId: string): Task | undefined {
    if (task.id === taskId) return task;

    if ('tasks' in task && task.tasks) {
      for (const child of task.tasks) {
        const found = this.findTaskInTree(child, taskId);
        if (found) return found;
      }
    }
    return undefined;
  }

  // ============================================================================
  // Private: Result Collection
  // ============================================================================

  private collectTestResult(
    task: Task,
    result: NonNullable<Task['result']>
  ): TestResult {
    // Get file path
    const file = this.getTaskFile(task);
    const testFile = file ? normalizeTestFilePath(file.filepath) : 'unknown';

    // Build suite path and test name
    const { suitePath, testName, fullTitle } = this.buildTestPath(task);

    // Get project name (workspace name)
    const project = file?.projectName ?? null;

    // Map status
    const status = this.mapStatus(result.state);

    // Get retry count
    const retry = result.retryCount ?? 0;

    // Get redacted error message
    let errorMessage: string | null = null;
    if (result.errors && result.errors.length > 0) {
      const firstError = result.errors[0];
      const errorStr = this.extractErrorMessage(firstError);
      const firstLine = this.extractFirstErrorLine(errorStr);
      errorMessage = this.redactionService?.redact(firstLine) ?? firstLine;
    }

    return {
      testFile,
      fullTitle,
      suitePath,
      testName,
      tags: [], // Vitest doesn't have native tag support
      project,
      status,
      durationMs: result.duration ?? 0,
      retry,
      errorMessage,
    };
  }

  private getTaskFile(task: Task): File | undefined {
    // Walk up to find the file
    let current: Task | undefined = task;
    while (current) {
      if (current.type === 'suite' && 'filepath' in current) {
        return current as File;
      }
      current = current.suite;
    }
    return undefined;
  }

  private buildTestPath(task: Task): {
    suitePath: string[];
    testName: string;
    fullTitle: string;
  } {
    const parts: string[] = [];
    let current: Task | undefined = task;

    // Walk up the tree collecting names
    while (current) {
      if (current.type === 'test' || current.type === 'suite') {
        // Skip file-level suite (has filepath)
        if (!('filepath' in current)) {
          parts.unshift(current.name);
        }
      }
      current = current.suite;
    }

    const testName = parts.pop() || task.name;
    const suitePath = parts;
    const fullTitle = [...suitePath, testName].join(' > ');

    return { suitePath, testName, fullTitle };
  }

  private mapStatus(
    state: NonNullable<Task['result']>['state'] | undefined
  ): TestStatus {
    switch (state) {
      case 'pass':
        return 'passed';
      case 'fail':
        return 'failed';
      case 'skip':
        return 'skipped';
      // todo is filtered out in onTaskUpdate, but map it anyway
      case 'todo':
        return 'skipped';
      // Handle cancelled/interrupted runs
      case 'run':
      case 'only':
        return 'interrupted';
      default:
        return 'failed';
    }
  }

  private extractErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    if (typeof error === 'object' && error !== null) {
      // Vitest error objects may have message property
      if ('message' in error && typeof error.message === 'string') {
        return error.message;
      }
      // Or a diff
      if ('diff' in error && typeof error.diff === 'string') {
        return error.diff;
      }
    }
    return String(error);
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
  // Private: Shard Info
  // ============================================================================

  private extractShardInfo(vitest: Vitest): void {
    const shard = vitest.config.shard;
    if (shard) {
      // Vitest shard format: { index: 1, count: 3 }
      this.shardIndex = shard.index ?? null;
      this.totalShards = shard.count ?? null;
    }
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
      framework: 'vitest',
      branch: this.getBranch(),
      commitSha: this.getCommitSha(),
      ciUrl: this.ciInfo?.url ?? null,
      shardIndex: this.shardIndex,
      totalShards: this.totalShards,
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
