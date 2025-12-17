import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getCIInfo, isCI } from '../../src/ci';

describe('CI Detection', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset process.env before each test
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    // Restore original env
    process.env = originalEnv;
  });

  describe('isCI', () => {
    it('should return false when not in CI', () => {
      delete process.env.CI;
      delete process.env.GITHUB_ACTIONS;
      delete process.env.GITLAB_CI;
      delete process.env.CIRCLECI;
      delete process.env.JENKINS_URL;
      delete process.env.TF_BUILD;
      delete process.env.BITBUCKET_PIPELINE_UUID;

      expect(isCI()).toBe(false);
    });

    it('should return true when CI env is set', () => {
      process.env.CI = 'true';
      expect(isCI()).toBe(true);
    });

    it('should return true for each CI provider', () => {
      // Clear all
      delete process.env.CI;
      delete process.env.GITHUB_ACTIONS;
      delete process.env.GITLAB_CI;
      delete process.env.CIRCLECI;
      delete process.env.JENKINS_URL;
      delete process.env.TF_BUILD;
      delete process.env.BITBUCKET_PIPELINE_UUID;

      // Test each provider triggers isCI
      process.env.GITHUB_ACTIONS = 'true';
      expect(isCI()).toBe(true);
      delete process.env.GITHUB_ACTIONS;

      process.env.GITLAB_CI = 'true';
      expect(isCI()).toBe(true);
      delete process.env.GITLAB_CI;

      process.env.CIRCLECI = 'true';
      expect(isCI()).toBe(true);
      delete process.env.CIRCLECI;

      process.env.JENKINS_URL = 'https://jenkins.example.com';
      expect(isCI()).toBe(true);
      delete process.env.JENKINS_URL;

      process.env.TF_BUILD = 'True';
      expect(isCI()).toBe(true);
      delete process.env.TF_BUILD;

      process.env.BITBUCKET_PIPELINE_UUID = '{uuid}';
      expect(isCI()).toBe(true);
    });
  });

  describe('GitHub Actions', () => {
    beforeEach(() => {
      // Clear other CI envs
      delete process.env.CI;
      delete process.env.GITLAB_CI;
      delete process.env.CIRCLECI;
      delete process.env.JENKINS_URL;
      delete process.env.TF_BUILD;
      delete process.env.BITBUCKET_PIPELINE_UUID;
    });

    it('should detect GitHub Actions', () => {
      process.env.GITHUB_ACTIONS = 'true';
      process.env.GITHUB_SERVER_URL = 'https://github.com';
      process.env.GITHUB_REPOSITORY = 'org/repo';
      process.env.GITHUB_RUN_ID = '12345';
      process.env.GITHUB_REF_NAME = 'main';
      process.env.GITHUB_SHA = 'abc123';

      const info = getCIInfo();

      expect(info.provider).toBe('github-actions');
      expect(info.url).toBe('https://github.com/org/repo/actions/runs/12345');
      expect(info.branch).toBe('main');
      expect(info.commitSha).toBe('abc123');
      expect(info.runId).toBe('12345');
    });

    it('should include run attempt in runId', () => {
      process.env.GITHUB_ACTIONS = 'true';
      process.env.GITHUB_RUN_ID = '12345';
      process.env.GITHUB_RUN_ATTEMPT = '2';

      const info = getCIInfo();

      expect(info.runId).toBe('12345-2');
    });

    it('should return null url when missing required components', () => {
      process.env.GITHUB_ACTIONS = 'true';
      process.env.GITHUB_SERVER_URL = 'https://github.com';
      // Missing GITHUB_REPOSITORY and GITHUB_RUN_ID

      const info = getCIInfo();

      expect(info.provider).toBe('github-actions');
      expect(info.url).toBeNull();
    });

    it('should handle missing optional env vars', () => {
      process.env.GITHUB_ACTIONS = 'true';
      // Only set the required env var

      const info = getCIInfo();

      expect(info.provider).toBe('github-actions');
      expect(info.url).toBeNull();
      expect(info.branch).toBeNull();
      expect(info.commitSha).toBeNull();
      expect(info.runId).toBeNull();
    });

    it('should use runId without attempt when GITHUB_RUN_ATTEMPT is not set', () => {
      process.env.GITHUB_ACTIONS = 'true';
      process.env.GITHUB_RUN_ID = '12345';
      delete process.env.GITHUB_RUN_ATTEMPT;

      const info = getCIInfo();

      expect(info.runId).toBe('12345');
    });
  });

  describe('GitLab CI', () => {
    beforeEach(() => {
      delete process.env.CI;
      delete process.env.GITHUB_ACTIONS;
      delete process.env.CIRCLECI;
      delete process.env.JENKINS_URL;
      delete process.env.TF_BUILD;
      delete process.env.BITBUCKET_PIPELINE_UUID;
    });

    it('should detect GitLab CI', () => {
      process.env.GITLAB_CI = 'true';
      process.env.CI_JOB_URL = 'https://gitlab.com/org/repo/-/jobs/123';
      process.env.CI_COMMIT_REF_NAME = 'feature-branch';
      process.env.CI_COMMIT_SHA = 'def456';
      process.env.CI_PIPELINE_ID = '789';

      const info = getCIInfo();

      expect(info.provider).toBe('gitlab-ci');
      expect(info.url).toBe('https://gitlab.com/org/repo/-/jobs/123');
      expect(info.branch).toBe('feature-branch');
      expect(info.commitSha).toBe('def456');
      expect(info.runId).toBe('789');
    });

    it('should handle missing optional env vars', () => {
      process.env.GITLAB_CI = 'true';

      const info = getCIInfo();

      expect(info.provider).toBe('gitlab-ci');
      expect(info.url).toBeNull();
      expect(info.branch).toBeNull();
      expect(info.commitSha).toBeNull();
      expect(info.runId).toBeNull();
    });
  });

  describe('CircleCI', () => {
    beforeEach(() => {
      delete process.env.CI;
      delete process.env.GITHUB_ACTIONS;
      delete process.env.GITLAB_CI;
      delete process.env.JENKINS_URL;
      delete process.env.TF_BUILD;
      delete process.env.BITBUCKET_PIPELINE_UUID;
    });

    it('should detect CircleCI', () => {
      process.env.CIRCLECI = 'true';
      process.env.CIRCLE_BUILD_URL = 'https://circleci.com/gh/org/repo/123';
      process.env.CIRCLE_BRANCH = 'develop';
      process.env.CIRCLE_SHA1 = 'ghi789';
      process.env.CIRCLE_WORKFLOW_ID = 'workflow-123';

      const info = getCIInfo();

      expect(info.provider).toBe('circleci');
      expect(info.url).toBe('https://circleci.com/gh/org/repo/123');
      expect(info.branch).toBe('develop');
      expect(info.commitSha).toBe('ghi789');
      expect(info.runId).toBe('workflow-123');
    });

    it('should handle missing optional env vars', () => {
      process.env.CIRCLECI = 'true';

      const info = getCIInfo();

      expect(info.provider).toBe('circleci');
      expect(info.url).toBeNull();
      expect(info.branch).toBeNull();
      expect(info.commitSha).toBeNull();
      expect(info.runId).toBeNull();
    });
  });

  describe('Jenkins', () => {
    beforeEach(() => {
      delete process.env.CI;
      delete process.env.GITHUB_ACTIONS;
      delete process.env.GITLAB_CI;
      delete process.env.CIRCLECI;
      delete process.env.TF_BUILD;
      delete process.env.BITBUCKET_PIPELINE_UUID;
    });

    it('should detect Jenkins', () => {
      process.env.JENKINS_URL = 'https://jenkins.example.com';
      process.env.BUILD_URL = 'https://jenkins.example.com/job/my-job/123';
      process.env.GIT_BRANCH = 'origin/main';
      process.env.GIT_COMMIT = 'jkl012';
      process.env.BUILD_ID = '123';

      const info = getCIInfo();

      expect(info.provider).toBe('jenkins');
      expect(info.url).toBe('https://jenkins.example.com/job/my-job/123');
      expect(info.branch).toBe('main'); // Should strip origin/
      expect(info.commitSha).toBe('jkl012');
      expect(info.runId).toBe('123');
    });

    it('should handle branch without origin/ prefix', () => {
      process.env.JENKINS_URL = 'https://jenkins.example.com';
      process.env.GIT_BRANCH = 'feature-branch';

      const info = getCIInfo();

      expect(info.branch).toBe('feature-branch');
    });

    it('should handle missing optional env vars', () => {
      process.env.JENKINS_URL = 'https://jenkins.example.com';

      const info = getCIInfo();

      expect(info.provider).toBe('jenkins');
      expect(info.url).toBeNull();
      expect(info.branch).toBeNull();
      expect(info.commitSha).toBeNull();
      expect(info.runId).toBeNull();
    });
  });

  describe('Azure DevOps', () => {
    beforeEach(() => {
      delete process.env.CI;
      delete process.env.GITHUB_ACTIONS;
      delete process.env.GITLAB_CI;
      delete process.env.CIRCLECI;
      delete process.env.JENKINS_URL;
      delete process.env.BITBUCKET_PIPELINE_UUID;
    });

    it('should detect Azure DevOps', () => {
      process.env.TF_BUILD = 'True';
      process.env.SYSTEM_TEAMFOUNDATIONCOLLECTIONURI = 'https://dev.azure.com/org/';
      process.env.SYSTEM_TEAMPROJECT = 'my-project';
      process.env.BUILD_BUILDID = '456';
      process.env.BUILD_SOURCEBRANCH = 'refs/heads/feature';
      process.env.BUILD_SOURCEVERSION = 'mno345';

      const info = getCIInfo();

      expect(info.provider).toBe('azure-devops');
      expect(info.url).toBe('https://dev.azure.com/org/my-project/_build/results?buildId=456');
      expect(info.branch).toBe('feature'); // Should strip refs/heads/
      expect(info.commitSha).toBe('mno345');
      expect(info.runId).toBe('456');
    });

    it('should handle branch without refs/heads/ prefix', () => {
      process.env.TF_BUILD = 'True';
      process.env.BUILD_SOURCEBRANCH = 'develop';

      const info = getCIInfo();

      expect(info.branch).toBe('develop');
    });

    it('should return null url when missing required components', () => {
      process.env.TF_BUILD = 'True';
      process.env.SYSTEM_TEAMFOUNDATIONCOLLECTIONURI = 'https://dev.azure.com/org/';
      // Missing SYSTEM_TEAMPROJECT and BUILD_BUILDID

      const info = getCIInfo();

      expect(info.provider).toBe('azure-devops');
      expect(info.url).toBeNull();
    });

    it('should handle missing optional env vars', () => {
      process.env.TF_BUILD = 'True';

      const info = getCIInfo();

      expect(info.provider).toBe('azure-devops');
      expect(info.url).toBeNull();
      expect(info.branch).toBeNull();
      expect(info.commitSha).toBeNull();
      expect(info.runId).toBeNull();
    });
  });

  describe('Bitbucket Pipelines', () => {
    beforeEach(() => {
      delete process.env.CI;
      delete process.env.GITHUB_ACTIONS;
      delete process.env.GITLAB_CI;
      delete process.env.CIRCLECI;
      delete process.env.JENKINS_URL;
      delete process.env.TF_BUILD;
    });

    it('should detect Bitbucket Pipelines', () => {
      process.env.BITBUCKET_PIPELINE_UUID = '{uuid}';
      process.env.BITBUCKET_GIT_HTTP_ORIGIN = 'https://bitbucket.org/org/repo';
      process.env.BITBUCKET_REPO_SLUG = 'repo';
      process.env.BITBUCKET_BUILD_NUMBER = '789';
      process.env.BITBUCKET_BRANCH = 'staging';
      process.env.BITBUCKET_COMMIT = 'pqr678';

      const info = getCIInfo();

      expect(info.provider).toBe('bitbucket-pipelines');
      expect(info.url).toBe('https://bitbucket.org/org/repo/addon/pipelines/home#!/results/789');
      expect(info.branch).toBe('staging');
      expect(info.commitSha).toBe('pqr678');
      expect(info.runId).toBe('789');
    });

    it('should return null url when missing required components', () => {
      process.env.BITBUCKET_PIPELINE_UUID = '{uuid}';
      process.env.BITBUCKET_GIT_HTTP_ORIGIN = 'https://bitbucket.org/org/repo';
      // Missing BITBUCKET_BUILD_NUMBER

      const info = getCIInfo();

      expect(info.provider).toBe('bitbucket-pipelines');
      expect(info.url).toBeNull();
    });

    it('should handle missing optional env vars', () => {
      process.env.BITBUCKET_PIPELINE_UUID = '{uuid}';

      const info = getCIInfo();

      expect(info.provider).toBe('bitbucket-pipelines');
      expect(info.url).toBeNull();
      expect(info.branch).toBeNull();
      expect(info.commitSha).toBeNull();
      expect(info.runId).toBeNull();
    });
  });

  describe('No CI', () => {
    it('should return null values when not in CI', () => {
      delete process.env.CI;
      delete process.env.GITHUB_ACTIONS;
      delete process.env.GITLAB_CI;
      delete process.env.CIRCLECI;
      delete process.env.JENKINS_URL;
      delete process.env.TF_BUILD;
      delete process.env.BITBUCKET_PIPELINE_UUID;

      const info = getCIInfo();

      expect(info.provider).toBeNull();
      expect(info.url).toBeNull();
      expect(info.branch).toBeNull();
      expect(info.commitSha).toBeNull();
      expect(info.runId).toBeNull();
    });
  });
});
