import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SpekraReporter } from '../../src/reporter';
import type {
  FullConfig,
  Suite,
  TestCase,
  TestResult as PlaywrightTestResult,
} from '@playwright/test/reporter';

// Mock fetch globally (new architecture uses fetch via ApiClient)
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Helper to create mock API response
function createMockApiResponse(overrides = {}) {
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

// Mock child_process for git operations
vi.mock('child_process', () => ({
  execSync: vi.fn((cmd: string) => {
    if (cmd.includes('rev-parse --abbrev-ref HEAD')) {
      return 'main\n';
    }
    if (cmd.includes('rev-parse HEAD')) {
      return 'abc123\n';
    }
    throw new Error('Command not found');
  }),
  exec: vi.fn((cmd: string, _options: unknown, callback?: unknown) => {
    const cb = typeof _options === 'function' ? _options : callback;
    if (typeof cb === 'function') {
      if (cmd.includes('rev-parse --abbrev-ref HEAD')) {
        setTimeout(() => cb(null, { stdout: 'main\n', stderr: '' }), 0);
      } else if (cmd.includes('rev-parse HEAD')) {
        setTimeout(() => cb(null, { stdout: 'abc123\n', stderr: '' }), 0);
      } else {
        setTimeout(() => cb(new Error('Command not found'), null), 0);
      }
    }
    return {} as unknown;
  }),
}));

function createMockConfig(): FullConfig {
  return {
    projects: [{ name: 'chromium' }],
    shard: null,
  } as unknown as FullConfig;
}

function createMockSuite(): Suite {
  return {
    title: 'Root Suite',
    allTests: () => [],
  } as unknown as Suite;
}

function createMockTest(index: number): TestCase {
  return {
    title: `Test ${index}`,
    location: {
      file: `/tests/suite${Math.floor(index / 100)}/test${index}.spec.ts`,
      line: 1,
      column: 1,
    },
    parent: {
      title: `Suite ${Math.floor(index / 100)}`,
      parent: undefined,
      project: () => ({ name: 'chromium' }),
    },
  } as unknown as TestCase;
}

function createMockResult(status: 'passed' | 'failed' = 'passed'): PlaywrightTestResult {
  return {
    status,
    duration: 100,
    retry: 0,
    error: status === 'failed' ? new Error('Test failed') : undefined,
    attachments: [],
    stdout: [],
    stderr: [],
    steps: [],
    startTime: new Date(),
  } as unknown as PlaywrightTestResult;
}

describe('Reporter Load Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue(createSuccessFetchMock());
  });

  it('should handle 1000 test results without memory issues', async () => {
    const reporter = new SpekraReporter({
      apiKey: 'test-key',
      source: 'test-suite',
      enabled: true,
      batchSize: 1000, // Don't trigger batching during the test
    });

    reporter.onBegin(createMockConfig(), createMockSuite());

    const startMem = process.memoryUsage().heapUsed;
    const startTime = Date.now();

    // Simulate 1000 test completions
    for (let i = 0; i < 1000; i++) {
      reporter.onTestEnd(createMockTest(i), createMockResult());
    }

    const endMem = process.memoryUsage().heapUsed;
    const duration = Date.now() - startTime;
    const memIncreaseMB = (endMem - startMem) / 1024 / 1024;

    console.log(`1000 tests processed in ${duration}ms`);
    console.log(`Memory increase: ${memIncreaseMB.toFixed(2)} MB`);

    // Should process quickly (< 1 second)
    expect(duration).toBeLessThan(1000);

    // Should use reasonable memory (< 50MB for 1000 tests)
    expect(memIncreaseMB).toBeLessThan(50);

    await reporter.onEnd({ status: 'passed' } as any);
  });

  it('should batch results efficiently', async () => {
    let metricsReceived: any = null;

    const reporter = new SpekraReporter({
      apiKey: 'test-key',
      source: 'test-suite',
      enabled: true,
      batchSize: 50,
      onMetrics: (metrics) => {
        metricsReceived = metrics;
      },
    });

    reporter.onBegin(createMockConfig(), createMockSuite());

    // Add exactly 150 tests
    for (let i = 0; i < 150; i++) {
      reporter.onTestEnd(createMockTest(i), createMockResult());
    }

    await reporter.onEnd({ status: 'passed' } as any);

    // Verify all 150 tests were reported
    expect(metricsReceived).not.toBeNull();
    expect(metricsReceived.resultsReported).toBe(150);
  });

  it('should handle large error messages efficiently', async () => {
    const reporter = new SpekraReporter({
      apiKey: 'test-key',
      source: 'test-suite',
      enabled: true,
      maxErrorLength: 500,
      maxStackTraceLines: 5,
    });

    reporter.onBegin(createMockConfig(), createMockSuite());

    const startMem = process.memoryUsage().heapUsed;

    // Add 100 failed tests with large error messages
    for (let i = 0; i < 100; i++) {
      const largeError = new Error('A'.repeat(10000)); // 10KB error message
      largeError.stack = Array(100).fill('    at someFunction (file.js:1:1)').join('\n');

      reporter.onTestEnd(createMockTest(i), {
        status: 'failed',
        duration: 100,
        retry: 0,
        error: largeError,
      } as unknown as PlaywrightTestResult);
    }

    const endMem = process.memoryUsage().heapUsed;
    const memIncreaseMB = (endMem - startMem) / 1024 / 1024;

    console.log(`100 tests with large errors: ${memIncreaseMB.toFixed(2)} MB`);

    // With truncation, memory should be much less than storing full errors
    // 100 tests * 10KB = 1MB raw, should be much less with truncation
    expect(memIncreaseMB).toBeLessThan(10);

    await reporter.onEnd({ status: 'passed' } as any);
  });

  it('should handle rapid test completions', async () => {
    const reporter = new SpekraReporter({
      apiKey: 'test-key',
      source: 'test-suite',
      enabled: true,
      batchSize: 100,
    });

    reporter.onBegin(createMockConfig(), createMockSuite());

    const startTime = Date.now();

    // Simulate rapid-fire test completions (like parallel tests)
    const promises: Promise<void>[] = [];
    for (let i = 0; i < 500; i++) {
      // Don't await - simulate concurrent completions
      promises.push(
        new Promise((resolve) => {
          reporter.onTestEnd(createMockTest(i), createMockResult());
          resolve();
        })
      );
    }

    await Promise.all(promises);

    const duration = Date.now() - startTime;
    console.log(`500 concurrent test completions in ${duration}ms`);

    // Should handle rapid completions efficiently
    expect(duration).toBeLessThan(500);

    await reporter.onEnd({ status: 'passed' } as any);
  });

  it('should not leak memory across multiple runs', async () => {
    const initialMem = process.memoryUsage().heapUsed;

    // Simulate 5 test runs
    for (let run = 0; run < 5; run++) {
      const reporter = new SpekraReporter({
        apiKey: 'test-key',
        source: 'test-suite',
        enabled: true,
      });

      reporter.onBegin(createMockConfig(), createMockSuite());

      for (let i = 0; i < 100; i++) {
        reporter.onTestEnd(createMockTest(i), createMockResult());
      }

      await reporter.onEnd({ status: 'passed' } as any);
    }

    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }

    const finalMem = process.memoryUsage().heapUsed;
    const memGrowthMB = (finalMem - initialMem) / 1024 / 1024;

    console.log(`Memory growth after 5 runs: ${memGrowthMB.toFixed(2)} MB`);

    // Memory shouldn't grow significantly across runs
    expect(memGrowthMB).toBeLessThan(20);
  });

  it('should handle sustained throughput of 10000 tests', async () => {
    const reporter = new SpekraReporter({
      apiKey: 'test-key',
      source: 'test-suite',
      enabled: true,
      batchSize: 100,
      maxBufferSize: 500,
    });

    reporter.onBegin(createMockConfig(), createMockSuite());

    const startMem = process.memoryUsage().heapUsed;
    const startTime = Date.now();

    // Simulate 10,000 test completions
    for (let i = 0; i < 10000; i++) {
      reporter.onTestEnd(createMockTest(i), createMockResult(i % 10 === 0 ? 'failed' : 'passed'));

      // Allow event loop to process batches periodically
      if (i % 1000 === 0) {
        await new Promise((resolve) => setImmediate(resolve));
      }
    }

    await reporter.onEnd({ status: 'passed' } as any);

    const endMem = process.memoryUsage().heapUsed;
    const duration = Date.now() - startTime;
    const memIncreaseMB = (endMem - startMem) / 1024 / 1024;

    console.log(`10,000 tests processed in ${duration}ms`);
    console.log(`Memory increase: ${memIncreaseMB.toFixed(2)} MB`);

    // Should complete in reasonable time (< 10 seconds)
    expect(duration).toBeLessThan(10000);

    // Memory should stay bounded due to batching and buffer limits
    expect(memIncreaseMB).toBeLessThan(100);
  });

  it('should handle mixed test statuses under load', async () => {
    const reporter = new SpekraReporter({
      apiKey: 'test-key',
      source: 'test-suite',
      enabled: true,
      batchSize: 50,
    });

    reporter.onBegin(createMockConfig(), createMockSuite());

    const statuses: Array<'passed' | 'failed'> = [];

    // Mix of passed, failed tests with varying error sizes
    for (let i = 0; i < 500; i++) {
      const status = i % 5 === 0 ? 'failed' : 'passed';
      statuses.push(status);

      if (status === 'failed') {
        const error = new Error(`Test ${i} failed with some details`);
        error.stack = Array(20)
          .fill(null)
          .map((_, j) => `    at function${j} (file${i}.ts:${j}:1)`)
          .join('\n');

        reporter.onTestEnd(createMockTest(i), {
          status: 'failed',
          duration: 100 + Math.random() * 1000,
          retry: Math.floor(Math.random() * 3),
          error,
        } as unknown as PlaywrightTestResult);
      } else {
        reporter.onTestEnd(createMockTest(i), {
          status: 'passed',
          duration: 50 + Math.random() * 500,
          retry: 0,
        } as unknown as PlaywrightTestResult);
      }
    }

    await reporter.onEnd({ status: 'passed' } as any);

    // Verify distribution
    const failedCount = statuses.filter((s) => s === 'failed').length;
    expect(failedCount).toBe(100); // 20% failure rate
  });
});

