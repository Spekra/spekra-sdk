import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UploadArtifactsUseCase } from '../../../src/use-cases/upload-artifacts.use-case';
import type { LoggerService, ApiClient } from '@spekra/core';
import type { UploadClient } from '../../../src/infrastructure/clients/upload.client';
import { Artifact } from '../../../src/domain/entities/artifact.entity';

// Mock logger
function createMockLogger(): LoggerService {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    verbose: vi.fn(),
  } as unknown as LoggerService;
}

describe('UploadArtifactsUseCase', () => {
  let logger: LoggerService;
  let uploadClient: UploadClient;
  let apiClient: ApiClient;
  let useCase: UploadArtifactsUseCase;

  beforeEach(() => {
    logger = createMockLogger();
    uploadClient = {
      uploadBatch: vi.fn(),
    } as unknown as UploadClient;
    apiClient = {
      confirmUploads: vi.fn(),
    } as unknown as ApiClient;
    useCase = new UploadArtifactsUseCase(logger, uploadClient, apiClient);
  });

  describe('execute', () => {
    it('should return empty result when no artifacts provided', async () => {
      const result = await useCase.execute({
        artifacts: [],
        uploadUrls: {},
      });

      expect(result.success).toBe(true);
      if (!result.success) throw new Error('Expected success');
      expect(result.data.succeeded).toEqual([]);
      expect(result.data.failed).toEqual([]);
      expect(result.data.totalBytesUploaded).toBe(0);
    });

    it('should skip artifacts without upload URLs', async () => {
      const artifact = Artifact.create({
        type: 'screenshot',
        name: 'screenshot',
        path: '/tmp/screenshot.png',
        contentType: 'image/png',
        size: 1000,
      });

      const result = await useCase.execute({
        artifacts: [artifact],
        uploadUrls: {}, // No URL for artifact
      });

      expect(result.success).toBe(true);
      if (!result.success) throw new Error('Expected success');
      expect(result.data.succeeded).toEqual([]);
      expect(logger.verbose).toHaveBeenCalledWith(
        'Skipped artifacts without upload URLs',
        expect.any(Object)
      );
    });

    it('should upload artifacts with matching URLs', async () => {
      const artifact = Artifact.create({
        type: 'screenshot',
        name: 'screenshot',
        path: '/tmp/screenshot.png',
        contentType: 'image/png',
        size: 1000,
      });

      vi.mocked(uploadClient.uploadBatch).mockResolvedValue({
        succeeded: [{ id: artifact.id, success: true, bytesUploaded: 1000 }],
        failed: [],
        totalBytesUploaded: 1000,
      });

      vi.mocked(apiClient.confirmUploads).mockResolvedValue({
        success: true,
        data: { success: true, confirmed: 1 },
        latencyMs: 10,
        retryCount: 0,
        requestId: 'req-123',
      });

      const result = await useCase.execute({
        artifacts: [artifact],
        uploadUrls: { [artifact.id]: 'https://storage.example.com/upload' },
      });

      expect(result.success).toBe(true);
      if (!result.success) throw new Error('Expected success');
      expect(result.data.succeeded).toEqual([artifact.id]);
      expect(result.data.failed).toEqual([]);
      expect(result.data.totalBytesUploaded).toBe(1000);
    });

    it('should handle upload failures', async () => {
      const artifact = Artifact.create({
        type: 'screenshot',
        name: 'screenshot',
        path: '/tmp/screenshot.png',
        contentType: 'image/png',
        size: 1000,
      });

      vi.mocked(uploadClient.uploadBatch).mockResolvedValue({
        succeeded: [],
        failed: [{ id: artifact.id, success: false, error: 'Upload failed', bytesUploaded: 0 }],
        totalBytesUploaded: 0,
      });

      const result = await useCase.execute({
        artifacts: [artifact],
        uploadUrls: { [artifact.id]: 'https://storage.example.com/upload' },
      });

      expect(result.success).toBe(true); // Use case succeeds even if uploads fail
      if (!result.success) throw new Error('Expected success');
      expect(result.data.failed).toHaveLength(1);
      expect(result.data.failed[0].error).toBe('Upload failed');
      expect(logger.warn).toHaveBeenCalled();
    });

    it('should confirm successful uploads', async () => {
      const artifact = Artifact.create({
        type: 'screenshot',
        name: 'screenshot',
        path: '/tmp/screenshot.png',
        contentType: 'image/png',
        size: 1000,
      });

      vi.mocked(uploadClient.uploadBatch).mockResolvedValue({
        succeeded: [{ id: artifact.id, success: true, bytesUploaded: 1000 }],
        failed: [],
        totalBytesUploaded: 1000,
      });

      vi.mocked(apiClient.confirmUploads).mockResolvedValue({
        success: true,
        data: { success: true, confirmed: 1 },
        latencyMs: 10,
        retryCount: 0,
        requestId: 'req-123',
      });

      await useCase.execute({
        artifacts: [artifact],
        uploadUrls: { [artifact.id]: 'https://storage.example.com/upload' },
      });

      expect(apiClient.confirmUploads).toHaveBeenCalledWith([artifact.id]);
    });

    it('should handle confirm uploads failure gracefully', async () => {
      const artifact = Artifact.create({
        type: 'screenshot',
        name: 'screenshot',
        path: '/tmp/screenshot.png',
        contentType: 'image/png',
        size: 1000,
      });

      vi.mocked(uploadClient.uploadBatch).mockResolvedValue({
        succeeded: [{ id: artifact.id, success: true, bytesUploaded: 1000 }],
        failed: [],
        totalBytesUploaded: 1000,
      });

      vi.mocked(apiClient.confirmUploads).mockResolvedValue({
        success: false,
        error: { type: 'api' as const, message: 'API error', statusCode: 500 },
        latencyMs: 10,
        retryCount: 0,
        requestId: 'req-123',
      });

      const result = await useCase.execute({
        artifacts: [artifact],
        uploadUrls: { [artifact.id]: 'https://storage.example.com/upload' },
      });

      // Should still succeed - uploads are complete, just not confirmed
      expect(result.success).toBe(true);
      expect(logger.warn).toHaveBeenCalledWith('Failed to confirm uploads', expect.any(Object));
    });

    it('should handle confirm uploads exception gracefully', async () => {
      const artifact = Artifact.create({
        type: 'screenshot',
        name: 'screenshot',
        path: '/tmp/screenshot.png',
        contentType: 'image/png',
        size: 1000,
      });

      vi.mocked(uploadClient.uploadBatch).mockResolvedValue({
        succeeded: [{ id: artifact.id, success: true, bytesUploaded: 1000 }],
        failed: [],
        totalBytesUploaded: 1000,
      });

      vi.mocked(apiClient.confirmUploads).mockRejectedValue(new Error('Network error'));

      const result = await useCase.execute({
        artifacts: [artifact],
        uploadUrls: { [artifact.id]: 'https://storage.example.com/upload' },
      });

      expect(result.success).toBe(true);
      expect(logger.warn).toHaveBeenCalledWith('Error confirming uploads', expect.any(Object));
    });

    it('should call progress callback during upload', async () => {
      const artifact = Artifact.create({
        type: 'screenshot',
        name: 'screenshot',
        path: '/tmp/screenshot.png',
        contentType: 'image/png',
        size: 10000,
      });

      // Capture the progress callback
      let capturedCallback: unknown;
      vi.mocked(uploadClient.uploadBatch).mockImplementation(async (_tasks, callback) => {
        capturedCallback = callback;
        // Simulate progress
        if (callback) {
          callback({ completedCount: 1, totalCount: 1, bytesUploaded: 10000, totalBytes: 10000 });
        }
        return {
          succeeded: [{ id: artifact.id, success: true, bytesUploaded: 10000 }],
          failed: [],
          totalBytesUploaded: 10000,
        };
      });

      vi.mocked(apiClient.confirmUploads).mockResolvedValue({
        success: true,
        data: { success: true, confirmed: 1 },
        latencyMs: 10,
        retryCount: 0,
        requestId: 'req-123',
      });

      await useCase.execute({
        artifacts: [artifact],
        uploadUrls: { [artifact.id]: 'https://storage.example.com/upload' },
      });

      expect(capturedCallback).toBeDefined();
      expect(logger.info).toHaveBeenCalled();
    });

    it('should not confirm when no uploads succeeded', async () => {
      const artifact = Artifact.create({
        type: 'screenshot',
        name: 'screenshot',
        path: '/tmp/screenshot.png',
        contentType: 'image/png',
        size: 1000,
      });

      vi.mocked(uploadClient.uploadBatch).mockResolvedValue({
        succeeded: [],
        failed: [{ id: artifact.id, success: false, error: 'Failed', bytesUploaded: 0 }],
        totalBytesUploaded: 0,
      });

      await useCase.execute({
        artifacts: [artifact],
        uploadUrls: { [artifact.id]: 'https://storage.example.com/upload' },
      });

      expect(apiClient.confirmUploads).not.toHaveBeenCalled();
    });

    it('should handle mixed results with failed items having undefined error', async () => {
      const artifact = Artifact.create({
        type: 'screenshot',
        name: 'screenshot',
        path: '/tmp/screenshot.png',
        contentType: 'image/png',
        size: 1000,
      });

      vi.mocked(uploadClient.uploadBatch).mockResolvedValue({
        succeeded: [],
        failed: [{ id: artifact.id, success: false, bytesUploaded: 0 }], // No error message
        totalBytesUploaded: 0,
      });

      const result = await useCase.execute({
        artifacts: [artifact],
        uploadUrls: { [artifact.id]: 'https://storage.example.com/upload' },
      });

      if (!result.success) throw new Error('Expected success');
      expect(result.data.failed[0].error).toBe('Unknown error');
    });

    it('should handle zero-byte artifacts (formatBytes edge case)', async () => {
      const artifact = Artifact.create({
        type: 'screenshot',
        name: 'screenshot',
        path: '/tmp/screenshot.png',
        contentType: 'image/png',
        size: 0, // Zero size
      });

      vi.mocked(uploadClient.uploadBatch).mockResolvedValue({
        succeeded: [{ id: artifact.id, success: true, bytesUploaded: 0 }],
        failed: [],
        totalBytesUploaded: 0,
      });

      vi.mocked(apiClient.confirmUploads).mockResolvedValue({
        success: true,
        data: { success: true, confirmed: 1 },
        latencyMs: 10,
        retryCount: 0,
        requestId: 'req-123',
      });

      const result = await useCase.execute({
        artifacts: [artifact],
        uploadUrls: { [artifact.id]: 'https://storage.example.com/upload' },
      });

      expect(result.success).toBe(true);
      // The formatBytes(0) should return '0 B' and be logged
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('0 B'));
    });

    it('should log progress at 100%', async () => {
      const artifact = Artifact.create({
        type: 'screenshot',
        name: 'screenshot',
        path: '/tmp/screenshot.png',
        contentType: 'image/png',
        size: 1000,
      });

      // Mock to call progress callback with 100%
      vi.mocked(uploadClient.uploadBatch).mockImplementation(async (_tasks, callback) => {
        if (callback) {
          // Call with exactly 100% progress
          callback({ completedCount: 1, totalCount: 1, bytesUploaded: 1000, totalBytes: 1000 });
        }
        return {
          succeeded: [{ id: artifact.id, success: true, bytesUploaded: 1000 }],
          failed: [],
          totalBytesUploaded: 1000,
        };
      });

      vi.mocked(apiClient.confirmUploads).mockResolvedValue({
        success: true,
        data: { success: true, confirmed: 1 },
        latencyMs: 10,
        retryCount: 0,
        requestId: 'req-123',
      });

      await useCase.execute({
        artifacts: [artifact],
        uploadUrls: { [artifact.id]: 'https://storage.example.com/upload' },
      });

      // Should log 100% progress
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('100%'));
    });

    it('should handle confirm uploads returning error with no message', async () => {
      const artifact = Artifact.create({
        type: 'screenshot',
        name: 'screenshot',
        path: '/tmp/screenshot.png',
        contentType: 'image/png',
        size: 1000,
      });

      vi.mocked(uploadClient.uploadBatch).mockResolvedValue({
        succeeded: [{ id: artifact.id, success: true, bytesUploaded: 1000 }],
        failed: [],
        totalBytesUploaded: 1000,
      });

      vi.mocked(apiClient.confirmUploads).mockResolvedValue({
        success: false,
        error: undefined, // No error object
        latencyMs: 10,
        retryCount: 0,
        requestId: 'req-123',
      });

      const result = await useCase.execute({
        artifacts: [artifact],
        uploadUrls: { [artifact.id]: 'https://storage.example.com/upload' },
      });

      expect(result.success).toBe(true);
      expect(logger.warn).toHaveBeenCalledWith(
        'Failed to confirm uploads',
        expect.objectContaining({ error: 'Unknown error' })
      );
    });

    it('should handle confirm uploads throwing non-Error', async () => {
      const artifact = Artifact.create({
        type: 'screenshot',
        name: 'screenshot',
        path: '/tmp/screenshot.png',
        contentType: 'image/png',
        size: 1000,
      });

      vi.mocked(uploadClient.uploadBatch).mockResolvedValue({
        succeeded: [{ id: artifact.id, success: true, bytesUploaded: 1000 }],
        failed: [],
        totalBytesUploaded: 1000,
      });

      vi.mocked(apiClient.confirmUploads).mockRejectedValue('string error');

      const result = await useCase.execute({
        artifacts: [artifact],
        uploadUrls: { [artifact.id]: 'https://storage.example.com/upload' },
      });

      expect(result.success).toBe(true);
      expect(logger.warn).toHaveBeenCalledWith(
        'Error confirming uploads',
        expect.objectContaining({ error: 'Unknown error' })
      );
    });
  });
});
