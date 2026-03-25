import type { Framework, ReportPayload, TestResult } from '@spekra/core';

export interface ValidationSummary {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
}

export interface RunTiming {
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
}

export interface ParsedJUnitReport {
  results: TestResult[];
  warnings: string[];
  suiteCount: number;
  timing: RunTiming;
}

export interface LoadedResults {
  files: string[];
  results: TestResult[];
  warnings: string[];
  summary: ValidationSummary;
  runTiming: RunTiming;
}

export interface ValidateCommandOptions {
  junitPaths: string;
  strict?: boolean;
}

export interface UploadCommandOptions extends ValidateCommandOptions {
  source?: string;
  apiKey?: string;
  apiUrl?: string;
  framework?: string;
  runId?: string;
  branch?: string;
  commitSha?: string;
  ciUrl?: string;
}

export interface UploadMetadata {
  framework: Framework;
  source: string;
  apiKey: string;
  apiUrl: string;
  branch: string | null;
  commitSha: string | null;
  ciUrl: string | null;
  runId: string;
}

export interface UploadApiSummary {
  runId: string;
  testsReceived: number;
  passed: number;
  failed: number;
  skipped: number;
}

export interface UploadApiResponse {
  success?: boolean;
  summary?: UploadApiSummary;
  error?: string;
  message?: string;
}

export type UploadPayload = ReportPayload;