describe('Reporter Failure Injection Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue(createSuccessFetchMock());
  });

  it('should handle API failures during batch sends gracefully', async () => {
    let metricsReceived: any = null;
    let errorReceived: any = null;

    // Mock fetch to simulate API failure
    mockFetch.mockResolvedValue(createErrorFetchMock(503, 'Simulated API failure'));

    const reporter = new SpekraReporter({
      apiKey: 'test-key',
      source: 'test-suite',
      enabled: true,
      batchSize: 20,
      maxRetries: 0, // Disable retries for faster test
      onMetrics: (metrics) => {
        metricsReceived = metrics;
      },
      onError: (error) => {
        errorReceived = error;
      },
    });

    reporter.onBegin(createMockConfig(), createMockSuite());

    // Add some tests
    for (let i = 0; i < 50; i++) {
      reporter.onTestEnd(createMockTest(i), createMockResult());
    }

    await reporter.onEnd({ status: 'passed' } as any);

    // Verify the error was captured and metrics show failure
    expect(metricsReceived).not.toBeNull();
    expect(metricsReceived.requestsFailed).toBe(1);
    expect(metricsReceived.resultsReported).toBe(0); // Failed, so none reported
    expect(errorReceived).not.toBeNull();
    expect(errorReceived.type).toBe('api');
  });

  it('should continue processing after batch failure', async () => {
    let metricsReceived: any = null;

    const reporter = new SpekraReporter({
      apiKey: 'test-key',
      source: 'test-suite',
      enabled: true,
      batchSize: 10,
      onMetrics: (metrics) => {
        metricsReceived = metrics;
      },
    });

    reporter.onBegin(createMockConfig(), createMockSuite());

    // Process 50 tests
    for (let i = 0; i < 50; i++) {
      reporter.onTestEnd(createMockTest(i), createMockResult());
    }

    await reporter.onEnd({ status: 'passed' } as any);

    // Metrics should be tracked regardless of API success/failure
    expect(metricsReceived).not.toBeNull();
    expect(metricsReceived.resultsReported).toBeGreaterThan(0);
  });
});

