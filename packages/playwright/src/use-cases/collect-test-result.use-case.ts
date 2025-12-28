import * as fs from 'fs';
import type {
  TestCase,
  TestResult as PlaywrightTestResult,
  TestStep as PlaywrightTestStep,
  Suite,
} from '@playwright/test/reporter';

import { BaseUseCase, type UseCaseResult } from './base.use-case';
import { LoggerService } from '../infrastructure/services/logger.service';
import { RedactionService } from '../infrastructure/services/redaction.service';
import { TestResult, type TestStep } from '../domain/entities/test-result.entity';
import { Artifact } from '../domain/entities/artifact.entity';

/**
 * Input for collecting a test result
 */
export interface CollectTestResultInput {
  test: TestCase;
  result: PlaywrightTestResult;
}

/**
 * Output of collecting a test result
 */
export interface CollectTestResultOutput {
  testResult: TestResult;
}

/**
 * Configuration for the collector
 */
export interface CollectorConfig {
  maxErrorLength: number;
  maxStackTraceLines: number;
}

/**
 * Extracts test results, artifacts, steps, and console output from Playwright's TestResult.
 * Applies PII redaction to text fields.
 */
export class CollectTestResultUseCase extends BaseUseCase<
  CollectTestResultInput,
  CollectTestResultOutput
