import { randomUUID } from 'crypto';
import type {
  FullConfig,
  FullResult,
  Reporter,
  Suite,
  TestCase,
  TestResult as PlaywrightTestResult,
} from '@playwright/test/reporter';

import { SpekraApiClient } from './api';
import { getCIInfo } from './ci';
import { getGitInfoAsync } from './git';
import type {
  CIInfo,
  GitInfo,
  ReportPayload,
  ResolvedConfig,
  SendResult,
  ShardInfo,
  SpekraError,
  SpekraMetrics,
  SpekraReporterOptions,
  TestResult,
  TestStatus,
} from './types';

const DEFAULTS = {
  apiUrl: 'https://spekra.dev/api/reports',
  enabled: true,
  debug: false,
  batchSize: 20,
  timeout: 15000,
  maxRetries: 3,
  retryBaseDelayMs: 1000,
  retryMaxDelayMs: 10000,
  maxErrorLength: 4000,
  maxStackTraceLines: 20,
  maxBufferSize: 1000,
} as const;

export class SpekraReporter implements Reporter {
  private config: ResolvedConfig | null = null;
  private apiClient: SpekraApiClient | null = null;
  private runId: string = '';
  private projectName: string = '';
  private gitInfo: GitInfo = { branch: null, commitSha: null };
  private gitInfoPromise: Promise<GitInfo> | null = null;
  private ciInfo: CIInfo = {
    provider: null,
    url: null,
    branch: null,
    commitSha: null,
    runId: null,
  };
  private shardInfo: ShardInfo = { index: null, total: null };
  private startedAt: string = '';
  private results: TestResult[] = [];
  private enabled: boolean = true;
  private shutdownHandler: (() => void) | null = null;
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

  constructor(private options: SpekraReporterOptions = {}) {}

  onBegin(config: FullConfig, _suite: Suite): void {
    try {
      this.config = this.resolveConfig(this.options);
      this.validateConfig(this.config);

      if (!this.config.enabled) {
        this.enabled = false;
        return;
      }

      if (!this.config.apiKey) {
        this.logWarning(
          'No API key provided. Set apiKey option or SPEKRA_API_KEY environment variable.'
        );
        this.enabled = false;
        return;
      }

      this.enabled = true;
      this.apiClient = new SpekraApiClient(this.config);
      this.startedAt = new Date().toISOString();

      this.gitInfoPromise = getGitInfoAsync().then((info) => {
        this.gitInfo = info;
        return info;
      });

      this.ciInfo = getCIInfo();
      this.shardInfo = this.getShardInfo(config);
      this.runId = this.getRunId();
      this.projectName = this.config.projectName || this.getProjectName(config);

      this.shutdownHandler = () => {
        if (this.results.length > 0) {
          this.logDebug('Process exiting, attempting to flush pending results...');
          void this.sendFinalReport();
        }
      };
      process.on('beforeExit', this.shutdownHandler);

      this.logDebug(`Run ID: ${this.runId}`);
      this.logDebug(`Project: ${this.projectName}`);

      if (this.ciInfo.provider) {
        this.logDebug(`CI: ${this.ciInfo.provider}`);
        this.logDebug(`CI URL: ${this.ciInfo.url}`);
        if (this.ciInfo.branch) {
          this.logDebug(`Branch: ${this.ciInfo.branch}`);
        }
        if (this.ciInfo.commitSha) {
          this.logDebug(`Commit: ${this.ciInfo.commitSha}`);
        }
      } else {
        this.logDebug('Git info: fetching async...');
      }

      if (this.shardInfo.index !== null) {
        this.logDebug(`Shard: ${this.shardInfo.index}/${this.shardInfo.total}`);
      }

      this.log('Reporting enabled');
    } catch (error) {
      this.logWarning(`Failed to initialize: ${this.getErrorMessage(error)}`);
      this.enabled = false;
    }
  }