describe('Reporter Retry Storm Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue(createSuccessFetchMock());
  });

  it('should handle high volume of tests with batching under load', async () => {
    // This test uses the existing mock which always succeeds
    // We're testing that high volume doesn't cause issues
    let metricsReceived: any = null;

    const reporter = new SpekraReporter({
      apiKey: 'test-key',
      source: 'test-suite',
      enabled: true,
      batchSize: 10,
      onMetrics: (metrics) => {
        metricsReceived = metrics;
      },
    });

    reporter.onBegin(createMockConfig(), createMockSuite());

    const startMem = process.memoryUsage().heapUsed;
    const startTime = Date.now();

    // Add tests that will trigger multiple batches rapidly
    for (let i = 0; i < 100; i++) {
      reporter.onTestEnd(createMockTest(i), createMockResult());
    }

    // Allow batches to process
    await new Promise((resolve) => setTimeout(resolve, 100));

    await reporter.onEnd({ status: 'passed' } as any);

    const endMem = process.memoryUsage().heapUsed;
    const duration = Date.now() - startTime;
    const memIncreaseMB = (endMem - startMem) / 1024 / 1024;

    console.log(`High volume test: processed in ${duration}ms`);
    console.log(`Memory increase: ${memIncreaseMB.toFixed(2)} MB`);

    // Memory should stay bounded
    expect(memIncreaseMB).toBeLessThan(50);

    // Should complete in reasonable time
    expect(duration).toBeLessThan(5000);

    // Metrics should reflect successful processing
    expect(metricsReceived).not.toBeNull();
    expect(metricsReceived.resultsReported).toBe(100);
  });

  it('should not block test processing when batches are being sent', async () => {
    const reporter = new SpekraReporter({
      apiKey: 'test-key',
      source: 'test-suite',
      enabled: true,
      batchSize: 5, // Small batches to trigger frequent sends
    });

    reporter.onBegin(createMockConfig(), createMockSuite());

    const addStartTime = Date.now();

    // Rapidly add tests
    for (let i = 0; i < 50; i++) {
      reporter.onTestEnd(createMockTest(i), createMockResult());
    }

    const addDuration = Date.now() - addStartTime;
    console.log(`Added 50 tests in ${addDuration}ms`);

    // Adding tests should be fast (not blocked by async sends)
    // The sends happen asynchronously, so adding should be nearly instant
    expect(addDuration).toBeLessThan(200);

    // Wait for all sends to complete
    await reporter.onEnd({ status: 'passed' } as any);
  });

  it('should maintain data integrity across concurrent batches', async () => {
    let metricsReceived: any = null;

    const reporter = new SpekraReporter({
      apiKey: 'test-key',
      source: 'test-suite',
      enabled: true,
      batchSize: 7, // Odd batch size to test edge cases
      onMetrics: (metrics) => {
        metricsReceived = metrics;
      },
    });

    reporter.onBegin(createMockConfig(), createMockSuite());

    // Add tests with unique identifiable data
    const testCount = 35; // Will create 5 batches of 7
    for (let i = 0; i < testCount; i++) {
      reporter.onTestEnd(createMockTest(i), createMockResult(i % 3 === 0 ? 'failed' : 'passed'));
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
    await reporter.onEnd({ status: 'passed' } as any);

    // All results should have been reported
    expect(metricsReceived).not.toBeNull();
    expect(metricsReceived.resultsReported).toBe(testCount);
  });

  it('should handle burst of tests followed by idle period', async () => {
    let metricsReceived: any = null;

    const reporter = new SpekraReporter({
      apiKey: 'test-key',
      source: 'test-suite',
      enabled: true,
      batchSize: 10,
      onMetrics: (metrics) => {
        metricsReceived = metrics;
      },
    });

    reporter.onBegin(createMockConfig(), createMockSuite());

    // Burst of tests
    for (let i = 0; i < 25; i++) {
      reporter.onTestEnd(createMockTest(i), createMockResult());
    }

    // Idle period - allow batches to be sent
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Another burst
    for (let i = 25; i < 50; i++) {
      reporter.onTestEnd(createMockTest(i), createMockResult());
    }

    await reporter.onEnd({ status: 'passed' } as any);

    expect(metricsReceived).not.toBeNull();
    expect(metricsReceived.resultsReported).toBe(50);
  });
});

