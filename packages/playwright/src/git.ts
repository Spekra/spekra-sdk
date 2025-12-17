import { exec } from 'child_process';
import { promisify } from 'util';
import type { GitInfo } from './types';

const execAsync = promisify(exec);

const GIT_TIMEOUT_MS = 3000;

export async function getGitInfoAsync(): Promise<GitInfo> {
  const [branch, commitSha] = await Promise.all([getBranchAsync(), getCommitShaAsync()]);
  return { branch, commitSha };
}

async function getBranchAsync(): Promise<string | null> {
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

async function getCommitShaAsync(): Promise<string | null> {
  try {
    const { stdout } = await execAsync('git rev-parse HEAD', {
      timeout: GIT_TIMEOUT_MS,
    });
    return stdout.trim() || null;
  } catch {
    return null;
  }
}
