import { gzipSync } from 'zlib';
import * as fs from 'fs';
import * as path from 'path';
import { BaseService, LoggerService } from '@spekra/core';

/**
 * Result of compression operation
 */
export interface CompressionResult {
  /** Original file path */
  originalPath: string;
  /** Compressed data buffer (or original if already compressed) */
  data: Buffer;
  /** Original size in bytes */
  originalSize: number;
  /** Final size in bytes (after compression if applied) */
  finalSize: number;
  /** Whether compression was applied */
  wasCompressed: boolean;
  /** Content-Encoding header value (if compressed) */
  contentEncoding: string | null;
}

/**
 * Content types that are already compressed
 */
const PRE_COMPRESSED_CONTENT_TYPES = new Set([
  'application/zip',
  'application/gzip',
  'application/x-gzip',
  'application/x-tar',
  'application/x-bzip2',
  'video/webm',
  'video/mp4',
  'video/avi',
  'image/webp',
  'audio/mp3',
  'audio/mpeg',
]);

/**
 * File extensions that indicate pre-compressed content
 */
const PRE_COMPRESSED_EXTENSIONS = new Set([
  '.zip',
  '.gz',
  '.gzip',
  '.tar.gz',
  '.tgz',
  '.bz2',
  '.webm',
  '.mp4',
  '.avi',
  '.webp',
  '.mp3',
]);

/**
 * Handles gzip compression for artifacts that aren't already compressed.
 * Detects pre-compressed files and passes them through unchanged.
 */
export class CompressionService extends BaseService {
  constructor(logger: LoggerService) {
    super(logger);
  }

  /**
   * Check if a file is already compressed based on content type or extension
   */
  isPreCompressed(contentType: string, filePath: string): boolean {
    if (PRE_COMPRESSED_CONTENT_TYPES.has(contentType)) {
      return true;
    }

    const lowerPath = filePath.toLowerCase();
    for (const ext of PRE_COMPRESSED_EXTENSIONS) {
      if (lowerPath.endsWith(ext)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Compress a file if it's not already compressed
   *
   * @param filePath - Path to the file to compress
   * @param contentType - MIME type of the file
   * @returns Compression result with data buffer and metadata
   */
  async compressFile(filePath: string, contentType: string): Promise<CompressionResult> {
    const data = await fs.promises.readFile(filePath);
    const originalSize = data.length;

    if (this.isPreCompressed(contentType, filePath)) {
      this.logger.verbose('Skipping compression for pre-compressed file', {
        file: path.basename(filePath),
        contentType,
        size: originalSize,
      });

      return {
        originalPath: filePath,
        data,
        originalSize,
        finalSize: originalSize,
        wasCompressed: false,
        contentEncoding: null,
      };
    }

    // Apply gzip compression
    const compressed = gzipSync(data);
    const compressionRatio = ((1 - compressed.length / originalSize) * 100).toFixed(1);

    this.logger.verbose('Compressed file', {
      file: path.basename(filePath),
      originalSize,
      compressedSize: compressed.length,
      ratio: `${compressionRatio}%`,
    });

    return {
      originalPath: filePath,
      data: compressed,
      originalSize,
      finalSize: compressed.length,
      wasCompressed: true,
      contentEncoding: 'gzip',
    };
  }

  /**
   * Compress raw data (Buffer or string)
   */
  compressData(data: Buffer | string): Buffer {
    const buffer = typeof data === 'string' ? Buffer.from(data, 'utf-8') : data;
    return gzipSync(buffer);
  }

  /**
   * Calculate total size of files (for progress tracking)
   *
   * @param filePaths - Array of file paths
   * @returns Total size in bytes
   */
  async calculateTotalSize(filePaths: string[]): Promise<number> {
    let total = 0;
    for (const filePath of filePaths) {
      try {
        const stats = await fs.promises.stat(filePath);
        total += stats.size;
      } catch {
        // File might not exist, skip it
        this.logger.verbose('Could not stat file for size calculation', { file: filePath });
      }
    }
    return total;
  }

  /**
   * Format bytes as human-readable string
   */
  formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';

    const units = ['B', 'KB', 'MB', 'GB'];
    const k = 1024;
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    const value = bytes / Math.pow(k, i);

    return `${value.toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
  }
}