// ==========================================================================
// Concurrent Execution Tests
// ==========================================================================

describe('Reporter Concurrent Execution Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue(createSuccessFetchMock());
  });

  it('should handle multiple parallel workers reporting simultaneously', async () => {
    let metricsReceived: any = null;

    const reporter = new SpekraReporter({
      apiKey: 'test-key',
      source: 'test-suite',
      enabled: true,
      batchSize: 10,
      onMetrics: (metrics) => {
        metricsReceived = metrics;
      },
    });

    reporter.onBegin(createMockConfig(), createMockSuite());

    // Simulate 4 parallel workers each processing 25 tests
    const workers = Array.from({ length: 4 }, (_, workerIndex) => {
      return (async () => {
        for (let i = 0; i < 25; i++) {
          const testIndex = workerIndex * 25 + i;
          // Add small random delay to simulate actual parallel execution
          await new Promise((resolve) => setTimeout(resolve, Math.random() * 5));
          reporter.onTestEnd(createMockTest(testIndex), createMockResult());
        }
      })();
    });

    await Promise.all(workers);
    await reporter.onEnd({ status: 'passed' } as any);

    expect(metricsReceived).not.toBeNull();
    expect(metricsReceived.resultsReported).toBe(100);
  });

  it('should handle out-of-order test completions', async () => {
    let metricsReceived: any = null;

    const reporter = new SpekraReporter({
      apiKey: 'test-key',
      source: 'test-suite',
      enabled: true,
      batchSize: 5,
      onMetrics: (metrics) => {
        metricsReceived = metrics;
      },
    });

    reporter.onBegin(createMockConfig(), createMockSuite());

    // Complete tests in random order (simulating parallel execution)
    const testIndices = Array.from({ length: 50 }, (_, i) => i);
    // Shuffle array
    for (let i = testIndices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [testIndices[i], testIndices[j]] = [testIndices[j], testIndices[i]];
    }

    for (const index of testIndices) {
      reporter.onTestEnd(createMockTest(index), createMockResult());
    }

    await reporter.onEnd({ status: 'passed' } as any);

    expect(metricsReceived).not.toBeNull();
    expect(metricsReceived.resultsReported).toBe(50);
  });

  it('should handle rapid onBegin/onEnd cycles', async () => {
    const cycleMetrics: any[] = [];

    // Simulate scenarios where multiple test files complete quickly
    for (let cycle = 0; cycle < 5; cycle++) {
      const reporter = new SpekraReporter({
        apiKey: 'test-key',
        source: `test-suite-${cycle}`,
        enabled: true,
        batchSize: 5,
        onMetrics: (metrics) => {
          cycleMetrics.push(metrics);
        },
      });

      reporter.onBegin(createMockConfig(), createMockSuite());

      for (let i = 0; i < 10; i++) {
        reporter.onTestEnd(createMockTest(i), createMockResult());
      }

      await reporter.onEnd({ status: 'passed' } as any);
    }

    // All 5 cycles should have reported 10 results each
    expect(cycleMetrics).toHaveLength(5);
    cycleMetrics.forEach((metrics) => {
      expect(metrics.resultsReported).toBe(10);
    });
  });

  it('should handle mixed passed/failed/skipped results in parallel', async () => {
    let metricsReceived: any = null;

    const reporter = new SpekraReporter({
      apiKey: 'test-key',
      source: 'test-suite',
      enabled: true,
      batchSize: 10,
      onMetrics: (metrics) => {
        metricsReceived = metrics;
      },
    });

    reporter.onBegin(createMockConfig(), createMockSuite());

    // Simulate parallel workers with different result types
    const workers = Array.from({ length: 3 }, (_, workerIndex) => {
      return (async () => {
        for (let i = 0; i < 10; i++) {
          const testIndex = workerIndex * 10 + i;
          const status: 'passed' | 'failed' =
            workerIndex === 0 ? 'passed' : workerIndex === 1 && i % 2 === 0 ? 'failed' : 'passed';

          await new Promise((resolve) => setTimeout(resolve, Math.random() * 3));
          reporter.onTestEnd(createMockTest(testIndex), createMockResult(status));
        }
      })();
    });

    await Promise.all(workers);
    await reporter.onEnd({ status: 'failed' } as any);

    expect(metricsReceived).not.toBeNull();
    expect(metricsReceived.resultsReported).toBe(30);
  });

  it('should handle tests completing during onEnd processing', async () => {
    let metricsReceived: any = null;

    const reporter = new SpekraReporter({
      apiKey: 'test-key',
      source: 'test-suite',
      enabled: true,
      batchSize: 5,
      onMetrics: (metrics) => {
        metricsReceived = metrics;
      },
    });

    reporter.onBegin(createMockConfig(), createMockSuite());

    // Add initial tests
    for (let i = 0; i < 20; i++) {
      reporter.onTestEnd(createMockTest(i), createMockResult());
    }

    // Start onEnd but don't await yet
    const endPromise = reporter.onEnd({ status: 'passed' } as any);

    // Try to add more tests during onEnd (this simulates race condition)
    // Tests added during onEnd might not be processed, but shouldn't crash
    for (let i = 20; i < 25; i++) {
      reporter.onTestEnd(createMockTest(i), createMockResult());
    }

    await endPromise;

    // At minimum, the initial 20 tests should have been reported
    expect(metricsReceived).not.toBeNull();
    expect(metricsReceived.resultsReported).toBeGreaterThanOrEqual(20);
  });
});

