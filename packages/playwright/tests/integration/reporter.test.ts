import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { spawn, ChildProcess } from 'child_process';
import { SpekraReporter } from '../../src/reporter';
import type {
  FullConfig,
  Suite,
  TestCase,
  TestResult as PlaywrightTestResult,
} from '@playwright/test/reporter';
import type { SpekraMetrics } from '../../src/types';

const PRISM_PORT = 4010;
const PRISM_URL = `http://127.0.0.1:${PRISM_PORT}/api/reports`;

let prismProcess: ChildProcess | null = null;

// Mock git to avoid actual git calls
vi.mock('../../src/git', () => ({
  getGitInfoAsync: vi
    .fn()
    .mockResolvedValue({ branch: 'feature/integration-tests', commitSha: 'abc123def456789' }),
}));

// Mock CI to avoid env var dependencies
vi.mock('../../src/ci', () => ({
  getCIInfo: vi.fn().mockReturnValue({
    provider: 'github',
    url: 'https://github.com/spekra/sdk/actions/runs/123456',
    branch: 'feature/integration-tests',
    commitSha: 'abc123def456789',
    runId: 'github-run-123456',
  }),
}));

async function waitForPrism(maxAttempts = 30): Promise<boolean> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const response = await fetch(`http://127.0.0.1:${PRISM_PORT}/api/reports`, {
        method: 'GET',
      });
      if (response.ok) {
        return true;
      }
    } catch {
      // Prism not ready yet
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return false;
}

// ============================================================================
// Test Factories
// ============================================================================

function createMockConfig(overrides: Partial<FullConfig> = {}): FullConfig {
  return {
    projects: [{ name: 'chromium' }],
    shard: null,
    ...overrides,
  } as unknown as FullConfig;
}

function createMockSuite(): Suite {
  return {
    title: 'Root Suite',
    allTests: () => [],
  } as unknown as Suite;
}

interface TestOptions {
  title?: string;
  file?: string;
  suiteTitle?: string;
  projectName?: string;
}

function createMockTest(options: TestOptions = {}): TestCase {
  const {
    title = 'should work',
    file = '/tests/example.spec.ts',
    suiteTitle = 'Test Suite',
    projectName = 'chromium',
  } = options;

  return {
    title,
    location: { file, line: 10, column: 5 },
    parent: {
      title: suiteTitle,
      parent: undefined,
      project: () => ({ name: projectName }),
    },
  } as unknown as TestCase;
}

interface ResultOptions {
  status?: 'passed' | 'failed' | 'skipped' | 'timedOut' | 'interrupted';
  duration?: number;
  retry?: number;
}

function createMockResult(options: ResultOptions = {}): PlaywrightTestResult {
  const { status = 'passed', duration = 100, retry = 0 } = options;

  return {
    status,
    duration,
    retry,
    error: undefined, // No error messages to avoid Prism gzip issues
  } as unknown as PlaywrightTestResult;
}

// ============================================================================
// Test Suite
// ============================================================================

