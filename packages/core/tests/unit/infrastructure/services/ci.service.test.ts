import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CIService } from '../../../../src/infrastructure/services/ci.service';

describe('CIService', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    // Clear all CI-related env vars
    delete process.env.CI;
    delete process.env.GITHUB_ACTIONS;
    delete process.env.GITLAB_CI;
    delete process.env.CIRCLECI;
    delete process.env.JENKINS_URL;
    delete process.env.TF_BUILD;
    delete process.env.BITBUCKET_PIPELINE_UUID;
    delete process.env.BUILDKITE;
    delete process.env.TRAVIS;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('getCIInfo', () => {
    it('returns null values when not in CI', () => {
      const service = new CIService();
      const info = service.getCIInfo();
      expect(info).toEqual({
        provider: null,
        url: null,
        branch: null,
        commitSha: null,
        runId: null,
      });
    });

    describe('GitHub Actions', () => {
      beforeEach(() => {
        process.env.GITHUB_ACTIONS = 'true';
        process.env.GITHUB_SERVER_URL = 'https://github.com';
        process.env.GITHUB_REPOSITORY = 'owner/repo';
        process.env.GITHUB_RUN_ID = '12345';
        process.env.GITHUB_REF_NAME = 'main';
        process.env.GITHUB_SHA = 'abc123';
      });

      it('detects GitHub Actions', () => {
        const service = new CIService();
        const info = service.getCIInfo();
        expect(info.provider).toBe('github-actions');
      });

      it('builds correct URL', () => {
        const service = new CIService();
        const info = service.getCIInfo();
        expect(info.url).toBe('https://github.com/owner/repo/actions/runs/12345');
      });

      it('includes run attempt in runId', () => {
        process.env.GITHUB_RUN_ATTEMPT = '2';
        const service = new CIService();
        const info = service.getCIInfo();
        expect(info.runId).toBe('12345-2');
      });

      it('extracts branch and commit', () => {
        const service = new CIService();
        const info = service.getCIInfo();
        expect(info.branch).toBe('main');
        expect(info.commitSha).toBe('abc123');
      });

      it('handles missing optional env vars', () => {
        delete process.env.GITHUB_RUN_ATTEMPT;
        const service = new CIService();
        const info = service.getCIInfo();
        expect(info.runId).toBe('12345');
      });
    });

    describe('GitLab CI', () => {
      beforeEach(() => {
        process.env.GITLAB_CI = 'true';
        process.env.CI_JOB_URL = 'https://gitlab.com/job/123';
        process.env.CI_COMMIT_REF_NAME = 'develop';
        process.env.CI_COMMIT_SHA = 'def456';
        process.env.CI_PIPELINE_ID = '789';
      });

      it('detects GitLab CI', () => {
        const service = new CIService();
        const info = service.getCIInfo();
        expect(info.provider).toBe('gitlab-ci');
        expect(info.url).toBe('https://gitlab.com/job/123');
        expect(info.branch).toBe('develop');
        expect(info.commitSha).toBe('def456');
        expect(info.runId).toBe('789');
      });
    });

    describe('CircleCI', () => {
      beforeEach(() => {
        process.env.CIRCLECI = 'true';
        process.env.CIRCLE_BUILD_URL = 'https://circleci.com/gh/owner/repo/123';
        process.env.CIRCLE_BRANCH = 'feature';
        process.env.CIRCLE_SHA1 = 'ghi789';
        process.env.CIRCLE_WORKFLOW_ID = 'workflow-123';
      });

      it('detects CircleCI', () => {
        const service = new CIService();
        const info = service.getCIInfo();
        expect(info.provider).toBe('circleci');
        expect(info.url).toBe('https://circleci.com/gh/owner/repo/123');
        expect(info.branch).toBe('feature');
        expect(info.commitSha).toBe('ghi789');
        expect(info.runId).toBe('workflow-123');
      });
    });

    describe('Jenkins', () => {
      beforeEach(() => {
        process.env.JENKINS_URL = 'https://jenkins.example.com';
        process.env.BUILD_URL = 'https://jenkins.example.com/job/test/456';
        process.env.GIT_BRANCH = 'origin/main';
        process.env.GIT_COMMIT = 'jkl012';
        process.env.BUILD_ID = '456';
      });

      it('detects Jenkins', () => {
        const service = new CIService();
        const info = service.getCIInfo();
        expect(info.provider).toBe('jenkins');
        expect(info.url).toBe('https://jenkins.example.com/job/test/456');
        // Jenkins strips 'origin/' prefix
        expect(info.branch).toBe('main');
        expect(info.commitSha).toBe('jkl012');
        expect(info.runId).toBe('456');
      });

      it('handles branch without origin prefix', () => {
        process.env.GIT_BRANCH = 'develop';
        const service = new CIService();
        const info = service.getCIInfo();
        expect(info.branch).toBe('develop');
      });
    });

    describe('Azure DevOps', () => {
      beforeEach(() => {
        process.env.TF_BUILD = 'True';
        process.env.SYSTEM_TEAMFOUNDATIONCOLLECTIONURI = 'https://dev.azure.com/org/';
        process.env.SYSTEM_TEAMPROJECT = 'project';
        process.env.BUILD_BUILDID = '789';
        process.env.BUILD_SOURCEBRANCH = 'refs/heads/main';
        process.env.BUILD_SOURCEVERSION = 'mno345';
      });

      it('detects Azure DevOps', () => {
        const service = new CIService();
        const info = service.getCIInfo();
        expect(info.provider).toBe('azure-devops');
        expect(info.url).toContain('dev.azure.com');
        // Azure strips 'refs/heads/' prefix
        expect(info.branch).toBe('main');
        expect(info.commitSha).toBe('mno345');
        expect(info.runId).toBe('789');
      });

      it('handles branch without refs/heads prefix', () => {
        process.env.BUILD_SOURCEBRANCH = 'feature-branch';
        const service = new CIService();
        const info = service.getCIInfo();
        expect(info.branch).toBe('feature-branch');
      });
    });

    describe('Bitbucket Pipelines', () => {
      beforeEach(() => {
        process.env.BITBUCKET_PIPELINE_UUID = '{uuid-123}';
        process.env.BITBUCKET_GIT_HTTP_ORIGIN = 'https://bitbucket.org/owner/repo';
        process.env.BITBUCKET_REPO_SLUG = 'repo';
        process.env.BITBUCKET_BUILD_NUMBER = '42';
        process.env.BITBUCKET_BRANCH = 'staging';
        process.env.BITBUCKET_COMMIT = 'pqr678';
      });

      it('detects Bitbucket Pipelines', () => {
        const service = new CIService();
        const info = service.getCIInfo();
        expect(info.provider).toBe('bitbucket-pipelines');
        expect(info.url).toContain('bitbucket.org');
        expect(info.branch).toBe('staging');
        expect(info.commitSha).toBe('pqr678');
        expect(info.runId).toBe('42');
      });

      it('handles missing URL components', () => {
        delete process.env.BITBUCKET_GIT_HTTP_ORIGIN;
        const service = new CIService();
        const info = service.getCIInfo();
        expect(info.provider).toBe('bitbucket-pipelines');
        expect(info.url).toBeNull();
        expect(info.branch).toBe('staging');
      });
    });
  });

  describe('isCI', () => {
    it('returns false when not in CI', () => {
      const service = new CIService();
      expect(service.isCI()).toBe(false);
    });

    it('returns true when CI env var is set', () => {
      process.env.CI = 'true';
      const service = new CIService();
      expect(service.isCI()).toBe(true);
    });

    it('returns true for GitHub Actions', () => {
      process.env.GITHUB_ACTIONS = 'true';
      const service = new CIService();
      expect(service.isCI()).toBe(true);
    });

    it('returns true for GitLab CI', () => {
      process.env.GITLAB_CI = 'true';
      const service = new CIService();
      expect(service.isCI()).toBe(true);
    });

    it('returns true for CircleCI', () => {
      process.env.CIRCLECI = 'true';
      const service = new CIService();
      expect(service.isCI()).toBe(true);
    });

    it('returns true for Jenkins', () => {
      process.env.JENKINS_URL = 'https://jenkins.example.com';
      const service = new CIService();
      expect(service.isCI()).toBe(true);
    });

    it('returns true for Azure DevOps', () => {
      process.env.TF_BUILD = 'True';
      const service = new CIService();
      expect(service.isCI()).toBe(true);
    });

    it('returns true for Bitbucket Pipelines', () => {
      process.env.BITBUCKET_PIPELINE_UUID = '{uuid}';
      const service = new CIService();
      expect(service.isCI()).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('handles missing env vars gracefully for GitHub', () => {
      process.env.GITHUB_ACTIONS = 'true';
      // Don't set any other GitHub env vars
      delete process.env.GITHUB_SERVER_URL;
      delete process.env.GITHUB_REPOSITORY;
      delete process.env.GITHUB_RUN_ID;
      delete process.env.GITHUB_REF_NAME;
      delete process.env.GITHUB_SHA;
      
      const service = new CIService();
      const info = service.getCIInfo();
      
      expect(info.provider).toBe('github-actions');
      expect(info.url).toBeNull();
      expect(info.runId).toBeNull();
      expect(info.branch).toBeNull();
      expect(info.commitSha).toBeNull();
    });

    it('handles missing env vars gracefully for GitLab', () => {
      process.env.GITLAB_CI = 'true';
      // Don't set any other GitLab env vars
      delete process.env.CI_JOB_URL;
      delete process.env.CI_COMMIT_REF_NAME;
      delete process.env.CI_COMMIT_SHA;
      delete process.env.CI_PIPELINE_ID;
      
      const service = new CIService();
      const info = service.getCIInfo();
      
      expect(info.provider).toBe('gitlab-ci');
      expect(info.url).toBeNull();
      expect(info.branch).toBeNull();
      expect(info.commitSha).toBeNull();
      expect(info.runId).toBeNull();
    });

    it('handles missing env vars gracefully for CircleCI', () => {
      process.env.CIRCLECI = 'true';
      // Don't set any other CircleCI env vars
      delete process.env.CIRCLE_BUILD_URL;
      delete process.env.CIRCLE_BRANCH;
      delete process.env.CIRCLE_SHA1;
      delete process.env.CIRCLE_WORKFLOW_ID;
      
      const service = new CIService();
      const info = service.getCIInfo();
      
      expect(info.provider).toBe('circleci');
      expect(info.url).toBeNull();
      expect(info.branch).toBeNull();
      expect(info.commitSha).toBeNull();
      expect(info.runId).toBeNull();
    });

    it('handles missing env vars gracefully for Jenkins', () => {
      process.env.JENKINS_URL = 'https://jenkins.example.com';
      // Don't set any other Jenkins env vars
      delete process.env.BUILD_URL;
      delete process.env.GIT_BRANCH;
      delete process.env.GIT_COMMIT;
      delete process.env.BUILD_ID;
      
      const service = new CIService();
      const info = service.getCIInfo();
      
      expect(info.provider).toBe('jenkins');
      expect(info.url).toBeNull();
      expect(info.branch).toBeNull();
      expect(info.commitSha).toBeNull();
      expect(info.runId).toBeNull();
    });

    it('handles missing env vars gracefully for Azure DevOps', () => {
      process.env.TF_BUILD = 'True';
      // Don't set any other Azure env vars
      delete process.env.SYSTEM_TEAMFOUNDATIONCOLLECTIONURI;
      delete process.env.SYSTEM_TEAMPROJECT;
      delete process.env.BUILD_BUILDID;
      delete process.env.BUILD_SOURCEBRANCH;
      delete process.env.BUILD_SOURCEVERSION;
      
      const service = new CIService();
      const info = service.getCIInfo();
      
      expect(info.provider).toBe('azure-devops');
      expect(info.url).toBeNull();
      expect(info.branch).toBeNull();
      expect(info.commitSha).toBeNull();
      expect(info.runId).toBeNull();
    });

    it('handles missing env vars gracefully for Bitbucket', () => {
      process.env.BITBUCKET_PIPELINE_UUID = '{uuid}';
      // Don't set any other Bitbucket env vars
      delete process.env.BITBUCKET_GIT_HTTP_ORIGIN;
      delete process.env.BITBUCKET_REPO_SLUG;
      delete process.env.BITBUCKET_BUILD_NUMBER;
      delete process.env.BITBUCKET_BRANCH;
      delete process.env.BITBUCKET_COMMIT;
      
      const service = new CIService();
      const info = service.getCIInfo();
      
      expect(info.provider).toBe('bitbucket-pipelines');
      expect(info.url).toBeNull();
      expect(info.branch).toBeNull();
      expect(info.commitSha).toBeNull();
      expect(info.runId).toBeNull();
    });

    it('handles partial URL components for Azure (missing project)', () => {
      process.env.TF_BUILD = 'True';
      process.env.SYSTEM_TEAMFOUNDATIONCOLLECTIONURI = 'https://dev.azure.com/org/';
      // Missing SYSTEM_TEAMPROJECT
      process.env.BUILD_BUILDID = '123';
      
      const service = new CIService();
      const info = service.getCIInfo();
      
      expect(info.url).toBeNull();
    });

    it('handles partial URL components for Bitbucket (missing slug)', () => {
      process.env.BITBUCKET_PIPELINE_UUID = '{uuid}';
      process.env.BITBUCKET_GIT_HTTP_ORIGIN = 'https://bitbucket.org/owner/repo';
      // Missing BITBUCKET_REPO_SLUG
      process.env.BITBUCKET_BUILD_NUMBER = '42';
      
      const service = new CIService();
      const info = service.getCIInfo();
      
      expect(info.url).toBeNull();
    });

    it('handles partial URL components for GitHub (missing server)', () => {
      process.env.GITHUB_ACTIONS = 'true';
      // Missing GITHUB_SERVER_URL
      process.env.GITHUB_REPOSITORY = 'owner/repo';
      process.env.GITHUB_RUN_ID = '12345';
      
      const service = new CIService();
      const info = service.getCIInfo();
      
      expect(info.url).toBeNull();
    });

    it('handles partial URL components for GitHub (missing repo)', () => {
      process.env.GITHUB_ACTIONS = 'true';
      process.env.GITHUB_SERVER_URL = 'https://github.com';
      // Missing GITHUB_REPOSITORY
      process.env.GITHUB_RUN_ID = '12345';
      
      const service = new CIService();
      const info = service.getCIInfo();
      
      expect(info.url).toBeNull();
    });
  });
});
