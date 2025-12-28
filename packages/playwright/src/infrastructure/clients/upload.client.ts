import * as fs from 'fs';
import * as path from 'path';
import { BaseClient, type ClientConfig } from './base.client';
import { LoggerService } from '../services/logger.service';

/**
 * Upload client configuration
 */
export interface UploadClientConfig extends ClientConfig {
  /** Maximum concurrent uploads */
  concurrency: number;
}

/**
 * Single artifact upload task
 */
export interface UploadTask {
  /** Artifact ID */
  id: string;
  /** Local file path */
  filePath: string;
  /** Content type */
  contentType: string;
  /** Presigned URL to upload to */
  uploadUrl: string;
  /** Whether to apply gzip compression */
  compress: boolean;
}

/**
 * Result of uploading a single artifact
 */
export interface UploadResult {
  id: string;
  success: boolean;
  error?: string;
  bytesUploaded: number;
}

/**
 * Result of uploading multiple artifacts
 */
export interface BatchUploadResult {
  succeeded: UploadResult[];
  failed: UploadResult[];
  totalBytesUploaded: number;
}

/**
 * Progress callback
 */
export type UploadProgressCallback = (progress: {
  completedCount: number;
  totalCount: number;
  bytesUploaded: number;
  totalBytes: number;
}) => void;

/**
 * HTTP client for uploading artifacts to presigned URLs.
 * Reads files from disk and uploads directly (no compression).
 *
 * Note: We don't compress uploads because Supabase Storage presigned URLs
 * don't support Content-Encoding headers. Most artifacts are already
 * compressed anyway (traces are zip, videos are webm).
 */
export class UploadClient extends BaseClient {
  private readonly concurrency: number;

  constructor(config: UploadClientConfig, logger: LoggerService) {
    super(config, logger);
    this.concurrency = config.concurrency;
  }

  /**
   * Upload multiple artifacts with concurrency control
   */
  async uploadBatch(
    tasks: UploadTask[],
    onProgress?: UploadProgressCallback
  ): Promise<BatchUploadResult> {
    const results: UploadResult[] = [];
    let bytesUploaded = 0;
    let completedCount = 0;

    // Calculate total bytes for progress
    let totalBytes = 0;
    for (const task of tasks) {
      try {
        const stats = await fs.promises.stat(task.filePath);
        totalBytes += stats.size;
      } catch {
        // File might not exist
      }
    }

    // Process tasks with concurrency limit using a simple semaphore
    const queue = [...tasks];
    const inFlight: Promise<void>[] = [];

    const processTask = async (task: UploadTask): Promise<void> => {
      const result = await this.uploadSingle(task);
      results.push(result);

      if (result.success) {
        bytesUploaded += result.bytesUploaded;
      }

      completedCount++;

      if (onProgress) {
        onProgress({
          completedCount,
          totalCount: tasks.length,
          bytesUploaded,
          totalBytes,
        });
      }
    };

    while (queue.length > 0 || inFlight.length > 0) {
      // Start new tasks up to concurrency limit
      while (queue.length > 0 && inFlight.length < this.concurrency) {
        const task = queue.shift()!;
        const promise = processTask(task).then(() => {
          // Remove from inFlight when done
          const index = inFlight.indexOf(promise);
          if (index > -1) {
            // void to silence ESLint - splice returns removed elements array
            void inFlight.splice(index, 1);
          }
        });
        inFlight.push(promise);
      }

      // Wait for at least one to complete
      if (inFlight.length > 0) {
        await Promise.race(inFlight);
      }
    }

    return {
      succeeded: results.filter((r) => r.success),
      failed: results.filter((r) => !r.success),
      totalBytesUploaded: bytesUploaded,
    };
  }

  /**
   * Upload a single artifact to its presigned URL
   *
   * Note: We upload files uncompressed because Supabase Storage presigned URLs
   * don't support Content-Encoding headers (the signature would fail).
   * Most artifacts are already compressed anyway (zip, webm, png).
   */
  private async uploadSingle(task: UploadTask): Promise<UploadResult> {
    const fileName = path.basename(task.filePath);

    try {
      // Check if file exists
      await fs.promises.access(task.filePath);
    } catch {
      this.logger.warn('Artifact file not found', { id: task.id, file: fileName });
      return {
        id: task.id,
        success: false,
        error: `File not found: ${fileName}`,
        bytesUploaded: 0,
      };
    }

    try {
      // Read file directly (no compression for storage uploads)
      const data = await fs.promises.readFile(task.filePath);
      const fileSize = data.length;

      const headers: Record<string, string> = {
        'Content-Type': task.contentType,
        'Content-Length': String(fileSize),
      };

      const result = await this.fetchWithRetry<void>(
        task.uploadUrl,
        {
          method: 'PUT',
          headers,
          body: data,
        },
        () => Promise.resolve(undefined) // No response body expected
      );

      if (result.success) {
        this.logger.verbose('Uploaded artifact', {
          id: task.id,
          file: fileName,
          bytes: fileSize,
        });

        return {
          id: task.id,
          success: true,
          bytesUploaded: fileSize,
        };
      }

      const errorMessage = result.error?.message ?? 'Upload failed';
      this.logger.warn('Failed to upload artifact', {
        id: task.id,
        file: fileName,
        error: errorMessage,
        statusCode: result.error?.statusCode,
        retries: result.retryCount,
      });

      return {
        id: task.id,
        success: false,
        error: errorMessage,
        bytesUploaded: 0,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn('Failed to upload artifact', {
        id: task.id,
        file: fileName,
        error: errorMessage,
      });

      return {
        id: task.id,
        success: false,
        error: errorMessage,
        bytesUploaded: 0,
      };
    }
  }
}
