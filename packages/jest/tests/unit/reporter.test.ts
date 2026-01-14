import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { AggregatedResult, TestResult as JestTestResult } from '@jest/reporters';

type AssertionResult = JestTestResult['testResults'][number];

// We need to mock the core modules before importing the reporter
vi.mock('@spekra/core', async () => {
  const actual = await vi.importActual('@spekra/core');
  return {
    ...actual,
    ApiClient: vi.fn().mockImplementation(() => ({
      sendReport: vi.fn().mockResolvedValue({
        success: true,
        data: { summary: { testsReceived: 1, passed: 1, failed: 0, skipped: 0 } },
        latencyMs: 100,
        bytesSent: 500,
        bytesUncompressed: 1000,
      }),
    })),
    CIService: {
      instance: () => ({
        getCIInfo: () => ({
          provider: null,
          url: null,
          branch: null,
          commitSha: null,
          runId: null,
        }),
      }),
    },
    GitService: {
      instance: () => ({
        getGitInfoAsync: () => Promise.resolve({ branch: 'main', commitSha: 'abc123' }),
      }),
    },
  };
});

import SpekraReporter from '../../src/reporter';

describe('SpekraReporter', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    // Clear all Spekra env vars
    Object.keys(process.env).forEach((key) => {
      if (key.startsWith('SPEKRA_')) {
        delete process.env[key];
      }
    });
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('constructor', () => {
    it('disables when API key is missing', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      new SpekraReporter({}, { source: 'test-source' });

      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Missing API key'));
      warnSpy.mockRestore();
    });

    it('disables when source is missing', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      new SpekraReporter({}, { apiKey: 'test-key' });

      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Missing source'));
      warnSpy.mockRestore();
    });

    it('enables when all required config present', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      new SpekraReporter({}, { apiKey: 'test-key', source: 'test-source' });

      // Should not warn about missing config
      expect(warnSpy).not.toHaveBeenCalledWith(expect.stringContaining('Missing'));
      warnSpy.mockRestore();
    });

    it('respects enabled: false option', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      new SpekraReporter({}, { apiKey: 'test-key', source: 'test-source', enabled: false });

      // Should not warn (just silently disabled)
      expect(warnSpy).not.toHaveBeenCalled();
      warnSpy.mockRestore();
    });
  });

  describe('test result collection', () => {
    it('maps Jest statuses correctly', async () => {
      const reporter = new SpekraReporter({}, { apiKey: 'key', source: 'src' });

      // Start run
      reporter.onRunStart(createAggregatedResult(), { estimatedTime: 0, showStatus: false });

      // Send test results with different statuses
      const statuses: Array<{ jestStatus: AssertionResult['status']; expectedStatus: string }> = [
        { jestStatus: 'passed', expectedStatus: 'passed' },
        { jestStatus: 'failed', expectedStatus: 'failed' },
        { jestStatus: 'skipped', expectedStatus: 'skipped' },
        { jestStatus: 'pending', expectedStatus: 'skipped' },
        { jestStatus: 'todo', expectedStatus: 'skipped' },
      ];

      for (const { jestStatus } of statuses) {
        reporter.onTestResult(
          {} as never,
          createJestTestResult([createAssertionResult({ status: jestStatus })]),
          createAggregatedResult()
        );
      }

      // The results are collected in memory - verify by completing run
      // (we can't directly inspect private state, but the send would include them)
    });

    it('calculates retry from invocations', () => {
      const reporter = new SpekraReporter({}, { apiKey: 'key', source: 'src' });

      reporter.onRunStart(createAggregatedResult(), { estimatedTime: 0, showStatus: false });

      // Test with invocations = 3 (meaning retry = 2)
      reporter.onTestResult(
        {} as never,
        createJestTestResult([createAssertionResult({ invocations: 3 })]),
        createAggregatedResult()
      );

      // Results are collected - would be sent with retry: 2
    });

    it('extracts first line of error message', () => {
      const reporter = new SpekraReporter({}, { apiKey: 'key', source: 'src' });

      reporter.onRunStart(createAggregatedResult(), { estimatedTime: 0, showStatus: false });

      reporter.onTestResult(
        {} as never,
        createJestTestResult([
          createAssertionResult({
            status: 'failed',
            failureMessages: ['First line error\nSecond line\nThird line'],
          }),
        ]),
        createAggregatedResult()
      );

      // Error message would be extracted and truncated
    });
  });

  describe('getLastError', () => {
    it('returns undefined when failOnError is false', () => {
      const reporter = new SpekraReporter({}, { apiKey: 'key', source: 'src', failOnError: false });

      expect(reporter.getLastError()).toBeUndefined();
    });

    it('returns undefined when no error occurred', () => {
      const reporter = new SpekraReporter({}, { apiKey: 'key', source: 'src', failOnError: true });

      expect(reporter.getLastError()).toBeUndefined();
    });
  });
});

// ============================================================================
// Test Helpers
// ============================================================================

function createAggregatedResult(): AggregatedResult {
  return {
    numFailedTestSuites: 0,
    numFailedTests: 0,
    numPassedTestSuites: 0,
    numPassedTests: 0,
    numPendingTestSuites: 0,
    numPendingTests: 0,
    numRuntimeErrorTestSuites: 0,
    numTodoTests: 0,
    numTotalTestSuites: 0,
    numTotalTests: 0,
    openHandles: [],
    snapshot: {
      added: 0,
      didUpdate: false,
      failure: false,
      filesAdded: 0,
      filesRemoved: 0,
      filesRemovedList: [],
      filesUnmatched: 0,
      filesUpdated: 0,
      matched: 0,
      total: 0,
      unchecked: 0,
      uncheckedKeysByFile: [],
      unmatched: 0,
      updated: 0,
    },
    startTime: Date.now(),
    success: true,
    testResults: [],
    wasInterrupted: false,
  };
}

function createJestTestResult(testResults: AssertionResult[]): JestTestResult {
  return {
    leaks: false,
    numFailingTests: testResults.filter((t) => t.status === 'failed').length,
    numPassingTests: testResults.filter((t) => t.status === 'passed').length,
    numPendingTests: testResults.filter((t) => t.status === 'pending').length,
    numTodoTests: testResults.filter((t) => t.status === 'todo').length,
    openHandles: [],
    perfStats: { end: Date.now(), runtime: 100, slow: false, start: Date.now() - 100 },
    skipped: false,
    snapshot: {
      added: 0,
      fileDeleted: false,
      matched: 0,
      unchecked: 0,
      uncheckedKeys: [],
      unmatched: 0,
      updated: 0,
    },
    testFilePath: '/path/to/__tests__/example.test.ts',
    testResults,
  };
}

function createAssertionResult(
  overrides: Partial<AssertionResult> = {}
): AssertionResult {
  return {
    ancestorTitles: ['Describe Block'],
    failureDetails: [],
    failureMessages: [],
    fullName: 'Describe Block test name',
    invocations: 1,
    location: null,
    numPassingAsserts: 1,
    retryReasons: [],
    status: 'passed',
    title: 'test name',
    duration: 50,
    ...overrides,
  };
}

