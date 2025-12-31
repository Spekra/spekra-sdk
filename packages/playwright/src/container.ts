import type { ResolvedConfig } from './types';
import { LoggerService, RedactionService } from '@spekra/core';
import { ApiClient } from '@spekra/core';
import { CompressionService } from './infrastructure/services/compression.service';
import { UploadClient } from './infrastructure/clients/upload.client';
import { CollectTestResultUseCase } from './use-cases/collect-test-result.use-case';
import { SendReportUseCase } from './use-cases/send-report.use-case';
import { UploadArtifactsUseCase } from './use-cases/upload-artifacts.use-case';

import { DEFAULTS } from './infrastructure/services/config.service';

// SDK version - injected at build time from package.json
declare const __SDK_VERSION__: string;
const SDK_VERSION = typeof __SDK_VERSION__ !== 'undefined' ? __SDK_VERSION__ : '0.0.0-dev';

/**
 * Container holding all initialized services and use cases
 */
export interface Container {
  // Services
  logger: LoggerService;
  redactionService: RedactionService;
  compressionService: CompressionService;

  // Clients
  apiClient: ApiClient;
  uploadClient: UploadClient;

  // Use Cases
  collectUseCase: CollectTestResultUseCase;
  sendReportUseCase: SendReportUseCase;
  uploadArtifactsUseCase: UploadArtifactsUseCase;
}

/**
 * Create and wire all dependencies.
 * Provides a simple composition root without requiring a DI framework.
 */
export function createContainer(config: ResolvedConfig): Container {
  // Logger (foundation service)
  const logger = new LoggerService({ debug: config.debug });

  // Infrastructure services
  const redactionService = new RedactionService(config.redaction, logger);
  const compressionService = new CompressionService(logger);

  // API Client (from core, configured for Playwright)
  const apiClient = new ApiClient(
    {
      apiKey: config.apiKey,
      apiUrl: config.apiUrl,
      timeout: config.timeout,
      maxRetries: config.maxRetries,
      retryBaseDelayMs: config.retryBaseDelayMs,
      retryMaxDelayMs: config.retryMaxDelayMs,
      framework: 'playwright',
      sdkVersion: SDK_VERSION,
      compression: true, // Playwright uses compression
    },
    logger
  );

  const uploadClient = new UploadClient(
    {
      timeout: config.timeout,
      maxRetries: config.maxRetries,
      retryBaseDelayMs: config.retryBaseDelayMs,
      retryMaxDelayMs: config.retryMaxDelayMs,
      concurrency: DEFAULTS.uploadConcurrency,
    },
    logger
  );

  // Use Cases
  const collectUseCase = new CollectTestResultUseCase(logger, redactionService, {
    maxErrorLength: config.maxErrorLength,
    maxStackTraceLines: config.maxStackTraceLines,
  });

  const sendReportUseCase = new SendReportUseCase(logger, apiClient);

  const uploadArtifactsUseCase = new UploadArtifactsUseCase(logger, uploadClient, apiClient);

  return {
    logger,
    redactionService,
    compressionService,
    apiClient,
    uploadClient,
    collectUseCase,
    sendReportUseCase,
    uploadArtifactsUseCase,
  };
}
