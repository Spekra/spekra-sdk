import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RunMetadataService } from '../../../../src/infrastructure/services/run-metadata.service';
import { CIService } from '../../../../src/infrastructure/services/ci.service';
import { GitService } from '../../../../src/infrastructure/services/git.service';
import type { FullConfig } from '@playwright/test/reporter';
import type { CIProvider } from '../../../../src/types';

// Mock the services
vi.mock('../../../../src/infrastructure/services/ci.service');
vi.mock('../../../../src/infrastructure/services/git.service');

describe('RunMetadataService', () => {
  let mockCIService: CIService;
  let mockGitService: GitService;
  let service: RunMetadataService;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    // Save environment
    originalEnv = { ...process.env };

    // Clear relevant env vars
    delete process.env.TEST_RUN_ID;
    delete process.env.TEST_SHARD_INDEX;
    delete process.env.TEST_TOTAL_SHARDS;

    // Setup mocks
    mockCIService = {
      getCIInfo: vi.fn().mockReturnValue({
        provider: null,
        url: null,
        branch: null,
        commitSha: null,
        runId: null,
      }),
      isCI: vi.fn().mockReturnValue(false),
    } as unknown as CIService;

    mockGitService = {
      getGitInfoAsync: vi.fn().mockResolvedValue({
        branch: 'main',
        commitSha: 'abc123',
      }),
      getBranch: vi.fn().mockResolvedValue('main'),
      getCommitSha: vi.fn().mockResolvedValue('abc123'),
    } as unknown as GitService;

    vi.mocked(CIService.instance).mockReturnValue(mockCIService);
    vi.mocked(GitService.instance).mockReturnValue(mockGitService);

    service = new RunMetadataService(mockCIService, mockGitService);
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.resetAllMocks();
  });

  describe('initialize', () => {
    it('should initialize with basic config', () => {
      const config = { shard: null } as unknown as FullConfig;

      service.initialize(config, 'test-source');

      expect(service.getRunId()).toMatch(/^run-/);
    });

    it('should use TEST_RUN_ID env var when set', () => {
      process.env.TEST_RUN_ID = 'custom-run-id';
      const config = { shard: null } as unknown as FullConfig;

      service.initialize(config, 'test-source');

      expect(service.getRunId()).toBe('custom-run-id');
    });

    it('should use CI run ID when available', () => {
      vi.mocked(mockCIService.getCIInfo).mockReturnValue({
        provider: 'github-actions',
        url: 'https://github.com',
        branch: 'main',
        commitSha: 'abc123',
        runId: '12345',
      });
      const config = { shard: null } as unknown as FullConfig;

      service.initialize(config, 'test-source');

      expect(service.getRunId()).toBe('ci-12345');
    });

    it('should extract shard info from config', () => {
      const config = { shard: { current: 1, total: 3 } } as unknown as FullConfig;

      service.initialize(config, 'test-source');

      expect(service.getShardInfo()).toEqual({ index: 1, total: 3 });
    });

    it('should extract shard info from env vars', () => {
      process.env.TEST_SHARD_INDEX = '2';
      process.env.TEST_TOTAL_SHARDS = '4';
      const config = { shard: null } as unknown as FullConfig;

      service.initialize(config, 'test-source');

      expect(service.getShardInfo()).toEqual({ index: 2, total: 4 });
    });

    it('should ignore invalid shard env vars', () => {
      process.env.TEST_SHARD_INDEX = 'not-a-number';
      process.env.TEST_TOTAL_SHARDS = '4';
      const config = { shard: null } as unknown as FullConfig;

      service.initialize(config, 'test-source');

      expect(service.getShardInfo()).toEqual({ index: null, total: null });
    });

    it('should ignore zero or negative shard values', () => {
      process.env.TEST_SHARD_INDEX = '0';
      process.env.TEST_TOTAL_SHARDS = '-1';
      const config = { shard: null } as unknown as FullConfig;

      service.initialize(config, 'test-source');

      expect(service.getShardInfo()).toEqual({ index: null, total: null });
    });
  });

  describe('ensureGitInfo', () => {
    it('should wait for git info', async () => {
      const config = { shard: null } as unknown as FullConfig;
      service.initialize(config, 'test-source');

      await service.ensureGitInfo();

      // Git info should be fetched
      expect(mockGitService.getGitInfoAsync).toHaveBeenCalled();
    });

    it('should swallow git info errors', async () => {
      vi.mocked(mockGitService.getGitInfoAsync).mockRejectedValue(new Error('Git error'));
      const config = { shard: null } as unknown as FullConfig;
      service.initialize(config, 'test-source');

      // Should not throw
      await expect(service.ensureGitInfo()).resolves.toBeUndefined();
    });
  });

  describe('buildMetadata', () => {
    it('should build complete metadata', async () => {
      vi.mocked(mockCIService.getCIInfo).mockReturnValue({
        provider: 'github-actions',
        url: 'https://github.com/run/123',
        branch: 'ci-branch',
        commitSha: 'ci-sha',
        runId: '123',
      });
      const config = { shard: { current: 1, total: 2 } } as unknown as FullConfig;
      service.initialize(config, 'my-source');

      const metadata = await service.buildMetadata();

      expect(metadata.runId).toBe('ci-123');
      expect(metadata.source).toBe('my-source');
      expect(metadata.branch).toBe('ci-branch');
      expect(metadata.commitSha).toBe('ci-sha');
      expect(metadata.ciUrl).toBe('https://github.com/run/123');
      expect(metadata.shardIndex).toBe(1);
      expect(metadata.totalShards).toBe(2);
      expect(metadata.startedAt).toBeDefined();
      expect(metadata.finishedAt).toBeDefined();
    });

    it('should fall back to git info when CI info is missing', async () => {
      const config = { shard: null } as unknown as FullConfig;
      service.initialize(config, 'test-source');

      const metadata = await service.buildMetadata();

      // Git info should be used as fallback
      expect(metadata.branch).toBe('main');
      expect(metadata.commitSha).toBe('abc123');
    });

    it('should handle case when git info promise rejects', async () => {
      vi.mocked(mockGitService.getGitInfoAsync).mockRejectedValue(new Error('Git not available'));
      const config = { shard: null } as unknown as FullConfig;
      service.initialize(config, 'test-source');

      // Should not throw, git info will be default values
      const metadata = await service.buildMetadata();

      expect(metadata.branch).toBeNull();
      expect(metadata.commitSha).toBeNull();
    });
  });

  describe('getCIInfo', () => {
    it('should return CI info', () => {
      const expectedCIInfo = {
        provider: 'gitlab-ci' as CIProvider,
        url: 'https://gitlab.com',
        branch: 'develop',
        commitSha: 'def456',
        runId: '789',
      };
      vi.mocked(mockCIService.getCIInfo).mockReturnValue(expectedCIInfo);
      const config = { shard: null } as unknown as FullConfig;
      service.initialize(config, 'test-source');

      expect(service.getCIInfo()).toEqual(expectedCIInfo);
    });
  });
});
