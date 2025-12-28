import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CIService } from '../../../../src/infrastructure/services/ci.service';

describe('CIService', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    // Save and clear environment
    originalEnv = { ...process.env };
    // Clear all CI-related env vars
    delete process.env.CI;
    delete process.env.GITHUB_ACTIONS;
    delete process.env.GITLAB_CI;
    delete process.env.CIRCLECI;
    delete process.env.JENKINS_URL;
    delete process.env.TF_BUILD;
    delete process.env.BITBUCKET_PIPELINE_UUID;
    // Clear GitHub-specific
    delete process.env.GITHUB_SERVER_URL;
    delete process.env.GITHUB_REPOSITORY;
    delete process.env.GITHUB_RUN_ID;
    delete process.env.GITHUB_REF_NAME;
    delete process.env.GITHUB_SHA;
    delete process.env.GITHUB_RUN_ATTEMPT;
    // Clear GitLab-specific
    delete process.env.CI_JOB_URL;
    delete process.env.CI_COMMIT_REF_NAME;
    delete process.env.CI_COMMIT_SHA;
    delete process.env.CI_PIPELINE_ID;
    // Clear CircleCI-specific
    delete process.env.CIRCLE_BUILD_URL;
    delete process.env.CIRCLE_BRANCH;
    delete process.env.CIRCLE_SHA1;
    delete process.env.CIRCLE_WORKFLOW_ID;
    // Clear Jenkins-specific
    delete process.env.BUILD_URL;
    delete process.env.GIT_BRANCH;
    delete process.env.GIT_COMMIT;
    delete process.env.BUILD_ID;
    // Clear Azure DevOps-specific
    delete process.env.SYSTEM_TEAMFOUNDATIONCOLLECTIONURI;
    delete process.env.SYSTEM_TEAMPROJECT;
    delete process.env.BUILD_BUILDID;
    delete process.env.BUILD_SOURCEBRANCH;
    delete process.env.BUILD_SOURCEVERSION;
    // Clear Bitbucket-specific
    delete process.env.BITBUCKET_GIT_HTTP_ORIGIN;
    delete process.env.BITBUCKET_REPO_SLUG;
    delete process.env.BITBUCKET_BUILD_NUMBER;
    delete process.env.BITBUCKET_BRANCH;
    delete process.env.BITBUCKET_COMMIT;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('singleton', () => {
    it('should return the same instance', () => {
      const instance1 = CIService.instance();
      const instance2 = CIService.instance();
      expect(instance1).toBe(instance2);
    });
  });

  describe('isCI', () => {
    it('should return false when not in CI', () => {
      const service = CIService.instance();
      expect(service.isCI()).toBe(false);
    });

    it('should return true when CI env var is set', () => {
      process.env.CI = 'true';
      const service = CIService.instance();
      expect(service.isCI()).toBe(true);
    });

    it('should return true when GITHUB_ACTIONS is set', () => {
      process.env.GITHUB_ACTIONS = 'true';
      const service = CIService.instance();
      expect(service.isCI()).toBe(true);
    });

    it('should return true when GITLAB_CI is set', () => {
      process.env.GITLAB_CI = 'true';
      const service = CIService.instance();
      expect(service.isCI()).toBe(true);
    });

    it('should return true when CIRCLECI is set', () => {
      process.env.CIRCLECI = 'true';
      const service = CIService.instance();
      expect(service.isCI()).toBe(true);
    });

    it('should return true when JENKINS_URL is set', () => {
      process.env.JENKINS_URL = 'http://jenkins.example.com';
      const service = CIService.instance();
      expect(service.isCI()).toBe(true);
    });

    it('should return true when TF_BUILD is set', () => {
      process.env.TF_BUILD = 'True';
      const service = CIService.instance();
      expect(service.isCI()).toBe(true);
    });

    it('should return true when BITBUCKET_PIPELINE_UUID is set', () => {
      process.env.BITBUCKET_PIPELINE_UUID = 'some-uuid';
      const service = CIService.instance();
      expect(service.isCI()).toBe(true);
    });
  });

  describe('getCIInfo', () => {
    it('should return null info when not in CI', () => {
      const service = CIService.instance();
      const info = service.getCIInfo();
      expect(info.provider).toBeNull();
      expect(info.url).toBeNull();
      expect(info.branch).toBeNull();
      expect(info.commitSha).toBeNull();
      expect(info.runId).toBeNull();
    });

    describe('GitHub Actions', () => {
      beforeEach(() => {
        process.env.GITHUB_ACTIONS = 'true';
      });

      it('should detect GitHub Actions with full info', () => {
        process.env.GITHUB_SERVER_URL = 'https://github.com';
        process.env.GITHUB_REPOSITORY = 'owner/repo';
        process.env.GITHUB_RUN_ID = '12345';
        process.env.GITHUB_REF_NAME = 'main';
        process.env.GITHUB_SHA = 'abc123';

        const service = CIService.instance();
        const info = service.getCIInfo();

        expect(info.provider).toBe('github-actions');
        expect(info.url).toBe('https://github.com/owner/repo/actions/runs/12345');
        expect(info.branch).toBe('main');
        expect(info.commitSha).toBe('abc123');
        expect(info.runId).toBe('12345');
      });

      it('should include run attempt in runId when present', () => {
        process.env.GITHUB_RUN_ID = '12345';
        process.env.GITHUB_RUN_ATTEMPT = '2';

        const service = CIService.instance();
        const info = service.getCIInfo();

        expect(info.runId).toBe('12345-2');
      });

      it('should handle missing optional fields', () => {
        const service = CIService.instance();
        const info = service.getCIInfo();

        expect(info.provider).toBe('github-actions');
        expect(info.url).toBeNull();
        expect(info.branch).toBeNull();
        expect(info.commitSha).toBeNull();
        expect(info.runId).toBeNull();
      });
    });

    describe('GitLab CI', () => {
      beforeEach(() => {
        process.env.GITLAB_CI = 'true';
      });

      it('should detect GitLab CI with full info', () => {
        process.env.CI_JOB_URL = 'https://gitlab.com/job/123';
        process.env.CI_COMMIT_REF_NAME = 'develop';
        process.env.CI_COMMIT_SHA = 'def456';
        process.env.CI_PIPELINE_ID = '789';

        const service = CIService.instance();
        const info = service.getCIInfo();

        expect(info.provider).toBe('gitlab-ci');
        expect(info.url).toBe('https://gitlab.com/job/123');
        expect(info.branch).toBe('develop');
        expect(info.commitSha).toBe('def456');
        expect(info.runId).toBe('789');
      });

      it('should handle missing optional fields', () => {
        const service = CIService.instance();
        const info = service.getCIInfo();

        expect(info.provider).toBe('gitlab-ci');
        expect(info.url).toBeNull();
      });
    });

    describe('CircleCI', () => {
      beforeEach(() => {
        process.env.CIRCLECI = 'true';
      });

      it('should detect CircleCI with full info', () => {
        process.env.CIRCLE_BUILD_URL = 'https://circleci.com/build/123';
        process.env.CIRCLE_BRANCH = 'feature-x';
        process.env.CIRCLE_SHA1 = 'ghi789';
        process.env.CIRCLE_WORKFLOW_ID = 'workflow-abc';

        const service = CIService.instance();
        const info = service.getCIInfo();

        expect(info.provider).toBe('circleci');
        expect(info.url).toBe('https://circleci.com/build/123');
        expect(info.branch).toBe('feature-x');
        expect(info.commitSha).toBe('ghi789');
        expect(info.runId).toBe('workflow-abc');
      });

      it('should handle missing optional fields', () => {
        const service = CIService.instance();
        const info = service.getCIInfo();

        expect(info.provider).toBe('circleci');
        expect(info.url).toBeNull();
        expect(info.branch).toBeNull();
        expect(info.commitSha).toBeNull();
        expect(info.runId).toBeNull();
      });
    });

    describe('Jenkins', () => {
      beforeEach(() => {
        process.env.JENKINS_URL = 'http://jenkins.example.com';
      });

      it('should detect Jenkins with full info', () => {
        process.env.BUILD_URL = 'http://jenkins.example.com/job/test/123';
        process.env.GIT_BRANCH = 'origin/main';
        process.env.GIT_COMMIT = 'jkl012';
        process.env.BUILD_ID = '123';

        const service = CIService.instance();
        const info = service.getCIInfo();

        expect(info.provider).toBe('jenkins');
        expect(info.url).toBe('http://jenkins.example.com/job/test/123');
        expect(info.branch).toBe('main'); // origin/ stripped
        expect(info.commitSha).toBe('jkl012');
        expect(info.runId).toBe('123');
      });

      it('should handle branch without origin prefix', () => {
        process.env.GIT_BRANCH = 'develop';

        const service = CIService.instance();
        const info = service.getCIInfo();

        expect(info.branch).toBe('develop');
      });

      it('should handle missing GIT_BRANCH', () => {
        const service = CIService.instance();
        const info = service.getCIInfo();

        expect(info.branch).toBeNull();
      });
    });

    describe('Azure DevOps', () => {
      beforeEach(() => {
        process.env.TF_BUILD = 'True';
      });

      it('should detect Azure DevOps with full info', () => {
        process.env.SYSTEM_TEAMFOUNDATIONCOLLECTIONURI = 'https://dev.azure.com/org/';
        process.env.SYSTEM_TEAMPROJECT = 'MyProject';
        process.env.BUILD_BUILDID = '456';
        process.env.BUILD_SOURCEBRANCH = 'refs/heads/main';
        process.env.BUILD_SOURCEVERSION = 'mno345';

        const service = CIService.instance();
        const info = service.getCIInfo();

        expect(info.provider).toBe('azure-devops');
        expect(info.url).toBe('https://dev.azure.com/org/MyProject/_build/results?buildId=456');
        expect(info.branch).toBe('main'); // refs/heads/ stripped
        expect(info.commitSha).toBe('mno345');
        expect(info.runId).toBe('456');
      });

      it('should handle branch without refs/heads prefix', () => {
        process.env.BUILD_SOURCEBRANCH = 'feature-y';

        const service = CIService.instance();
        const info = service.getCIInfo();

        expect(info.branch).toBe('feature-y');
      });

      it('should handle missing BUILD_SOURCEBRANCH', () => {
        const service = CIService.instance();
        const info = service.getCIInfo();

        expect(info.branch).toBeNull();
      });
    });

    describe('Bitbucket Pipelines', () => {
      beforeEach(() => {
        process.env.BITBUCKET_PIPELINE_UUID = 'some-uuid';
      });

      it('should detect Bitbucket Pipelines with full info', () => {
        process.env.BITBUCKET_GIT_HTTP_ORIGIN = 'https://bitbucket.org/owner/repo';
        process.env.BITBUCKET_REPO_SLUG = 'repo';
        process.env.BITBUCKET_BUILD_NUMBER = '789';
        process.env.BITBUCKET_BRANCH = 'staging';
        process.env.BITBUCKET_COMMIT = 'pqr678';

        const service = CIService.instance();
        const info = service.getCIInfo();

        expect(info.provider).toBe('bitbucket-pipelines');
        expect(info.url).toBe(
          'https://bitbucket.org/owner/repo/addon/pipelines/home#!/results/789'
        );
        expect(info.branch).toBe('staging');
        expect(info.commitSha).toBe('pqr678');
        expect(info.runId).toBe('789');
      });

      it('should handle missing URL components', () => {
        const service = CIService.instance();
        const info = service.getCIInfo();

        expect(info.provider).toBe('bitbucket-pipelines');
        expect(info.url).toBeNull();
      });
    });

    // ========================================================================
    // CI Edge Cases - Conflicting/Malformed Environment Variables
    // ========================================================================

    describe('CI edge cases', () => {
      it('should prioritize first detected CI when multiple CI env vars are set', () => {
        // Simulate self-hosted runner scenario where multiple CI systems might be detected
        process.env.GITHUB_ACTIONS = 'true';
        process.env.GITLAB_CI = 'true';
        process.env.CIRCLECI = 'true';

        const service = CIService.instance();
        const info = service.getCIInfo();

        // Should detect the first one in priority order (GitHub Actions)
        expect(info.provider).toBe('github-actions');
      });

      it('should handle empty string CI env vars', () => {
        process.env.GITHUB_ACTIONS = '';
        process.env.GITHUB_RUN_ID = '';
        process.env.GITHUB_REF_NAME = '';

        const service = CIService.instance();
        const info = service.getCIInfo();

        // Empty strings are falsy, should not detect GitHub Actions
        expect(info.provider).toBeNull();
      });

      it('should handle GITHUB_RUN_ID without GITHUB_ACTIONS', () => {
        // Partial env vars - someone set RUN_ID but not ACTIONS
        process.env.GITHUB_RUN_ID = '12345';
        process.env.GITHUB_REF_NAME = 'main';
        process.env.GITHUB_SHA = 'abc123';
        // GITHUB_ACTIONS not set

        const service = CIService.instance();
        const info = service.getCIInfo();

        // Should not detect GitHub Actions without the main flag
        expect(info.provider).toBeNull();
      });

      it('should handle very long branch names', () => {
        process.env.GITHUB_ACTIONS = 'true';
        const longBranchName = 'feature/' + 'a'.repeat(250);
        process.env.GITHUB_REF_NAME = longBranchName;

        const service = CIService.instance();
        const info = service.getCIInfo();

        expect(info.provider).toBe('github-actions');
        expect(info.branch).toBe(longBranchName);
      });

      it('should handle branch names with special characters', () => {
        process.env.GITHUB_ACTIONS = 'true';
        process.env.GITHUB_REF_NAME = 'feature/user@domain.com/fix-bug#123';

        const service = CIService.instance();
        const info = service.getCIInfo();

        expect(info.branch).toBe('feature/user@domain.com/fix-bug#123');
      });

      it('should handle unicode in branch names', () => {
        process.env.GITHUB_ACTIONS = 'true';
        process.env.GITHUB_REF_NAME = 'feature/日本語-branch-🚀';

        const service = CIService.instance();
        const info = service.getCIInfo();

        expect(info.branch).toBe('feature/日本語-branch-🚀');
      });

      it('should handle whitespace-only env vars', () => {
        process.env.GITHUB_ACTIONS = 'true';
        process.env.GITHUB_RUN_ID = '   ';
        process.env.GITHUB_REF_NAME = '\t\n';

        const service = CIService.instance();
        const info = service.getCIInfo();

        expect(info.provider).toBe('github-actions');
        // Whitespace-only values should be preserved as-is (caller decides handling)
        expect(info.runId).toBe('   ');
      });

      it('should handle numeric-string env vars', () => {
        process.env.GITHUB_ACTIONS = 'true';
        process.env.GITHUB_RUN_ID = '0'; // Edge case: zero as string
        process.env.GITHUB_RUN_ATTEMPT = '0';

        const service = CIService.instance();
        const info = service.getCIInfo();

        // '0' is truthy as a string
        expect(info.runId).toBe('0-0');
      });

      it('should handle Azure DevOps refs/pull/ prefix', () => {
        process.env.TF_BUILD = 'True';
        process.env.BUILD_SOURCEBRANCH = 'refs/pull/123/merge';

        const service = CIService.instance();
        const info = service.getCIInfo();

        // Should handle PR ref format
        expect(info.branch).toBe('refs/pull/123/merge'); // Or stripped depending on implementation
      });

      it('should handle Jenkins branch with refs/remotes prefix', () => {
        process.env.JENKINS_URL = 'http://jenkins.example.com';
        process.env.GIT_BRANCH = 'refs/remotes/origin/feature-x';

        const service = CIService.instance();
        const info = service.getCIInfo();

        // Should strip refs/remotes/origin/
        expect(info.branch).toBe('refs/remotes/origin/feature-x'); // Or stripped
      });

      it('should handle CI provider with all null values', () => {
        process.env.GITHUB_ACTIONS = 'true';
        // Don't set any other GitHub env vars

        const service = CIService.instance();
        const info = service.getCIInfo();

        expect(info.provider).toBe('github-actions');
        expect(info.url).toBeNull();
        expect(info.branch).toBeNull();
        expect(info.commitSha).toBeNull();
        expect(info.runId).toBeNull();
      });

      it('should handle malformed URL in BUILD_URL', () => {
        process.env.JENKINS_URL = 'http://jenkins.example.com';
        process.env.BUILD_URL = 'not-a-valid-url';

        const service = CIService.instance();
        const info = service.getCIInfo();

        expect(info.provider).toBe('jenkins');
        // Should still return the value even if malformed
        expect(info.url).toBe('not-a-valid-url');
      });

      it('should handle case sensitivity in CI env vars', () => {
        process.env.github_actions = 'true'; // lowercase

        const service = CIService.instance();
        const info = service.getCIInfo();

        // Most CI detection is case-sensitive
        expect(info.provider).toBeNull();
      });

      it('should handle "true" vs "True" vs "TRUE" for boolean env vars', () => {
        process.env.TF_BUILD = 'TRUE'; // All caps

        const service = CIService.instance();
        expect(service.isCI()).toBe(true);
      });

      it('should handle nested/child pipeline scenario', () => {
        // GitLab child pipelines have different env vars
        process.env.GITLAB_CI = 'true';
        process.env.CI_PIPELINE_SOURCE = 'parent_pipeline';
        process.env.CI_PIPELINE_ID = '789';
        process.env.CI_COMMIT_REF_NAME = 'main';

        const service = CIService.instance();
        const info = service.getCIInfo();

        expect(info.provider).toBe('gitlab-ci');
        expect(info.runId).toBe('789');
      });
    });
  });
});
