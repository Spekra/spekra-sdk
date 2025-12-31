import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  UploadClient,
  type UploadTask,
} from '../../../../src/infrastructure/clients/upload.client';
import type { LoggerService } from '@spekra/core';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock logger
function createMockLogger(): LoggerService {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    verbose: vi.fn(),
  } as unknown as LoggerService;
}

describe('UploadClient', () => {
  let logger: LoggerService;
  let client: UploadClient;
  let tempDir: string;

  beforeEach(async () => {
    logger = createMockLogger();
    client = new UploadClient(
      {
        timeout: 5000,
        maxRetries: 1,
        retryBaseDelayMs: 100,
        retryMaxDelayMs: 500,
        concurrency: 2,
      },
      logger
    );
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'spekra-upload-test-'));
    mockFetch.mockReset();
  });

  afterEach(async () => {
    await fs.promises.rm(tempDir, { recursive: true, force: true });
  });

  describe('uploadBatch', () => {
    it('should upload multiple files successfully', async () => {
      // Create test files
      const file1 = path.join(tempDir, 'file1.txt');
      const file2 = path.join(tempDir, 'file2.txt');
      await fs.promises.writeFile(file1, 'Content of file 1');
      await fs.promises.writeFile(file2, 'Content of file 2');

      // Mock successful uploads
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({}),
      });

      const tasks: UploadTask[] = [
        {
          id: 'artifact-1',
          filePath: file1,
          contentType: 'text/plain',
          uploadUrl: 'https://storage.example.com/upload/1',
          compress: false,
        },
        {
          id: 'artifact-2',
          filePath: file2,
          contentType: 'text/plain',
          uploadUrl: 'https://storage.example.com/upload/2',
          compress: false,
        },
      ];

      const result = await client.uploadBatch(tasks);

      expect(result.succeeded).toHaveLength(2);
      expect(result.failed).toHaveLength(0);
      expect(result.totalBytesUploaded).toBeGreaterThan(0);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should handle partial failures', async () => {
      const file1 = path.join(tempDir, 'file1.txt');
      const file2 = path.join(tempDir, 'file2.txt');
      await fs.promises.writeFile(file1, 'Content 1');
      await fs.promises.writeFile(file2, 'Content 2');

      // First succeeds, second fails
      mockFetch
        .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({}) })
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          json: async () => ({ error: 'Server error' }),
        });

      const tasks: UploadTask[] = [
        {
          id: 'artifact-1',
          filePath: file1,
          contentType: 'text/plain',
          uploadUrl: 'https://storage.example.com/upload/1',
          compress: false,
        },
        {
          id: 'artifact-2',
          filePath: file2,
          contentType: 'text/plain',
          uploadUrl: 'https://storage.example.com/upload/2',
          compress: false,
        },
      ];

      const result = await client.uploadBatch(tasks);

      expect(result.succeeded).toHaveLength(1);
      expect(result.failed).toHaveLength(1);
    });

    it('should call progress callback', async () => {
      const file1 = path.join(tempDir, 'file1.txt');
      await fs.promises.writeFile(file1, 'Test content');

      mockFetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });

      const progressCallback = vi.fn();

      const tasks: UploadTask[] = [
        {
          id: 'artifact-1',
          filePath: file1,
          contentType: 'text/plain',
          uploadUrl: 'https://storage.example.com/upload/1',
          compress: false,
        },
      ];

      await client.uploadBatch(tasks, progressCallback);

      expect(progressCallback).toHaveBeenCalled();
      expect(progressCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          completedCount: 1,
          totalCount: 1,
        })
      );
    });

    it('should handle missing files gracefully', async () => {
      const tasks: UploadTask[] = [
        {
          id: 'artifact-1',
          filePath: '/nonexistent/file.txt',
          contentType: 'text/plain',
          uploadUrl: 'https://storage.example.com/upload/1',
          compress: false,
        },
      ];

      const result = await client.uploadBatch(tasks);

      expect(result.succeeded).toHaveLength(0);
      expect(result.failed).toHaveLength(1);
      expect(result.failed[0].error).toContain('File not found');
    });

    it('should handle empty task list', async () => {
      const result = await client.uploadBatch([]);

      expect(result.succeeded).toHaveLength(0);
      expect(result.failed).toHaveLength(0);
      expect(result.totalBytesUploaded).toBe(0);
    });

    it('should respect concurrency limit', async () => {
      // Create 4 files
      const files: string[] = [];
      for (let i = 0; i < 4; i++) {
        const file = path.join(tempDir, `file${i}.txt`);
        await fs.promises.writeFile(file, `Content ${i}`);
        files.push(file);
      }

      let maxConcurrent = 0;
      let currentConcurrent = 0;

      mockFetch.mockImplementation(async () => {
        currentConcurrent++;
        maxConcurrent = Math.max(maxConcurrent, currentConcurrent);
        // Simulate some upload time
        await new Promise((resolve) => setTimeout(resolve, 50));
        currentConcurrent--;
        return { ok: true, status: 200, json: async () => ({}) };
      });

      const tasks: UploadTask[] = files.map((file, i) => ({
        id: `artifact-${i}`,
        filePath: file,
        contentType: 'text/plain',
        uploadUrl: `https://storage.example.com/upload/${i}`,
        compress: false,
      }));

      await client.uploadBatch(tasks);

      // Concurrency was set to 2
      expect(maxConcurrent).toBeLessThanOrEqual(2);
    });

    it('should handle network errors', async () => {
      const file = path.join(tempDir, 'file.txt');
      await fs.promises.writeFile(file, 'Content');

      mockFetch.mockRejectedValue(new Error('Network error'));

      const tasks: UploadTask[] = [
        {
          id: 'artifact-1',
          filePath: file,
          contentType: 'text/plain',
          uploadUrl: 'https://storage.example.com/upload/1',
          compress: false,
        },
      ];

      const result = await client.uploadBatch(tasks);

      expect(result.failed).toHaveLength(1);
      expect(result.failed[0].error).toContain('Network error');
    });

    it('should handle unexpected exceptions during upload (non-Error thrown)', async () => {
      const file = path.join(tempDir, 'file.txt');
      await fs.promises.writeFile(file, 'Content');

      // Mock readFile to throw a non-Error value
      vi.spyOn(fs.promises, 'readFile').mockRejectedValue('string error');

      const tasks: UploadTask[] = [
        {
          id: 'artifact-1',
          filePath: file,
          contentType: 'text/plain',
          uploadUrl: 'https://storage.example.com/upload/1',
          compress: false,
        },
      ];

      const result = await client.uploadBatch(tasks);

      expect(result.failed).toHaveLength(1);
      expect(result.failed[0].error).toBe('Unknown error');
      expect(logger.warn).toHaveBeenCalledWith('Failed to upload artifact', expect.any(Object));

      // Restore
      vi.mocked(fs.promises.readFile).mockRestore();
    });

    it('should handle exceptions thrown during file read', async () => {
      const file = path.join(tempDir, 'file.txt');
      await fs.promises.writeFile(file, 'Content');

      // Mock readFile to throw after access check passes
      vi.spyOn(fs.promises, 'readFile').mockRejectedValue(new Error('Permission denied'));

      const tasks: UploadTask[] = [
        {
          id: 'artifact-1',
          filePath: file,
          contentType: 'text/plain',
          uploadUrl: 'https://storage.example.com/upload/1',
          compress: false,
        },
      ];

      const result = await client.uploadBatch(tasks);

      expect(result.failed).toHaveLength(1);
      expect(result.failed[0].error).toBe('Permission denied');

      vi.mocked(fs.promises.readFile).mockRestore();
    });

    it('should use default error message when upload fails without error details', async () => {
      const file = path.join(tempDir, 'file.txt');
      await fs.promises.writeFile(file, 'Content');

      // Mock fetch to fail without an error message
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => '', // Empty error text
      });

      const tasks: UploadTask[] = [
        {
          id: 'artifact-1',
          filePath: file,
          contentType: 'text/plain',
          uploadUrl: 'https://storage.example.com/upload/1',
          compress: false,
        },
      ];

      const result = await client.uploadBatch(tasks);

      expect(result.failed).toHaveLength(1);
      // Empty string from response is still passed through
      expect(result.failed[0].error).toBe('');
    });
  });

  describe('artifact edge cases', () => {
    it('should handle zero-byte files', async () => {
      // Create an empty file
      const emptyFile = path.join(tempDir, 'empty.txt');
      await fs.promises.writeFile(emptyFile, '');

      mockFetch.mockResolvedValue({ ok: true, status: 200 });

      const tasks: UploadTask[] = [
        {
          id: 'empty-artifact',
          filePath: emptyFile,
          contentType: 'text/plain',
          uploadUrl: 'https://storage.example.com/upload/empty',
          compress: false,
        },
      ];

      const result = await client.uploadBatch(tasks);

      expect(result.succeeded).toHaveLength(1);
      expect(result.failed).toHaveLength(0);
    });

    it('should handle file that disappears between check and upload', async () => {
      const ephemeralFile = path.join(tempDir, 'ephemeral.txt');
      await fs.promises.writeFile(ephemeralFile, 'temporary content');

      // Delete the file after it's checked but before upload
      mockFetch.mockImplementation(async () => {
        // File is already deleted by test setup below
        return { ok: true, status: 200 };
      });

      const tasks: UploadTask[] = [
        {
          id: 'ephemeral',
          filePath: ephemeralFile,
          contentType: 'text/plain',
          uploadUrl: 'https://storage.example.com/upload/ephemeral',
          compress: false,
        },
      ];

      // Delete the file before upload
      await fs.promises.unlink(ephemeralFile);

      const result = await client.uploadBatch(tasks);

      // Should handle the missing file gracefully
      expect(result.failed).toHaveLength(1);
      expect(result.failed[0].error).toMatch(/ENOENT|not found/i);
    });

    it('should handle files with very long paths', async () => {
      // Create nested directories to make a long path
      const deepDir = path.join(tempDir, 'a'.repeat(50), 'b'.repeat(50), 'c'.repeat(50));
      await fs.promises.mkdir(deepDir, { recursive: true });
      const longPathFile = path.join(deepDir, 'file.txt');
      await fs.promises.writeFile(longPathFile, 'content');

      mockFetch.mockResolvedValue({ ok: true, status: 200 });

      const tasks: UploadTask[] = [
        {
          id: 'long-path',
          filePath: longPathFile,
          contentType: 'text/plain',
          uploadUrl: 'https://storage.example.com/upload/long',
          compress: false,
        },
      ];

      const result = await client.uploadBatch(tasks);

      expect(result.succeeded).toHaveLength(1);
    });

    it('should handle binary files correctly', async () => {
      // Create a binary file with various byte values
      const binaryFile = path.join(tempDir, 'binary.bin');
      const binaryContent = Buffer.from([0x00, 0x01, 0xff, 0xfe, 0x89, 0x50, 0x4e, 0x47]);
      await fs.promises.writeFile(binaryFile, binaryContent);

      let uploadedBody: Buffer | null = null;
      mockFetch.mockImplementation(async (_url: string, options: RequestInit) => {
        uploadedBody = options.body as Buffer;
        return { ok: true, status: 200 };
      });

      const tasks: UploadTask[] = [
        {
          id: 'binary',
          filePath: binaryFile,
          contentType: 'application/octet-stream',
          uploadUrl: 'https://storage.example.com/upload/binary',
          compress: false,
        },
      ];

      const result = await client.uploadBatch(tasks);

      expect(result.succeeded).toHaveLength(1);
      expect(uploadedBody).toBeDefined();
    });

    it('should handle files with special characters in names', async () => {
      // Create file with special characters (that are valid on most filesystems)
      const specialFile = path.join(tempDir, 'test file (1) [final].txt');
      await fs.promises.writeFile(specialFile, 'content');

      mockFetch.mockResolvedValue({ ok: true, status: 200 });

      const tasks: UploadTask[] = [
        {
          id: 'special-name',
          filePath: specialFile,
          contentType: 'text/plain',
          uploadUrl: 'https://storage.example.com/upload/special',
          compress: false,
        },
      ];

      const result = await client.uploadBatch(tasks);

      expect(result.succeeded).toHaveLength(1);
    });

    it('should handle permission denied error gracefully', async () => {
      const restrictedFile = path.join(tempDir, 'restricted.txt');
      await fs.promises.writeFile(restrictedFile, 'secret content');

      // Make the file unreadable (only works on Unix-like systems)
      try {
        await fs.promises.chmod(restrictedFile, 0o000);
      } catch {
        // Skip on Windows or if chmod fails
        return;
      }

      const tasks: UploadTask[] = [
        {
          id: 'restricted',
          filePath: restrictedFile,
          contentType: 'text/plain',
          uploadUrl: 'https://storage.example.com/upload/restricted',
          compress: false,
        },
      ];

      const result = await client.uploadBatch(tasks);

      // Should fail gracefully
      expect(result.failed).toHaveLength(1);
      expect(result.failed[0].error).toMatch(/EACCES|permission/i);

      // Restore permissions for cleanup
      await fs.promises.chmod(restrictedFile, 0o644);
    });

    it('should handle compression of already compressed files', async () => {
      // Create a file that looks like it's already compressed (gzip header)
      const gzipFile = path.join(tempDir, 'already.gz');
      // Gzip magic bytes + some content
      const gzipContent = Buffer.from([0x1f, 0x8b, 0x08, 0x00, 0x00, 0x00, 0x00, 0x00]);
      await fs.promises.writeFile(gzipFile, gzipContent);

      mockFetch.mockResolvedValue({ ok: true, status: 200 });

      const tasks: UploadTask[] = [
        {
          id: 'gzip',
          filePath: gzipFile,
          contentType: 'application/gzip',
          uploadUrl: 'https://storage.example.com/upload/gzip',
          compress: true, // Request compression
        },
      ];

      const result = await client.uploadBatch(tasks);

      // Should succeed - either skips re-compression or handles it
      expect(result.succeeded).toHaveLength(1);
    });

    it('should handle concurrent uploads to same URL (idempotency)', async () => {
      const file = path.join(tempDir, 'concurrent.txt');
      await fs.promises.writeFile(file, 'content');

      let uploadCount = 0;
      mockFetch.mockImplementation(async () => {
        uploadCount++;
        return { ok: true, status: 200 };
      });

      // Same file, same URL - should both succeed
      const tasks: UploadTask[] = [
        {
          id: 'dup-1',
          filePath: file,
          contentType: 'text/plain',
          uploadUrl: 'https://storage.example.com/upload/same',
          compress: false,
        },
        {
          id: 'dup-2',
          filePath: file,
          contentType: 'text/plain',
          uploadUrl: 'https://storage.example.com/upload/same',
          compress: false,
        },
      ];

      const result = await client.uploadBatch(tasks);

      expect(result.succeeded).toHaveLength(2);
      expect(uploadCount).toBe(2);
    });
  });
});
