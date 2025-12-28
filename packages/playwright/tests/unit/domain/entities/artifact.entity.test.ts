import { describe, it, expect } from 'vitest';
import { Artifact } from '../../../../src/domain/entities/artifact.entity';

describe('Artifact', () => {
  describe('create', () => {
    it('should create an artifact with generated id', () => {
      const artifact = Artifact.create({
        type: 'screenshot',
        name: 'test-screenshot',
        path: '/tmp/screenshot.png',
        contentType: 'image/png',
        size: 1024,
      });

      expect(artifact.id).toBeDefined();
      expect(artifact.id.length).toBeGreaterThan(0);
      expect(artifact.type).toBe('screenshot');
      expect(artifact.name).toBe('test-screenshot');
      expect(artifact.path).toBe('/tmp/screenshot.png');
      expect(artifact.contentType).toBe('image/png');
      expect(artifact.size).toBe(1024);
    });

    it('should detect pre-compressed files by content type', () => {
      const zipArtifact = Artifact.create({
        type: 'trace',
        name: 'trace',
        path: '/tmp/trace.zip',
        contentType: 'application/zip',
        size: 5000,
      });

      expect(zipArtifact.isPreCompressed).toBe(true);
    });

    it('should detect pre-compressed video files', () => {
      const videoArtifact = Artifact.create({
        type: 'video',
        name: 'video',
        path: '/tmp/video.webm',
        contentType: 'video/webm',
        size: 10000,
      });

      expect(videoArtifact.isPreCompressed).toBe(true);
    });

    it('should detect pre-compressed files by extension', () => {
      const mp4Artifact = Artifact.create({
        type: 'video',
        name: 'video',
        path: '/tmp/video.mp4',
        contentType: 'application/octet-stream',
        size: 10000,
      });

      expect(mp4Artifact.isPreCompressed).toBe(true);
    });

    it('should mark non-compressed files correctly', () => {
      const pngArtifact = Artifact.create({
        type: 'screenshot',
        name: 'screenshot',
        path: '/tmp/image.png',
        contentType: 'image/png',
        size: 2000,
      });

      expect(pngArtifact.isPreCompressed).toBe(false);
    });
  });

  describe('inferType', () => {
    it('should infer trace type', () => {
      expect(Artifact.inferType('trace', 'application/zip')).toBe('trace');
      expect(Artifact.inferType('something', 'application/zip')).toBe('trace');
    });

    it('should infer screenshot type', () => {
      expect(Artifact.inferType('screenshot', 'image/png')).toBe('screenshot');
      expect(Artifact.inferType('my-image', 'image/jpeg')).toBe('screenshot');
    });

    it('should infer video type', () => {
      expect(Artifact.inferType('video', 'video/webm')).toBe('video');
      expect(Artifact.inferType('recording', 'video/mp4')).toBe('video');
    });

    it('should default to attachment for unknown types', () => {
      expect(Artifact.inferType('data', 'application/json')).toBe('attachment');
      expect(Artifact.inferType('custom', 'text/plain')).toBe('attachment');
    });
  });

  describe('toMetadata', () => {
    it('should convert to API metadata without path', () => {
      const artifact = Artifact.create({
        type: 'screenshot',
        name: 'screenshot',
        path: '/local/path/screenshot.png',
        contentType: 'image/png',
        size: 1500,
      });

      const metadata = artifact.toMetadata();

      expect(metadata.id).toBe(artifact.id);
      expect(metadata.type).toBe('screenshot');
      expect(metadata.name).toBe('screenshot');
      expect(metadata.contentType).toBe('image/png');
      expect(metadata.size).toBe(1500);
      expect(metadata.compressed).toBe(false);
      expect('path' in metadata).toBe(false);
    });

    it('should reflect compression status in metadata', () => {
      const artifact = Artifact.create({
        type: 'trace',
        name: 'trace',
        path: '/tmp/trace.zip',
        contentType: 'application/zip',
        size: 5000,
      });

      const metadata = artifact.toMetadata();
      expect(metadata.compressed).toBe(true);
    });
  });

  describe('pre-compressed detection edge cases', () => {
    it('should detect gzip content type', () => {
      const artifact = Artifact.create({
        type: 'attachment',
        name: 'data.gz',
        path: '/tmp/data.gz',
        contentType: 'application/gzip',
        size: 100,
      });
      expect(artifact.isPreCompressed).toBe(true);
    });

    it('should detect x-gzip content type', () => {
      const artifact = Artifact.create({
        type: 'attachment',
        name: 'data',
        path: '/tmp/data',
        contentType: 'application/x-gzip',
        size: 100,
      });
      expect(artifact.isPreCompressed).toBe(true);
    });

    it('should detect webp images as pre-compressed', () => {
      const artifact = Artifact.create({
        type: 'screenshot',
        name: 'image',
        path: '/tmp/image.webp',
        contentType: 'image/webp',
        size: 100,
      });
      expect(artifact.isPreCompressed).toBe(true);
    });

    it('should detect mp4 by extension', () => {
      const artifact = Artifact.create({
        type: 'video',
        name: 'video',
        path: '/tmp/video.mp4',
        contentType: 'video/mp4',
        size: 100,
      });
      expect(artifact.isPreCompressed).toBe(true);
    });
  });
});
