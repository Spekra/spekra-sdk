import { exec } from 'child_process';
import { promisify } from 'util';
import type { GitInfo } from '../../types';

const execAsync = promisify(exec);

const GIT_TIMEOUT_MS = 3000;

/**
 * Extracts git metadata (branch, commit SHA) from the local repository.
 * Falls back gracefully when git is unavailable.
 */
export class GitService {
  private static _instance: GitService;

  static instance(): GitService {
    if (!GitService._instance) {
      GitService._instance = new GitService();
    }
    return GitService._instance;
  }

  /**
   * Get git info asynchronously
   */
  async getGitInfoAsync(): Promise<GitInfo> {
    const [branch, commitSha] = await Promise.all([
      this.getBranchAsync(),
      this.getCommitShaAsync(),
    ]);
    return { branch, commitSha };
  }

  private async getBranchAsync(): Promise<string | null> {
    try {
      const { stdout } = await execAsync('git rev-parse --abbrev-ref HEAD', {
        timeout: GIT_TIMEOUT_MS,
      });
      const branch = stdout.trim();
      return branch && branch !== 'HEAD' ? branch : null;
    } catch {
      return null;
    }
  }

  private async getCommitShaAsync(): Promise<string | null> {
    try {
      const { stdout } = await execAsync('git rev-parse HEAD', {
        timeout: GIT_TIMEOUT_MS,
      });
      return stdout.trim() || null;
    } catch {
      return null;
    }
  }
}

// Export singleton for convenience
export const gitService = GitService.instance();

