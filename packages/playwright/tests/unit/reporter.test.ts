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

function createMockTest(title: string, filePath: string, parentTitle?: string): TestCase {
  const parentSuite: Suite = {
    title: parentTitle || '',
    parent: undefined,
    project: () => undefined,
  } as Suite;

  return {
    title,
    location: { file: filePath, line: 1, column: 1 },
    parent: parentSuite,
  } as TestCase;
}

function createNestedMockTest(title: string, filePath: string, parents: string[]): TestCase {
  // Build nested suite structure from root to leaf
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
  } as TestCase;
}

function createMockTestWithProject(title: string, filePath: string, projectName: string): TestCase {
  const parentSuite: Suite = {
    title: '',
    parent: undefined,
    project: () => ({ name: projectName }) as any,
  } as Suite;

  return {
    title,
    location: { file: filePath, line: 1, column: 1 },
    parent: parentSuite,
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
    mockFetch.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('OK'),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('initialization', () => {
    it('should disable reporting when no API key is provided', () => {
      const reporter = new SpekraReporter({});
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

    it('should enable reporting with valid API key', () => {
      const reporter = new SpekraReporter({ apiKey: 'test-api-key', debug: true });
      const config = createMockConfig();
      const suite = createMockSuite();

      reporter.onBegin(config, suite);

      expect(true).toBe(true); // Reporter initialized without throwing
    });

    it('should respect enabled: false option', () => {
      const reporter = new SpekraReporter({ apiKey: 'test-api-key', enabled: false });
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
      const reporter = new SpekraReporter({ apiKey: 'test-api-key', batchSize: 100 });
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
        testTitle: 'Example > should pass',
        status: 'passed',
        durationMs: 500,
      });
    });

    it('should handle failed tests with error messages', async () => {
      const reporter = new SpekraReporter({ apiKey: 'test-api-key', batchSize: 100 });
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

    it('should batch results when batchSize is reached', async () => {
      const reporter = new SpekraReporter({ apiKey: 'test-api-key', batchSize: 2 });
      const config = createMockConfig();
      const suite = createMockSuite();

      reporter.onBegin(config, suite);

      // Add 3 tests (should trigger batch at 2)
      for (let i = 0; i < 3; i++) {
        const test = createMockTest(`test ${i}`, '/tests/example.spec.ts');
        reporter.onTestEnd(test, createMockResult());
      }

      await reporter.onEnd({ status: 'passed' } as FullResult);

      // Should have at least 2 calls: one batch + one final
      // Note: may have more calls due to fire-and-forget batch sends
      expect(mockFetch.mock.calls.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('file path handling', () => {
    it('should extract relative path from test file', async () => {
      const reporter = new SpekraReporter({ apiKey: 'test-api-key', batchSize: 100 });
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
      const reporter = new SpekraReporter({ apiKey: 'test-api-key', batchSize: 100 });
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
      const reporter = new SpekraReporter({ apiKey: 'test-api-key', projectName: 'my-project' });
      const config = createMockConfig();
      const suite = createMockSuite();

      reporter.onBegin(config, suite);

      const test = createMockTest('test', '/tests/example.spec.ts');
      reporter.onTestEnd(test, createMockResult());

      await reporter.onEnd({ status: 'passed' } as FullResult);

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);

      expect(body).toHaveProperty('runId');
      expect(body).toHaveProperty('project', 'my-project');
      expect(body).toHaveProperty('branch');
      expect(body).toHaveProperty('commitSha');
      expect(body).toHaveProperty('startedAt');
      expect(body).toHaveProperty('finishedAt');
      expect(body).toHaveProperty('results');
    });

    it('should use project name from config when not overridden', async () => {
      const reporter = new SpekraReporter({ apiKey: 'test-api-key' });
      const config = createMockConfig({ projects: [{ name: 'firefox' }] as any });
      const suite = createMockSuite();

      reporter.onBegin(config, suite);

      const test = createMockTest('test', '/tests/example.spec.ts');
      reporter.onTestEnd(test, createMockResult());

      await reporter.onEnd({ status: 'passed' } as FullResult);

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);

      expect(body.project).toBe('firefox');
    });
  });

  describe('error handling', () => {
    it('should not throw when API request fails', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const reporter = new SpekraReporter({ apiKey: 'test-api-key' });
      const config = createMockConfig();
      const suite = createMockSuite();

      reporter.onBegin(config, suite);

      const test = createMockTest('test', '/tests/example.spec.ts');
      reporter.onTestEnd(test, createMockResult());

      // Should not throw
      await expect(reporter.onEnd({ status: 'passed' } as FullResult)).resolves.toBeUndefined();
    });

    it('should not throw when API returns error status', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Internal Server Error'),
      });

      const reporter = new SpekraReporter({ apiKey: 'test-api-key' });
      const config = createMockConfig();
      const suite = createMockSuite();

      reporter.onBegin(config, suite);

      const test = createMockTest('test', '/tests/example.spec.ts');
      reporter.onTestEnd(test, createMockResult());

      // Should not throw
      await expect(reporter.onEnd({ status: 'passed' } as FullResult)).resolves.toBeUndefined();
    });

    it('should restore results when batch send fails and retry in final report', async () => {
      // First batch call fails (with no retries), subsequent calls succeed
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 503,
          text: () => Promise.resolve('Service Unavailable'),
        })
        .mockResolvedValue({
          ok: true,
          text: () => Promise.resolve('OK'),
        });

      // Use batchSize: 3 so adding 3rd test doesn't trigger another batch
      // Disable retries for simpler test
      const reporter = new SpekraReporter({ apiKey: 'test-api-key', batchSize: 3, maxRetries: 0 });
      reporter.onBegin(createMockConfig(), createMockSuite());

      // Add 3 tests to trigger batch
      const test1 = createMockTest('test 1', '/tests/example.spec.ts');
      reporter.onTestEnd(test1, createMockResult());
      const test2 = createMockTest('test 2', '/tests/example.spec.ts');
      reporter.onTestEnd(test2, createMockResult());
      const test3 = createMockTest('test 3', '/tests/example.spec.ts');
      reporter.onTestEnd(test3, createMockResult());

      // Wait for batch to attempt (fire-and-forget but we need to let it run)
      await new Promise((resolve) => setTimeout(resolve, 100));

      await reporter.onEnd({ status: 'passed' } as FullResult);

      // Should have made 2 calls: failed batch + successful final
      expect(mockFetch).toHaveBeenCalledTimes(2);

      // Final report should include all 3 tests (restored from failed batch)
      const [, finalOptions] = mockFetch.mock.calls[1];
      const finalBody = JSON.parse(finalOptions.body);
      expect(finalBody.results).toHaveLength(3);
      expect(finalBody.results.map((r: any) => r.testTitle)).toContain('test 1');
      expect(finalBody.results.map((r: any) => r.testTitle)).toContain('test 2');
      expect(finalBody.results.map((r: any) => r.testTitle)).toContain('test 3');
    });

    it('should not send empty final report when all results sent in batch', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('OK'),
      });

      const reporter = new SpekraReporter({ apiKey: 'test-api-key', batchSize: 2 });
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

    it('should log warning when final report fails', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Internal Server Error'),
      });

      // Disable retries for simpler test
      const reporter = new SpekraReporter({ apiKey: 'test-api-key', maxRetries: 0 });
      reporter.onBegin(createMockConfig(), createMockSuite());

      const test = createMockTest('test', '/tests/example.spec.ts');
      reporter.onTestEnd(test, createMockResult());

      await reporter.onEnd({ status: 'passed' } as FullResult);

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[Spekra] Failed to send final report')
      );

      warnSpy.mockRestore();
    });

    it('should log warning when batch send fails', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      mockFetch.mockResolvedValue({
        ok: false,
        status: 503,
        text: () => Promise.resolve('Service Unavailable'),
      });

      // Disable retries for simpler test
      const reporter = new SpekraReporter({ apiKey: 'test-api-key', batchSize: 2, maxRetries: 0 });
      reporter.onBegin(createMockConfig(), createMockSuite());

      // Add 2 tests to trigger batch
      const test1 = createMockTest('test 1', '/tests/example.spec.ts');
      reporter.onTestEnd(test1, createMockResult());
      const test2 = createMockTest('test 2', '/tests/example.spec.ts');
      reporter.onTestEnd(test2, createMockResult());

      // Wait for batch to attempt
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[Spekra] Batch send failed, will retry in final report')
      );

      warnSpy.mockRestore();
    });
  });

  describe('shard support', () => {
    it('should include shard info from config', async () => {
      const reporter = new SpekraReporter({ apiKey: 'test-api-key' });
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

      const reporter = new SpekraReporter({ apiKey: 'test-api-key' });
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

      const reporter = new SpekraReporter({ apiKey: 'test-api-key' });
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
      const reporter = new SpekraReporter({ apiKey: 'test-api-key' });
      reporter.onBegin(createMockConfig(), createMockSuite());

      const test = createMockTest('test', '/tests/example.spec.ts');
      reporter.onTestEnd(test, createMockResult('passed'));

      await reporter.onEnd({ status: 'passed' } as FullResult);

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.results[0].status).toBe('passed');
    });

    it('should map failed status', async () => {
      const reporter = new SpekraReporter({ apiKey: 'test-api-key' });
      reporter.onBegin(createMockConfig(), createMockSuite());

      const test = createMockTest('test', '/tests/example.spec.ts');
      reporter.onTestEnd(test, createMockResult('failed'));

      await reporter.onEnd({ status: 'failed' } as FullResult);

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.results[0].status).toBe('failed');
    });

    it('should map skipped status', async () => {
      const reporter = new SpekraReporter({ apiKey: 'test-api-key' });
      reporter.onBegin(createMockConfig(), createMockSuite());

      const test = createMockTest('test', '/tests/example.spec.ts');
      reporter.onTestEnd(test, createMockResult('skipped'));

      await reporter.onEnd({ status: 'passed' } as FullResult);

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.results[0].status).toBe('skipped');
    });

    it('should map timedOut status', async () => {
      const reporter = new SpekraReporter({ apiKey: 'test-api-key' });
      reporter.onBegin(createMockConfig(), createMockSuite());

      const test = createMockTest('test', '/tests/example.spec.ts');
      reporter.onTestEnd(test, createMockResult('timedOut'));

      await reporter.onEnd({ status: 'timedOut' } as any);

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.results[0].status).toBe('timedOut');
    });

    it('should map interrupted status', async () => {
      const reporter = new SpekraReporter({ apiKey: 'test-api-key' });
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
      const reporter = new SpekraReporter({ apiKey: 'test-api-key' });
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
      expect(body.results[0].testTitle).toBe(
        'Authentication > Login Form > Validation > should validate input'
      );
    });

    it('should handle test with no parent title', async () => {
      const reporter = new SpekraReporter({ apiKey: 'test-api-key' });
      reporter.onBegin(createMockConfig(), createMockSuite());

      const test = createMockTest('should work', '/tests/example.spec.ts', '');
      reporter.onTestEnd(test, createMockResult());

      await reporter.onEnd({ status: 'passed' } as FullResult);

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.results[0].testTitle).toBe('should work');
    });
  });

  describe('test file path extraction', () => {
    it('should extract path from /e2e/ directory', async () => {
      const reporter = new SpekraReporter({ apiKey: 'test-api-key' });
      reporter.onBegin(createMockConfig(), createMockSuite());

      const test = createMockTest('test', '/project/e2e/auth/login.spec.ts');
      reporter.onTestEnd(test, createMockResult());

      await reporter.onEnd({ status: 'passed' } as FullResult);

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.results[0].testFile).toBe('auth/login.spec.ts');
    });

    it('should extract path from /test/ directory', async () => {
      const reporter = new SpekraReporter({ apiKey: 'test-api-key' });
      reporter.onBegin(createMockConfig(), createMockSuite());

      const test = createMockTest('test', '/project/test/unit/utils.spec.ts');
      reporter.onTestEnd(test, createMockResult());

      await reporter.onEnd({ status: 'passed' } as FullResult);

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.results[0].testFile).toBe('unit/utils.spec.ts');
    });

    it('should extract path from /__tests__/ directory', async () => {
      const reporter = new SpekraReporter({ apiKey: 'test-api-key' });
      reporter.onBegin(createMockConfig(), createMockSuite());

      const test = createMockTest('test', '/project/__tests__/component.spec.ts');
      reporter.onTestEnd(test, createMockResult());

      await reporter.onEnd({ status: 'passed' } as FullResult);

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.results[0].testFile).toBe('component.spec.ts');
    });

    it('should extract path from /specs/ directory', async () => {
      const reporter = new SpekraReporter({ apiKey: 'test-api-key' });
      reporter.onBegin(createMockConfig(), createMockSuite());

      const test = createMockTest('test', '/project/specs/api/users.spec.ts');
      reporter.onTestEnd(test, createMockResult());

      await reporter.onEnd({ status: 'passed' } as FullResult);

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.results[0].testFile).toBe('api/users.spec.ts');
    });

    it('should extract path from /spec/ directory', async () => {
      const reporter = new SpekraReporter({ apiKey: 'test-api-key' });
      reporter.onBegin(createMockConfig(), createMockSuite());

      const test = createMockTest('test', '/project/spec/models/user.spec.ts');
      reporter.onTestEnd(test, createMockResult());

      await reporter.onEnd({ status: 'passed' } as FullResult);

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.results[0].testFile).toBe('models/user.spec.ts');
    });

    it('should fallback to last two path segments when no marker found', async () => {
      const reporter = new SpekraReporter({ apiKey: 'test-api-key' });
      reporter.onBegin(createMockConfig(), createMockSuite());

      const test = createMockTest('test', '/project/src/components/Button.spec.ts');
      reporter.onTestEnd(test, createMockResult());

      await reporter.onEnd({ status: 'passed' } as FullResult);

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.results[0].testFile).toBe('components/Button.spec.ts');
    });

    it('should handle single filename path', async () => {
      const reporter = new SpekraReporter({ apiKey: 'test-api-key' });
      reporter.onBegin(createMockConfig(), createMockSuite());

      const test = createMockTest('test', 'example.spec.ts');
      reporter.onTestEnd(test, createMockResult());

      await reporter.onEnd({ status: 'passed' } as FullResult);

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.results[0].testFile).toBe('example.spec.ts');
    });

    it('should handle empty file path fallback', async () => {
      const reporter = new SpekraReporter({ apiKey: 'test-api-key' });
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
      const reporter = new SpekraReporter({ apiKey: 'test-api-key' });
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
      const reporter = new SpekraReporter({ apiKey: 'test-api-key' });
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
      const reporter = new SpekraReporter({ apiKey: 'test-api-key' });
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
      const reporter = new SpekraReporter({ apiKey: 'test-api-key' });
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
    it('should update project name from test when different', async () => {
      const reporter = new SpekraReporter({ apiKey: 'test-api-key' });
      reporter.onBegin(
        createMockConfig({ projects: [{ name: 'initial-project' }] as any }),
        createMockSuite()
      );

      const test = createMockTestWithProject('test', '/tests/example.spec.ts', 'webkit');
      reporter.onTestEnd(test, createMockResult());

      await reporter.onEnd({ status: 'passed' } as FullResult);

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.project).toBe('webkit');
    });

    it('should use default when no projects in config', async () => {
      const reporter = new SpekraReporter({ apiKey: 'test-api-key' });
      reporter.onBegin(createMockConfig({ projects: [] }), createMockSuite());

      const test = createMockTest('test', '/tests/example.spec.ts');
      reporter.onTestEnd(test, createMockResult());

      await reporter.onEnd({ status: 'passed' } as FullResult);

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.project).toBe('default');
    });
  });

  describe('configuration options', () => {
    it('should use API key from environment variable', async () => {
      const originalEnv = process.env.SPEKRA_API_KEY;
      process.env.SPEKRA_API_KEY = 'env-api-key';

      const reporter = new SpekraReporter({});
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

      const reporter = new SpekraReporter({ apiKey: 'option-api-key' });
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
    it('should log CI branch and commit info when available', async () => {
      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const originalEnv = { ...process.env };
      process.env.GITHUB_ACTIONS = 'true';
      process.env.GITHUB_RUN_ID = 'gh-run-123';
      process.env.GITHUB_REF_NAME = 'feature-branch';
      process.env.GITHUB_SHA = 'abc123def456';
      process.env.GITHUB_SERVER_URL = 'https://github.com';
      process.env.GITHUB_REPOSITORY = 'org/repo';

      mockFetch.mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('OK'),
      });

      const reporter = new SpekraReporter({ apiKey: 'test-api-key', debug: true });
      reporter.onBegin(createMockConfig(), createMockSuite());

      // CI info should be logged
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('CI:'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Branch: feature-branch'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Commit: abc123def456'));

      process.env = originalEnv;
      consoleLogSpy.mockRestore();
    });

    it('should use CI run ID when available', async () => {
      const originalEnv = { ...process.env };
      delete process.env.TEST_RUN_ID;
      process.env.GITHUB_ACTIONS = 'true';
      process.env.GITHUB_RUN_ID = 'gh-run-456';
      // Ensure no attempt suffix is added
      delete process.env.GITHUB_RUN_ATTEMPT;

      const reporter = new SpekraReporter({ apiKey: 'test-api-key' });
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

      const reporter = new SpekraReporter({ apiKey: 'test-api-key' });
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
      const reporter = new SpekraReporter({ apiKey: 'test-api-key' });
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

    it('should log debug info when debug is enabled', () => {
      const reporter = new SpekraReporter({ apiKey: 'test-api-key', debug: true });
      reporter.onBegin(createMockConfig(), createMockSuite());

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('[Spekra] Run ID:'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('[Spekra] Project:'));
    });

    it('should not log debug info when debug is disabled', () => {
      const reporter = new SpekraReporter({ apiKey: 'test-api-key', debug: false });
      reporter.onBegin(createMockConfig(), createMockSuite());

      // Only the "Reporting enabled" message should be logged
      const debugCalls = consoleLogSpy.mock.calls.filter(
        (call: string[]) => call[0].includes('Run ID:') || call[0].includes('Project:')
      );
      expect(debugCalls).toHaveLength(0);
    });
  });

  describe('initialization error handling', () => {
    it('should handle initialization errors gracefully', async () => {
      // Create a reporter that will fail to initialize due to malformed config
      const reporter = new SpekraReporter({ apiKey: 'test-api-key' });

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

  describe('error message truncation', () => {
    it('should truncate stack traces exceeding maxStackTraceLines', async () => {
      const reporter = new SpekraReporter({
        apiKey: 'test-api-key',
        maxStackTraceLines: 5,
      });
      reporter.onBegin(createMockConfig(), createMockSuite());

      // Create actual Error with many stack trace lines
      const error = new Error('Something went wrong');
      const errorLines = ['Error: Something went wrong'];
      for (let i = 0; i < 20; i++) {
        errorLines.push(`    at function${i} (file${i}.ts:${i}:1)`);
      }
      error.stack = errorLines.join('\n');

      const test = createMockTest('test', '/tests/example.spec.ts');
      reporter.onTestEnd(test, createMockResult('failed', 1000, 0, error));

      await reporter.onEnd({ status: 'failed' } as FullResult);

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);
      const errorMessage = body.results[0].errorMessage;

      // Should have 5 lines + truncation message
      const lines = errorMessage.split('\n');
      expect(lines.length).toBe(6);
      expect(lines[5]).toContain('16 more lines truncated');
    });

    it('should truncate error message exceeding maxErrorLength', async () => {
      const reporter = new SpekraReporter({
        apiKey: 'test-api-key',
        maxErrorLength: 100,
      });
      reporter.onBegin(createMockConfig(), createMockSuite());

      // Create actual Error with long message
      const error = new Error('A'.repeat(200));

      const test = createMockTest('test', '/tests/example.spec.ts');
      reporter.onTestEnd(test, createMockResult('failed', 1000, 0, error));

      await reporter.onEnd({ status: 'failed' } as FullResult);

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);
      const errorMessage = body.results[0].errorMessage;

      // Should be truncated to 100 chars + truncation marker
      expect(errorMessage.length).toBeLessThan(250);
      expect(errorMessage).toContain('... (truncated)');
    });

    it('should apply both line and length truncation', async () => {
      const reporter = new SpekraReporter({
        apiKey: 'test-api-key',
        maxStackTraceLines: 3,
        maxErrorLength: 50,
      });
      reporter.onBegin(createMockConfig(), createMockSuite());

      // Create actual Error with many long lines
      const error = new Error('Something went wrong');
      const errorLines = ['Error: Something went wrong'];
      for (let i = 0; i < 10; i++) {
        errorLines.push('    at ' + 'x'.repeat(50) + ` (file${i}.ts:${i}:1)`);
      }
      error.stack = errorLines.join('\n');

      const test = createMockTest('test', '/tests/example.spec.ts');
      reporter.onTestEnd(test, createMockResult('failed', 1000, 0, error));

      await reporter.onEnd({ status: 'failed' } as FullResult);

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);
      const errorMessage = body.results[0].errorMessage;

      // Should be within length limit
      expect(errorMessage.length).toBeLessThanOrEqual(50 + '... (truncated)'.length);
      expect(errorMessage).toContain('... (truncated)');
    });

    it('should not truncate short error messages', async () => {
      const reporter = new SpekraReporter({
        apiKey: 'test-api-key',
        maxStackTraceLines: 20,
        maxErrorLength: 4000,
      });
      reporter.onBegin(createMockConfig(), createMockSuite());

      // Short error object (not Error instance, no stack)
      const shortError = { message: 'Short error message' };

      const test = createMockTest('test', '/tests/example.spec.ts');
      reporter.onTestEnd(test, createMockResult('failed', 1000, 0, shortError));

      await reporter.onEnd({ status: 'failed' } as FullResult);

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);
      const errorMessage = body.results[0].errorMessage;

      expect(errorMessage).toBe('Short error message');
      expect(errorMessage).not.toContain('truncated');
    });

    it('should use default truncation limits when not configured', async () => {
      const reporter = new SpekraReporter({ apiKey: 'test-api-key' });
      reporter.onBegin(createMockConfig(), createMockSuite());

      // Create actual Error with 26 lines (> default 20)
      const error = new Error('Test error');
      const errorLines = ['Error: Test error'];
      for (let i = 0; i < 25; i++) {
        errorLines.push(`    at fn${i} (file.ts:${i}:1)`);
      }
      error.stack = errorLines.join('\n');

      const test = createMockTest('test', '/tests/example.spec.ts');
      reporter.onTestEnd(test, createMockResult('failed', 1000, 0, error));

      await reporter.onEnd({ status: 'failed' } as FullResult);

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);
      const errorMessage = body.results[0].errorMessage;

      // Default is 20 lines, so 26 - 20 = 6 lines truncated
      expect(errorMessage).toContain('6 more lines truncated');
    });
  });

  describe('new configuration options', () => {
    it('should accept custom timeout configuration', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('OK'),
      });

      const reporter = new SpekraReporter({
        apiKey: 'test-api-key',
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
      mockFetch.mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('OK'),
      });

      const reporter = new SpekraReporter({
        apiKey: 'test-api-key',
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
      mockFetch.mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('OK'),
      });

      const reporter = new SpekraReporter({
        apiKey: 'test-api-key',
        apiUrl: 'https://custom.api/reports',
        projectName: 'my-project',
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
      mockFetch.mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('OK'),
      });

      const reporter = new SpekraReporter({ apiKey: 'test-api-key' });

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

      mockFetch.mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('OK'),
      });

      const reporter = new SpekraReporter({ apiKey: 'test-api-key' });

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
      mockFetch.mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('OK'),
      });

      const reporter = new SpekraReporter({ apiKey: 'test-api-key' });
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

      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Server Error'),
      });

      const throwingOnError = vi.fn(() => {
        throw new Error('Callback error');
      });

      const reporter = new SpekraReporter({
        apiKey: 'test-api-key',
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

      mockFetch.mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('OK'),
      });

      const throwingOnMetrics = vi.fn(() => {
        throw new Error('Metrics callback error');
      });

      const reporter = new SpekraReporter({
        apiKey: 'test-api-key',
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

      mockFetch.mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('OK'),
      });

      const throwingOnMetrics = vi.fn(() => {
        // eslint-disable-next-line @typescript-eslint/only-throw-error
        throw 'string error'; // Intentionally throwing non-Error to test error handling
      });

      const reporter = new SpekraReporter({
        apiKey: 'test-api-key',
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

      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Server Error'),
      });

      const throwingOnError = vi.fn(() => {
        // eslint-disable-next-line @typescript-eslint/only-throw-error
        throw 'string error'; // Intentionally throwing non-Error to test error handling
      });

      const reporter = new SpekraReporter({
        apiKey: 'test-api-key',
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

  describe('configuration validation edge cases', () => {
    it('should warn and use default for invalid maxBufferSize', async () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      mockFetch.mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('OK'),
      });

      const reporter = new SpekraReporter({
        apiKey: 'test-api-key',
        maxBufferSize: 0, // Invalid - should trigger warning
      });
      reporter.onBegin(createMockConfig(), createMockSuite());

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('maxBufferSize must be > 0')
      );

      consoleWarnSpy.mockRestore();
    });

    it('should warn and use default for negative maxBufferSize', async () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      mockFetch.mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('OK'),
      });

      const reporter = new SpekraReporter({
        apiKey: 'test-api-key',
        maxBufferSize: -5, // Invalid - should trigger warning
      });
      reporter.onBegin(createMockConfig(), createMockSuite());

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('maxBufferSize must be > 0')
      );

      consoleWarnSpy.mockRestore();
    });

    it('should warn and use default for invalid maxErrorLength', async () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      mockFetch.mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('OK'),
      });

      const reporter = new SpekraReporter({
        apiKey: 'test-api-key',
        maxErrorLength: 0, // Invalid - should trigger warning
      });
      reporter.onBegin(createMockConfig(), createMockSuite());

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('maxErrorLength must be > 0')
      );

      consoleWarnSpy.mockRestore();
    });

    it('should warn and use default for invalid maxStackTraceLines', async () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      mockFetch.mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('OK'),
      });

      const reporter = new SpekraReporter({
        apiKey: 'test-api-key',
        maxStackTraceLines: -1, // Invalid - should trigger warning
      });
      reporter.onBegin(createMockConfig(), createMockSuite());

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('maxStackTraceLines must be > 0')
      );

      consoleWarnSpy.mockRestore();
    });

    it('should warn and use default for invalid retryBaseDelayMs', async () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      mockFetch.mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('OK'),
      });

      const reporter = new SpekraReporter({
        apiKey: 'test-api-key',
        retryBaseDelayMs: 0, // Invalid - should trigger warning
      });
      reporter.onBegin(createMockConfig(), createMockSuite());

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('retryBaseDelayMs must be > 0')
      );

      consoleWarnSpy.mockRestore();
    });

    it('should warn when retryMaxDelayMs is less than retryBaseDelayMs', async () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      mockFetch.mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('OK'),
      });

      const reporter = new SpekraReporter({
        apiKey: 'test-api-key',
        retryBaseDelayMs: 5000,
        retryMaxDelayMs: 1000, // Invalid - less than base
      });
      reporter.onBegin(createMockConfig(), createMockSuite());

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('retryMaxDelayMs must be >= retryBaseDelayMs')
      );

      consoleWarnSpy.mockRestore();
    });

    it('should warn and use default for invalid batchSize (zero)', async () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      mockFetch.mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('OK'),
      });

      const reporter = new SpekraReporter({
        apiKey: 'test-api-key',
        batchSize: 0, // Invalid - must be 1-1000
      });
      reporter.onBegin(createMockConfig(), createMockSuite());

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('batchSize must be 1-1000')
      );

      consoleWarnSpy.mockRestore();
    });

    it('should warn and use default for invalid batchSize (too large)', async () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      mockFetch.mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('OK'),
      });

      const reporter = new SpekraReporter({
        apiKey: 'test-api-key',
        batchSize: 2000, // Invalid - exceeds 1000
      });
      reporter.onBegin(createMockConfig(), createMockSuite());

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('batchSize must be 1-1000')
      );

      consoleWarnSpy.mockRestore();
    });

    it('should warn and use default for invalid timeout', async () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      mockFetch.mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('OK'),
      });

      const reporter = new SpekraReporter({
        apiKey: 'test-api-key',
        timeout: 0, // Invalid - must be > 0
      });
      reporter.onBegin(createMockConfig(), createMockSuite());

      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('timeout must be > 0'));

      consoleWarnSpy.mockRestore();
    });

    it('should warn and use default for negative maxRetries', async () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      mockFetch.mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('OK'),
      });

      const reporter = new SpekraReporter({
        apiKey: 'test-api-key',
        maxRetries: -1, // Invalid - must be >= 0
      });
      reporter.onBegin(createMockConfig(), createMockSuite());

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('maxRetries must be >= 0')
      );

      consoleWarnSpy.mockRestore();
    });
  });

  describe('shard environment variable edge cases', () => {
    it('should warn on invalid non-numeric shard env vars', async () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      // Set invalid shard env vars (non-numeric)
      const originalEnv = { ...process.env };
      process.env.TEST_SHARD_INDEX = 'not-a-number';
      process.env.TEST_TOTAL_SHARDS = 'also-not-a-number';

      mockFetch.mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('OK'),
      });

      const reporter = new SpekraReporter({ apiKey: 'test-api-key' });
      reporter.onBegin(createMockConfig(), createMockSuite());

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Invalid shard env vars')
      );

      // Restore env
      process.env = originalEnv;
      consoleWarnSpy.mockRestore();
    });

    it('should warn on zero shard values', async () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      // Set zero shard env vars (invalid - should be > 0)
      const originalEnv = { ...process.env };
      process.env.TEST_SHARD_INDEX = '0';
      process.env.TEST_TOTAL_SHARDS = '0';

      mockFetch.mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('OK'),
      });

      const reporter = new SpekraReporter({ apiKey: 'test-api-key' });
      reporter.onBegin(createMockConfig(), createMockSuite());

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Invalid shard env vars')
      );

      // Restore env
      process.env = originalEnv;
      consoleWarnSpy.mockRestore();
    });
  });

  describe('error message extraction edge cases', () => {
    it('should handle plain string error', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('OK'),
      });

      const reporter = new SpekraReporter({ apiKey: 'test-api-key' });
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
      mockFetch.mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('OK'),
      });

      const reporter = new SpekraReporter({ apiKey: 'test-api-key' });
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
      mockFetch.mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('OK'),
      });

      const reporter = new SpekraReporter({ apiKey: 'test-api-key' });
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
      const reporter = new SpekraReporter({ enabled: false });
      reporter.onBegin(createMockConfig(), createMockSuite());

      const test = createMockTest('test', '/tests/example.spec.ts');
      reporter.onTestEnd(test, createMockResult());
      await reporter.onEnd({ status: 'passed' } as FullResult);

      // No fetch calls should be made
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should handle sendBatch when results are empty', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('OK'),
      });

      const reporter = new SpekraReporter({ apiKey: 'test-api-key', batchSize: 1 });
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
      mockFetch.mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('OK'),
      });

      const reporter = new SpekraReporter({ apiKey: 'test-api-key', debug: true });
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
      mockFetch.mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('OK'),
      });

      const reporter = new SpekraReporter({ apiKey: 'test-api-key' });
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
    it('should handle gitInfoPromise rejection gracefully', async () => {
      // Create a reporter with a gitInfoPromise that will reject
      mockFetch.mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('OK'),
      });

      const reporter = new SpekraReporter({ apiKey: 'test-api-key' });
      reporter.onBegin(createMockConfig(), createMockSuite());

      // Manually set a rejecting gitInfoPromise
      (reporter as any).gitInfoPromise = Promise.reject(new Error('Git fetch failed'));

      const test = createMockTest('test', '/tests/example.spec.ts');
      reporter.onTestEnd(test, createMockResult());

      // Should not throw even if gitInfoPromise rejects
      await expect(reporter.onEnd({ status: 'passed' } as FullResult)).resolves.toBeUndefined();
    });
  });

  describe('onEnd error handling', () => {
    it('should catch errors in sendFinalReport', async () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      mockFetch.mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('OK'),
      });

      const reporter = new SpekraReporter({ apiKey: 'test-api-key' });
      reporter.onBegin(createMockConfig(), createMockSuite());

      const test = createMockTest('test', '/tests/example.spec.ts');
      reporter.onTestEnd(test, createMockResult());

      // Make the apiClient's sendReport throw
      (reporter as any).apiClient.sendReport = () => {
        throw new Error('Unexpected error in sendReport');
      };

      // Should not throw
      await expect(reporter.onEnd({ status: 'passed' } as FullResult)).resolves.toBeUndefined();
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to send final report')
      );

      consoleWarnSpy.mockRestore();
    });
  });

  describe('methods called before onBegin (config is null)', () => {
    it('should use defaults when onTestEnd is called before onBegin', () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const reporter = new SpekraReporter({ apiKey: 'test-api-key' });
      // Don't call onBegin - config will be null

      const test = createMockTest('test', '/tests/example.spec.ts');
      // This should not throw - uses DEFAULTS when config is null
      reporter.onTestEnd(test, createMockResult());

      // Internal results should still be populated
      expect((reporter as any).results.length).toBe(1);

      consoleWarnSpy.mockRestore();
    });

    it('should handle sendBatch with no apiClient', async () => {
      const reporter = new SpekraReporter({ apiKey: 'test-api-key' });
      // Don't call onBegin - apiClient will be null

      // Manually add a result to bypass onTestEnd checks
      (reporter as any).results = [{ test: 'data' }];

      // Call sendBatch directly - should return early when no apiClient
      await (reporter as any).sendBatch();

      // Results should still be there (not sent)
      expect((reporter as any).results.length).toBe(1);
    });

    it('should handle sendFinalReport with no apiClient', async () => {
      const reporter = new SpekraReporter({ apiKey: 'test-api-key' });
      // Don't call onBegin - apiClient will be null

      // Call sendFinalReport directly - should return early
      await (reporter as any).sendFinalReport();

      // No error should occur
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should use defaults in truncateErrorMessage when config is null', () => {
      const reporter = new SpekraReporter({ apiKey: 'test-api-key' });
      // Don't call onBegin - config will be null

      // Call truncateErrorMessage directly
      const longMessage = 'Line 1\nLine 2\nLine 3\nLine 4\nLine 5\n' + 'a'.repeat(10000);
      const result = (reporter as any).truncateErrorMessage(longMessage);

      // Should use default limits and truncate
      expect(result.length).toBeLessThan(longMessage.length);
    });
  });

  describe('sendBatch with empty results', () => {
    it('should return early when results array is empty', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('OK'),
      });

      const reporter = new SpekraReporter({ apiKey: 'test-api-key' });
      reporter.onBegin(createMockConfig(), createMockSuite());

      // Results is empty, apiClient is set
      // Call sendBatch directly
      await (reporter as any).sendBatch();

      // Should not have called fetch
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('error handling in lifecycle methods', () => {
    it('should handle errors in onTestEnd gracefully', async () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      mockFetch.mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('OK'),
      });

      const reporter = new SpekraReporter({ apiKey: 'test-api-key' });
      reporter.onBegin(createMockConfig(), createMockSuite());

      // Create a malformed test that will cause an error
      const badTest = {
        title: 'test',
        location: null, // This will cause getTestFile to throw
        parent: createMockSuite(),
      } as unknown as TestCase;

      // Should not throw
      expect(() => reporter.onTestEnd(badTest, createMockResult())).not.toThrow();
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to process test result')
      );

      consoleWarnSpy.mockRestore();
    });

    it('should handle errors in onEnd gracefully', async () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      // Mock fetch to throw an unexpected error
      mockFetch.mockImplementation(() => {
        throw new Error('Unexpected network failure');
      });

      const reporter = new SpekraReporter({ apiKey: 'test-api-key', maxRetries: 0 });
      reporter.onBegin(createMockConfig(), createMockSuite());

      const test = createMockTest('test', '/tests/example.spec.ts');
      reporter.onTestEnd(test, createMockResult());

      // Should not throw
      await expect(reporter.onEnd({ status: 'passed' } as FullResult)).resolves.toBeUndefined();
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to send final report')
      );

      consoleWarnSpy.mockRestore();
    });
  });
});
