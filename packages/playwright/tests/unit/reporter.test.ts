import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SpekraReporter } from '../../src/reporter';
import type {
  FullConfig,
  Suite,
  TestCase,
  TestResult as PlaywrightTestResult,
  FullResult,
} from '@playwright/test/reporter';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Helper to create mock API response (new architecture expects JSON)
function createMockApiResponse(
  overrides: Partial<{
    success: boolean;
    message: string;
    summary: {
      runId: string;
      testsReceived: number;
      passed: number;
      failed: number;
      skipped: number;
    };
    uploadUrls?: Record<string, string>;
  }> = {}
) {
  return {
    success: true,
    message: 'Test results received',
    summary: { runId: 'test-run', testsReceived: 1, passed: 1, failed: 0, skipped: 0 },
    ...overrides,
  };
}

function createSuccessFetchMock(responseOverrides = {}) {
  return {
    ok: true,
    json: () => Promise.resolve(createMockApiResponse(responseOverrides)),
    text: () => Promise.resolve(JSON.stringify(createMockApiResponse(responseOverrides))),
  };
}

function createErrorFetchMock(status: number, message: string) {
  return {
    ok: false,
    status,
    json: () => Promise.resolve({ error: message }),
    text: () => Promise.resolve(message),
  };
}

// Mock child_process for both sync and async git operations
vi.mock('child_process', () => ({
  execSync: vi.fn((cmd: string) => {
    if (cmd.includes('rev-parse --abbrev-ref HEAD')) {
      return 'main\n';
    }
    if (cmd.includes('rev-parse HEAD')) {
      return 'abc123def456\n';
    }
    throw new Error('Command not found');
  }),
  exec: vi.fn((cmd: string, _options: any, callback?: any) => {
    const cb = typeof _options === 'function' ? _options : callback;
    if (cmd.includes('rev-parse --abbrev-ref HEAD')) {
      setTimeout(() => cb(null, { stdout: 'main\n', stderr: '' }), 0);
    } else if (cmd.includes('rev-parse HEAD')) {
      setTimeout(() => cb(null, { stdout: 'abc123def456\n', stderr: '' }), 0);
    } else {
      setTimeout(() => cb(new Error('Command not found'), null), 0);
    }
    return {} as any;
  }),
}));

function createMockConfig(overrides: Partial<FullConfig> = {}): FullConfig {
  return {
    rootDir: '/test',
    configFile: '/test/playwright.config.ts',
    projects: [{ name: 'chromium' }],
    shard: null,
    ...overrides,
  } as FullConfig;
}

function createMockSuite(): Suite {
  return {
    title: '',
    parent: undefined,
    project: () => undefined,
  } as Suite;
}

function createMockTest(
  title: string,
  filePath: string,
  parentTitle?: string,
  annotations?: Array<{ type: string; description?: string }>
): TestCase {
  const parentSuite: Suite = {
    title: parentTitle || '',
    parent: undefined,
    project: () => undefined,
  } as Suite;

  return {
    title,
    location: { file: filePath, line: 1, column: 1 },
    parent: parentSuite,
    annotations: annotations || [],
  } as TestCase;
}

function createNestedMockTest(
  title: string,
  filePath: string,
  parents: string[],
  annotations?: Array<{ type: string; description?: string }>
): TestCase {
  let currentSuite: Suite | undefined = undefined;

  for (const parentTitle of parents) {
    const suite: Suite = {
      title: parentTitle,
      parent: currentSuite,
      project: () => undefined,
    } as Suite;
    currentSuite = suite;
  }

  return {
    title,
    location: { file: filePath, line: 1, column: 1 },
    parent: currentSuite || ({ title: '', parent: undefined, project: () => undefined } as Suite),
    annotations: annotations || [],
  } as TestCase;
}

function createRealisticMockTest(
  testName: string,
  filePath: string,
  describeBlocks: string[],
  projectName: string,
  relativeFilePath?: string,
  annotations?: Array<{ type: string; description?: string }>
): TestCase {
  const rootSuite: Suite = {
    title: '',
    parent: undefined,
    project: () => undefined,
  } as Suite;

  const projectSuite: Suite = {
    title: projectName,
    parent: rootSuite,
    project: () => ({ name: projectName }) as any,
  } as Suite;

  const fileSuiteTitle = relativeFilePath || filePath.split('/').pop() || filePath;
  const fileSuite: Suite = {
    title: fileSuiteTitle,
    parent: projectSuite,
    project: () => ({ name: projectName }) as any,
  } as Suite;

  let currentSuite: Suite = fileSuite;
  for (const describeTitle of describeBlocks) {
    const describeSuite: Suite = {
      title: describeTitle,
      parent: currentSuite,
      project: () => ({ name: projectName }) as any,
    } as Suite;
    currentSuite = describeSuite;
  }

  return {
    title: testName,
    location: { file: filePath, line: 1, column: 1 },
    parent: currentSuite,
    annotations: annotations || [],
  } as TestCase;
}

function createMockTestWithProject(
  title: string,
  filePath: string,
  projectName: string,
  annotations?: Array<{ type: string; description?: string }>
): TestCase {
  const parentSuite: Suite = {
    title: '',
    parent: undefined,
    project: () => ({ name: projectName }) as any,
  } as Suite;

  return {
    title,
    location: { file: filePath, line: 1, column: 1 },
    parent: parentSuite,
    annotations: annotations || [],
  } as TestCase;
}

function createMockResult(
  status: PlaywrightTestResult['status'] = 'passed',
  duration = 1000,
  retry = 0,
  error?: { message?: string; stack?: string }
): PlaywrightTestResult {
  return {
    status,
    duration,
    retry,
    error: error ?? (status === 'failed' ? { message: 'Test failed' } : undefined),
    attachments: [],
    stdout: [],
    stderr: [],
    steps: [],
    startTime: new Date(),
  } as unknown as PlaywrightTestResult;
}