  onTestEnd(test: TestCase, result: PlaywrightTestResult): void {
    if (!this.enabled) return;

    try {
      const testProjectName = test.parent?.project()?.name;
      if (testProjectName && testProjectName !== this.projectName) {
        this.projectName = testProjectName;
      }

      const testResult: TestResult = {
        testFile: this.getTestFile(test),
        testTitle: this.getFullTitle(test),
        status: this.mapStatus(result.status),
        durationMs: result.duration,
        retry: result.retry,
        errorMessage: this.getErrorMessage(result.error) || null,
      };

      this.results.push(testResult);

      const maxBuffer = this.config?.maxBufferSize ?? DEFAULTS.maxBufferSize;
      if (this.results.length > maxBuffer) {
        const dropped = this.results.length - maxBuffer;
        this.results = this.results.slice(-maxBuffer);
        this.metrics.resultsDropped += dropped;
        this.logWarning(`Buffer limit (${maxBuffer}) exceeded, dropped ${dropped} oldest results`);
      }

      if (this.results.length >= (this.config?.batchSize ?? DEFAULTS.batchSize)) {
        void this.sendBatch();
      }
    } catch (error) {
      this.logWarning(`Failed to process test result: ${this.getErrorMessage(error)}`);
    }
  }

  async onEnd(_result: FullResult): Promise<void> {
    if (this.shutdownHandler) {
      process.removeListener('beforeExit', this.shutdownHandler);
      this.shutdownHandler = null;
    }

    if (!this.enabled) return;

    try {
      await this.sendFinalReport();
      this.log('Report sent successfully');
      this.notifyMetrics();
    } catch (error) {
      this.logWarning(`Failed to send final report: ${this.getErrorMessage(error)}`);
    }
  }

  private resolveConfig(options: SpekraReporterOptions): ResolvedConfig {
    return {
      apiKey: options.apiKey || process.env.SPEKRA_API_KEY || '',
      apiUrl: options.apiUrl || DEFAULTS.apiUrl,
      projectName: options.projectName || null,
      enabled: options.enabled ?? DEFAULTS.enabled,
      debug: options.debug ?? DEFAULTS.debug,
      batchSize: options.batchSize ?? DEFAULTS.batchSize,
      timeout: options.timeout ?? DEFAULTS.timeout,
      maxRetries: options.maxRetries ?? DEFAULTS.maxRetries,
      retryBaseDelayMs: options.retryBaseDelayMs ?? DEFAULTS.retryBaseDelayMs,
      retryMaxDelayMs: options.retryMaxDelayMs ?? DEFAULTS.retryMaxDelayMs,
      maxErrorLength: options.maxErrorLength ?? DEFAULTS.maxErrorLength,
      maxStackTraceLines: options.maxStackTraceLines ?? DEFAULTS.maxStackTraceLines,
      maxBufferSize: options.maxBufferSize ?? DEFAULTS.maxBufferSize,
      onError: options.onError || null,
      onMetrics: options.onMetrics || null,
    };
  }

  private validateConfig(config: ResolvedConfig): void {
    const warnings: string[] = [];

    if (config.batchSize <= 0 || config.batchSize > 1000) {
      warnings.push(`batchSize must be 1-1000, got ${config.batchSize}, using default`);
      config.batchSize = DEFAULTS.batchSize;
    }

    if (config.timeout <= 0) {
      warnings.push(`timeout must be > 0, got ${config.timeout}, using default`);
      config.timeout = DEFAULTS.timeout;
    }

    if (config.maxRetries < 0) {
      warnings.push(`maxRetries must be >= 0, got ${config.maxRetries}, using default`);
      config.maxRetries = DEFAULTS.maxRetries;
    }

    if (config.retryBaseDelayMs <= 0) {
      warnings.push(`retryBaseDelayMs must be > 0, got ${config.retryBaseDelayMs}, using default`);
      config.retryBaseDelayMs = DEFAULTS.retryBaseDelayMs;
    }

    if (config.retryMaxDelayMs < config.retryBaseDelayMs) {
      warnings.push(`retryMaxDelayMs must be >= retryBaseDelayMs, using retryBaseDelayMs value`);
      config.retryMaxDelayMs = config.retryBaseDelayMs;
    }

    if (config.maxErrorLength <= 0) {
      warnings.push(`maxErrorLength must be > 0, got ${config.maxErrorLength}, using default`);
      config.maxErrorLength = DEFAULTS.maxErrorLength;
    }

    if (config.maxStackTraceLines <= 0) {
      warnings.push(
        `maxStackTraceLines must be > 0, got ${config.maxStackTraceLines}, using default`
      );
      config.maxStackTraceLines = DEFAULTS.maxStackTraceLines;
    }

    if (config.maxBufferSize <= 0) {
      warnings.push(`maxBufferSize must be > 0, got ${config.maxBufferSize}, using default`);
      config.maxBufferSize = DEFAULTS.maxBufferSize;
    }

    warnings.forEach((w) => this.logWarning(w));
  }