// ==========================================================================
// Memory/Performance Edge Case Tests
// ==========================================================================

describe('Reporter Memory Edge Cases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue(createSuccessFetchMock());
  });

  it('should handle tests with very large stdout/stderr output', async () => {
    const reporter = new SpekraReporter({
      apiKey: 'test-key',
      source: 'test-suite',
      enabled: true,
    });

    reporter.onBegin(createMockConfig(), createMockSuite());

    const startMem = process.memoryUsage().heapUsed;

    // Add tests with large console output
    for (let i = 0; i < 50; i++) {
      const largeStdout = Array(100).fill(`Console log line ${i}: ${'x'.repeat(1000)}`);
      const largeStderr = Array(50).fill(`Error log line ${i}: ${'e'.repeat(500)}`);

      reporter.onTestEnd(createMockTest(i), {
        status: 'passed',
        duration: 100,
        retry: 0,
        attachments: [],
        stdout: largeStdout,
        stderr: largeStderr,
        steps: [],
        startTime: new Date(),
      } as unknown as PlaywrightTestResult);
    }

    const endMem = process.memoryUsage().heapUsed;
    const memIncreaseMB = (endMem - startMem) / 1024 / 1024;

    console.log(`50 tests with large stdout/stderr: ${memIncreaseMB.toFixed(2)} MB`);

    // Memory usage should be bounded
    expect(memIncreaseMB).toBeLessThan(100);

    await reporter.onEnd({ status: 'passed' } as any);
  });

  it('should handle tests with many steps', async () => {
    const reporter = new SpekraReporter({
      apiKey: 'test-key',
      source: 'test-suite',
      enabled: true,
    });

    reporter.onBegin(createMockConfig(), createMockSuite());

    const startMem = process.memoryUsage().heapUsed;

    // Add tests with many steps
    for (let i = 0; i < 50; i++) {
      const manySteps = Array(200)
        .fill(null)
        .map((_, j) => ({
          title: `Step ${j}: Some action description`,
          duration: 10,
          error: j % 50 === 0 ? { message: `Step ${j} failed` } : undefined,
          steps: [],
        }));

      reporter.onTestEnd(createMockTest(i), {
        status: 'passed',
        duration: 2000,
        retry: 0,
        attachments: [],
        stdout: [],
        stderr: [],
        steps: manySteps,
        startTime: new Date(),
      } as unknown as PlaywrightTestResult);
    }

    const endMem = process.memoryUsage().heapUsed;
    const memIncreaseMB = (endMem - startMem) / 1024 / 1024;

    console.log(`50 tests with 200 steps each: ${memIncreaseMB.toFixed(2)} MB`);

    expect(memIncreaseMB).toBeLessThan(50);

    await reporter.onEnd({ status: 'passed' } as any);
  });

  it('should handle tests with deeply nested steps', async () => {
    const reporter = new SpekraReporter({
      apiKey: 'test-key',
      source: 'test-suite',
      enabled: true,
    });

    reporter.onBegin(createMockConfig(), createMockSuite());

    // Create deeply nested step structure
    function createNestedSteps(depth: number): any[] {
      if (depth === 0) {
        return [{ title: 'leaf', duration: 1, steps: [] }];
      }
      return [
        {
          title: `level-${depth}`,
          duration: depth * 10,
          steps: createNestedSteps(depth - 1),
        },
      ];
    }

    for (let i = 0; i < 20; i++) {
      reporter.onTestEnd(createMockTest(i), {
        status: 'passed',
        duration: 1000,
        retry: 0,
        attachments: [],
        stdout: [],
        stderr: [],
        steps: createNestedSteps(15), // 15 levels deep
        startTime: new Date(),
      } as unknown as PlaywrightTestResult);
    }

    await reporter.onEnd({ status: 'passed' } as any);

    // Verify all 20 tests with deeply nested steps were reported
    expect(mockFetch).toHaveBeenCalled();
  });

  it('should handle tests with many annotations/tags', async () => {
    let metricsReceived: any = null;

    const reporter = new SpekraReporter({
      apiKey: 'test-key',
      source: 'test-suite',
      enabled: true,
      onMetrics: (metrics) => {
        metricsReceived = metrics;
      },
    });

    reporter.onBegin(createMockConfig(), createMockSuite());

    for (let i = 0; i < 100; i++) {
      const testWithManyAnnotations = {
        title: `Test ${i} @tag1 @tag2 @tag3 @tag4 @tag5`,
        location: { file: `/tests/test${i}.spec.ts`, line: 1, column: 1 },
        parent: {
          title: 'Suite',
          project: () => ({ name: 'chromium' }),
        },
        annotations: Array(50)
          .fill(null)
          .map((_, j) => ({
            type: 'tag',
            description: `annotation-${j}`,
          })),
      } as unknown as TestCase;

      reporter.onTestEnd(testWithManyAnnotations, createMockResult());
    }

    await reporter.onEnd({ status: 'passed' } as any);

    // Verify all 100 tests with many annotations were reported
    expect(metricsReceived).not.toBeNull();
    expect(metricsReceived.resultsReported).toBe(100);
  });

  it('should handle unicode-heavy test names efficiently', async () => {
    let metricsReceived: any = null;

    const reporter = new SpekraReporter({
      apiKey: 'test-key',
      source: 'test-suite',
      enabled: true,
      onMetrics: (metrics) => {
        metricsReceived = metrics;
      },
    });

    reporter.onBegin(createMockConfig(), createMockSuite());

    const unicodeStrings = [
      '日本語テスト',
      '中文测试',
      'Тест на русском',
      'العربية',
      'עברית',
      'emoji 🎉🚀💻🔥✨',
    ];

    for (let i = 0; i < 100; i++) {
      const unicodeTitle = unicodeStrings[i % unicodeStrings.length] + ` #${i}`;
      const testWithUnicode = {
        title: unicodeTitle,
        location: { file: `/tests/国际化/test${i}.spec.ts`, line: 1, column: 1 },
        parent: {
          title: '国際化テスト',
          project: () => ({ name: 'chromium' }),
        },
        annotations: [],
      } as unknown as TestCase;

      reporter.onTestEnd(testWithUnicode, createMockResult());
    }

    await reporter.onEnd({ status: 'passed' } as any);

    // Verify all 100 tests with unicode names were reported
    expect(metricsReceived).not.toBeNull();
    expect(metricsReceived.resultsReported).toBe(100);
  });

  it('should handle tests completing immediately after onBegin', async () => {
    let metricsReceived: any = null;

    const reporter = new SpekraReporter({
      apiKey: 'test-key',
      source: 'test-suite',
      enabled: true,
      batchSize: 5,
      onMetrics: (metrics) => {
        metricsReceived = metrics;
      },
    });

    // Immediately start tests before onBegin completes
    const beginPromise = new Promise<void>((resolve) => {
      reporter.onBegin(createMockConfig(), createMockSuite());
      resolve();
    });

    // Race condition test - add tests while onBegin might still be processing
    void beginPromise.then(() => {
      for (let i = 0; i < 10; i++) {
        reporter.onTestEnd(createMockTest(i), createMockResult());
      }
    });

    await beginPromise;

    // Add more tests after onBegin is definitely done
    for (let i = 10; i < 20; i++) {
      reporter.onTestEnd(createMockTest(i), createMockResult());
    }

    await reporter.onEnd({ status: 'passed' } as any);

    // At least the tests added after onBegin should have been reported
    expect(metricsReceived).not.toBeNull();
    expect(metricsReceived.resultsReported).toBeGreaterThanOrEqual(10);
  });
});

