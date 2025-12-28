import type {
  FullConfig,
  FullResult,
  Reporter,
  Suite,
  TestCase,
  TestResult as PlaywrightTestResult,
} from '@playwright/test/reporter';

import type { ResolvedConfig, SpekraError, SpekraMetrics, SpekraReporterOptions } from './types';

// Container
import { type Container, createContainer } from './container';

// Services
import { ConfigService, DEFAULTS } from './infrastructure/services/config.service';
import { RunMetadataService } from './infrastructure/services/run-metadata.service';

// Domain
import type { Artifact } from './domain/entities/artifact.entity';

/**
 * Playwright reporter that captures test results, artifacts, and uploads to Spekra.
 * Thin adapter that delegates to use cases.
 */
export class SpekraReporter implements Reporter {
  // State
  private enabled = false;
  private config: ResolvedConfig | null = null;
  private container: Container | null = null;
  private runMetadataService: RunMetadataService | null = null;

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

  // Shutdown handler
  private shutdownHandler: (() => void) | null = null;

  constructor(private options: SpekraReporterOptions = {}) {}

  onBegin(config: FullConfig, _suite: Suite): void {
    try {
      const configService = ConfigService.instance();
      this.config = configService.resolve(this.options);

      // Check if ready (enabled + API key)
      const readiness = configService.isReady(this.config);
      if (!readiness.ready) {
        if (readiness.reason && readiness.reason !== 'disabled') {
          console.warn(`[Spekra] ${readiness.reason}`);
        }
        this.enabled = false;
        return;
      }

      // Create container with all dependencies
      this.container = createContainer(this.config);

      // Validate config (logs warnings)
      configService.validate(this.config, this.container.logger);

      // Initialize run metadata with source from config
      this.runMetadataService = new RunMetadataService();
      this.runMetadataService.initialize(config, this.config.source);

      this.enabled = true;

      // Setup shutdown handler
      this.shutdownHandler = () => {
        if (this.container?.collectUseCase && this.container.collectUseCase.bufferedCount > 0) {
          this.container.logger.verbose('Process exiting, attempting to flush pending results...');
          void this.sendFinalReport();
        }
      };
      process.on('beforeExit', this.shutdownHandler);

      // Log startup info
      this.logStartupInfo();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.warn(`[Spekra] Failed to initialize: ${errorMessage}`);
      this.enabled = false;
    }
  }

  onTestEnd(test: TestCase, result: PlaywrightTestResult): void {
    if (!this.enabled || !this.container) return;

    const collectResult = this.container.collectUseCase.execute({ test, result });

    if (!collectResult.success) {
      this.container.logger.warn('Failed to collect test result', { error: collectResult.error });
    }

    // Check buffer limit
    const maxBuffer = this.config?.maxBufferSize ?? DEFAULTS.maxBufferSize;
    if (this.container.collectUseCase.bufferedCount > maxBuffer) {
      this.container.logger.warn('Buffer limit exceeded', {
        buffered: this.container.collectUseCase.bufferedCount,
        max: maxBuffer,
      });
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
      this.container?.logger.info('Report sent successfully');
      this.notifyMetrics();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.container?.logger.error('Failed to send final report', error);
      this.notifyError({
        type: 'network',
        message: errorMessage,
      });
    }
  }

  // ============================================================================
  // Private: Report Sending
  // ============================================================================

  private async sendFinalReport(): Promise<void> {
    if (!this.container || !this.runMetadataService) return;

    // Get buffered results
    const results = this.container.collectUseCase.flushResults();

    if (results.length === 0) {
      this.container.logger.verbose('No results to send');
      return;
    }

    // Build run metadata
    const metadata = await this.runMetadataService.buildMetadata();

    // Send report to API
    const sendResult = await this.container.sendReportUseCase.execute({ metadata, results });

    if (!sendResult.success) {
      this.metrics.requestsFailed++;
      this.notifyError({
        type: 'api',
        message: sendResult.error,
        resultsAffected: results.length,
      });
      return;
    }

    // Update metrics
    this.metrics.requestsSent++;
    this.metrics.resultsReported += results.length;
    this.metrics.totalLatencyMs += sendResult.data.metrics.latencyMs;
    this.metrics.lastRequestLatencyMs = sendResult.data.metrics.latencyMs;
    this.metrics.bytesSent += sendResult.data.metrics.bytesSent;
    this.metrics.bytesUncompressed += sendResult.data.metrics.bytesUncompressed;

    // Upload artifacts
    await this.uploadArtifacts(results, sendResult.data.uploadUrls);
  }

  private async uploadArtifacts(
    results: { artifacts: Artifact[] }[],
    uploadUrls: Record<string, string>
  ): Promise<void> {
    if (!this.container) return;

    // Collect all artifacts from results
    const allArtifacts: Artifact[] = [];
    for (const result of results) {
      allArtifacts.push(...result.artifacts);
    }

    // Upload if we have artifacts and URLs
    if (allArtifacts.length > 0 && Object.keys(uploadUrls).length > 0) {
      const uploadResult = await this.container.uploadArtifactsUseCase.execute({
        artifacts: allArtifacts,
        uploadUrls,
      });

      if (uploadResult.success && uploadResult.data.failed.length > 0) {
        this.notifyError({
          type: 'network',
          message: `Failed to upload ${uploadResult.data.failed.length} artifacts`,
          resultsAffected: uploadResult.data.failed.length,
        });
      }
    }
  }

  // ============================================================================
  // Private: Logging
  // ============================================================================

  private logStartupInfo(): void {
    if (!this.container || !this.runMetadataService || !this.config) return;

    const logger = this.container.logger;
    const ciInfo = this.runMetadataService.getCIInfo();
    const shardInfo = this.runMetadataService.getShardInfo();

    logger.verbose('Run ID', { runId: this.runMetadataService.getRunId() });
    logger.verbose('Source', { source: this.config.source });

    if (ciInfo.provider) {
      logger.verbose('CI detected', {
        provider: ciInfo.provider,
        url: ciInfo.url,
      });
    }

    if (shardInfo.index !== null) {
      logger.verbose('Shard info', {
        index: shardInfo.index,
        total: shardInfo.total,
      });
    }

    logger.info('Reporting enabled');
  }

  // ============================================================================
  // Private: Callbacks
  // ============================================================================

  private notifyError(error: SpekraError): void {
    if (this.config?.onError) {
      try {
        this.config.onError(error);
      } catch (e) {
        this.container?.logger.warn('onError callback threw', {
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
        this.container?.logger.warn('onMetrics callback threw', {
          error: e instanceof Error ? e.message : 'Unknown',
        });
      }
    }
  }
}
