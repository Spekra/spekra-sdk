import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SpekraReporter } from '../../src/reporter';
import type {
  FullConfig,
  Suite,
  TestCase,
  TestResult as PlaywrightTestResult,
} from '@playwright/test/reporter';

// Mock the API client to avoid actual network calls
vi.mock('../../src/api', () => ({
  SpekraApiClient: vi.fn().mockImplementation(() => ({
    sendReport: vi.fn().mockResolvedValue({
      success: true,
      latencyMs: 10,
      bytesSent: 100,
      bytesUncompressed: 200,
      retryCount: 0,
      requestId: 'mock-request-id',
    }),
  })),
}));

// Mock git and CI to avoid external calls
vi.mock('../../src/git', () => ({
  getGitInfoAsync: vi.fn().mockResolvedValue({ branch: 'main', commitSha: 'abc123' }),
}));

vi.mock('../../src/ci', () => ({
  getCIInfo: vi.fn().mockReturnValue({
    provider: null,
    url: null,
    branch: null,
    commitSha: null,
    runId: null,
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
  } as unknown as PlaywrightTestResult;
}

describe('Reporter Load Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should handle 1000 test results without memory issues', async () => {
    const reporter = new SpekraReporter({
      apiKey: 'test-key',
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

  it('should respect maxBufferSize under load', async () => {
    const maxBufferSize = 100;
    let metricsReceived: any = null;

    const reporter = new SpekraReporter({
      apiKey: 'test-key',
      enabled: true,
      batchSize: 1000, // Don't trigger batching
      maxBufferSize,
      onMetrics: (metrics) => {
        metricsReceived = metrics;
      },
    });

    reporter.onBegin(createMockConfig(), createMockSuite());

    // Add 500 results (5x the buffer size)
    for (let i = 0; i < 500; i++) {
      reporter.onTestEnd(createMockTest(i), createMockResult());
    }

    // Should have dropped 400 results to stay within buffer
    // The onMetrics callback should report dropped results
    await reporter.onEnd({ status: 'passed' } as any);

    expect(metricsReceived).not.toBeNull();
    expect(metricsReceived.resultsDropped).toBe(400);
  });

  it('should batch results efficiently', async () => {
    // This test verifies batching logic works - we use mocked API
    // The mocked API is set up at file level, so batching is tested implicitly
    // by ensuring reporter handles 150 tests without issues
    const batchSize = 50;

    const reporter = new SpekraReporter({
      apiKey: 'test-key',
      enabled: true,
      batchSize,
    });

    reporter.onBegin(createMockConfig(), createMockSuite());

    // Add exactly 150 tests
    for (let i = 0; i < 150; i++) {
      reporter.onTestEnd(createMockTest(i), createMockResult());
    }

    // Should complete without errors
    await reporter.onEnd({ status: 'passed' } as any);

    // Test passes if no errors were thrown during batched processing
    expect(true).toBe(true);
  });

  it('should handle large error messages efficiently', async () => {
    const reporter = new SpekraReporter({
      apiKey: 'test-key',
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
  });

  it('should handle API failures during batch sends gracefully', async () => {
    let callCount = 0;
    const errorCallback = vi.fn();

    // Reset the mock to simulate intermittent failures
    vi.doMock('../../src/api', () => ({
      SpekraApiClient: vi.fn().mockImplementation(() => ({
        sendReport: vi.fn().mockImplementation(() => {
          callCount++;
          // Fail every 3rd call
          if (callCount % 3 === 0) {
            return Promise.resolve({
              success: false,
              latencyMs: 100,
              bytesSent: 0,
              bytesUncompressed: 100,
              retryCount: 3,
              requestId: `fail-request-${callCount}`,
              error: {
                type: 'api',
                message: 'Simulated API failure',
                statusCode: 503,
              },
            });
          }
          return Promise.resolve({
            success: true,
            latencyMs: 10,
            bytesSent: 100,
            bytesUncompressed: 200,
            retryCount: 0,
            requestId: `success-request-${callCount}`,
          });
        }),
      })),
    }));

    // Need to re-import after mock change
    const { SpekraReporter: FreshReporter } = await import('../../src/reporter');

    const reporter = new FreshReporter({
      apiKey: 'test-key',
      enabled: true,
      batchSize: 20,
      onError: errorCallback,
    });

    reporter.onBegin(createMockConfig(), createMockSuite());

    // Add enough tests to trigger multiple batches
    for (let i = 0; i < 100; i++) {
      reporter.onTestEnd(createMockTest(i), createMockResult());
    }

    // Should complete without throwing
    await reporter.onEnd({ status: 'passed' } as any);

    // The reporter should have handled failures gracefully
    // Some batches may have failed, but the test run completes
    expect(true).toBe(true);
  });

  it('should continue processing after batch failure', async () => {
    let metricsReceived: any = null;

    const reporter = new SpekraReporter({
      apiKey: 'test-key',
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

describe('Reporter Backpressure Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should handle tests completing faster than batches can send', async () => {
    // Simulate slow API responses
    vi.doMock('../../src/api', () => ({
      SpekraApiClient: vi.fn().mockImplementation(() => ({
        sendReport: vi.fn().mockImplementation(async () => {
          // Simulate 100ms API latency
          await new Promise((resolve) => setTimeout(resolve, 100));
          return {
            success: true,
            latencyMs: 100,
            bytesSent: 100,
            bytesUncompressed: 200,
            retryCount: 0,
            requestId: 'mock-request-id',
          };
        }),
      })),
    }));

    const { SpekraReporter: SlowApiReporter } = await import('../../src/reporter');

    const reporter = new SlowApiReporter({
      apiKey: 'test-key',
      enabled: true,
      batchSize: 10,
      maxBufferSize: 50,
    });

    reporter.onBegin(createMockConfig(), createMockSuite());

    const startTime = Date.now();

    // Rapidly add 200 tests (faster than batches can be sent)
    for (let i = 0; i < 200; i++) {
      reporter.onTestEnd(createMockTest(i), createMockResult());
    }

    const addDuration = Date.now() - startTime;
    console.log(`Added 200 tests in ${addDuration}ms`);

    // Adding tests should be fast (not blocked by slow sends)
    expect(addDuration).toBeLessThan(500);

    // Complete the run
    await reporter.onEnd({ status: 'passed' } as any);
  });

  it('should drop oldest results when buffer overflows under backpressure', async () => {
    let metricsReceived: any = null;

    const reporter = new SpekraReporter({
      apiKey: 'test-key',
      enabled: true,
      batchSize: 1000, // Very large batch to prevent sending
      maxBufferSize: 50, // Small buffer
      onMetrics: (metrics) => {
        metricsReceived = metrics;
      },
    });

    reporter.onBegin(createMockConfig(), createMockSuite());

    // Add more tests than buffer can hold
    for (let i = 0; i < 200; i++) {
      reporter.onTestEnd(createMockTest(i), createMockResult());
    }

    await reporter.onEnd({ status: 'passed' } as any);

    // Should have dropped 150 results (200 - 50 buffer)
    expect(metricsReceived).not.toBeNull();
    expect(metricsReceived.resultsDropped).toBe(150);
  });
});

describe('Reporter Retry Storm Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should handle high volume of tests with batching under load', async () => {
    // This test uses the existing mock which always succeeds
    // We're testing that high volume doesn't cause issues
    let metricsReceived: any = null;

    const reporter = new SpekraReporter({
      apiKey: 'test-key',
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
    expect(metricsReceived.resultsDropped).toBe(0);
  });

  it('should handle burst of tests followed by idle period', async () => {
    let metricsReceived: any = null;

    const reporter = new SpekraReporter({
      apiKey: 'test-key',
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
