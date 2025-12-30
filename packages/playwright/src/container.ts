import type { ResolvedConfig } from './types';

// Services
import { LoggerService } from './infrastructure/services/logger.service';
import { RedactionService } from './infrastructure/services/redaction.service';
import { CompressionService } from './infrastructure/services/compression.service';

// Clients
import { ApiClient } from './infrastructure/clients/api.client';
import { UploadClient } from './infrastructure/clients/upload.client';

// Use Cases
import { CollectTestResultUseCase } from './use-cases/collect-test-result.use-case';
import { SendReportUseCase } from './use-cases/send-report.use-case';
import { UploadArtifactsUseCase } from './use-cases/upload-artifacts.use-case';

import { DEFAULTS } from './infrastructure/services/config.service';

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

  // Clients
  const apiClient = new ApiClient(
    {
      apiKey: config.apiKey,
      apiUrl: config.apiUrl,
      timeout: config.timeout,
      maxRetries: config.maxRetries,
      retryBaseDelayMs: config.retryBaseDelayMs,
      retryMaxDelayMs: config.retryMaxDelayMs,
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
