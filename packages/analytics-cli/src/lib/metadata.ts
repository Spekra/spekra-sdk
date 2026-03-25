import { randomUUID } from 'node:crypto';
import type { Framework } from '@spekra/core';
import { ciService, gitService } from '@spekra/core';
import type { UploadCommandOptions, UploadMetadata } from '../types';

declare const __SDK_VERSION__: string;

const DEFAULT_API_URL = 'https://www.spekra.dev/api/v1/reports';
const SUPPORTED_FRAMEWORKS = new Set<Framework>(['vitest', 'jest', 'playwright']);

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function toFramework(value: string): Framework {
  if (!SUPPORTED_FRAMEWORKS.has(value as Framework)) {
    throw new Error(
      `Unsupported framework "${value}". Expected one of: ${[...SUPPORTED_FRAMEWORKS].join(', ')}.`
    );
  }

  return value as Framework;
}

export function getReporterVersion(): string {
  return `junit-cli/${__SDK_VERSION__}`;
}

export async function resolveUploadMetadata(options: UploadCommandOptions): Promise<UploadMetadata> {
  const frameworkValue =
    asNonEmptyString(options.framework) ??
    asNonEmptyString(process.env.SPEKRA_FRAMEWORK) ??
    'vitest';
  const framework = toFramework(frameworkValue);

  const source = asNonEmptyString(options.source) ?? asNonEmptyString(process.env.SPEKRA_SOURCE);
  if (!source) {
    throw new Error('Missing required option: --source (or SPEKRA_SOURCE).');
  }

  const apiKey =
    asNonEmptyString(options.apiKey) ??
    asNonEmptyString(process.env.SPEKRA_API_KEY) ??
    asNonEmptyString(process.env.SPEKRA_VITEST_API_KEY);
  if (!apiKey) {
    throw new Error('Missing API key. Use --api-key or SPEKRA_API_KEY.');
  }

  const apiUrl =
    asNonEmptyString(options.apiUrl) ??
    asNonEmptyString(process.env.SPEKRA_API_URL) ??
    asNonEmptyString(process.env.SPEKRA_VITEST_API_URL) ??
    DEFAULT_API_URL;

  const ciInfo = ciService.getCIInfo();
  const gitInfo = await gitService.getGitInfoAsync();

  const branch =
    asNonEmptyString(options.branch) ??
    asNonEmptyString(process.env.SPEKRA_BRANCH) ??
    asNonEmptyString(process.env.GITHUB_HEAD_REF) ??
    asNonEmptyString(process.env.GITHUB_REF_NAME) ??
    asNonEmptyString(process.env.CI_COMMIT_REF_NAME) ??
    ciInfo.branch ??
    gitInfo.branch;

  const commitSha =
    asNonEmptyString(options.commitSha) ??
    asNonEmptyString(process.env.SPEKRA_COMMIT_SHA) ??
    asNonEmptyString(process.env.GITHUB_SHA) ??
    asNonEmptyString(process.env.CI_COMMIT_SHA) ??
    ciInfo.commitSha ??
    gitInfo.commitSha;

  const ciUrl =
    asNonEmptyString(options.ciUrl) ??
    asNonEmptyString(process.env.SPEKRA_CI_URL) ??
    ciInfo.url;

  const runId =
    asNonEmptyString(options.runId) ??
    asNonEmptyString(process.env.SPEKRA_RUN_ID) ??
    (ciInfo.runId ? `run-${ciInfo.runId}` : null) ??
    `run-${randomUUID()}`;

  return {
    framework,
    source,
    apiKey,
    apiUrl,
    branch,
    commitSha,
    ciUrl,
    runId,
  };
}
