import { BaseUseCase, type UseCaseResult } from './base.use-case';
import { LoggerService } from '../infrastructure/services/logger.service';
import {
  UploadClient,
  type UploadTask,
  type BatchUploadResult,
} from '../infrastructure/clients/upload.client';
import { ApiClient } from '../infrastructure/clients/api.client';
import { Artifact } from '../domain/entities/artifact.entity';

/**
 * Format bytes as human-readable string
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const value = bytes / Math.pow(k, i);
  return `${value.toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

/**
 * Input for uploading artifacts
 */
export interface UploadArtifactsInput {
  /** Artifacts to upload */
  artifacts: Artifact[];
  /** Presigned URLs (artifactId -> URL) */
  uploadUrls: Record<string, string>;
}

/**
 * Output of uploading artifacts
 */
export interface UploadArtifactsOutput {
  /** Successfully uploaded artifact IDs */
  succeeded: string[];
  /** Failed artifact IDs with errors */
  failed: Array<{ id: string; error: string }>;
  /** Total bytes uploaded */
  totalBytesUploaded: number;
  /** Total size of all artifacts before upload */
  totalArtifactSize: number;
}

/**
 * Uploads artifacts to presigned URLs with progress logging.
 * Handles partial success and reports detailed results.
 * Confirms successful uploads with the API.
 */
export class UploadArtifactsUseCase extends BaseUseCase<
  UploadArtifactsInput,
  UploadArtifactsOutput
> {
  private readonly uploadClient: UploadClient;
  private readonly apiClient: ApiClient;

  constructor(logger: LoggerService, uploadClient: UploadClient, apiClient: ApiClient) {
    super(logger);
    this.uploadClient = uploadClient;
    this.apiClient = apiClient;
  }

  /**
   * Upload artifacts to presigned URLs
   */
  async execute(input: UploadArtifactsInput): Promise<UseCaseResult<UploadArtifactsOutput>> {
    const { artifacts, uploadUrls } = input;

    // Filter artifacts that have upload URLs
    const tasksToUpload: UploadTask[] = [];
    const skippedArtifacts: string[] = [];

    for (const artifact of artifacts) {
      const uploadUrl = uploadUrls[artifact.id];
      if (!uploadUrl) {
        skippedArtifacts.push(artifact.id);
        continue;
      }

      tasksToUpload.push({
        id: artifact.id,
        filePath: artifact.path,
        contentType: artifact.contentType,
        uploadUrl,
        compress: !artifact.isPreCompressed,
      });
    }

    if (skippedArtifacts.length > 0) {
      this.logger.verbose('Skipped artifacts without upload URLs', {
        count: skippedArtifacts.length,
      });
    }

    if (tasksToUpload.length === 0) {
      this.logger.verbose('No artifacts to upload');
      return {
        success: true,
        data: {
          succeeded: [],
          failed: [],
          totalBytesUploaded: 0,
          totalArtifactSize: 0,
        },
      };
    }

    // Calculate total size for progress
    const totalArtifactSize = artifacts.reduce((sum, a) => sum + a.size, 0);

    this.logger.info('Uploading artifacts', {
      count: tasksToUpload.length,
      totalSize: formatBytes(totalArtifactSize),
    });

    // Track progress
    let lastProgressLog = 0;
    const progressInterval = 10; // Log every 10%

    const result: BatchUploadResult = await this.uploadClient.uploadBatch(
      tasksToUpload,
      (progress) => {
        const percentage = Math.round((progress.bytesUploaded / progress.totalBytes) * 100);

        // Log progress at intervals
        if (percentage >= lastProgressLog + progressInterval || percentage === 100) {
          this.logger.info(
            `Uploading artifacts: ${percentage}% (${formatBytes(progress.bytesUploaded)}/${formatBytes(progress.totalBytes)})`
          );
          lastProgressLog = percentage;
        }
      }
    );

    // Report results
    const succeeded = result.succeeded.map((r) => r.id);
    const failed = result.failed.map((r) => ({ id: r.id, error: r.error ?? 'Unknown error' }));

    if (failed.length > 0) {
      this.logger.warn(`Upload incomplete: ${succeeded.length}/${tasksToUpload.length} artifacts`, {
        failed: failed.length,
      });
    } else {
      this.logger.info(
        `Uploaded ${succeeded.length} artifacts (${formatBytes(result.totalBytesUploaded)})`
      );
    }

    // Confirm successful uploads with the API
    if (succeeded.length > 0) {
      await this.confirmUploads(succeeded);
    }

    return {
      success: true,
      data: {
        succeeded,
        failed,
        totalBytesUploaded: result.totalBytesUploaded,
        totalArtifactSize,
      },
    };
  }

  /**
   * Confirm successful uploads with the API
   */
  private async confirmUploads(artifactIds: string[]): Promise<void> {
    try {
      const result = await this.apiClient.confirmUploads(artifactIds);

      if (result.success && result.data) {
        this.logger.verbose('Confirmed uploads', { confirmed: result.data.confirmed });
      } else {
        this.logger.warn('Failed to confirm uploads', {
          error: result.error?.message ?? 'Unknown error',
        });
      }
    } catch (error) {
      // Non-fatal - uploads are already complete, just not confirmed
      this.logger.warn('Error confirming uploads', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
}
