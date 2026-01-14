import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GitService } from '../../../../src/infrastructure/services/git.service';
import * as childProcess from 'child_process';

// Mock child_process
vi.mock('child_process', () => ({
  exec: vi.fn(),
}));

describe('GitService', () => {
  // Helper to create mock exec that calls callback
  function mockExec(responses: { stdout: string }[]) {
    let callIndex = 0;
    return vi.fn(
      (
        _cmd: string,
        _opts: unknown,
        callback: (err: unknown, result: { stdout: string }) => void
      ) => {
        const response = responses[callIndex] || { stdout: '' };
        callIndex++;
        callback(null, response);
      }
    );
  }

  function mockExecFailure(error: Error) {
    return vi.fn((_cmd: string, _opts: unknown, callback: (err: Error) => void) => {
      callback(error);
    });
  }

  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('singleton', () => {
    it('should return the same instance', () => {
      const instance1 = GitService.instance();
      const instance2 = GitService.instance();
      expect(instance1).toBe(instance2);
    });
  });

  describe('getGitInfoAsync', () => {
    it('should return branch and commit sha', async () => {
      // First call is for branch, second is for commit sha
      vi.mocked(childProcess.exec).mockImplementation(
        mockExec([
          { stdout: 'main\n' },
          { stdout: 'abc123def456\n' },
        ]) as unknown as typeof childProcess.exec
      );

      const service = GitService.instance();
      const info = await service.getGitInfoAsync();

      expect(info.branch).toBe('main');
      expect(info.commitSha).toBe('abc123def456');
    });

    it('should return null for branch when HEAD (detached state)', async () => {
      vi.mocked(childProcess.exec).mockImplementation(
        mockExec([
          { stdout: 'HEAD\n' },
          { stdout: 'abc123\n' },
        ]) as unknown as typeof childProcess.exec
      );

      const service = GitService.instance();
      const info = await service.getGitInfoAsync();

      expect(info.branch).toBeNull();
      expect(info.commitSha).toBe('abc123');
    });

    it('should return null for branch when empty', async () => {
      vi.mocked(childProcess.exec).mockImplementation(
        mockExec([{ stdout: '' }, { stdout: 'abc123\n' }]) as unknown as typeof childProcess.exec
      );

      const service = GitService.instance();
      const info = await service.getGitInfoAsync();

      expect(info.branch).toBeNull();
    });

    it('should return null for sha when empty', async () => {
      vi.mocked(childProcess.exec).mockImplementation(
        mockExec([{ stdout: 'main\n' }, { stdout: '' }]) as unknown as typeof childProcess.exec
      );

      const service = GitService.instance();
      const info = await service.getGitInfoAsync();

      expect(info.commitSha).toBeNull();
    });

    it('should return null values on git command failure', async () => {
      vi.mocked(childProcess.exec).mockImplementation(
        mockExecFailure(new Error('Not a git repo')) as unknown as typeof childProcess.exec
      );

      const service = GitService.instance();
      const info = await service.getGitInfoAsync();

      expect(info.branch).toBeNull();
      expect(info.commitSha).toBeNull();
    });

    it('should handle feature branches with slashes', async () => {
      vi.mocked(childProcess.exec).mockImplementation(
        mockExec([
          { stdout: 'feature/my-branch\n' },
          { stdout: 'abc123\n' },
        ]) as unknown as typeof childProcess.exec
      );

      const service = GitService.instance();
      const info = await service.getGitInfoAsync();

      expect(info.branch).toBe('feature/my-branch');
    });

    it('should trim whitespace from output', async () => {
      vi.mocked(childProcess.exec).mockImplementation(
        mockExec([
          { stdout: '  main  \n' },
          { stdout: '  abc123  \n' },
        ]) as unknown as typeof childProcess.exec
      );

      const service = GitService.instance();
      const info = await service.getGitInfoAsync();

      expect(info.branch).toBe('main');
      expect(info.commitSha).toBe('abc123');
    });
  });
});