describe('SpekraReporter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue(createSuccessFetchMock());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('initialization', () => {
    it('should disable reporting when no API key is provided', () => {
      const reporter = new SpekraReporter({ source: 'test-suite' });
      const config = createMockConfig();
      const suite = createMockSuite();

      // Clear SPEKRA_API_KEY from env if set
      const originalEnv = process.env.SPEKRA_API_KEY;
      delete process.env.SPEKRA_API_KEY;

      reporter.onBegin(config, suite);

      // Verify no API calls are made when disabled
      const test = createMockTest('test', '/tests/example.spec.ts');
      reporter.onTestEnd(test, createMockResult());

      expect(mockFetch).not.toHaveBeenCalled();

      // Restore env
      if (originalEnv) {
        process.env.SPEKRA_API_KEY = originalEnv;
      }
    });

    it('should enable reporting with valid API key', async () => {
      const reporter = new SpekraReporter({
        apiKey: 'test-api-key',
        source: 'test-suite',
        debug: true,
      });
      const config = createMockConfig();
      const suite = createMockSuite();

      reporter.onBegin(config, suite);

      // Add a test and complete the run
      const test = createMockTest('test', '/tests/example.spec.ts');
      reporter.onTestEnd(test, createMockResult());
      await reporter.onEnd({ status: 'passed' } as FullResult);

      // Reporter should have sent the results when properly initialized
      expect(mockFetch).toHaveBeenCalled();
    });

    it('should respect enabled: false option', () => {
      const reporter = new SpekraReporter({
        apiKey: 'test-api-key',
        source: 'test-suite',
        enabled: false,
      });
      const config = createMockConfig();
      const suite = createMockSuite();

      reporter.onBegin(config, suite);

      const test = createMockTest('test', '/tests/example.spec.ts');
      reporter.onTestEnd(test, createMockResult());

      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('test result collection', () => {
    it('should collect test results', async () => {
      const reporter = new SpekraReporter({
        apiKey: 'test-api-key',
        source: 'test-suite',
        batchSize: 100,
      });
      const config = createMockConfig();
      const suite = createMockSuite();

      reporter.onBegin(config, suite);

      const test = createMockTest('should pass', '/tests/example.spec.ts', 'Example');
      reporter.onTestEnd(test, createMockResult('passed', 500));

      await reporter.onEnd({ status: 'passed' } as FullResult);

      expect(mockFetch).toHaveBeenCalled();

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe('https://spekra.dev/api/reports');
      expect(options.method).toBe('POST');

      const body = JSON.parse(options.body);
      expect(body.results).toHaveLength(1);
      expect(body.results[0]).toMatchObject({
        fullTitle: 'Example > should pass',
        suitePath: ['Example'],
        testName: 'should pass',
        tags: [],
        project: 'default',
        status: 'passed',
        durationMs: 500,
      });
    });

    it('should handle failed tests with error messages', async () => {
      const reporter = new SpekraReporter({
        apiKey: 'test-api-key',
        source: 'test-suite',
        batchSize: 100,
      });
      const config = createMockConfig();
      const suite = createMockSuite();

      reporter.onBegin(config, suite);

      const test = createMockTest('should fail', '/tests/example.spec.ts');
      reporter.onTestEnd(test, createMockResult('failed', 1000));

      await reporter.onEnd({ status: 'failed' } as FullResult);

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);

      expect(body.results[0]).toMatchObject({
        status: 'failed',
        errorMessage: 'Test failed',
      });
    });

    it('should collect results and send all at onEnd', async () => {
      // New architecture: collect all results during run, send once at onEnd
      const reporter = new SpekraReporter({
        apiKey: 'test-api-key',
        source: 'test-suite',
        batchSize: 2,
      });
      const config = createMockConfig();
      const suite = createMockSuite();

      reporter.onBegin(config, suite);

      // Add 3 tests
      for (let i = 0; i < 3; i++) {
        const test = createMockTest(`test ${i}`, '/tests/example.spec.ts');
        reporter.onTestEnd(test, createMockResult());
      }

      // No fetch during onTestEnd
      expect(mockFetch).not.toHaveBeenCalled();

      await reporter.onEnd({ status: 'passed' } as FullResult);

      // Single call at onEnd with all results
      expect(mockFetch.mock.calls.length).toBe(1);
    });
  });

  describe('file path handling', () => {
    it('should extract relative path from test file', async () => {
      const reporter = new SpekraReporter({
        apiKey: 'test-api-key',
        source: 'test-suite',
        batchSize: 100,
      });
      const config = createMockConfig();
      const suite = createMockSuite();

      reporter.onBegin(config, suite);

      const test = createMockTest('test', '/path/to/project/tests/auth/login.spec.ts');
      reporter.onTestEnd(test, createMockResult());

      await reporter.onEnd({ status: 'passed' } as FullResult);

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);

      expect(body.results[0].testFile).toBe('auth/login.spec.ts');
    });

    it('should handle e2e test paths', async () => {
      const reporter = new SpekraReporter({
        apiKey: 'test-api-key',
        source: 'test-suite',
        batchSize: 100,
      });
      const config = createMockConfig();
      const suite = createMockSuite();

      reporter.onBegin(config, suite);

      const test = createMockTest('test', '/path/to/project/e2e/tests/checkout.spec.ts');
      reporter.onTestEnd(test, createMockResult());

      await reporter.onEnd({ status: 'passed' } as FullResult);

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);

      expect(body.results[0].testFile).toBe('checkout.spec.ts');
    });
  });

  describe('payload structure', () => {
    it('should include all required fields in payload', async () => {
      const reporter = new SpekraReporter({ apiKey: 'test-api-key', source: 'test-suite' });
      const config = createMockConfig();
      const suite = createMockSuite();

      reporter.onBegin(config, suite);

      const test = createMockTest('test', '/tests/example.spec.ts');
      reporter.onTestEnd(test, createMockResult());

      await reporter.onEnd({ status: 'passed' } as FullResult);

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);

      expect(body).toHaveProperty('runId');
      expect(body).toHaveProperty('branch');
      expect(body).toHaveProperty('commitSha');
      expect(body).toHaveProperty('startedAt');
      expect(body).toHaveProperty('finishedAt');
      expect(body).toHaveProperty('results');
      // Project is now per test result, not at payload level
      expect(body).not.toHaveProperty('project');
    });

    it('should include project per test result', async () => {
      const reporter = new SpekraReporter({ apiKey: 'test-api-key', source: 'test-suite' });
      const config = createMockConfig();
      const suite = createMockSuite();

      reporter.onBegin(config, suite);

      const test = createMockTestWithProject('test', '/tests/example.spec.ts', 'firefox');
      reporter.onTestEnd(test, createMockResult());

      await reporter.onEnd({ status: 'passed' } as FullResult);

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);

      expect(body.results[0].project).toBe('firefox');
    });
  });

  describe('error handling', () => {
    it('should not throw when API request fails', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const reporter = new SpekraReporter({ apiKey: 'test-api-key', source: 'test-suite' });
      const config = createMockConfig();
      const suite = createMockSuite();

      reporter.onBegin(config, suite);

      const test = createMockTest('test', '/tests/example.spec.ts');
      reporter.onTestEnd(test, createMockResult());

      // Should not throw
      await expect(reporter.onEnd({ status: 'passed' } as FullResult)).resolves.toBeUndefined();
    });

    it('should not throw when API returns error status', async () => {
      mockFetch.mockResolvedValueOnce(createErrorFetchMock(500, 'Internal Server Error'));

      const reporter = new SpekraReporter({ apiKey: 'test-api-key', source: 'test-suite' });
      const config = createMockConfig();
      const suite = createMockSuite();

      reporter.onBegin(config, suite);

      const test = createMockTest('test', '/tests/example.spec.ts');
      reporter.onTestEnd(test, createMockResult());

      // Should not throw
      await expect(reporter.onEnd({ status: 'passed' } as FullResult)).resolves.toBeUndefined();
    });

    it('should not send empty final report when all results sent in batch', async () => {
      mockFetch.mockResolvedValue(createSuccessFetchMock());

      const reporter = new SpekraReporter({
        apiKey: 'test-api-key',
        source: 'test-suite',
        batchSize: 2,
      });
      reporter.onBegin(createMockConfig(), createMockSuite());

      // Add exactly 2 tests (one batch)
      const test1 = createMockTest('test 1', '/tests/example.spec.ts');
      reporter.onTestEnd(test1, createMockResult());
      const test2 = createMockTest('test 2', '/tests/example.spec.ts');
      reporter.onTestEnd(test2, createMockResult());

      // Wait for batch to complete
      await new Promise((resolve) => setTimeout(resolve, 100));

      await reporter.onEnd({ status: 'passed' } as FullResult);

      // Should only have the batch call, no final report
      expect(mockFetch).toHaveBeenCalledTimes(1);

      const [, batchOptions] = mockFetch.mock.calls[0];
      const batchBody = JSON.parse(batchOptions.body);
      expect(batchBody.results).toHaveLength(2);
    });

    it('should log error when report fails', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      mockFetch.mockResolvedValue(createErrorFetchMock(500, 'Internal Server Error'));

      // Disable retries for simpler test
      const reporter = new SpekraReporter({
        apiKey: 'test-api-key',
        source: 'test-suite',
        maxRetries: 0,
      });
      reporter.onBegin(createMockConfig(), createMockSuite());

      const test = createMockTest('test', '/tests/example.spec.ts');
      reporter.onTestEnd(test, createMockResult());

      await reporter.onEnd({ status: 'passed' } as FullResult);

      // New architecture logs via LoggerService.error
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('[Spekra] Failed to send report')
      );

      errorSpy.mockRestore();
    });
  });

  describe('shard support', () => {
    it('should include shard info from config', async () => {
      const reporter = new SpekraReporter({ apiKey: 'test-api-key', source: 'test-suite' });
      const config = createMockConfig({
        shard: { current: 2, total: 4 },
      });
      const suite = createMockSuite();

      reporter.onBegin(config, suite);

      const test = createMockTest('test', '/tests/example.spec.ts');
      reporter.onTestEnd(test, createMockResult());

      await reporter.onEnd({ status: 'passed' } as FullResult);

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);

      expect(body.shardIndex).toBe(2);
      expect(body.totalShards).toBe(4);
    });

    it('should use TEST_RUN_ID from environment', async () => {
      const originalEnv = process.env.TEST_RUN_ID;
      process.env.TEST_RUN_ID = 'shared-run-123';

      const reporter = new SpekraReporter({ apiKey: 'test-api-key', source: 'test-suite' });
      const config = createMockConfig();
      const suite = createMockSuite();

      reporter.onBegin(config, suite);

      const test = createMockTest('test', '/tests/example.spec.ts');
      reporter.onTestEnd(test, createMockResult());

      await reporter.onEnd({ status: 'passed' } as FullResult);

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);

      expect(body.runId).toBe('shared-run-123');

      // Restore
      if (originalEnv) {
        process.env.TEST_RUN_ID = originalEnv;
      } else {
        delete process.env.TEST_RUN_ID;
      }
    });

    it('should use shard env vars when Playwright config has no shard', async () => {
      const originalShardIndex = process.env.TEST_SHARD_INDEX;
      const originalTotalShards = process.env.TEST_TOTAL_SHARDS;
      process.env.TEST_SHARD_INDEX = '3';
      process.env.TEST_TOTAL_SHARDS = '5';

      const reporter = new SpekraReporter({ apiKey: 'test-api-key', source: 'test-suite' });
      const config = createMockConfig({ shard: null });
      const suite = createMockSuite();

      reporter.onBegin(config, suite);

      const test = createMockTest('test', '/tests/example.spec.ts');
      reporter.onTestEnd(test, createMockResult());

      await reporter.onEnd({ status: 'passed' } as FullResult);

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);

      expect(body.shardIndex).toBe(3);
      expect(body.totalShards).toBe(5);

      // Restore
      if (originalShardIndex) {
        process.env.TEST_SHARD_INDEX = originalShardIndex;
      } else {
        delete process.env.TEST_SHARD_INDEX;
      }
      if (originalTotalShards) {
        process.env.TEST_TOTAL_SHARDS = originalTotalShards;
      } else {
        delete process.env.TEST_TOTAL_SHARDS;
      }
    });
  });

  describe('status mapping', () => {
    it('should map passed status', async () => {
      const reporter = new SpekraReporter({ apiKey: 'test-api-key', source: 'test-suite' });
      reporter.onBegin(createMockConfig(), createMockSuite());

      const test = createMockTest('test', '/tests/example.spec.ts');
      reporter.onTestEnd(test, createMockResult('passed'));

      await reporter.onEnd({ status: 'passed' } as FullResult);

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.results[0].status).toBe('passed');
    });

    it('should map failed status', async () => {
      const reporter = new SpekraReporter({ apiKey: 'test-api-key', source: 'test-suite' });
      reporter.onBegin(createMockConfig(), createMockSuite());

      const test = createMockTest('test', '/tests/example.spec.ts');
      reporter.onTestEnd(test, createMockResult('failed'));

      await reporter.onEnd({ status: 'failed' } as FullResult);

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.results[0].status).toBe('failed');
    });

    it('should map skipped status', async () => {
      const reporter = new SpekraReporter({ apiKey: 'test-api-key', source: 'test-suite' });
      reporter.onBegin(createMockConfig(), createMockSuite());

      const test = createMockTest('test', '/tests/example.spec.ts');
      reporter.onTestEnd(test, createMockResult('skipped'));

      await reporter.onEnd({ status: 'passed' } as FullResult);

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.results[0].status).toBe('skipped');
    });

    it('should map timedOut status', async () => {
      const reporter = new SpekraReporter({ apiKey: 'test-api-key', source: 'test-suite' });
      reporter.onBegin(createMockConfig(), createMockSuite());

      const test = createMockTest('test', '/tests/example.spec.ts');
      reporter.onTestEnd(test, createMockResult('timedOut'));

      await reporter.onEnd({ status: 'timedOut' } as any);

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.results[0].status).toBe('timedOut');
    });

    it('should map interrupted status', async () => {
      const reporter = new SpekraReporter({ apiKey: 'test-api-key', source: 'test-suite' });
      reporter.onBegin(createMockConfig(), createMockSuite());

      const test = createMockTest('test', '/tests/example.spec.ts');
      reporter.onTestEnd(test, createMockResult('interrupted'));

      await reporter.onEnd({ status: 'interrupted' } as FullResult);

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.results[0].status).toBe('interrupted');
    });
  });

  describe('nested describe blocks', () => {
    it('should build full test title from nested describes', async () => {
      const reporter = new SpekraReporter({ apiKey: 'test-api-key', source: 'test-suite' });
      reporter.onBegin(createMockConfig(), createMockSuite());

      const test = createNestedMockTest('should validate input', '/tests/example.spec.ts', [
        'Authentication',
        'Login Form',
        'Validation',
      ]);
      reporter.onTestEnd(test, createMockResult());

      await reporter.onEnd({ status: 'passed' } as FullResult);

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.results[0].fullTitle).toBe(
        'Authentication > Login Form > Validation > should validate input'
      );
      expect(body.results[0].suitePath).toEqual(['Authentication', 'Login Form', 'Validation']);
      expect(body.results[0].testName).toBe('should validate input');
    });

    it('should handle test with no parent title', async () => {
      const reporter = new SpekraReporter({ apiKey: 'test-api-key', source: 'test-suite' });
      reporter.onBegin(createMockConfig(), createMockSuite());

      const test = createMockTest('should work', '/tests/example.spec.ts', '');
      reporter.onTestEnd(test, createMockResult());

      await reporter.onEnd({ status: 'passed' } as FullResult);

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.results[0].fullTitle).toBe('should work');
      expect(body.results[0].suitePath).toEqual([]);
      expect(body.results[0].testName).toBe('should work');
    });
  });

  describe('test title filtering', () => {
    describe('project name exclusion', () => {
      it('should exclude project name from title', async () => {
        const reporter = new SpekraReporter({ apiKey: 'test-api-key', source: 'test-suite' });
        reporter.onBegin(createMockConfig(), createMockSuite());

        const test = createRealisticMockTest(
          'should load dashboard',
          '/tests/dashboard/dashboard.spec.ts',
          ['Dashboard'],
          'desktop-chrome'
        );
        reporter.onTestEnd(test, createMockResult());

        await reporter.onEnd({ status: 'passed' } as FullResult);

        const [, options] = mockFetch.mock.calls[0];
        const body = JSON.parse(options.body);

        expect(body.results[0].fullTitle).not.toMatch(/^desktop-chrome/);
        expect(body.results[0].fullTitle).toBe('Dashboard > should load dashboard');
        expect(body.results[0].project).toBe('desktop-chrome');
      });

      it('should exclude project name with nested describes', async () => {
        const reporter = new SpekraReporter({ apiKey: 'test-api-key', source: 'test-suite' });
        reporter.onBegin(createMockConfig(), createMockSuite());

        const test = createRealisticMockTest(
          'should validate email',
          '/tests/auth.spec.ts',
          ['Auth', 'Login'],
          'webkit'
        );
        reporter.onTestEnd(test, createMockResult());

        await reporter.onEnd({ status: 'passed' } as FullResult);

        const [, options] = mockFetch.mock.calls[0];
        const body = JSON.parse(options.body);

        expect(body.results[0].fullTitle).not.toMatch(/^webkit/);
        expect(body.results[0].fullTitle).toBe('Auth > Login > should validate email');
        expect(body.results[0].project).toBe('webkit');
      });
    });

    describe('file path exclusion', () => {
      it('should exclude file name from title', async () => {
        const reporter = new SpekraReporter({ apiKey: 'test-api-key', source: 'test-suite' });
        reporter.onBegin(createMockConfig(), createMockSuite());

        const test = createRealisticMockTest(
          'should authenticate user',
          '/project/tests/auth.spec.ts',
          ['Authentication'],
          'chromium'
        );
        reporter.onTestEnd(test, createMockResult());

        await reporter.onEnd({ status: 'passed' } as FullResult);

        const [, options] = mockFetch.mock.calls[0];
        const body = JSON.parse(options.body);

        expect(body.results[0].fullTitle).not.toContain('auth.spec.ts');
        expect(body.results[0].fullTitle).toBe('Authentication > should authenticate user');
      });

      it('should exclude nested file paths', async () => {
        const reporter = new SpekraReporter({ apiKey: 'test-api-key', source: 'test-suite' });
        reporter.onBegin(createMockConfig(), createMockSuite());

        const test = createRealisticMockTest(
          'should display items',
          '/project/tests/dashboard/widgets/items.spec.ts',
          ['Widget Display'],
          'firefox'
        );
        reporter.onTestEnd(test, createMockResult());

        await reporter.onEnd({ status: 'passed' } as FullResult);

        const [, options] = mockFetch.mock.calls[0];
        const body = JSON.parse(options.body);

        expect(body.results[0].fullTitle).not.toContain('items.spec.ts');
        expect(body.results[0].fullTitle).not.toContain('dashboard');
        expect(body.results[0].fullTitle).not.toContain('widgets');
        expect(body.results[0].fullTitle).toBe('Widget Display > should display items');
      });
    });

    describe('describe hierarchy preservation', () => {
      it('should preserve nested describe blocks', async () => {
        const reporter = new SpekraReporter({ apiKey: 'test-api-key', source: 'test-suite' });
        reporter.onBegin(createMockConfig(), createMockSuite());

        const test = createRealisticMockTest(
          'should validate email',
          '/tests/auth/login.spec.ts',
          ['Auth', 'Login'],
          'chromium'
        );
        reporter.onTestEnd(test, createMockResult());

        await reporter.onEnd({ status: 'passed' } as FullResult);

        const [, options] = mockFetch.mock.calls[0];
        const body = JSON.parse(options.body);

        expect(body.results[0].fullTitle).toBe('Auth > Login > should validate email');
        expect(body.results[0].suitePath).toEqual(['Auth', 'Login']);
        expect(body.results[0].testName).toBe('should validate email');
      });

      it('should handle deeply nested describes', async () => {
        const reporter = new SpekraReporter({ apiKey: 'test-api-key', source: 'test-suite' });
        reporter.onBegin(createMockConfig(), createMockSuite());

        const test = createRealisticMockTest(
          'should submit form',
          '/tests/checkout.spec.ts',
          ['Checkout', 'Payment', 'Credit Card', 'Form Validation'],
          'chromium'
        );
        reporter.onTestEnd(test, createMockResult());

        await reporter.onEnd({ status: 'passed' } as FullResult);

        const [, options] = mockFetch.mock.calls[0];
        const body = JSON.parse(options.body);

        expect(body.results[0].fullTitle).toBe(
          'Checkout > Payment > Credit Card > Form Validation > should submit form'
        );
        expect(body.results[0].suitePath).toEqual([
          'Checkout',
          'Payment',
          'Credit Card',
          'Form Validation',
        ]);
      });

      it('should handle top-level tests without describes', async () => {
        const reporter = new SpekraReporter({ apiKey: 'test-api-key', source: 'test-suite' });
        reporter.onBegin(createMockConfig(), createMockSuite());

        const test = createRealisticMockTest(
          'should run standalone test',
          '/tests/smoke.spec.ts',
          [],
          'chromium'
        );
        reporter.onTestEnd(test, createMockResult());

        await reporter.onEnd({ status: 'passed' } as FullResult);

        const [, options] = mockFetch.mock.calls[0];
        const body = JSON.parse(options.body);

        expect(body.results[0].fullTitle).toBe('should run standalone test');
        expect(body.results[0].suitePath).toEqual([]);
        expect(body.results[0].testName).toBe('should run standalone test');
      });
    });

    describe('file extension detection', () => {
      it('should detect .test.ts files', async () => {
        const reporter = new SpekraReporter({ apiKey: 'test-api-key', source: 'test-suite' });
        reporter.onBegin(createMockConfig(), createMockSuite());

        const test = createRealisticMockTest(
          'should work',
          '/tests/utils.test.ts',
          ['Utils'],
          'chromium'
        );
        reporter.onTestEnd(test, createMockResult());

        await reporter.onEnd({ status: 'passed' } as FullResult);

        const [, options] = mockFetch.mock.calls[0];
        const body = JSON.parse(options.body);

        expect(body.results[0].fullTitle).not.toContain('utils.test.ts');
        expect(body.results[0].fullTitle).toBe('Utils > should work');
      });

      it('should detect .spec.js files', async () => {
        const reporter = new SpekraReporter({ apiKey: 'test-api-key', source: 'test-suite' });
        reporter.onBegin(createMockConfig(), createMockSuite());

        const test = createRealisticMockTest(
          'should work',
          '/tests/legacy.spec.js',
          ['Legacy'],
          'chromium'
        );
        reporter.onTestEnd(test, createMockResult());

        await reporter.onEnd({ status: 'passed' } as FullResult);

        const [, options] = mockFetch.mock.calls[0];
        const body = JSON.parse(options.body);

        expect(body.results[0].fullTitle).not.toContain('legacy.spec.js');
        expect(body.results[0].fullTitle).toBe('Legacy > should work');
      });

      it('should detect .test.tsx files', async () => {
        const reporter = new SpekraReporter({ apiKey: 'test-api-key', source: 'test-suite' });
        reporter.onBegin(createMockConfig(), createMockSuite());

        const test = createRealisticMockTest(
          'should render',
          '/tests/Component.test.tsx',
          ['Component'],
          'chromium'
        );
        reporter.onTestEnd(test, createMockResult());

        await reporter.onEnd({ status: 'passed' } as FullResult);

        const [, options] = mockFetch.mock.calls[0];
        const body = JSON.parse(options.body);

        expect(body.results[0].fullTitle).not.toContain('Component.test.tsx');
        expect(body.results[0].fullTitle).toBe('Component > should render');
      });

      it('should not filter describe blocks that look like paths', async () => {
        const reporter = new SpekraReporter({ apiKey: 'test-api-key', source: 'test-suite' });
        reporter.onBegin(createMockConfig(), createMockSuite());

        const test = createRealisticMockTest(
          'should validate',
          '/tests/form.spec.ts',
          ['form validation', 'input fields'],
          'chromium'
        );
        reporter.onTestEnd(test, createMockResult());

        await reporter.onEnd({ status: 'passed' } as FullResult);

        const [, options] = mockFetch.mock.calls[0];
        const body = JSON.parse(options.body);

        expect(body.results[0].fullTitle).toBe('form validation > input fields > should validate');
      });
    });

    describe('relative file paths in suite title', () => {
      it('should handle directory/file.spec.ts format', async () => {
        const reporter = new SpekraReporter({ apiKey: 'test-api-key', source: 'test-suite' });
        reporter.onBegin(createMockConfig(), createMockSuite());

        const test = createRealisticMockTest(
          'should load data',
          '/project/tests/dashboard/dashboard.spec.ts',
          ['Dashboard'],
          'desktop-chrome',
          'dashboard/dashboard.spec.ts'
        );
        reporter.onTestEnd(test, createMockResult());

        await reporter.onEnd({ status: 'passed' } as FullResult);

        const [, options] = mockFetch.mock.calls[0];
        const body = JSON.parse(options.body);

        expect(body.results[0].fullTitle).not.toMatch(/^desktop-chrome/);
        expect(body.results[0].fullTitle).not.toContain('dashboard/dashboard.spec.ts');
        expect(body.results[0].fullTitle).not.toContain('dashboard.spec.ts');
        expect(body.results[0].fullTitle).toBe('Dashboard > should load data');
        expect(body.results[0].project).toBe('desktop-chrome');
      });

      it('should handle deeply nested paths', async () => {
        const reporter = new SpekraReporter({ apiKey: 'test-api-key', source: 'test-suite' });
        reporter.onBegin(createMockConfig(), createMockSuite());

        const test = createRealisticMockTest(
          'should work',
          '/project/e2e/features/auth/login.spec.ts',
          ['Auth', 'Login'],
          'chromium',
          'e2e/features/auth/login.spec.ts'
        );
        reporter.onTestEnd(test, createMockResult());

        await reporter.onEnd({ status: 'passed' } as FullResult);

        const [, options] = mockFetch.mock.calls[0];
        const body = JSON.parse(options.body);

        expect(body.results[0].fullTitle).not.toContain('e2e/features/auth/login.spec.ts');
        expect(body.results[0].fullTitle).not.toContain('login.spec.ts');
        expect(body.results[0].fullTitle).toBe('Auth > Login > should work');
      });

      it('should handle tests/ prefixed paths', async () => {
        const reporter = new SpekraReporter({ apiKey: 'test-api-key', source: 'test-suite' });
        reporter.onBegin(createMockConfig(), createMockSuite());

        const test = createRealisticMockTest(
          'should fetch',
          '/project/tests/integration/api.spec.ts',
          ['API Tests'],
          'firefox',
          'tests/integration/api.spec.ts'
        );
        reporter.onTestEnd(test, createMockResult());

        await reporter.onEnd({ status: 'passed' } as FullResult);

        const [, options] = mockFetch.mock.calls[0];
        const body = JSON.parse(options.body);

        expect(body.results[0].fullTitle).not.toContain('tests/integration/api.spec.ts');
        expect(body.results[0].fullTitle).toBe('API Tests > should fetch');
      });

      it('should handle src/ prefixed paths', async () => {
        const reporter = new SpekraReporter({ apiKey: 'test-api-key', source: 'test-suite' });
        reporter.onBegin(createMockConfig(), createMockSuite());

        const test = createRealisticMockTest(
          'should render',
          '/project/src/components/Button.test.tsx',
          ['Button'],
          'webkit',
          'src/components/Button.test.tsx'
        );
        reporter.onTestEnd(test, createMockResult());

        await reporter.onEnd({ status: 'passed' } as FullResult);

        const [, options] = mockFetch.mock.calls[0];
        const body = JSON.parse(options.body);

        expect(body.results[0].fullTitle).not.toContain('src/components/Button.test.tsx');
        expect(body.results[0].fullTitle).toBe('Button > should render');
      });

      it('should handle same test across multiple projects', async () => {
        const reporter = new SpekraReporter({ apiKey: 'test-api-key', source: 'test-suite' });
        reporter.onBegin(createMockConfig(), createMockSuite());

        const testChromium = createRealisticMockTest(
          'should work',
          '/project/tests/app.spec.ts',
          ['App'],
          'chromium',
          'tests/app.spec.ts'
        );
        const testFirefox = createRealisticMockTest(
          'should work',
          '/project/tests/app.spec.ts',
          ['App'],
          'firefox',
          'tests/app.spec.ts'
        );

        reporter.onTestEnd(testChromium, createMockResult());
        reporter.onTestEnd(testFirefox, createMockResult());

        await reporter.onEnd({ status: 'passed' } as FullResult);

        const [, options] = mockFetch.mock.calls[0];
        const body = JSON.parse(options.body);

        expect(body.results[0].fullTitle).toBe('App > should work');
        expect(body.results[1].fullTitle).toBe('App > should work');
        // Project names are captured separately
        expect(body.results[0].project).toBe('chromium');
        expect(body.results[1].project).toBe('firefox');
      });
    });
  });

  describe('tag extraction', () => {
    it('should extract tags from Playwright annotations', async () => {
      const reporter = new SpekraReporter({ apiKey: 'test-api-key', source: 'test-suite' });
      reporter.onBegin(createMockConfig(), createMockSuite());

      const test = createMockTestWithProject(
        'should authenticate user',
        '/tests/auth.spec.ts',
        'chromium',
        [
          { type: 'tag', description: '@auth' },
          { type: 'tag', description: '@smoke' },
        ]
      );
      reporter.onTestEnd(test, createMockResult());

      await reporter.onEnd({ status: 'passed' } as FullResult);

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);

      expect(body.results[0].tags).toContain('@auth');
      expect(body.results[0].tags).toContain('@smoke');
    });

    it('should extract inline @tags from test title', async () => {
      const reporter = new SpekraReporter({ apiKey: 'test-api-key', source: 'test-suite' });
      reporter.onBegin(createMockConfig(), createMockSuite());

      const test = createMockTestWithProject(
        'should authenticate user @auth @slow',
        '/tests/auth.spec.ts',
        'chromium'
      );
      reporter.onTestEnd(test, createMockResult());

      await reporter.onEnd({ status: 'passed' } as FullResult);

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);

      expect(body.results[0].tags).toContain('@auth');
      expect(body.results[0].tags).toContain('@slow');
      // Test name should have tags stripped
      expect(body.results[0].testName).toBe('should authenticate user');
    });

    it('should combine annotations and inline tags without duplicates', async () => {
      const reporter = new SpekraReporter({ apiKey: 'test-api-key', source: 'test-suite' });
      reporter.onBegin(createMockConfig(), createMockSuite());

      const test = createMockTestWithProject(
        'should authenticate user @auth',
        '/tests/auth.spec.ts',
        'chromium',
        [
          { type: 'tag', description: '@auth' },
          { type: 'tag', description: '@smoke' },
        ]
      );
      reporter.onTestEnd(test, createMockResult());

      await reporter.onEnd({ status: 'passed' } as FullResult);

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);

      // Should have @auth only once, plus @smoke
      const authCount = body.results[0].tags.filter((t: string) => t === '@auth').length;
      expect(authCount).toBe(1);
      expect(body.results[0].tags).toContain('@smoke');
    });

    it('should return empty tags array when no tags present', async () => {
      const reporter = new SpekraReporter({ apiKey: 'test-api-key', source: 'test-suite' });
      reporter.onBegin(createMockConfig(), createMockSuite());

      const test = createMockTestWithProject(
        'should authenticate user',
        '/tests/auth.spec.ts',
        'chromium'
      );
      reporter.onTestEnd(test, createMockResult());

      await reporter.onEnd({ status: 'passed' } as FullResult);

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);

      expect(body.results[0].tags).toEqual([]);
    });

    it('should handle annotations without description', async () => {
      const reporter = new SpekraReporter({ apiKey: 'test-api-key', source: 'test-suite' });
      reporter.onBegin(createMockConfig(), createMockSuite());

      const test = createMockTestWithProject(
        'should authenticate user',
        '/tests/auth.spec.ts',
        'chromium',
        [
          { type: 'tag' }, // No description
          { type: 'skip', description: 'skipped reason' }, // Different type
          { type: 'tag', description: '@valid' },
        ]
      );
      reporter.onTestEnd(test, createMockResult());

      await reporter.onEnd({ status: 'passed' } as FullResult);

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);

      // Should only have @valid, not the empty or non-tag annotations
      expect(body.results[0].tags).toEqual(['@valid']);
    });

    it('should strip tags from fullTitle', async () => {
      const reporter = new SpekraReporter({ apiKey: 'test-api-key', source: 'test-suite' });
      reporter.onBegin(createMockConfig(), createMockSuite());

      const test = createMockTest(
        'should authenticate user @auth @smoke',
        '/tests/auth.spec.ts',
        'Authentication'
      );
      reporter.onTestEnd(test, createMockResult());

      await reporter.onEnd({ status: 'passed' } as FullResult);

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);

      // Tags should be extracted
      expect(body.results[0].tags).toContain('@auth');
      expect(body.results[0].tags).toContain('@smoke');
      // Full title should not contain tags
      expect(body.results[0].fullTitle).toBe('Authentication > should authenticate user');
      expect(body.results[0].testName).toBe('should authenticate user');
    });
  });

  describe('test file path extraction', () => {
    it('should extract path from /e2e/ directory', async () => {
      const reporter = new SpekraReporter({ apiKey: 'test-api-key', source: 'test-suite' });
      reporter.onBegin(createMockConfig(), createMockSuite());

      const test = createMockTest('test', '/project/e2e/auth/login.spec.ts');
      reporter.onTestEnd(test, createMockResult());

      await reporter.onEnd({ status: 'passed' } as FullResult);

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.results[0].testFile).toBe('auth/login.spec.ts');
    });

    it('should extract path from /test/ directory', async () => {
      const reporter = new SpekraReporter({ apiKey: 'test-api-key', source: 'test-suite' });
      reporter.onBegin(createMockConfig(), createMockSuite());

      const test = createMockTest('test', '/project/test/unit/utils.spec.ts');
      reporter.onTestEnd(test, createMockResult());

      await reporter.onEnd({ status: 'passed' } as FullResult);

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.results[0].testFile).toBe('unit/utils.spec.ts');
    });

    it('should extract path from /__tests__/ directory', async () => {
      const reporter = new SpekraReporter({ apiKey: 'test-api-key', source: 'test-suite' });
      reporter.onBegin(createMockConfig(), createMockSuite());

      const test = createMockTest('test', '/project/__tests__/component.spec.ts');
      reporter.onTestEnd(test, createMockResult());

      await reporter.onEnd({ status: 'passed' } as FullResult);

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.results[0].testFile).toBe('component.spec.ts');
    });

    it('should extract path from /specs/ directory', async () => {
      const reporter = new SpekraReporter({ apiKey: 'test-api-key', source: 'test-suite' });
      reporter.onBegin(createMockConfig(), createMockSuite());

      const test = createMockTest('test', '/project/specs/api/users.spec.ts');
      reporter.onTestEnd(test, createMockResult());

      await reporter.onEnd({ status: 'passed' } as FullResult);

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.results[0].testFile).toBe('api/users.spec.ts');
    });

    it('should extract path from /spec/ directory', async () => {
      const reporter = new SpekraReporter({ apiKey: 'test-api-key', source: 'test-suite' });
      reporter.onBegin(createMockConfig(), createMockSuite());

      const test = createMockTest('test', '/project/spec/models/user.spec.ts');
      reporter.onTestEnd(test, createMockResult());

      await reporter.onEnd({ status: 'passed' } as FullResult);

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.results[0].testFile).toBe('models/user.spec.ts');
    });

    it('should fallback to last two path segments when no marker found', async () => {
      const reporter = new SpekraReporter({ apiKey: 'test-api-key', source: 'test-suite' });
      reporter.onBegin(createMockConfig(), createMockSuite());

      const test = createMockTest('test', '/project/src/components/Button.spec.ts');
      reporter.onTestEnd(test, createMockResult());

      await reporter.onEnd({ status: 'passed' } as FullResult);

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.results[0].testFile).toBe('components/Button.spec.ts');
    });

    it('should handle single filename path', async () => {
      const reporter = new SpekraReporter({ apiKey: 'test-api-key', source: 'test-suite' });
      reporter.onBegin(createMockConfig(), createMockSuite());

      const test = createMockTest('test', 'example.spec.ts');
      reporter.onTestEnd(test, createMockResult());

      await reporter.onEnd({ status: 'passed' } as FullResult);

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.results[0].testFile).toBe('example.spec.ts');
    });

    it('should handle empty file path fallback', async () => {
      const reporter = new SpekraReporter({ apiKey: 'test-api-key', source: 'test-suite' });
      reporter.onBegin(createMockConfig(), createMockSuite());

      // Test with empty path (edge case)
      const test = createMockTest('test', '');
      reporter.onTestEnd(test, createMockResult());

      await reporter.onEnd({ status: 'passed' } as FullResult);

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);
      // Should fallback to empty string
      expect(body.results[0].testFile).toBe('');
    });
  });

  describe('error message extraction', () => {
    it('should include stack trace when available', async () => {
      const reporter = new SpekraReporter({ apiKey: 'test-api-key', source: 'test-suite' });
      reporter.onBegin(createMockConfig(), createMockSuite());

      const test = createMockTest('test', '/tests/example.spec.ts');
      const error = new Error('Assertion failed');
      error.stack = 'Error: Assertion failed\n    at test.spec.ts:10:5';
      reporter.onTestEnd(test, createMockResult('failed', 1000, 0, error));

      await reporter.onEnd({ status: 'failed' } as FullResult);

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.results[0].errorMessage).toContain('Assertion failed');
      expect(body.results[0].errorMessage).toContain('at test.spec.ts:10:5');
    });

    it('should handle error object with message property', async () => {
      const reporter = new SpekraReporter({ apiKey: 'test-api-key', source: 'test-suite' });
      reporter.onBegin(createMockConfig(), createMockSuite());

      const test = createMockTest('test', '/tests/example.spec.ts');
      reporter.onTestEnd(
        test,
        createMockResult('failed', 1000, 0, { message: 'Custom error message' })
      );

      await reporter.onEnd({ status: 'failed' } as FullResult);

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.results[0].errorMessage).toBe('Custom error message');
    });

    it('should handle null error', async () => {
      const reporter = new SpekraReporter({ apiKey: 'test-api-key', source: 'test-suite' });
      reporter.onBegin(createMockConfig(), createMockSuite());

      const test = createMockTest('test', '/tests/example.spec.ts');
      reporter.onTestEnd(test, createMockResult('passed', 1000, 0, undefined));

      await reporter.onEnd({ status: 'passed' } as FullResult);

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.results[0].errorMessage).toBeNull();
    });
  });

  describe('retry handling', () => {
    it('should include retry count in results', async () => {
      const reporter = new SpekraReporter({ apiKey: 'test-api-key', source: 'test-suite' });
      reporter.onBegin(createMockConfig(), createMockSuite());

      const test = createMockTest('test', '/tests/example.spec.ts');
      reporter.onTestEnd(test, createMockResult('passed', 1000, 2));

      await reporter.onEnd({ status: 'passed' } as FullResult);

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.results[0].retry).toBe(2);
    });
  });

  describe('project name handling', () => {
    it('should capture project name per test result', async () => {
      const reporter = new SpekraReporter({ apiKey: 'test-api-key', source: 'test-suite' });
      reporter.onBegin(
        createMockConfig({ projects: [{ name: 'initial-project' }] as any }),
        createMockSuite()
      );

      const test = createMockTestWithProject('test', '/tests/example.spec.ts', 'webkit');
      reporter.onTestEnd(test, createMockResult());

      await reporter.onEnd({ status: 'passed' } as FullResult);

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);
      // Project is now per result, not at payload level
      expect(body.results[0].project).toBe('webkit');
    });

    it('should use default when no project defined on test', async () => {
      const reporter = new SpekraReporter({ apiKey: 'test-api-key', source: 'test-suite' });
      reporter.onBegin(createMockConfig({ projects: [] }), createMockSuite());

      const test = createMockTest('test', '/tests/example.spec.ts');
      reporter.onTestEnd(test, createMockResult());

      await reporter.onEnd({ status: 'passed' } as FullResult);

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.results[0].project).toBe('default');
    });
  });

  describe('configuration options', () => {
    it('should use API key from environment variable', async () => {
      const originalEnv = process.env.SPEKRA_API_KEY;
      process.env.SPEKRA_API_KEY = 'env-api-key';

      const reporter = new SpekraReporter({ source: 'test-suite' });
      reporter.onBegin(createMockConfig(), createMockSuite());

      const test = createMockTest('test', '/tests/example.spec.ts');
      reporter.onTestEnd(test, createMockResult());

      await reporter.onEnd({ status: 'passed' } as FullResult);

      expect(mockFetch).toHaveBeenCalled();
      const [, options] = mockFetch.mock.calls[0];
      expect(options.headers.Authorization).toBe('Bearer env-api-key');

      // Restore
      if (originalEnv) {
        process.env.SPEKRA_API_KEY = originalEnv;
      } else {
        delete process.env.SPEKRA_API_KEY;
      }
    });

    it('should prefer option apiKey over environment variable', async () => {
      const originalEnv = process.env.SPEKRA_API_KEY;
      process.env.SPEKRA_API_KEY = 'env-api-key';

      const reporter = new SpekraReporter({ apiKey: 'option-api-key', source: 'test-suite' });
      reporter.onBegin(createMockConfig(), createMockSuite());

      const test = createMockTest('test', '/tests/example.spec.ts');
      reporter.onTestEnd(test, createMockResult());

      await reporter.onEnd({ status: 'passed' } as FullResult);

      const [, options] = mockFetch.mock.calls[0];
      expect(options.headers.Authorization).toBe('Bearer option-api-key');

      // Restore
      if (originalEnv) {
        process.env.SPEKRA_API_KEY = originalEnv;
      } else {
        delete process.env.SPEKRA_API_KEY;
      }
    });

    it('should use custom API URL when provided', async () => {
      const reporter = new SpekraReporter({
        apiKey: 'test-api-key',
        source: 'test-suite',
        apiUrl: 'https://custom.api/v2/reports',
      });
      reporter.onBegin(createMockConfig(), createMockSuite());

      const test = createMockTest('test', '/tests/example.spec.ts');
      reporter.onTestEnd(test, createMockResult());

      await reporter.onEnd({ status: 'passed' } as FullResult);

      const [url] = mockFetch.mock.calls[0];
      expect(url).toBe('https://custom.api/v2/reports');
    });

    it('should use custom timeout', async () => {
      const reporter = new SpekraReporter({
        apiKey: 'test-api-key',
        source: 'test-suite',
        timeout: 10000,
      });
      reporter.onBegin(createMockConfig(), createMockSuite());

      const test = createMockTest('test', '/tests/example.spec.ts');
      reporter.onTestEnd(test, createMockResult());

      await reporter.onEnd({ status: 'passed' } as FullResult);

      // Timeout is passed via AbortController, can't directly assert, but no error means it worked
      expect(mockFetch).toHaveBeenCalled();
    });
  });

  describe('CI integration', () => {
    it('should use CI run ID when available', async () => {
      const originalEnv = { ...process.env };
      delete process.env.TEST_RUN_ID;
      process.env.GITHUB_ACTIONS = 'true';
      process.env.GITHUB_RUN_ID = 'gh-run-456';
      // Ensure no attempt suffix is added
      delete process.env.GITHUB_RUN_ATTEMPT;

      const reporter = new SpekraReporter({ apiKey: 'test-api-key', source: 'test-suite' });
      reporter.onBegin(createMockConfig(), createMockSuite());

      const test = createMockTest('test', '/tests/example.spec.ts');
      reporter.onTestEnd(test, createMockResult());

      await reporter.onEnd({ status: 'passed' } as FullResult);

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.runId).toBe('ci-gh-run-456');

      // Restore
      process.env = originalEnv;
    });

    it('should generate unique run ID when not in CI', async () => {
      const originalEnv = { ...process.env };
      delete process.env.TEST_RUN_ID;
      delete process.env.GITHUB_ACTIONS;
      delete process.env.GITLAB_CI;
      delete process.env.CIRCLECI;
      delete process.env.JENKINS_URL;
      delete process.env.TF_BUILD;
      delete process.env.BITBUCKET_PIPELINE_UUID;

      const reporter = new SpekraReporter({ apiKey: 'test-api-key', source: 'test-suite' });
      reporter.onBegin(createMockConfig(), createMockSuite());

      const test = createMockTest('test', '/tests/example.spec.ts');
      reporter.onTestEnd(test, createMockResult());

      await reporter.onEnd({ status: 'passed' } as FullResult);

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.runId).toMatch(/^run-[a-f0-9-]{36}$/); // UUID format

      // Restore
      process.env = originalEnv;
    });
  });

  describe('no results edge case', () => {
    it('should not send report when no tests run', async () => {
      const reporter = new SpekraReporter({ apiKey: 'test-api-key', source: 'test-suite' });
      reporter.onBegin(createMockConfig(), createMockSuite());

      // Don't call onTestEnd

      await reporter.onEnd({ status: 'passed' } as FullResult);

      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('debug logging', () => {
    let consoleLogSpy: any;

    beforeEach(() => {
      consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    });

    it('should not log debug info when debug is disabled', () => {
      const reporter = new SpekraReporter({
        apiKey: 'test-api-key',
        source: 'test-suite',
        debug: false,
      });
      reporter.onBegin(createMockConfig(), createMockSuite());

      // Only the "Reporting enabled" message should be logged
      const debugCalls = consoleLogSpy.mock.calls.filter((call: string[]) =>
        call[0].includes('Run ID:')
      );
      expect(debugCalls).toHaveLength(0);
    });
  });

  describe('initialization error handling', () => {
    it('should handle initialization errors gracefully', async () => {
      // Create a reporter that will fail to initialize due to malformed config
      const reporter = new SpekraReporter({ apiKey: 'test-api-key', source: 'test-suite' });

      // Create a config that might cause issues
      const badConfig = {
        rootDir: '/test',
        configFile: '/test/playwright.config.ts',
        projects: null as any, // This could cause issues
        shard: null,
      } as FullConfig;

      // Should not throw
      expect(() => reporter.onBegin(badConfig, createMockSuite())).not.toThrow();
    });
  });

  describe('new configuration options', () => {
    it('should accept custom timeout configuration', async () => {
      mockFetch.mockResolvedValue(createSuccessFetchMock());

      const reporter = new SpekraReporter({
        apiKey: 'test-api-key',
        source: 'test-suite',
        timeout: 30000,
      });
      reporter.onBegin(createMockConfig(), createMockSuite());

      const test = createMockTest('test', '/tests/example.spec.ts');
      reporter.onTestEnd(test, createMockResult());

      await reporter.onEnd({ status: 'passed' } as FullResult);

      // Reporter should work with custom timeout
      expect(mockFetch).toHaveBeenCalled();
    });

    it('should accept retry configuration', async () => {
      mockFetch.mockResolvedValue(createSuccessFetchMock());

      const reporter = new SpekraReporter({
        apiKey: 'test-api-key',
        source: 'test-suite',
        maxRetries: 5,
        retryBaseDelayMs: 2000,
        retryMaxDelayMs: 30000,
      });
      reporter.onBegin(createMockConfig(), createMockSuite());

      const test = createMockTest('test', '/tests/example.spec.ts');
      reporter.onTestEnd(test, createMockResult());

      await reporter.onEnd({ status: 'passed' } as FullResult);

      // Reporter should work with custom retry config
      expect(mockFetch).toHaveBeenCalled();
    });

    it('should accept all configuration options together', async () => {
      mockFetch.mockResolvedValue(createSuccessFetchMock());

      const reporter = new SpekraReporter({
        apiKey: 'test-api-key',
        source: 'test-suite',
        apiUrl: 'https://custom.api/reports',
        enabled: true,
        debug: true,
        batchSize: 50,
        timeout: 20000,
        maxRetries: 2,
        retryBaseDelayMs: 500,
        retryMaxDelayMs: 5000,
        maxErrorLength: 8000,
        maxStackTraceLines: 30,
      });
      reporter.onBegin(createMockConfig(), createMockSuite());

      const test = createMockTest('test', '/tests/example.spec.ts');
      reporter.onTestEnd(test, createMockResult());

      await reporter.onEnd({ status: 'passed' } as FullResult);

      expect(mockFetch).toHaveBeenCalledWith('https://custom.api/reports', expect.anything());
    });
  });

  describe('async git info', () => {
    it('should wait for git info before sending batch', async () => {
      mockFetch.mockResolvedValue(createSuccessFetchMock());

      const reporter = new SpekraReporter({ apiKey: 'test-api-key', source: 'test-suite' });

      // Clear CI envs to force git usage
      const originalEnv = { ...process.env };
      delete process.env.GITHUB_ACTIONS;
      delete process.env.GITHUB_REF_NAME;
      delete process.env.GITHUB_SHA;

      reporter.onBegin(createMockConfig(), createMockSuite());

      const test = createMockTest('test', '/tests/example.spec.ts');
      reporter.onTestEnd(test, createMockResult());

      // Wait a bit for async git info
      await new Promise((resolve) => setTimeout(resolve, 50));

      await reporter.onEnd({ status: 'passed' } as FullResult);

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);

      // Git info should be present (from mock)
      expect(body.branch).toBe('main');
      expect(body.commitSha).toBe('abc123def456');

      // Restore env
      process.env = originalEnv;
    });

    it('should handle git info fetch failure gracefully', async () => {
      // Temporarily override the exec mock to fail
      const { exec } = await import('child_process');
      const mockExecFn = vi.mocked(exec);
      mockExecFn.mockImplementation((_cmd: string, _options: any, callback?: any) => {
        const cb = typeof _options === 'function' ? _options : callback;
        setTimeout(() => cb(new Error('Git not found'), null), 0);
        return {} as any;
      });

      mockFetch.mockResolvedValue(createSuccessFetchMock());

      const reporter = new SpekraReporter({ apiKey: 'test-api-key', source: 'test-suite' });

      // Clear CI env vars so git is used
      const originalEnv = { ...process.env };
      delete process.env.GITHUB_ACTIONS;

      reporter.onBegin(createMockConfig(), createMockSuite());

      const test = createMockTest('test', '/tests/example.spec.ts');
      reporter.onTestEnd(test, createMockResult());

      await new Promise((resolve) => setTimeout(resolve, 50));

      // Should not throw
      await expect(reporter.onEnd({ status: 'passed' } as FullResult)).resolves.toBeUndefined();

      // Restore env
      process.env = originalEnv;
    });
  });

  describe('status mapping edge cases', () => {
    it('should map unknown status to failed', async () => {
      mockFetch.mockResolvedValue(createSuccessFetchMock());

      const reporter = new SpekraReporter({ apiKey: 'test-api-key', source: 'test-suite' });
      reporter.onBegin(createMockConfig(), createMockSuite());

      const test = createMockTest('test', '/tests/example.spec.ts');
      // Create a result with an unexpected status
      const result = createMockResult('unexpected' as any);
      reporter.onTestEnd(test, result);
      await reporter.onEnd({ status: 'passed' } as FullResult);

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);

      // Unknown status should map to 'failed'
      expect(body.results[0].status).toBe('failed');
    });
  });

  describe('callback error handling', () => {
    it('should handle onError callback that throws', async () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      mockFetch.mockResolvedValue(createErrorFetchMock(500, 'Server Error'));

      const throwingOnError = vi.fn(() => {
        throw new Error('Callback error');
      });

      const reporter = new SpekraReporter({
        apiKey: 'test-api-key',
        source: 'test-suite',
        maxRetries: 0,
        onError: throwingOnError,
      });
      reporter.onBegin(createMockConfig(), createMockSuite());

      const test = createMockTest('test', '/tests/example.spec.ts');
      reporter.onTestEnd(test, createMockResult());

      // Should not throw even when callback throws
      await expect(reporter.onEnd({ status: 'passed' } as FullResult)).resolves.toBeUndefined();

      // Callback was called
      expect(throwingOnError).toHaveBeenCalled();
      // Warning logged about callback error
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('onError callback threw')
      );

      consoleWarnSpy.mockRestore();
    });

    it('should handle onMetrics callback that throws', async () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      mockFetch.mockResolvedValue(createSuccessFetchMock());

      const throwingOnMetrics = vi.fn(() => {
        throw new Error('Metrics callback error');
      });

      const reporter = new SpekraReporter({
        apiKey: 'test-api-key',
        source: 'test-suite',
        onMetrics: throwingOnMetrics,
      });
      reporter.onBegin(createMockConfig(), createMockSuite());

      const test = createMockTest('test', '/tests/example.spec.ts');
      reporter.onTestEnd(test, createMockResult());

      // Should not throw even when callback throws
      await expect(reporter.onEnd({ status: 'passed' } as FullResult)).resolves.toBeUndefined();

      // Callback was called
      expect(throwingOnMetrics).toHaveBeenCalled();
      // Warning logged about callback error
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('onMetrics callback threw')
      );

      consoleWarnSpy.mockRestore();
    });

    it('should handle onMetrics callback that throws non-Error value', async () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      mockFetch.mockResolvedValue(createSuccessFetchMock());

      const throwingOnMetrics = vi.fn(() => {
        // eslint-disable-next-line @typescript-eslint/only-throw-error
        throw 'string error'; // Intentionally throwing non-Error to test error handling
      });

      const reporter = new SpekraReporter({
        apiKey: 'test-api-key',
        source: 'test-suite',
        onMetrics: throwingOnMetrics,
      });
      reporter.onBegin(createMockConfig(), createMockSuite());

      const test = createMockTest('test', '/tests/example.spec.ts');
      reporter.onTestEnd(test, createMockResult());
      await reporter.onEnd({ status: 'passed' } as FullResult);

      // Warning logged with 'Unknown'
      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('Unknown'));

      consoleWarnSpy.mockRestore();
    });

    it('should handle onError callback that throws non-Error value', async () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      mockFetch.mockResolvedValue(createErrorFetchMock(500, 'Server Error'));

      const throwingOnError = vi.fn(() => {
        // eslint-disable-next-line @typescript-eslint/only-throw-error
        throw 'string error'; // Intentionally throwing non-Error to test error handling
      });

      const reporter = new SpekraReporter({
        apiKey: 'test-api-key',
        source: 'test-suite',
        maxRetries: 0,
        onError: throwingOnError,
      });
      reporter.onBegin(createMockConfig(), createMockSuite());

      const test = createMockTest('test', '/tests/example.spec.ts');
      reporter.onTestEnd(test, createMockResult());
      await reporter.onEnd({ status: 'passed' } as FullResult);

      // Warning logged with 'Unknown'
      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('Unknown'));

      consoleWarnSpy.mockRestore();
    });
  });

  describe('shard environment variable edge cases', () => {
    it('should handle invalid non-numeric shard env vars gracefully', async () => {
      // Set invalid shard env vars (non-numeric)
      const originalEnv = { ...process.env };
      process.env.TEST_SHARD_INDEX = 'not-a-number';
      process.env.TEST_TOTAL_SHARDS = 'also-not-a-number';

      mockFetch.mockResolvedValue(createSuccessFetchMock());

      const reporter = new SpekraReporter({ apiKey: 'test-api-key', source: 'test-suite' });
      // Should not throw - silently ignores invalid shard values
      expect(() => reporter.onBegin(createMockConfig(), createMockSuite())).not.toThrow();

      // Restore env
      process.env = originalEnv;
    });

    it('should handle zero shard values gracefully', async () => {
      // Set zero shard env vars (invalid - should be > 0)
      const originalEnv = { ...process.env };
      process.env.TEST_SHARD_INDEX = '0';
      process.env.TEST_TOTAL_SHARDS = '0';

      mockFetch.mockResolvedValue(createSuccessFetchMock());

      const reporter = new SpekraReporter({ apiKey: 'test-api-key', source: 'test-suite' });
      // Should not throw - silently ignores zero shard values
      expect(() => reporter.onBegin(createMockConfig(), createMockSuite())).not.toThrow();

      // Restore env
      process.env = originalEnv;
    });
  });

  describe('error message extraction edge cases', () => {
    it('should handle plain string error', async () => {
      mockFetch.mockResolvedValue(createSuccessFetchMock());

      const reporter = new SpekraReporter({ apiKey: 'test-api-key', source: 'test-suite' });
      reporter.onBegin(createMockConfig(), createMockSuite());

      const test = createMockTest('test', '/tests/example.spec.ts');
      // Create result with plain string error (not Error object)
      const result = {
        status: 'failed',
        duration: 100,
        retry: 0,
        error: 'Plain string error', // Pass string as error
        attachments: [],
        stdout: [],
        stderr: [],
        steps: [],
        startTime: new Date(),
        parallelIndex: 0,
        workerIndex: 0,
      } as unknown as PlaywrightTestResult;

      reporter.onTestEnd(test, result);
      await reporter.onEnd({ status: 'passed' } as FullResult);

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);

      // String error should be captured
      expect(body.results[0].errorMessage).toBe('Plain string error');
    });

    it('should handle Error without stack trace', async () => {
      mockFetch.mockResolvedValue(createSuccessFetchMock());

      const reporter = new SpekraReporter({ apiKey: 'test-api-key', source: 'test-suite' });
      reporter.onBegin(createMockConfig(), createMockSuite());

      const test = createMockTest('test', '/tests/example.spec.ts');
      // Create error with no stack
      const errorWithoutStack = new Error('Error without stack');
      errorWithoutStack.stack = undefined;

      const result = {
        status: 'failed',
        duration: 100,
        retry: 0,
        error: errorWithoutStack,
        attachments: [],
        stdout: [],
        stderr: [],
        steps: [],
        startTime: new Date(),
        parallelIndex: 0,
        workerIndex: 0,
      } as unknown as PlaywrightTestResult;

      reporter.onTestEnd(test, result);
      await reporter.onEnd({ status: 'passed' } as FullResult);

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);

      // Should use message when stack is undefined
      expect(body.results[0].errorMessage).toBe('Error without stack');
    });

    it('should return null for object error without message property', async () => {
      mockFetch.mockResolvedValue(createSuccessFetchMock());

      const reporter = new SpekraReporter({ apiKey: 'test-api-key', source: 'test-suite' });
      reporter.onBegin(createMockConfig(), createMockSuite());

      const test = createMockTest('test', '/tests/example.spec.ts');
      // Create error that is an object without message property
      const result = {
        status: 'failed',
        duration: 100,
        retry: 0,
        error: { code: 123 }, // Object without message
        attachments: [],
        stdout: [],
        stderr: [],
        steps: [],
        startTime: new Date(),
        parallelIndex: 0,
        workerIndex: 0,
      } as unknown as PlaywrightTestResult;

      reporter.onTestEnd(test, result);
      await reporter.onEnd({ status: 'passed' } as FullResult);

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);

      // Should be null for object without message
      expect(body.results[0].errorMessage).toBeNull();
    });
  });

  describe('disabled reporter edge cases', () => {
    it('should not send when disabled (no apiClient)', async () => {
      // When no API key is provided, reporter is disabled and has no apiClient
      const reporter = new SpekraReporter({ enabled: false, source: 'test-suite' });
      reporter.onBegin(createMockConfig(), createMockSuite());

      const test = createMockTest('test', '/tests/example.spec.ts');
      reporter.onTestEnd(test, createMockResult());
      await reporter.onEnd({ status: 'passed' } as FullResult);

      // No fetch calls should be made
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should handle sendBatch when results are empty', async () => {
      mockFetch.mockResolvedValue(createSuccessFetchMock());

      const reporter = new SpekraReporter({
        apiKey: 'test-api-key',
        source: 'test-suite',
        batchSize: 1,
      });
      reporter.onBegin(createMockConfig(), createMockSuite());

      // Add one test - this will trigger sendBatch due to batchSize: 1
      const test = createMockTest('test', '/tests/example.spec.ts');
      reporter.onTestEnd(test, createMockResult());

      // Wait for the batch to be sent
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Now call onEnd - results array is empty because batch was sent
      await reporter.onEnd({ status: 'passed' } as FullResult);

      // Should have been called once for the batch (onEnd has no results to send)
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('shutdown handler', () => {
    it('should flush pending results on process beforeExit', async () => {
      mockFetch.mockResolvedValue(createSuccessFetchMock());

      const reporter = new SpekraReporter({
        apiKey: 'test-api-key',
        source: 'test-suite',
        debug: true,
      });
      reporter.onBegin(createMockConfig(), createMockSuite());

      const test = createMockTest('test', '/tests/example.spec.ts');
      reporter.onTestEnd(test, createMockResult());

      // Get the shutdown handler and call it directly
      const shutdownHandler = (reporter as any).shutdownHandler;
      expect(shutdownHandler).toBeDefined();

      // Call the handler (simulates process beforeExit)
      shutdownHandler();

      // Wait for async operations
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Should have sent the results
      expect(mockFetch).toHaveBeenCalled();
    });

    it('should not flush when no pending results on beforeExit', async () => {
      mockFetch.mockResolvedValue(createSuccessFetchMock());

      const reporter = new SpekraReporter({ apiKey: 'test-api-key', source: 'test-suite' });
      reporter.onBegin(createMockConfig(), createMockSuite());

      // Don't add any tests - no results

      // Get the shutdown handler and call it directly
      const shutdownHandler = (reporter as any).shutdownHandler;
      shutdownHandler();

      await new Promise((resolve) => setTimeout(resolve, 50));

      // Should NOT have sent anything (no results)
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('git info promise rejection', () => {
    it('should handle git command failure gracefully', async () => {
      // Mock child_process.exec to fail
      const { exec } = await import('child_process');
      const mockExec = vi.mocked(exec);
      mockExec.mockImplementation((_cmd: string, _options: any, callback?: any) => {
        const cb = typeof _options === 'function' ? _options : callback;
        setTimeout(() => cb(new Error('Git command failed'), null), 0);
        return {} as any;
      });

      mockFetch.mockResolvedValue(createSuccessFetchMock());

      const reporter = new SpekraReporter({ apiKey: 'test-api-key', source: 'test-suite' });
      reporter.onBegin(createMockConfig(), createMockSuite());

      const test = createMockTest('test', '/tests/example.spec.ts');
      reporter.onTestEnd(test, createMockResult());

      // Should not throw even if git commands fail
      await expect(reporter.onEnd({ status: 'passed' } as FullResult)).resolves.toBeUndefined();

      // Verify the report was still sent
      expect(mockFetch).toHaveBeenCalled();
    });
  });

  describe('onEnd error handling', () => {
    it('should catch errors in sendFinalReport', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      // Mock fetch to throw
      mockFetch.mockImplementation(() => {
        throw new Error('Unexpected error in sendReport');
      });

      const reporter = new SpekraReporter({
        apiKey: 'test-api-key',
        source: 'test-suite',
        maxRetries: 0,
      });
      reporter.onBegin(createMockConfig(), createMockSuite());

      const test = createMockTest('test', '/tests/example.spec.ts');
      reporter.onTestEnd(test, createMockResult());

      // Should not throw
      await expect(reporter.onEnd({ status: 'passed' } as FullResult)).resolves.toBeUndefined();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to send report')
      );

      consoleErrorSpy.mockRestore();
    });
  });

  describe('methods called before onBegin (config is null)', () => {
    it('should not process tests when reporter is not enabled', async () => {
      const reporter = new SpekraReporter({ apiKey: 'test-api-key', source: 'test-suite' });
      // Don't call onBegin - reporter not initialized

      const test = createMockTest('test', '/tests/example.spec.ts');
      // onTestEnd should return early when not enabled
      reporter.onTestEnd(test, createMockResult());

      // Call onEnd to verify nothing was collected
      await reporter.onEnd({ status: 'passed' } as FullResult);

      // No fetch call should have been made since reporter wasn't initialized
      expect(mockFetch).not.toHaveBeenCalled();
    });

    // Note: Tests for internal methods (sendBatch, truncateErrorMessage) have been removed
    // as these are now implementation details handled by use cases.
    // The behavior is tested through the public API (onBegin, onTestEnd, onEnd).

    it('should not send reports when not initialized', async () => {
      const reporter = new SpekraReporter({ apiKey: 'test-api-key', source: 'test-suite' });
      // Don't call onBegin - reporter not initialized

      // onEnd should return early without sending
      await reporter.onEnd({ status: 'passed' } as FullResult);

      // No fetch call should have been made
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('empty results handling', () => {
    it('should not send report when no test results', async () => {
      mockFetch.mockResolvedValue(createSuccessFetchMock());

      const reporter = new SpekraReporter({ apiKey: 'test-api-key', source: 'test-suite' });
      reporter.onBegin(createMockConfig(), createMockSuite());

      // Don't add any test results, just call onEnd
      await reporter.onEnd({ status: 'passed' } as FullResult);

      // Should not have called fetch (no results to send)
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('error handling in lifecycle methods', () => {
    it('should handle errors in onTestEnd gracefully', async () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      mockFetch.mockResolvedValue(createSuccessFetchMock());

      const reporter = new SpekraReporter({ apiKey: 'test-api-key', source: 'test-suite' });
      reporter.onBegin(createMockConfig(), createMockSuite());

      // Create a malformed test that will cause an error
      const badTest = {
        title: 'test',
        location: null, // This will cause errors in test parsing
        parent: createMockSuite(),
      } as unknown as TestCase;

      // Should not throw
      expect(() => reporter.onTestEnd(badTest, createMockResult())).not.toThrow();
      // New architecture logs via LoggerService with different format
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to collect test result')
      );

      consoleWarnSpy.mockRestore();
    });

    it('should handle errors in onEnd gracefully', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      // Mock fetch to throw an unexpected error
      mockFetch.mockImplementation(() => {
        throw new Error('Unexpected network failure');
      });

      const reporter = new SpekraReporter({
        apiKey: 'test-api-key',
        source: 'test-suite',
        maxRetries: 0,
      });
      reporter.onBegin(createMockConfig(), createMockSuite());

      const test = createMockTest('test', '/tests/example.spec.ts');
      reporter.onTestEnd(test, createMockResult());

      // Should not throw
      await expect(reporter.onEnd({ status: 'passed' } as FullResult)).resolves.toBeUndefined();
      // New architecture logs errors via LoggerService.error (console.error)
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to send report')
      );

      consoleErrorSpy.mockRestore();
    });
  });

  describe('lifecycle edge cases', () => {
    it('should handle onTestEnd called before onBegin', async () => {
      const reporter = new SpekraReporter({ apiKey: 'test-api-key', source: 'test-suite' });

      // Call onTestEnd without calling onBegin first
      const test = createMockTest('test', '/tests/example.spec.ts');

      // Should not throw - reporter is not enabled yet
      expect(() => reporter.onTestEnd(test, createMockResult())).not.toThrow();

      // onEnd should also not throw
      await expect(reporter.onEnd({ status: 'passed' } as FullResult)).resolves.toBeUndefined();

      // No API calls should have been made
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should handle onEnd called multiple times', async () => {
      mockFetch.mockResolvedValue(createSuccessFetchMock());

      const reporter = new SpekraReporter({ apiKey: 'test-api-key', source: 'test-suite' });
      reporter.onBegin(createMockConfig(), createMockSuite());

      const test = createMockTest('test', '/tests/example.spec.ts');
      reporter.onTestEnd(test, createMockResult());

      // First onEnd
      await reporter.onEnd({ status: 'passed' } as FullResult);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Second onEnd - should not send again (buffer already flushed)
      await reporter.onEnd({ status: 'passed' } as FullResult);
      expect(mockFetch).toHaveBeenCalledTimes(1); // Still just 1 call
    });

    it('should handle onBegin called twice (re-initialization)', async () => {
      mockFetch.mockResolvedValue(createSuccessFetchMock());

      const reporter = new SpekraReporter({ apiKey: 'test-api-key', source: 'test-suite' });

      // First initialization
      reporter.onBegin(createMockConfig(), createMockSuite());
      const test1 = createMockTest('test1', '/tests/example.spec.ts');
      reporter.onTestEnd(test1, createMockResult());

      // Second initialization (re-init) - this will reset state
      reporter.onBegin(createMockConfig(), createMockSuite());
      const test2 = createMockTest('test2', '/tests/example.spec.ts');
      reporter.onTestEnd(test2, createMockResult());

      await reporter.onEnd({ status: 'passed' } as FullResult);

      // Should have results from second initialization
      expect(mockFetch).toHaveBeenCalled();
      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);
      // Results from first init may or may not be present depending on implementation
      expect(body.results.length).toBeGreaterThanOrEqual(1);
    });

    it('should warn when buffer limit is exceeded', async () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      mockFetch.mockResolvedValue(createSuccessFetchMock());

      // Create reporter with very small buffer
      const reporter = new SpekraReporter({
        apiKey: 'test-api-key',
        source: 'test-suite',
        maxBufferSize: 2,
        debug: true, // Enable logging
      });
      reporter.onBegin(createMockConfig(), createMockSuite());

      // Add more tests than buffer allows
      for (let i = 0; i < 5; i++) {
        const test = createMockTest(`test${i}`, '/tests/example.spec.ts');
        reporter.onTestEnd(test, createMockResult());
      }

      await reporter.onEnd({ status: 'passed' } as FullResult);

      // Should have logged a buffer warning
      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('Buffer limit exceeded'));

      consoleWarnSpy.mockRestore();
    });

    it('should handle onEnd with no onBegin', async () => {
      const reporter = new SpekraReporter({ apiKey: 'test-api-key', source: 'test-suite' });

      // Call onEnd directly without onBegin
      await expect(reporter.onEnd({ status: 'passed' } as FullResult)).resolves.toBeUndefined();

      // No API calls
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('callback error isolation', () => {
    it('should not crash when onError callback throws synchronously', async () => {
      mockFetch.mockRejectedValue(new Error('API error'));

      const reporter = new SpekraReporter({
        apiKey: 'test-api-key',
        source: 'test-suite',
        maxRetries: 0,
        onError: () => {
          throw new Error('Callback threw!');
        },
      });
      reporter.onBegin(createMockConfig(), createMockSuite());

      const test = createMockTest('test', '/tests/example.spec.ts');
      reporter.onTestEnd(test, createMockResult());

      // Should not throw even though callback throws
      await expect(reporter.onEnd({ status: 'passed' } as FullResult)).resolves.toBeUndefined();
    });

    it('should not crash when onMetrics callback throws', async () => {
      mockFetch.mockResolvedValue(createSuccessFetchMock());

      const reporter = new SpekraReporter({
        apiKey: 'test-api-key',
        source: 'test-suite',
        onMetrics: () => {
          throw new Error('Metrics callback threw!');
        },
      });
      reporter.onBegin(createMockConfig(), createMockSuite());

      const test = createMockTest('test', '/tests/example.spec.ts');
      reporter.onTestEnd(test, createMockResult());

      // Should not throw even though callback throws
      await expect(reporter.onEnd({ status: 'passed' } as FullResult)).resolves.toBeUndefined();
      expect(mockFetch).toHaveBeenCalled();
    });

    it('should log warning when onError callback throws', async () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      mockFetch.mockRejectedValue(new Error('API error'));

      const reporter = new SpekraReporter({
        apiKey: 'test-api-key',
        source: 'test-suite',
        maxRetries: 0,
        debug: true,
        onError: () => {
          throw new Error('Callback error');
        },
      });
      reporter.onBegin(createMockConfig(), createMockSuite());

      const test = createMockTest('test', '/tests/example.spec.ts');
      reporter.onTestEnd(test, createMockResult());

      await reporter.onEnd({ status: 'passed' } as FullResult);

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('onError callback threw')
      );

      consoleWarnSpy.mockRestore();
    });

    it('should log warning when onMetrics callback throws', async () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      mockFetch.mockResolvedValue(createSuccessFetchMock());

      const reporter = new SpekraReporter({
        apiKey: 'test-api-key',
        source: 'test-suite',
        debug: true,
        onMetrics: () => {
          throw new Error('Metrics error');
        },
      });
      reporter.onBegin(createMockConfig(), createMockSuite());

      const test = createMockTest('test', '/tests/example.spec.ts');
      reporter.onTestEnd(test, createMockResult());

      await reporter.onEnd({ status: 'passed' } as FullResult);

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('onMetrics callback threw')
      );

      consoleWarnSpy.mockRestore();
    });
  });
});
