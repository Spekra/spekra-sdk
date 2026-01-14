import { randomUUID } from 'crypto';
import type { FullConfig } from '@playwright/test/reporter';

import type { CIInfo, GitInfo, ShardInfo, Framework } from '@spekra/core';
import { CIService, GitService } from '@spekra/core';

/**
 * Run metadata for the report (Playwright-specific with framework)
 */
export interface RunMetadata {
  runId: string;
  source: string;
  framework: Framework;
  branch: string | null;
  commitSha: string | null;
  ciUrl: string | null;
  shardIndex: number | null;
  totalShards: number | null;
  startedAt: string;
  finishedAt: string | null;
}

/**
 * Manages test run metadata: run ID, shard info, git/CI info resolution.
 */
export class RunMetadataService {
  private ciInfo: CIInfo;
  private gitInfo: GitInfo = { branch: null, commitSha: null };
  private gitInfoPromise: Promise<GitInfo> | null = null;
  private shardInfo: ShardInfo = { index: null, total: null };
  private runId: string = '';
  private source: string = '';
  private startedAt: string = '';

  constructor(
    private ciService: CIService = CIService.instance(),
    private gitService: GitService = GitService.instance()
  ) {
    this.ciInfo = { provider: null, url: null, branch: null, commitSha: null, runId: null };
  }

  /**
   * Initialize run metadata from Playwright config
   * Call this in onBegin
   */
  initialize(config: FullConfig, source: string): void {
    this.startedAt = new Date().toISOString();
    this.source = source;

    // Start async git info fetch
    this.gitInfoPromise = this.gitService.getGitInfoAsync().then((info) => {
      this.gitInfo = info;
      return info;
    });

    // Get CI info synchronously
    this.ciInfo = this.ciService.getCIInfo();

    // Get shard info
    this.shardInfo = this.resolveShardInfo(config);

    // Generate run ID
    this.runId = this.resolveRunId();
  }

  /**
   * Wait for git info to be ready (call before building final metadata)
   */
  async ensureGitInfo(): Promise<void> {
    try {
      await this.gitInfoPromise;
    } catch {
      // Git info is optional, swallow errors
    }
  }

  /**
   * Build metadata object for report submission
   */
  async buildMetadata(): Promise<RunMetadata> {
    await this.ensureGitInfo();

    return {
      runId: this.runId,
      source: this.source,
      framework: 'playwright',
      branch: this.getBranch(),
      commitSha: this.getCommitSha(),
      ciUrl: this.ciInfo.url,
      shardIndex: this.shardInfo.index,
      totalShards: this.shardInfo.total,
      startedAt: this.startedAt,
      finishedAt: new Date().toISOString(),
    };
  }

  /**
   * Get CI info (for logging/debugging)
   */
  getCIInfo(): CIInfo {
    return this.ciInfo;
  }

  /**
   * Get shard info (for logging/debugging)
   */
  getShardInfo(): ShardInfo {
    return this.shardInfo;
  }

  /**
   * Get run ID
   */
  getRunId(): string {
    return this.runId;
  }

  // ============================================================================
  // Private: Resolution
  // ============================================================================

  private resolveRunId(): string {
    // Explicit override
    if (process.env.TEST_RUN_ID) {
      return process.env.TEST_RUN_ID;
    }

    // CI-provided run ID
    if (this.ciInfo.runId) {
      return `ci-${this.ciInfo.runId}`;
    }

    // Generate random
    return `run-${randomUUID()}`;
  }

  private resolveShardInfo(config: FullConfig): ShardInfo {
    // Playwright config
    if (config.shard) {
      return { index: config.shard.current, total: config.shard.total };
    }

    // Environment variables
    const shardIndex = process.env.TEST_SHARD_INDEX;
    const totalShards = process.env.TEST_TOTAL_SHARDS;

    if (shardIndex && totalShards) {
      const index = parseInt(shardIndex, 10);
      const total = parseInt(totalShards, 10);

      if (!isNaN(index) && !isNaN(total) && index > 0 && total > 0) {
        return { index, total };
      }
    }

    return { index: null, total: null };
  }

  private getBranch(): string | null {
    return this.ciInfo.branch || this.gitInfo.branch;
  }

  private getCommitSha(): string | null {
    return this.ciInfo.commitSha || this.gitInfo.commitSha;
  }
}