> {
  private readonly redactionService: RedactionService;
  private readonly config: CollectorConfig;
  private readonly bufferedResults: TestResult[] = [];

  constructor(logger: LoggerService, redactionService: RedactionService, config: CollectorConfig) {
    super(logger);
    this.redactionService = redactionService;
    this.config = config;
  }

  /**
   * Collect test result from Playwright
   */
  execute(input: CollectTestResultInput): UseCaseResult<CollectTestResultOutput> {
    const { test, result } = input;

    try {
      // Extract structured test information
      const { suitePath, testName, fullTitle } = this.parseTestStructure(test);
      const tags = this.extractTags(test);
      const project = test.parent?.project()?.name || 'default';

      // Collect artifacts from attachments
      const artifacts = this.collectArtifacts(result);

      // Collect and redact console output
      const stdout = this.redactionService.redactArray(
        result.stdout.map((chunk) => chunk.toString())
      );
      const stderr = this.redactionService.redactArray(
        result.stderr.map((chunk) => chunk.toString())
      );

      // Collect test steps
      const steps = this.collectSteps(result.steps);

      // Get redacted error message
      const errorMessage = this.getErrorMessage(result.error);

      // Create TestResult entity
      const testResult = TestResult.create({
        testFile: this.getTestFile(test),
        fullTitle,
        suitePath,
        testName,
        tags,
        project,
        status: this.mapStatus(result.status),
        durationMs: result.duration,
        retry: result.retry,
        errorMessage,
        artifacts,
        steps,
        stdout,
        stderr,
      });

      // Buffer the result
      this.bufferedResults.push(testResult);

      this.logger.verbose('Collected test result', {
        test: testName,
        status: result.status,
        artifacts: artifacts.length,
      });

      return {
        success: true,
        data: { testResult },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error('Failed to collect test result', error);

      return {
        success: false,
        error: `Failed to collect test result: ${errorMessage}`,
      };
    }
  }

  /**
   * Get all buffered results and clear the buffer
   */
  flushResults(): TestResult[] {
    const results = [...this.bufferedResults];
    this.bufferedResults.length = 0;
    return results;
  }

  /**
   * Get buffered results without clearing
   */
  getBufferedResults(): TestResult[] {
    return [...this.bufferedResults];
  }

  /**
   * Get count of buffered results
   */
  get bufferedCount(): number {
    return this.bufferedResults.length;
  }

  /**
   * Collect artifacts from Playwright result attachments
   */
  private collectArtifacts(result: PlaywrightTestResult): Artifact[] {
    const artifacts: Artifact[] = [];

    for (const attachment of result.attachments) {
      // Skip inline body attachments (we only handle file-based)
      if (!attachment.path) {
        continue;
      }

      try {
        const stats = fs.statSync(attachment.path);
        const type = Artifact.inferType(attachment.name, attachment.contentType);

        const artifact = Artifact.create({
          type,
          name: attachment.name,
          path: attachment.path,
          contentType: attachment.contentType,
          size: stats.size,
        });

        artifacts.push(artifact);
      } catch {
        // File might not exist yet or be inaccessible
        this.logger.verbose('Could not stat attachment', {
          name: attachment.name,
          path: attachment.path,
        });
      }
    }

    return artifacts;
  }

  /**
   * Recursively collect test steps
   */
  private collectSteps(steps: PlaywrightTestStep[]): TestStep[] {
    return steps.map((step) => ({
      title: step.title,
      category: step.category,
      durationMs: step.duration,
      error: step.error ? this.getErrorMessage(step.error) : null,
      steps: step.steps.length > 0 ? this.collectSteps(step.steps) : undefined,
    }));
  }

  /**
   * Parse test structure to extract suite path, test name, and full title
   */
  private parseTestStructure(test: TestCase): {
    suitePath: string[];
    testName: string;
    fullTitle: string;
  } {
    const suitePath: string[] = [];
    let current: Suite | undefined = test.parent;
    const projectName = test.parent?.project()?.name;

    while (current) {
      if (current.title) {
        // Skip project-level suite
        if (projectName && current.title === projectName) {
          current = current.parent;
          continue;
        }
        // Skip file-level suite
        if (this.isFilePath(current.title)) {
          current = current.parent;
          continue;
        }
        suitePath.unshift(current.title);
      }
      current = current.parent;
    }

    const testName = this.stripTags(test.title);
    const fullTitle = [...suitePath, testName].join(' > ');

    return { suitePath, testName, fullTitle };
  }

  /**
   * Extract tags from test annotations and title
   */
  private extractTags(test: TestCase): string[] {
    const tags: string[] = [];

    // From Playwright annotations
    const annotations = test.annotations || [];
    for (const annotation of annotations) {
      if (annotation.type === 'tag' && annotation.description) {
        tags.push(annotation.description);
      }
    }

    // From inline @tags in title
    const inlineTags = test.title.match(/@[\w-]+/g) || [];
    for (const tag of inlineTags) {
      if (!tags.includes(tag)) {
        tags.push(tag);
      }
    }

    return tags;
  }

  /**
   * Strip @tags from title
   */
  private stripTags(title: string): string {
    return title.replace(/@[\w-]+/g, '').trim();
  }

  /**
   * Check if title looks like a file path
   */
  private isFilePath(title: string): boolean {
    return (
      /\.(spec|test)\.(ts|js|mjs|cjs|tsx|jsx)$/.test(title) ||
      /^.*\/.*\.(ts|js|mjs|cjs|tsx|jsx)$/.test(title)
    );
  }

  /**
   * Get relative test file path
   */
  private getTestFile(test: TestCase): string {
    const file = test.location.file.replace(/\\/g, '/');

    const markers = [
      '/e2e/tests/',
      '/e2e/',
      '/tests/',
      '/test/',
      '/__tests__/',
      '/specs/',
      '/spec/',
    ];
    for (const marker of markers) {
      const idx = file.indexOf(marker);
      if (idx !== -1) {
        return file.substring(idx + marker.length);
      }
    }

    const parts = file.split('/');
    if (parts.length >= 2) {
      return parts.slice(-2).join('/');
    }
    return parts.pop() || file;
  }

  /**
   * Map Playwright status to our status
   */
  private mapStatus(
    status: PlaywrightTestResult['status']
  ): 'passed' | 'failed' | 'skipped' | 'timedOut' | 'interrupted' {
    const statusMap: Record<string, 'passed' | 'failed' | 'skipped' | 'timedOut' | 'interrupted'> =
      {
        passed: 'passed',
        failed: 'failed',
        skipped: 'skipped',
        timedOut: 'timedOut',
        interrupted: 'interrupted',
      };
    return statusMap[status] ?? 'failed';
  }

  /**
   * Get error message with redaction and truncation
   */
  private getErrorMessage(error: unknown): string | null {
    if (!error) return null;

    let message: string | null = null;

    if (error instanceof Error) {
      message = error.stack || error.message;
    } else if (typeof error === 'object' && 'message' in error) {
      message = String((error as { message: unknown }).message);
    } else if (typeof error === 'string') {
      message = error;
    }

    if (!message) return null;

    // Truncate
    message = this.truncateErrorMessage(message);

    // Redact
    return this.redactionService.redact(message);
  }

  /**
   * Truncate long error messages
   */
  private truncateErrorMessage(message: string): string {
    const lines = message.split('\n');
    if (lines.length > this.config.maxStackTraceLines) {
      const truncatedLines = lines.slice(0, this.config.maxStackTraceLines);
      truncatedLines.push(`... (${lines.length - this.config.maxStackTraceLines} more lines)`);
      message = truncatedLines.join('\n');
    }

    if (message.length > this.config.maxErrorLength) {
      message = message.slice(0, this.config.maxErrorLength) + '... (truncated)';
    }

    return message;
  }
}