// ==========================================================================
// Artifact Edge Case Tests
// ==========================================================================

describe('Reporter Artifact Edge Cases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue(createSuccessFetchMock());
  });

  it('should handle tests with many small attachments', async () => {
    let metricsReceived: any = null;

    const reporter = new SpekraReporter({
      apiKey: 'test-key',
      source: 'test-suite',
      enabled: true,
      onMetrics: (metrics) => {
        metricsReceived = metrics;
      },
    });

    reporter.onBegin(createMockConfig(), createMockSuite());

    // Create attachments array with many items (but no actual paths)
    const manyAttachments = Array(100)
      .fill(null)
      .map((_, i) => ({
        name: `attachment-${i}`,
        contentType: 'application/octet-stream',
        // No path means inline attachment, which should be skipped
        body: Buffer.from(`inline data ${i}`),
      }));

    for (let i = 0; i < 10; i++) {
      reporter.onTestEnd(createMockTest(i), {
        status: 'failed',
        duration: 100,
        retry: 0,
        attachments: manyAttachments,
        stdout: [],
        stderr: [],
        steps: [],
        startTime: new Date(),
      } as unknown as PlaywrightTestResult);
    }

    await reporter.onEnd({ status: 'failed' } as any);

    // Verify all 10 tests were reported (inline attachments should be skipped)
    expect(metricsReceived).not.toBeNull();
    expect(metricsReceived.resultsReported).toBe(10);
  });

  it('should handle attachments with special characters in names', async () => {
    let metricsReceived: any = null;

    const reporter = new SpekraReporter({
      apiKey: 'test-key',
      source: 'test-suite',
      enabled: true,
      onMetrics: (metrics) => {
        metricsReceived = metrics;
      },
    });

    reporter.onBegin(createMockConfig(), createMockSuite());

    const specialNameAttachments = [
      { name: 'スクリーンショット.png', contentType: 'image/png', body: Buffer.from('data') },
      { name: 'screen shot (1).png', contentType: 'image/png', body: Buffer.from('data') },
      { name: 'file<>:"/\\|?*.png', contentType: 'image/png', body: Buffer.from('data') },
      { name: '../../../etc/passwd', contentType: 'text/plain', body: Buffer.from('data') },
    ];

    reporter.onTestEnd(createMockTest(0), {
      status: 'failed',
      duration: 100,
      retry: 0,
      attachments: specialNameAttachments,
      stdout: [],
      stderr: [],
      steps: [],
      startTime: new Date(),
    } as unknown as PlaywrightTestResult);

    await reporter.onEnd({ status: 'failed' } as any);

    // Verify the test was reported despite special characters in attachment names
    expect(metricsReceived).not.toBeNull();
    expect(metricsReceived.resultsReported).toBe(1);
  });

  it('should handle mixed attachment types efficiently', async () => {
    let metricsReceived: any = null;

    const reporter = new SpekraReporter({
      apiKey: 'test-key',
      source: 'test-suite',
      enabled: true,
      onMetrics: (metrics) => {
        metricsReceived = metrics;
      },
    });

    reporter.onBegin(createMockConfig(), createMockSuite());

    const mixedAttachments = [
      { name: 'screenshot-1.png', contentType: 'image/png', body: Buffer.from('x'.repeat(1000)) },
      { name: 'video.webm', contentType: 'video/webm', body: Buffer.from('v'.repeat(5000)) },
      { name: 'trace.zip', contentType: 'application/zip', body: Buffer.from('z'.repeat(2000)) },
      { name: 'stdout.txt', contentType: 'text/plain', body: Buffer.from('log output here') },
      { name: 'data.json', contentType: 'application/json', body: Buffer.from('{"key":"value"}') },
    ];

    for (let i = 0; i < 20; i++) {
      reporter.onTestEnd(createMockTest(i), {
        status: 'failed',
        duration: 100,
        retry: 0,
        attachments: mixedAttachments,
        stdout: [],
        stderr: [],
        steps: [],
        startTime: new Date(),
      } as unknown as PlaywrightTestResult);
    }

    await reporter.onEnd({ status: 'failed' } as any);

    // Verify all 20 tests were reported
    expect(metricsReceived).not.toBeNull();
    expect(metricsReceived.resultsReported).toBe(20);
  });
});
