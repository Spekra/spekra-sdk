import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CompressionService } from '../../../../src/infrastructure/services/compression.service';
import { LoggerService } from '../../../../src/infrastructure/services/logger.service';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Mock logger
function createMockLogger(): LoggerService {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    verbose: vi.fn(),
  } as unknown as LoggerService;
}

describe('CompressionService', () => {
  let logger: LoggerService;
  let service: CompressionService;
  let tempDir: string;

  beforeEach(async () => {
    logger = createMockLogger();
    service = new CompressionService(logger);
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'spekra-test-'));
  });

  afterEach(async () => {
    // Clean up temp directory
    await fs.promises.rm(tempDir, { recursive: true, force: true });
  });

  describe('isPreCompressed', () => {
    it('should detect pre-compressed content types', () => {
      expect(service.isPreCompressed('application/zip', 'file.txt')).toBe(true);
      expect(service.isPreCompressed('application/gzip', 'file.txt')).toBe(true);
      expect(service.isPreCompressed('application/x-gzip', 'file.txt')).toBe(true);
      expect(service.isPreCompressed('video/webm', 'file.txt')).toBe(true);
      expect(service.isPreCompressed('video/mp4', 'file.txt')).toBe(true);
      expect(service.isPreCompressed('image/webp', 'file.txt')).toBe(true);
    });

    it('should detect pre-compressed file extensions', () => {
      expect(service.isPreCompressed('application/octet-stream', 'file.zip')).toBe(true);
      expect(service.isPreCompressed('application/octet-stream', 'file.gz')).toBe(true);
      expect(service.isPreCompressed('application/octet-stream', 'file.tar.gz')).toBe(true);
      expect(service.isPreCompressed('application/octet-stream', 'file.tgz')).toBe(true);
      expect(service.isPreCompressed('application/octet-stream', 'file.webm')).toBe(true);
      expect(service.isPreCompressed('application/octet-stream', 'video.mp4')).toBe(true);
    });

    it('should be case-insensitive for extensions', () => {
      expect(service.isPreCompressed('application/octet-stream', 'FILE.ZIP')).toBe(true);
      expect(service.isPreCompressed('application/octet-stream', 'Video.MP4')).toBe(true);
    });

    it('should return false for non-compressed files', () => {
      expect(service.isPreCompressed('text/plain', 'file.txt')).toBe(false);
      expect(service.isPreCompressed('image/png', 'image.png')).toBe(false);
      expect(service.isPreCompressed('application/json', 'data.json')).toBe(false);
    });
  });

  describe('compressFile', () => {
    it('should compress a text file', async () => {
      const filePath = path.join(tempDir, 'test.txt');
      const content = 'Hello World! '.repeat(1000); // Repetitive content compresses well
      await fs.promises.writeFile(filePath, content);

      const result = await service.compressFile(filePath, 'text/plain');

      expect(result.wasCompressed).toBe(true);
      expect(result.contentEncoding).toBe('gzip');
      expect(result.originalPath).toBe(filePath);
      expect(result.originalSize).toBe(content.length);
      expect(result.finalSize).toBeLessThan(result.originalSize);
    });

    it('should skip compression for pre-compressed files', async () => {
      const filePath = path.join(tempDir, 'test.zip');
      const content = Buffer.from([0x50, 0x4b, 0x03, 0x04]); // ZIP magic bytes
      await fs.promises.writeFile(filePath, content);

      const result = await service.compressFile(filePath, 'application/zip');

      expect(result.wasCompressed).toBe(false);
      expect(result.contentEncoding).toBeNull();
      expect(result.originalSize).toBe(content.length);
      expect(result.finalSize).toBe(content.length);
      expect(result.data).toEqual(content);
    });

    it('should skip compression based on extension', async () => {
      const filePath = path.join(tempDir, 'video.mp4');
      const content = Buffer.from([0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70]); // MP4 magic
      await fs.promises.writeFile(filePath, content);

      const result = await service.compressFile(filePath, 'application/octet-stream');

      expect(result.wasCompressed).toBe(false);
    });
  });

  describe('compressData', () => {
    it('should compress a string', () => {
      const data = 'Hello World! '.repeat(100);
      const compressed = service.compressData(data);

      expect(Buffer.isBuffer(compressed)).toBe(true);
      expect(compressed.length).toBeLessThan(data.length);
    });

    it('should compress a buffer', () => {
      const data = Buffer.from('Test data '.repeat(100));
      const compressed = service.compressData(data);

      expect(Buffer.isBuffer(compressed)).toBe(true);
      expect(compressed.length).toBeLessThan(data.length);
    });
  });

  describe('calculateTotalSize', () => {
    it('should calculate total size of files', async () => {
      const file1 = path.join(tempDir, 'file1.txt');
      const file2 = path.join(tempDir, 'file2.txt');
      await fs.promises.writeFile(file1, 'Hello');
      await fs.promises.writeFile(file2, 'World!');

      const total = await service.calculateTotalSize([file1, file2]);

      expect(total).toBe(11); // 5 + 6
    });

    it('should skip non-existent files', async () => {
      const file1 = path.join(tempDir, 'exists.txt');
      const file2 = path.join(tempDir, 'does-not-exist.txt');
      await fs.promises.writeFile(file1, 'Hello');

      const total = await service.calculateTotalSize([file1, file2]);

      expect(total).toBe(5);
      expect(logger.verbose).toHaveBeenCalled();
    });

    it('should return 0 for empty array', async () => {
      const total = await service.calculateTotalSize([]);
      expect(total).toBe(0);
    });
  });

  describe('formatBytes', () => {
    it('should format 0 bytes', () => {
      expect(service.formatBytes(0)).toBe('0 B');
    });

    it('should format bytes', () => {
      expect(service.formatBytes(500)).toBe('500 B');
    });

    it('should format kilobytes', () => {
      expect(service.formatBytes(1024)).toBe('1.0 KB');
      expect(service.formatBytes(1536)).toBe('1.5 KB');
    });

    it('should format megabytes', () => {
      expect(service.formatBytes(1024 * 1024)).toBe('1.0 MB');
      expect(service.formatBytes(2.5 * 1024 * 1024)).toBe('2.5 MB');
    });

    it('should format gigabytes', () => {
      expect(service.formatBytes(1024 * 1024 * 1024)).toBe('1.0 GB');
    });
  });
});
