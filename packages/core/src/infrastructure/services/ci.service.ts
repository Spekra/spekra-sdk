import type { CIInfo } from '../../types';

/**
 * Detects CI environment and extracts relevant metadata.
 * Supports GitHub Actions, GitLab CI, CircleCI, Jenkins, Azure DevOps, and Bitbucket Pipelines.
 */
export class CIService {
  private static _instance: CIService;

  static instance(): CIService {
    if (!CIService._instance) {
      CIService._instance = new CIService();
    }
    return CIService._instance;
  }

  /**
   * Detect CI environment and return relevant info
   */
  getCIInfo(): CIInfo {
    // GitHub Actions
    if (process.env.GITHUB_ACTIONS) {
      return this.getGitHubActionsInfo();
    }

    // GitLab CI
    if (process.env.GITLAB_CI) {
      return this.getGitLabCIInfo();
    }

    // CircleCI
    if (process.env.CIRCLECI) {
      return this.getCircleCIInfo();
    }

    // Jenkins
    if (process.env.JENKINS_URL) {
      return this.getJenkinsInfo();
    }

    // Azure DevOps
    if (process.env.TF_BUILD) {
      return this.getAzureDevOpsInfo();
    }

    // Bitbucket Pipelines
    if (process.env.BITBUCKET_PIPELINE_UUID) {
      return this.getBitbucketPipelinesInfo();
    }

    return {
      provider: null,
      url: null,
      branch: null,
      commitSha: null,
      runId: null,
    };
  }

  /**
   * Check if running in a CI environment
   */
  isCI(): boolean {
    return !!(
      process.env.CI ||
      process.env.GITHUB_ACTIONS ||
      process.env.GITLAB_CI ||
      process.env.CIRCLECI ||
      process.env.JENKINS_URL ||
      process.env.TF_BUILD ||
      process.env.BITBUCKET_PIPELINE_UUID
    );
  }

  private getGitHubActionsInfo(): CIInfo {
    const {
      GITHUB_SERVER_URL,
      GITHUB_REPOSITORY,
      GITHUB_RUN_ID,
      GITHUB_REF_NAME,
      GITHUB_SHA,
      GITHUB_RUN_ATTEMPT,
    } = process.env;

    let url: string | null = null;
    if (GITHUB_SERVER_URL && GITHUB_REPOSITORY && GITHUB_RUN_ID) {
      url = `${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}`;
    }

    let runId: string | null = null;
    if (GITHUB_RUN_ID) {
      runId = GITHUB_RUN_ATTEMPT ? `${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}` : GITHUB_RUN_ID;
    }

    return {
      provider: 'github-actions',
      url,
      branch: GITHUB_REF_NAME || null,
      commitSha: GITHUB_SHA || null,
      runId,
    };
  }

  private getGitLabCIInfo(): CIInfo {
    const { CI_JOB_URL, CI_COMMIT_REF_NAME, CI_COMMIT_SHA, CI_PIPELINE_ID } = process.env;

    return {
      provider: 'gitlab-ci',
      url: CI_JOB_URL || null,
      branch: CI_COMMIT_REF_NAME || null,
      commitSha: CI_COMMIT_SHA || null,
      runId: CI_PIPELINE_ID || null,
    };
  }

  private getCircleCIInfo(): CIInfo {
    const { CIRCLE_BUILD_URL, CIRCLE_BRANCH, CIRCLE_SHA1, CIRCLE_WORKFLOW_ID } = process.env;

    return {
      provider: 'circleci',
      url: CIRCLE_BUILD_URL || null,
      branch: CIRCLE_BRANCH || null,
      commitSha: CIRCLE_SHA1 || null,
      runId: CIRCLE_WORKFLOW_ID || null,
    };
  }

  private getJenkinsInfo(): CIInfo {
    const { BUILD_URL, GIT_BRANCH, GIT_COMMIT, BUILD_ID } = process.env;

    // Jenkins GIT_BRANCH often includes remote prefix like 'origin/main'
    let branch = GIT_BRANCH || null;
    if (branch?.startsWith('origin/')) {
      branch = branch.slice(7);
    }

    return {
      provider: 'jenkins',
      url: BUILD_URL || null,
      branch,
      commitSha: GIT_COMMIT || null,
      runId: BUILD_ID || null,
    };
  }

  private getAzureDevOpsInfo(): CIInfo {
    const {
      SYSTEM_TEAMFOUNDATIONCOLLECTIONURI,
      SYSTEM_TEAMPROJECT,
      BUILD_BUILDID,
      BUILD_SOURCEBRANCH,
      BUILD_SOURCEVERSION,
    } = process.env;

    let url: string | null = null;
    if (SYSTEM_TEAMFOUNDATIONCOLLECTIONURI && SYSTEM_TEAMPROJECT && BUILD_BUILDID) {
      url = `${SYSTEM_TEAMFOUNDATIONCOLLECTIONURI}${SYSTEM_TEAMPROJECT}/_build/results?buildId=${BUILD_BUILDID}`;
    }

    // Azure uses refs/heads/main format
    let branch = BUILD_SOURCEBRANCH || null;
    if (branch?.startsWith('refs/heads/')) {
      branch = branch.slice(11);
    }

    return {
      provider: 'azure-devops',
      url,
      branch,
      commitSha: BUILD_SOURCEVERSION || null,
      runId: BUILD_BUILDID || null,
    };
  }

  private getBitbucketPipelinesInfo(): CIInfo {
    const {
      BITBUCKET_GIT_HTTP_ORIGIN,
      BITBUCKET_REPO_SLUG,
      BITBUCKET_BUILD_NUMBER,
      BITBUCKET_BRANCH,
      BITBUCKET_COMMIT,
    } = process.env;

    let url: string | null = null;
    if (BITBUCKET_GIT_HTTP_ORIGIN && BITBUCKET_REPO_SLUG && BITBUCKET_BUILD_NUMBER) {
      url = `${BITBUCKET_GIT_HTTP_ORIGIN}/addon/pipelines/home#!/results/${BITBUCKET_BUILD_NUMBER}`;
    }

    return {
      provider: 'bitbucket-pipelines',
      url,
      branch: BITBUCKET_BRANCH || null,
      commitSha: BITBUCKET_COMMIT || null,
      runId: BITBUCKET_BUILD_NUMBER || null,
    };
  }
}

// Export singleton for convenience
export const ciService = CIService.instance();

