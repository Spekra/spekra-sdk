import { randomUUID } from 'crypto';
import { BaseEntity } from './base.entity';
import { Artifact, type ArtifactMetadata } from './artifact.entity';
import type { TestStatus } from '@spekra/core';

// Re-export TestStatus from core for convenience
export type { TestStatus } from '@spekra/core';

/**
 * Test step (action performed during test)
 */
export interface TestStep {
  /** Step title/description */
  title: string;
  /** Step category (e.g., "pw:api", "test.step") */
  category?: string;
  /** Step duration in milliseconds */
  durationMs: number;
  /** Error message if step failed */
  error: string | null;
  /** Nested steps */
  steps?: TestStep[];
}

/**
 * Test result properties
 */
export interface TestResultProps {
  /** Unique identifier for this result */
  id: string;
  /** Relative path to test file */
  testFile: string;
  /** Full test title (describe blocks + test name, no tags) */
  fullTitle: string;
  /** Suite/describe block hierarchy */
  suitePath: string[];
  /** Test name without tags */
  testName: string;
  /** Tags extracted from annotations and inline @tag in title */
  tags: string[];
  /** Playwright project name */
  project: string;
  /** Test outcome */
  status: TestStatus;
  /** Test duration in milliseconds */
  durationMs: number;
  /** Retry attempt (0 = first run) */
  retry: number;
  /** Error message if test failed */
  errorMessage: string | null;
  /** Artifacts (traces, screenshots, videos, attachments) */
  artifacts: Artifact[];
  /** Test steps with timing */
  steps: TestStep[];
  /** Console stdout output */
  stdout: string[];
  /** Console stderr output */
  stderr: string[];
}

/**
 * Input for creating a new TestResult
 */
export interface CreateTestResultInput {
  testFile: string;
  fullTitle: string;
  suitePath: string[];
  testName: string;
  tags: string[];
  project: string;
  status: TestStatus;
  durationMs: number;
  retry: number;
  errorMessage: string | null;
  artifacts?: Artifact[];
  steps?: TestStep[];
  stdout?: string[];
  stderr?: string[];
}

/**
 * Payload format for API (artifacts as metadata)
 */
export interface TestResultPayload {
  id: string;
  testFile: string;
  fullTitle: string;
  suitePath: string[];
  testName: string;
  tags: string[];
  project: string;
  status: TestStatus;
  durationMs: number;
  retry: number;
  errorMessage: string | null;
  artifacts: ArtifactMetadata[];
  steps: TestStep[];
  stdout: string[];
  stderr: string[];
}

/**
 * Test Result Entity
 *
 * Enhanced test result with artifacts, steps, and console output.
 * Represents a single test execution with all captured data.
 */
export class TestResult extends BaseEntity<TestResultProps> {
  private constructor(props: TestResultProps) {
    super(props);
  }

  /**
   * Create a new TestResult
   */
  static create(input: CreateTestResultInput): TestResult {
    return new TestResult({
      id: randomUUID(),
      testFile: input.testFile,
      fullTitle: input.fullTitle,
      suitePath: input.suitePath,
      testName: input.testName,
      tags: input.tags,
      project: input.project,
      status: input.status,
      durationMs: input.durationMs,
      retry: input.retry,
      errorMessage: input.errorMessage,
      artifacts: input.artifacts ?? [],
      steps: input.steps ?? [],
      stdout: input.stdout ?? [],
      stderr: input.stderr ?? [],
    });
  }

  // Getters
  get id(): string {
    return this.props.id;
  }

  get testFile(): string {
    return this.props.testFile;
  }

  get fullTitle(): string {
    return this.props.fullTitle;
  }

  get suitePath(): string[] {
    return this.props.suitePath;
  }

  get testName(): string {
    return this.props.testName;
  }

  get tags(): string[] {
    return this.props.tags;
  }

  get project(): string {
    return this.props.project;
  }

  get status(): TestStatus {
    return this.props.status;
  }

  get durationMs(): number {
    return this.props.durationMs;
  }

  get retry(): number {
    return this.props.retry;
  }

  get errorMessage(): string | null {
    return this.props.errorMessage;
  }

  get artifacts(): Artifact[] {
    return this.props.artifacts;
  }

  get steps(): TestStep[] {
    return this.props.steps;
  }

  get stdout(): string[] {
    return this.props.stdout;
  }

  get stderr(): string[] {
    return this.props.stderr;
  }

  /**
   * Check if test has any artifacts
   */
  get hasArtifacts(): boolean {
    return this.props.artifacts.length > 0;
  }

  /**
   * Get total size of all artifacts in bytes
   */
  get totalArtifactSize(): number {
    return this.props.artifacts.reduce((sum, a) => sum + a.size, 0);
  }

  /**
   * Convert to API payload format
   * Artifacts are converted to metadata (excludes local file paths)
   */
  toPayload(): TestResultPayload {
    return {
      id: this.props.id,
      testFile: this.props.testFile,
      fullTitle: this.props.fullTitle,
      suitePath: this.props.suitePath,
      testName: this.props.testName,
      tags: this.props.tags,
      project: this.props.project,
      status: this.props.status,
      durationMs: this.props.durationMs,
      retry: this.props.retry,
      errorMessage: this.props.errorMessage,
      artifacts: this.props.artifacts.map((a) => a.toMetadata()),
      steps: this.props.steps,
      stdout: this.props.stdout,
      stderr: this.props.stderr,
    };
  }
}