  private getRunId(): string {
    if (process.env.TEST_RUN_ID) {
      return process.env.TEST_RUN_ID;
    }
    if (this.ciInfo.runId) {
      return `ci-${this.ciInfo.runId}`;
    }
    return `run-${randomUUID()}`;
  }

  private getProjectName(config: FullConfig): string {
    if (config.projects.length > 0 && config.projects[0].name) {
      return config.projects[0].name;
    }
    return 'default';
  }

  private getShardInfo(config: FullConfig): ShardInfo {
    if (config.shard) {
      return { index: config.shard.current, total: config.shard.total };
    }

    const shardIndex = process.env.TEST_SHARD_INDEX;
    const totalShards = process.env.TEST_TOTAL_SHARDS;

    if (shardIndex && totalShards) {
      const index = parseInt(shardIndex, 10);
      const total = parseInt(totalShards, 10);

      if (!isNaN(index) && !isNaN(total) && index > 0 && total > 0) {
        return { index, total };
      }
      this.logWarning(
        `Invalid shard env vars: TEST_SHARD_INDEX=${shardIndex}, TEST_TOTAL_SHARDS=${totalShards}`
      );
    }

    return { index: null, total: null };
  }

  private getBranch(): string | null {
    return this.ciInfo.branch || this.gitInfo.branch;
  }

  private getCommitSha(): string | null {
    return this.ciInfo.commitSha || this.gitInfo.commitSha;
  }

  private getTestFile(test: TestCase): string {
    const file = test.location.file.replace(/\\/g, '/');

    const markers = [
      '/e2e/tests/',
      '/e2e/',
      '/tests/',
      '/test/',
      '/__tests__/',
      '/specs/',
      '/spec/',
    ];
    for (const marker of markers) {
      const idx = file.indexOf(marker);
      if (idx !== -1) {
        return file.substring(idx + marker.length);
      }
    }

    const parts = file.split('/');
    if (parts.length >= 2) {
      return parts.slice(-2).join('/');
    }
    return parts.pop() || file;
  }

  private getFullTitle(test: TestCase): string {
    const titles: string[] = [];
    let current: Suite | undefined = test.parent;

    while (current) {
      if (current.title) {
        titles.unshift(current.title);
      }
      current = current.parent;
    }

    titles.push(test.title);
    return titles.join(' > ');
  }

  private mapStatus(status: PlaywrightTestResult['status']): TestStatus {
    const validStatuses: TestStatus[] = ['passed', 'failed', 'skipped', 'timedOut', 'interrupted'];
    return validStatuses.includes(status as TestStatus) ? (status as TestStatus) : 'failed';
  }

  private createPayload(finishedAt: string | null = null): ReportPayload {
    return {
      runId: this.runId,
      project: this.projectName,
      branch: this.getBranch(),
      commitSha: this.getCommitSha(),
      ciUrl: this.ciInfo.url,
      shardIndex: this.shardInfo.index,
      totalShards: this.shardInfo.total,
      startedAt: this.startedAt,
      finishedAt,
      results: [...this.results],
    };
  }