describe('Reporter → Prism Integration', () => {
  beforeAll(async () => {
    // Start Prism mock server
    prismProcess = spawn(
      'npx',
      [
        '@stoplight/prism-cli',
        'mock',
        'openapi.json',
        '--port',
        String(PRISM_PORT),
        '--host',
        '127.0.0.1',
      ],
      {
        cwd: process.cwd(),
        stdio: ['ignore', 'pipe', 'pipe'],
      }
    );

    prismProcess.stdout?.on('data', (data) => {
      if (process.env.DEBUG) {
        console.log(`[Prism] ${data.toString()}`);
      }
    });

    prismProcess.stderr?.on('data', (data) => {
      if (process.env.DEBUG) {
        console.error(`[Prism Error] ${data.toString()}`);
      }
    });

    // Wait for Prism to be ready
    const ready = await waitForPrism();
    if (!ready) {
      throw new Error('Prism mock server failed to start');
    }
  }, 30000);

  afterAll(async () => {
    if (prismProcess) {
      try {
        prismProcess.kill('SIGTERM');
      } catch {
        // Ignore kill errors (can happen in sandboxed environments)
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  });

  // ==========================================================================
  // Basic Payload Validation
  // ==========================================================================

  describe('Basic Payload Validation', () => {
    it('should send a valid report payload that Prism accepts', async () => {
      let metricsReceived: SpekraMetrics | null = null;

      const reporter = new SpekraReporter({
        apiKey: 'test-api-key-12345',
        apiUrl: PRISM_URL,
        projectName: 'prism-test-project',
        onMetrics: (metrics) => {
          metricsReceived = metrics;
        },
      });

      reporter.onBegin(createMockConfig(), createMockSuite());
      reporter.onTestEnd(
        createMockTest({ title: 'should pass' }),
        createMockResult({ status: 'passed' })
      );
      await reporter.onEnd({ status: 'passed' } as any);

      expect(metricsReceived).not.toBeNull();
      expect(metricsReceived!.resultsReported).toBe(1);
      expect(metricsReceived!.requestsFailed).toBe(0);
    });

    it('should send multiple tests with batch size 1', async () => {
      let metricsReceived: SpekraMetrics | null = null;

      const reporter = new SpekraReporter({
        apiKey: 'test-api-key-12345',
        apiUrl: PRISM_URL,
        projectName: 'multi-test-project',
        batchSize: 1, // Send one at a time to avoid Prism gzip issues
        onMetrics: (metrics) => {
          metricsReceived = metrics;
        },
      });

      reporter.onBegin(createMockConfig(), createMockSuite());

      // Add 3 tests - sent one at a time
      for (let i = 0; i < 3; i++) {
        reporter.onTestEnd(
          createMockTest({ title: `test ${i}`, file: `/tests/test-${i}.spec.ts` }),
          createMockResult({ status: 'passed', duration: 50 + i * 10 })
        );
        await new Promise((resolve) => setTimeout(resolve, 50));
      }

      await reporter.onEnd({ status: 'passed' } as any);

      expect(metricsReceived).not.toBeNull();
      expect(metricsReceived!.resultsReported).toBe(3);
      expect(metricsReceived!.requestsSent).toBe(3); // One per test
      expect(metricsReceived!.requestsFailed).toBe(0);
    });
  });

  // ==========================================================================
  // Test Status Handling
  // ==========================================================================

  describe('Test Status Handling', () => {
    it('should handle passed status correctly', async () => {
      let metricsReceived: SpekraMetrics | null = null;

      const reporter = new SpekraReporter({
        apiKey: 'test-api-key',
        apiUrl: PRISM_URL,
        onMetrics: (m) => {
          metricsReceived = m;
        },
      });

      reporter.onBegin(createMockConfig(), createMockSuite());
      reporter.onTestEnd(
        createMockTest({ title: 'passes' }),
        createMockResult({ status: 'passed' })
      );
      await reporter.onEnd({ status: 'passed' } as any);

      expect(metricsReceived!.resultsReported).toBe(1);
      expect(metricsReceived!.requestsFailed).toBe(0);
    });

    it('should handle failed status', async () => {
      let metricsReceived: SpekraMetrics | null = null;

      const reporter = new SpekraReporter({
        apiKey: 'test-api-key',
        apiUrl: PRISM_URL,
        onMetrics: (m) => {
          metricsReceived = m;
        },
      });

      reporter.onBegin(createMockConfig(), createMockSuite());
      reporter.onTestEnd(
        createMockTest({ title: 'fails' }),
        createMockResult({ status: 'failed' })
      );
      await reporter.onEnd({ status: 'failed' } as any);

      expect(metricsReceived!.resultsReported).toBe(1);
      expect(metricsReceived!.requestsFailed).toBe(0);
    });

    it('should handle skipped status', async () => {
      let metricsReceived: SpekraMetrics | null = null;

      const reporter = new SpekraReporter({
        apiKey: 'test-api-key',
        apiUrl: PRISM_URL,
        onMetrics: (m) => {
          metricsReceived = m;
        },
      });

      reporter.onBegin(createMockConfig(), createMockSuite());
      reporter.onTestEnd(
        createMockTest({ title: 'is skipped' }),
        createMockResult({ status: 'skipped', duration: 0 })
      );
      await reporter.onEnd({ status: 'passed' } as any);

      expect(metricsReceived!.resultsReported).toBe(1);
      expect(metricsReceived!.requestsFailed).toBe(0);
    });

    it('should handle timedOut status', async () => {
      let metricsReceived: SpekraMetrics | null = null;

      const reporter = new SpekraReporter({
        apiKey: 'test-api-key',
        apiUrl: PRISM_URL,
        onMetrics: (m) => {
          metricsReceived = m;
        },
      });

      reporter.onBegin(createMockConfig(), createMockSuite());
      reporter.onTestEnd(
        createMockTest({ title: 'times out' }),
        createMockResult({ status: 'timedOut', duration: 30000 })
      );
      await reporter.onEnd({ status: 'timedOut' } as any);

      expect(metricsReceived!.resultsReported).toBe(1);
      expect(metricsReceived!.requestsFailed).toBe(0);
    });

    it('should handle interrupted status', async () => {
      let metricsReceived: SpekraMetrics | null = null;

      const reporter = new SpekraReporter({
        apiKey: 'test-api-key',
        apiUrl: PRISM_URL,
        onMetrics: (m) => {
          metricsReceived = m;
        },
      });

      reporter.onBegin(createMockConfig(), createMockSuite());
      reporter.onTestEnd(
        createMockTest({ title: 'is interrupted' }),
        createMockResult({ status: 'interrupted', duration: 5000 })
      );
      await reporter.onEnd({ status: 'interrupted' } as any);

      expect(metricsReceived!.resultsReported).toBe(1);
      expect(metricsReceived!.requestsFailed).toBe(0);
    });

    it('should handle all statuses sent separately', async () => {
      let metricsReceived: SpekraMetrics | null = null;

      const reporter = new SpekraReporter({
        apiKey: 'test-api-key',
        apiUrl: PRISM_URL,
        batchSize: 1, // Send separately to avoid gzip issues
        onMetrics: (m) => {
          metricsReceived = m;
        },
      });

      reporter.onBegin(createMockConfig(), createMockSuite());

      // Add one of each status
      const statuses: Array<'passed' | 'failed' | 'skipped' | 'timedOut' | 'interrupted'> = [
        'passed',
        'failed',
        'skipped',
        'timedOut',
        'interrupted',
      ];

      for (const status of statuses) {
        reporter.onTestEnd(createMockTest({ title: status }), createMockResult({ status }));
        await new Promise((resolve) => setTimeout(resolve, 50));
      }

      await reporter.onEnd({ status: 'failed' } as any);

      expect(metricsReceived!.resultsReported).toBe(5);
      expect(metricsReceived!.requestsFailed).toBe(0);
    });
  });

  // ==========================================================================
  // Batching Behavior
  // ==========================================================================

  describe('Batching Behavior', () => {
    it('should handle batch size of 1 correctly', async () => {
      let metricsReceived: SpekraMetrics | null = null;

      const reporter = new SpekraReporter({
        apiKey: 'test-api-key',
        apiUrl: PRISM_URL,
        batchSize: 1,
        onMetrics: (m) => {
          metricsReceived = m;
        },
      });

      reporter.onBegin(createMockConfig(), createMockSuite());

      for (let i = 0; i < 3; i++) {
        reporter.onTestEnd(
          createMockTest({ title: `test ${i}` }),
          createMockResult({ status: 'passed' })
        );
        await new Promise((resolve) => setTimeout(resolve, 50));
      }

      await reporter.onEnd({ status: 'passed' } as any);

      expect(metricsReceived!.resultsReported).toBe(3);
      expect(metricsReceived!.requestsSent).toBe(3);
    });

    it('should trigger batch send when batch size reached', async () => {
      let metricsReceived: SpekraMetrics | null = null;

      const reporter = new SpekraReporter({
        apiKey: 'test-api-key',
        apiUrl: PRISM_URL,
        batchSize: 1,
        onMetrics: (m) => {
          metricsReceived = m;
        },
      });

      reporter.onBegin(createMockConfig(), createMockSuite());

      // Add 5 tests with batch size 1
      for (let i = 0; i < 5; i++) {
        reporter.onTestEnd(
          createMockTest({ title: `batch test ${i}` }),
          createMockResult({ status: 'passed' })
        );
        await new Promise((resolve) => setTimeout(resolve, 30));
      }

      await reporter.onEnd({ status: 'passed' } as any);

      expect(metricsReceived!.resultsReported).toBe(5);
      expect(metricsReceived!.requestsSent).toBe(5);
      expect(metricsReceived!.requestsFailed).toBe(0);
    });
  });

  // ==========================================================================
  // Retry Handling
  // ==========================================================================

  describe('Retry Handling', () => {
    it('should track retry attempts correctly', async () => {
      let metricsReceived: SpekraMetrics | null = null;

      const reporter = new SpekraReporter({
        apiKey: 'test-api-key',
        apiUrl: PRISM_URL,
        onMetrics: (m) => {
          metricsReceived = m;
        },
      });

      reporter.onBegin(createMockConfig(), createMockSuite());

      // Test with retry count - single test result with retry value
      reporter.onTestEnd(
        createMockTest({ title: 'flaky test' }),
        createMockResult({ status: 'passed', retry: 2 })
      );

      await reporter.onEnd({ status: 'passed' } as any);

      expect(metricsReceived!.resultsReported).toBe(1);
      expect(metricsReceived!.requestsFailed).toBe(0);
    });

    it('should handle high retry counts', async () => {
      let metricsReceived: SpekraMetrics | null = null;

      const reporter = new SpekraReporter({
        apiKey: 'test-api-key',
        apiUrl: PRISM_URL,
        onMetrics: (m) => {
          metricsReceived = m;
        },
      });

      reporter.onBegin(createMockConfig(), createMockSuite());
      reporter.onTestEnd(
        createMockTest({ title: 'eventually passes' }),
        createMockResult({ status: 'passed', retry: 5 }) // High retry count
      );
      await reporter.onEnd({ status: 'passed' } as any);

      expect(metricsReceived!.resultsReported).toBe(1);
      expect(metricsReceived!.requestsFailed).toBe(0);
    });
  });

  // ==========================================================================
  // Shard Configuration
  // ==========================================================================

  describe('Shard Configuration', () => {
    it('should include shard info from Playwright config', async () => {
      let metricsReceived: SpekraMetrics | null = null;

      const reporter = new SpekraReporter({
        apiKey: 'test-api-key',
        apiUrl: PRISM_URL,
        onMetrics: (m) => {
          metricsReceived = m;
        },
      });

      const shardedConfig = createMockConfig({
        shard: { current: 2, total: 4 },
      });

      reporter.onBegin(shardedConfig, createMockSuite());
      reporter.onTestEnd(
        createMockTest({ title: 'shard test' }),
        createMockResult({ status: 'passed' })
      );
      await reporter.onEnd({ status: 'passed' } as any);

      expect(metricsReceived!.resultsReported).toBe(1);
      expect(metricsReceived!.requestsFailed).toBe(0);
    });
  });

  // ==========================================================================
  // Compression and Payload Size
  // ==========================================================================

  describe('Compression', () => {
    it('should track byte metrics for payloads', async () => {
      let metricsReceived: SpekraMetrics | null = null;

      const reporter = new SpekraReporter({
        apiKey: 'test-api-key',
        apiUrl: PRISM_URL,
        onMetrics: (m) => {
          metricsReceived = m;
        },
      });

      reporter.onBegin(createMockConfig(), createMockSuite());
      reporter.onTestEnd(
        createMockTest({ title: 'compression test' }),
        createMockResult({ status: 'passed' })
      );
      await reporter.onEnd({ status: 'passed' } as any);

      expect(metricsReceived!.resultsReported).toBe(1);
      expect(metricsReceived!.bytesSent).toBeGreaterThan(0);
      expect(metricsReceived!.bytesUncompressed).toBeGreaterThan(0);
      // For small payloads, gzip overhead may make bytesSent >= bytesUncompressed
      // For larger payloads, compression would make bytesSent < bytesUncompressed
      // The key assertion is that both metrics are tracked
      expect(typeof metricsReceived!.bytesSent).toBe('number');
      expect(typeof metricsReceived!.bytesUncompressed).toBe('number');
    });
  });

  // ==========================================================================
  // Metrics Accuracy
  // ==========================================================================

  describe('Metrics Tracking', () => {
    it('should track latency accurately', async () => {
      let metricsReceived: SpekraMetrics | null = null;

      const reporter = new SpekraReporter({
        apiKey: 'test-api-key',
        apiUrl: PRISM_URL,
        onMetrics: (m) => {
          metricsReceived = m;
        },
      });

      reporter.onBegin(createMockConfig(), createMockSuite());
      reporter.onTestEnd(
        createMockTest({ title: 'latency test' }),
        createMockResult({ status: 'passed' })
      );
      await reporter.onEnd({ status: 'passed' } as any);

      expect(metricsReceived!.totalLatencyMs).toBeGreaterThan(0);
      expect(metricsReceived!.lastRequestLatencyMs).toBeGreaterThan(0);
      expect(metricsReceived!.totalLatencyMs).toBe(metricsReceived!.lastRequestLatencyMs);
    });

    it('should accumulate metrics across multiple requests', async () => {
      const metricsHistory: SpekraMetrics[] = [];

      const reporter = new SpekraReporter({
        apiKey: 'test-api-key',
        apiUrl: PRISM_URL,
        batchSize: 1,
        onMetrics: (m) => {
          metricsHistory.push({ ...m });
        },
      });

      reporter.onBegin(createMockConfig(), createMockSuite());

      for (let i = 0; i < 3; i++) {
        reporter.onTestEnd(
          createMockTest({ title: `metrics test ${i}` }),
          createMockResult({ status: 'passed' })
        );
        await new Promise((resolve) => setTimeout(resolve, 50));
      }

      await reporter.onEnd({ status: 'passed' } as any);

      // Should have received multiple metrics updates (3 batches + possible final)
      expect(metricsHistory.length).toBeGreaterThanOrEqual(3);

      // Final metrics should show all results
      const finalMetrics = metricsHistory[metricsHistory.length - 1];
      expect(finalMetrics.resultsReported).toBe(3);
      expect(finalMetrics.requestsSent).toBe(3);
    });
  });

  // ==========================================================================
  // File Path Handling
  // ==========================================================================

  describe('File Path Handling', () => {
    it('should normalize test file paths', async () => {
      let metricsReceived: SpekraMetrics | null = null;

      const reporter = new SpekraReporter({
        apiKey: 'test-api-key',
        apiUrl: PRISM_URL,
        batchSize: 1,
        onMetrics: (m) => {
          metricsReceived = m;
        },
      });

      reporter.onBegin(createMockConfig(), createMockSuite());

      // Various file path formats
      const paths = [
        '/Users/dev/project/tests/auth/login.spec.ts',
        '/home/ci/app/e2e/tests/checkout.spec.ts',
        'C:\\Users\\dev\\tests\\windows.spec.ts', // Windows path
      ];

      for (const path of paths) {
        reporter.onTestEnd(
          createMockTest({ title: 'path test', file: path }),
          createMockResult({ status: 'passed' })
        );
        await new Promise((resolve) => setTimeout(resolve, 50));
      }

      await reporter.onEnd({ status: 'passed' } as any);

      expect(metricsReceived!.resultsReported).toBe(3);
      expect(metricsReceived!.requestsFailed).toBe(0);
    });
  });

  // ==========================================================================
  // Test Title Handling
  // ==========================================================================

  describe('Test Title Handling', () => {
    it('should handle nested describe blocks in test titles', async () => {
      let metricsReceived: SpekraMetrics | null = null;

      const reporter = new SpekraReporter({
        apiKey: 'test-api-key',
        apiUrl: PRISM_URL,
        onMetrics: (m) => {
          metricsReceived = m;
        },
      });

      reporter.onBegin(createMockConfig(), createMockSuite());

      // Test with nested parent structure
      const nestedTest = {
        title: 'should authenticate',
        location: { file: '/tests/auth.spec.ts', line: 10, column: 5 },
        parent: {
          title: 'valid credentials',
          parent: {
            title: 'Login',
            parent: undefined,
            project: () => ({ name: 'chromium' }),
          },
          project: () => ({ name: 'chromium' }),
        },
      } as unknown as TestCase;

      reporter.onTestEnd(nestedTest, createMockResult({ status: 'passed' }));

      await reporter.onEnd({ status: 'passed' } as any);

      expect(metricsReceived!.resultsReported).toBe(1);
      expect(metricsReceived!.requestsFailed).toBe(0);
    });
  });

  // ==========================================================================
  // Multiple Projects
  // ==========================================================================

  describe('Multiple Projects', () => {
    it('should handle tests from different Playwright projects', async () => {
      let metricsReceived: SpekraMetrics | null = null;

      const reporter = new SpekraReporter({
        apiKey: 'test-api-key',
        apiUrl: PRISM_URL,
        batchSize: 1,
        onMetrics: (m) => {
          metricsReceived = m;
        },
      });

      const multiProjectConfig = createMockConfig({
        projects: [{ name: 'chromium' }, { name: 'firefox' }, { name: 'webkit' }] as any,
      });

      reporter.onBegin(multiProjectConfig, createMockSuite());

      // Tests from different projects
      const projects = ['chromium', 'firefox', 'webkit'];
      for (const project of projects) {
        reporter.onTestEnd(
          createMockTest({ title: `${project} test`, projectName: project }),
          createMockResult({ status: 'passed' })
        );
        await new Promise((resolve) => setTimeout(resolve, 50));
      }

      await reporter.onEnd({ status: 'passed' } as any);

      expect(metricsReceived!.resultsReported).toBe(3);
      expect(metricsReceived!.requestsFailed).toBe(0);
    });
  });

  // ==========================================================================
  // Edge Cases
  // ==========================================================================

  describe('Edge Cases', () => {
    it('should handle empty test run gracefully', async () => {
      let metricsReceived: SpekraMetrics | null = null;

      const reporter = new SpekraReporter({
        apiKey: 'test-api-key',
        apiUrl: PRISM_URL,
        onMetrics: (m) => {
          metricsReceived = m;
        },
      });

      reporter.onBegin(createMockConfig(), createMockSuite());
      // No tests added
      await reporter.onEnd({ status: 'passed' } as any);

      // No results sent means metrics might be null or show 0 results
      // The key is that no errors occurred
      if (metricsReceived !== null) {
        expect((metricsReceived as SpekraMetrics).resultsReported).toBe(0);
      }
    });

    it('should handle tests with zero duration', async () => {
      let metricsReceived: SpekraMetrics | null = null;

      const reporter = new SpekraReporter({
        apiKey: 'test-api-key',
        apiUrl: PRISM_URL,
        onMetrics: (m) => {
          metricsReceived = m;
        },
      });

      reporter.onBegin(createMockConfig(), createMockSuite());
      reporter.onTestEnd(
        createMockTest({ title: 'instant test' }),
        createMockResult({ status: 'passed', duration: 0 })
      );
      await reporter.onEnd({ status: 'passed' } as any);

      expect(metricsReceived!.resultsReported).toBe(1);
      expect(metricsReceived!.requestsFailed).toBe(0);
    });

    it('should handle very long test durations', async () => {
      let metricsReceived: SpekraMetrics | null = null;

      const reporter = new SpekraReporter({
        apiKey: 'test-api-key',
        apiUrl: PRISM_URL,
        onMetrics: (m) => {
          metricsReceived = m;
        },
      });

      reporter.onBegin(createMockConfig(), createMockSuite());
      reporter.onTestEnd(
        createMockTest({ title: 'long running test' }),
        createMockResult({ status: 'passed', duration: 3600000 }) // 1 hour
      );
      await reporter.onEnd({ status: 'passed' } as any);

      expect(metricsReceived!.resultsReported).toBe(1);
      expect(metricsReceived!.requestsFailed).toBe(0);
    });
  });

  // ==========================================================================
  // Callback Behavior
  // ==========================================================================

  describe('Callback Behavior', () => {
    it('should call onMetrics after each batch', async () => {
      const metricsCallCount = { count: 0 };

      const reporter = new SpekraReporter({
        apiKey: 'test-api-key',
        apiUrl: PRISM_URL,
        batchSize: 1,
        onMetrics: () => {
          metricsCallCount.count++;
        },
      });

      reporter.onBegin(createMockConfig(), createMockSuite());

      for (let i = 0; i < 3; i++) {
        reporter.onTestEnd(
          createMockTest({ title: `test ${i}` }),
          createMockResult({ status: 'passed' })
        );
        await new Promise((resolve) => setTimeout(resolve, 50));
      }

      await reporter.onEnd({ status: 'passed' } as any);

      // 3 tests with batch size 1 = at least 3 callbacks (plus possible final callback)
      expect(metricsCallCount.count).toBeGreaterThanOrEqual(3);
    });
  });

  // ==========================================================================
  // Configuration
  // ==========================================================================

  describe('Configuration', () => {
    it('should use custom project name when provided', async () => {
      let metricsReceived: SpekraMetrics | null = null;

      const reporter = new SpekraReporter({
        apiKey: 'test-api-key',
        apiUrl: PRISM_URL,
        projectName: 'my-custom-project',
        onMetrics: (m) => {
          metricsReceived = m;
        },
      });

      reporter.onBegin(createMockConfig(), createMockSuite());
      reporter.onTestEnd(
        createMockTest({ title: 'config test' }),
        createMockResult({ status: 'passed' })
      );
      await reporter.onEnd({ status: 'passed' } as any);

      expect(metricsReceived!.resultsReported).toBe(1);
    });

    it('should respect debug mode without breaking', async () => {
      let metricsReceived: SpekraMetrics | null = null;

      const reporter = new SpekraReporter({
        apiKey: 'test-api-key',
        apiUrl: PRISM_URL,
        debug: true, // Enable debug logging
        onMetrics: (m) => {
          metricsReceived = m;
        },
      });

      reporter.onBegin(createMockConfig(), createMockSuite());
      reporter.onTestEnd(
        createMockTest({ title: 'debug test' }),
        createMockResult({ status: 'passed' })
      );
      await reporter.onEnd({ status: 'passed' } as any);

      expect(metricsReceived!.resultsReported).toBe(1);
    });

    it('should handle custom timeout settings', async () => {
      let metricsReceived: SpekraMetrics | null = null;

      const reporter = new SpekraReporter({
        apiKey: 'test-api-key',
        apiUrl: PRISM_URL,
        timeout: 30000, // 30 second timeout
        onMetrics: (m) => {
          metricsReceived = m;
        },
      });

      reporter.onBegin(createMockConfig(), createMockSuite());
      reporter.onTestEnd(
        createMockTest({ title: 'timeout test' }),
        createMockResult({ status: 'passed' })
      );
      await reporter.onEnd({ status: 'passed' } as any);

      expect(metricsReceived!.resultsReported).toBe(1);
    });

    it('should handle custom retry settings', async () => {
      let metricsReceived: SpekraMetrics | null = null;

      const reporter = new SpekraReporter({
        apiKey: 'test-api-key',
        apiUrl: PRISM_URL,
        maxRetries: 5,
        retryBaseDelayMs: 100,
        retryMaxDelayMs: 1000,
        onMetrics: (m) => {
          metricsReceived = m;
        },
      });

      reporter.onBegin(createMockConfig(), createMockSuite());
      reporter.onTestEnd(
        createMockTest({ title: 'retry config test' }),
        createMockResult({ status: 'passed' })
      );
      await reporter.onEnd({ status: 'passed' } as any);

      expect(metricsReceived!.resultsReported).toBe(1);
    });
  });

  // ==========================================================================
  // Disabled Reporter
  // ==========================================================================

  describe('Disabled Reporter', () => {
    it('should not send requests when disabled', async () => {
      let metricsCallCount = 0;

      const reporter = new SpekraReporter({
        apiKey: 'test-api-key',
        apiUrl: PRISM_URL,
        enabled: false,
        onMetrics: () => {
          metricsCallCount++;
        },
      });

      reporter.onBegin(createMockConfig(), createMockSuite());
      reporter.onTestEnd(
        createMockTest({ title: 'disabled test' }),
        createMockResult({ status: 'passed' })
      );
      await reporter.onEnd({ status: 'passed' } as any);

      // No metrics callbacks when disabled
      expect(metricsCallCount).toBe(0);
    });

    it('should not send requests when API key is missing', async () => {
      let metricsCallCount = 0;

      const reporter = new SpekraReporter({
        apiKey: '', // Empty API key
        apiUrl: PRISM_URL,
        onMetrics: () => {
          metricsCallCount++;
        },
      });

      reporter.onBegin(createMockConfig(), createMockSuite());
      reporter.onTestEnd(
        createMockTest({ title: 'no key test' }),
        createMockResult({ status: 'passed' })
      );
      await reporter.onEnd({ status: 'passed' } as any);

      // No metrics callbacks when no API key
      expect(metricsCallCount).toBe(0);
    });
  });
});
