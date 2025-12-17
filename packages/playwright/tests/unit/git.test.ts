import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getGitInfoAsync } from '../../src/git';
import { exec } from 'child_process';

vi.mock('child_process', () => ({
  execSync: vi.fn(),
  exec: vi.fn(),
}));

const mockExec = vi.mocked(exec);

describe('Git Detection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getGitInfoAsync', () => {
    it('should return branch and commit SHA in parallel', async () => {
      // Mock exec to call callback with success
      mockExec.mockImplementation((cmd: string, _options: any, callback?: any) => {
        const cb = typeof _options === 'function' ? _options : callback;
        if (cmd.includes('--abbrev-ref')) {
          setTimeout(() => cb(null, { stdout: 'feature-branch\n', stderr: '' }), 0);
        } else {
          setTimeout(() => cb(null, { stdout: 'abc123def456789\n', stderr: '' }), 0);
        }
        return {} as any;
      });

      const info = await getGitInfoAsync();

      expect(info.branch).toBe('feature-branch');
      expect(info.commitSha).toBe('abc123def456789');
    });

    it('should return null branch for detached HEAD', async () => {
      mockExec.mockImplementation((cmd: string, _options: any, callback?: any) => {
        const cb = typeof _options === 'function' ? _options : callback;
        if (cmd.includes('--abbrev-ref')) {
          setTimeout(() => cb(null, { stdout: 'HEAD\n', stderr: '' }), 0);
        } else {
          setTimeout(() => cb(null, { stdout: 'abc123def456789\n', stderr: '' }), 0);
        }
        return {} as any;
      });

      const info = await getGitInfoAsync();

      expect(info.branch).toBeNull();
      expect(info.commitSha).toBe('abc123def456789');
    });

    it('should return null values when git commands fail', async () => {
      mockExec.mockImplementation((_cmd: string, _options: any, callback?: any) => {
        const cb = typeof _options === 'function' ? _options : callback;
        setTimeout(() => cb(new Error('fatal: not a git repository'), null), 0);
        return {} as any;
      });

      const info = await getGitInfoAsync();

      expect(info.branch).toBeNull();
      expect(info.commitSha).toBeNull();
    });

    it('should handle empty string returns', async () => {
      mockExec.mockImplementation((_cmd: string, _options: any, callback?: any) => {
        const cb = typeof _options === 'function' ? _options : callback;
        setTimeout(() => cb(null, { stdout: '', stderr: '' }), 0);
        return {} as any;
      });

      const info = await getGitInfoAsync();

      expect(info.branch).toBeNull();
      expect(info.commitSha).toBeNull();
    });

    it('should trim whitespace from async results', async () => {
      mockExec.mockImplementation((cmd: string, _options: any, callback?: any) => {
        const cb = typeof _options === 'function' ? _options : callback;
        if (cmd.includes('--abbrev-ref')) {
          setTimeout(() => cb(null, { stdout: '  main  \n', stderr: '' }), 0);
        } else {
          setTimeout(() => cb(null, { stdout: '  abc123  \n', stderr: '' }), 0);
        }
        return {} as any;
      });

      const info = await getGitInfoAsync();

      expect(info.branch).toBe('main');
      expect(info.commitSha).toBe('abc123');
    });
  });
});