  private async ensureGitInfo(): Promise<void> {
    try {
      await this.gitInfoPromise;
    } catch {
      // noop
    }
  }

  private async sendBatch(): Promise<void> {
    if (!this.apiClient || this.results.length === 0) return;

    await this.ensureGitInfo();

    // Snapshot and clear before async send to prevent race conditions
    const payload = this.createPayload();
    const resultsBackup = [...this.results];
    this.results = [];

    const sendResult = await this.apiClient.sendReport(payload);
    this.updateMetrics(sendResult, resultsBackup.length);

    if (!sendResult.success) {
      this.results = [...resultsBackup, ...this.results];
      this.logWarning('Batch send failed, will retry in final report');
      if (sendResult.error) {
        this.notifyError(sendResult.error);
      }
    }

    this.notifyMetrics();
  }

  private async sendFinalReport(): Promise<void> {
    if (!this.apiClient) return;

    if (this.results.length === 0) {
      this.logDebug('No remaining results to send');
      return;
    }

    await this.ensureGitInfo();

    const finishedAt = new Date().toISOString();
    const payload = this.createPayload(finishedAt);
    const resultCount = this.results.length;
    this.results = [];

    const sendResult = await this.apiClient.sendReport(payload);
    this.updateMetrics(sendResult, resultCount);

    if (!sendResult.success) {
      this.logWarning('Failed to send final report');
      if (sendResult.error) {
        this.notifyError(sendResult.error);
      }
    }
  }

  private updateMetrics(result: SendResult, resultCount: number): void {
    this.metrics.requestsSent++;
    this.metrics.totalLatencyMs += result.latencyMs;
    this.metrics.lastRequestLatencyMs = result.latencyMs;
    this.metrics.bytesSent += result.bytesSent;
    this.metrics.bytesUncompressed += result.bytesUncompressed;

    if (result.success) {
      this.metrics.resultsReported += resultCount;
    } else {
      this.metrics.requestsFailed++;
    }
  }

  private notifyError(error: SpekraError): void {
    if (this.config?.onError) {
      try {
        this.config.onError(error);
      } catch (e) {
        this.logWarning(`onError callback threw: ${e instanceof Error ? e.message : 'Unknown'}`);
      }
    }
  }

  private notifyMetrics(): void {
    if (this.config?.onMetrics) {
      try {
        this.config.onMetrics({ ...this.metrics });
      } catch (e) {
        this.logWarning(`onMetrics callback threw: ${e instanceof Error ? e.message : 'Unknown'}`);
      }
    }
  }

  private getErrorMessage(error: unknown): string | null {
    if (!error) return null;

    let message: string | null = null;

    if (error instanceof Error) {
      message = error.stack || error.message;
    } else if (typeof error === 'object' && 'message' in error) {
      message = String((error as { message: unknown }).message);
    } else if (typeof error === 'string') {
      message = error;
    }

    if (!message) return null;

    return this.truncateErrorMessage(message);
  }

  private truncateErrorMessage(message: string): string {
    const maxLines = this.config?.maxStackTraceLines ?? DEFAULTS.maxStackTraceLines;
    const maxLength = this.config?.maxErrorLength ?? DEFAULTS.maxErrorLength;

    const lines = message.split('\n');
    if (lines.length > maxLines) {
      const truncatedLines = lines.slice(0, maxLines);
      truncatedLines.push(`... (${lines.length - maxLines} more lines truncated)`);
      message = truncatedLines.join('\n');
    }

    if (message.length > maxLength) {
      message = message.slice(0, maxLength) + '... (truncated)';
    }

    return message;
  }

  private log(message: string): void {
    console.log(`[Spekra] ${message}`);
  }

  private logDebug(message: string): void {
    if (this.config?.debug) {
      console.log(`[Spekra] ${message}`);
    }
  }

  private logWarning(message: string): void {
    console.warn(`[Spekra] ${message}`);
  }
}
