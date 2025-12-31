import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CollectTestResultUseCase } from '../../../src/use-cases/collect-test-result.use-case';
import type { LoggerService, RedactionService } from '@spekra/core';
import type { TestCase, TestResult as PlaywrightTestResult } from '@playwright/test/reporter';

// Mock logger
function createMockLogger(): LoggerService {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    verbose: vi.fn(),
  } as unknown as LoggerService;
}

// Mock redaction service
function createMockRedactionService(): RedactionService {
  return {
    redact: vi.fn((text: string) => text),
    redactArray: vi.fn((arr: string[]) => arr),
    redactUrl: vi.fn((url: string) => url),
  } as unknown as RedactionService;
}

describe('CollectTestResultUseCase', () => {
  let logger: LoggerService;
  let redactionService: RedactionService;
  let useCase: CollectTestResultUseCase;

  beforeEach(() => {
    logger = createMockLogger();
    redactionService = createMockRedactionService();
    useCase = new CollectTestResultUseCase(logger, redactionService, {
      maxErrorLength: 100,
      maxStackTraceLines: 5,
    });
  });

  // Helper to create mock Playwright test objects
  function createMockTest(
    overrides: Partial<{
      title: string;
      annotations: Array<{ type: string; description?: string }>;
      parent: {
        title: string;
        project: () => { name: string } | undefined;
      };
      titlePath: () => string[];
      location: { file: string; line: number; column: number };
    }> = {}
  ): TestCase {
    const defaultProject = { name: 'chromium' };
    return {
      title: overrides.title ?? 'test title',
      annotations: overrides.annotations ?? [],
      parent: overrides.parent ?? {
        title: 'Suite',
        project: () => defaultProject,
      },
      titlePath: overrides.titlePath ?? (() => ['Suite', 'test title']),
      location: overrides.location ?? { file: 'test.spec.ts', line: 10, column: 1 },
    } as unknown as TestCase;
  }

  function createMockResult(
    overrides: Partial<{
      status: 'passed' | 'failed' | 'skipped' | 'timedOut' | 'interrupted';
      duration: number;
      retry: number;
      error: { message: string; stack?: string };
      attachments: Array<{ name: string; contentType: string; path?: string; body?: Buffer }>;
      stdout: Array<string | Buffer>;
      stderr: Array<string | Buffer>;
      steps: Array<{
        title: string;
        category?: string;
        duration: number;
        error?: { message: string };
        steps?: unknown[];
      }>;
    }> = {}
  ): PlaywrightTestResult {
    return {
      status: overrides.status ?? 'passed',
      duration: overrides.duration ?? 100,
      retry: overrides.retry ?? 0,
      error: overrides.error,
      attachments: overrides.attachments ?? [],
      stdout: overrides.stdout ?? [],
      stderr: overrides.stderr ?? [],
      steps: overrides.steps ?? [],
    } as unknown as PlaywrightTestResult;
  }

  describe('execute', () => {
    it('should collect basic test result', () => {
      const test = createMockTest();
      const result = createMockResult();

      const output = useCase.execute({ test, result });

      expect(output.success).toBe(true);
      if (!output.success) throw new Error('Expected success');
      expect(output.data.testResult).toBeDefined();
      expect(output.data.testResult.status).toBe('passed');
    });

    it('should truncate long error messages by lines', () => {
      // Use a long error with many lines but under the length limit
      // Config has maxStackTraceLines: 5, maxErrorLength: 100
      // So we need lines to trigger first
      const longError = Array(20).fill('L').join('\n'); // 39 chars with newlines, under 100
      const test = createMockTest();
      const useCase = new CollectTestResultUseCase(logger, redactionService, {
        maxErrorLength: 500, // High length limit so lines trigger first
        maxStackTraceLines: 5,
      });
      const result = createMockResult({
        status: 'failed',
        error: { message: longError },
      });

      const output = useCase.execute({ test, result });

      expect(output.success).toBe(true);
      if (!output.success) throw new Error('Expected success');
      // Should have truncated to maxStackTraceLines (5) + 1 for the "more lines" message
      const errorMessage = output.data.testResult.errorMessage;
      expect(errorMessage).toContain('more lines');
    });

    it('should truncate very long error messages by length', () => {
      const longError = 'A'.repeat(500);
      const test = createMockTest();
      const result = createMockResult({
        status: 'failed',
        error: { message: longError },
      });

      const output = useCase.execute({ test, result });

      expect(output.success).toBe(true);
      if (!output.success) throw new Error('Expected success');
      const errorMessage = output.data.testResult.errorMessage;
      expect(errorMessage).toContain('truncated');
      expect(errorMessage?.length).toBeLessThan(500);
    });

    it('should handle test with console output', () => {
      const test = createMockTest();
      const result = createMockResult({
        stdout: ['Log message 1', 'Log message 2'],
        stderr: ['Error message'],
      });

      const output = useCase.execute({ test, result });

      expect(output.success).toBe(true);
      if (!output.success) throw new Error('Expected success');
      expect(output.data.testResult.stdout).toHaveLength(2);
      expect(output.data.testResult.stderr).toHaveLength(1);
    });

    it('should extract tags from annotations', () => {
      const test = createMockTest({
        annotations: [
          { type: 'tag', description: 'smoke' },
          { type: 'tag', description: 'critical' },
        ],
      });
      const result = createMockResult();

      const output = useCase.execute({ test, result });

      expect(output.success).toBe(true);
      if (!output.success) throw new Error('Expected success');
      expect(output.data.testResult.tags).toContain('smoke');
      expect(output.data.testResult.tags).toContain('critical');
    });

    it('should handle @tags in title', () => {
      const test = createMockTest({
        title: '@smoke @critical should work',
        titlePath: () => ['Suite', '@smoke @critical should work'],
      });
      const result = createMockResult();

      const output = useCase.execute({ test, result });

      expect(output.success).toBe(true);
      if (!output.success) throw new Error('Expected success');
      // Tags from title include the @ symbol
      expect(output.data.testResult.tags).toContain('@smoke');
      expect(output.data.testResult.tags).toContain('@critical');
    });

    it('should handle test steps', () => {
      const test = createMockTest();
      const result = createMockResult({
        steps: [
          { title: 'Click button', category: 'test.step', duration: 50, steps: [] },
          { title: 'Fill form', category: 'test.step', duration: 100, steps: [] },
        ],
      });

      const output = useCase.execute({ test, result });

      expect(output.success).toBe(true);
      if (!output.success) throw new Error('Expected success');
      expect(output.data.testResult.steps).toHaveLength(2);
    });

    it('should handle steps with errors', () => {
      const test = createMockTest();
      const result = createMockResult({
        steps: [
          {
            title: 'Failing step',
            category: 'test.step',
            duration: 50,
            error: { message: 'Step failed' },
            steps: [],
          },
        ],
      });

      const output = useCase.execute({ test, result });

      expect(output.success).toBe(true);
      if (!output.success) throw new Error('Expected success');
      expect(output.data.testResult.steps).toHaveLength(1);
      expect(output.data.testResult.steps[0].error).toBe('Step failed');
    });

    it('should handle nested steps', () => {
      const test = createMockTest();
      const result = createMockResult({
        steps: [
          {
            title: 'Parent step',
            category: 'test.step',
            duration: 100,
            steps: [
              { title: 'Child step 1', category: 'test.step', duration: 30, steps: [] },
              { title: 'Child step 2', category: 'test.step', duration: 40, steps: [] },
            ],
          },
        ],
      });

      const output = useCase.execute({ test, result });

      expect(output.success).toBe(true);
      if (!output.success) throw new Error('Expected success');
      expect(output.data.testResult.steps).toHaveLength(1);
      expect(output.data.testResult.steps[0].steps).toHaveLength(2);
    });

    it('should handle thrown exceptions in execute', () => {
      // Create a test that will cause an error during execution
      const badTest = {
        title: 'test',
        annotations: [],
        parent: {
          title: 'Suite',
          project: () => {
            throw new Error('Unexpected error');
          },
        },
        titlePath: () => ['Suite', 'test'],
        location: { file: 'test.spec.ts', line: 10, column: 1 },
      } as unknown as TestCase;
      const result = createMockResult();

      const output = useCase.execute({ test: badTest, result });

      expect(output.success).toBe(false);
      if (output.success) throw new Error('Expected failure');
      expect(output.error).toContain('Failed to collect test result');
    });
  });

  describe('flushResults', () => {
    it('should return buffered results and clear buffer', () => {
      const test = createMockTest();
      const result = createMockResult();

      useCase.execute({ test, result });
      useCase.execute({ test, result });

      const flushed = useCase.flushResults();
      expect(flushed).toHaveLength(2);

      const flushedAgain = useCase.flushResults();
      expect(flushedAgain).toHaveLength(0);
    });
  });

  describe('getBufferedResults', () => {
    it('should return buffered results without clearing', () => {
      const test = createMockTest();
      const result = createMockResult();

      useCase.execute({ test, result });
      useCase.execute({ test, result });

      const results1 = useCase.getBufferedResults();
      expect(results1).toHaveLength(2);

      // Should still have the results
      const results2 = useCase.getBufferedResults();
      expect(results2).toHaveLength(2);
    });
  });

  describe('bufferedCount', () => {
    it('should return count of buffered results', () => {
      const test = createMockTest();
      const result = createMockResult();

      expect(useCase.bufferedCount).toBe(0);

      useCase.execute({ test, result });
      expect(useCase.bufferedCount).toBe(1);

      useCase.execute({ test, result });
      expect(useCase.bufferedCount).toBe(2);
    });
  });

  describe('edge cases', () => {
    it('should handle test with default project when project is undefined', () => {
      const test = createMockTest({
        parent: {
          title: 'Suite',
          project: () => undefined,
        },
      });
      const result = createMockResult();

      const output = useCase.execute({ test, result });

      expect(output.success).toBe(true);
      if (!output.success) throw new Error('Expected success');
      expect(output.data.testResult.project).toBe('default');
    });

    it('should handle test with Buffer console output', () => {
      const test = createMockTest();
      const result = createMockResult({
        stdout: [Buffer.from('Buffer output')],
        stderr: [],
      });

      const output = useCase.execute({ test, result });

      expect(output.success).toBe(true);
      if (!output.success) throw new Error('Expected success');
      expect(output.data.testResult.stdout[0]).toBe('Buffer output');
    });

    it('should handle timed out status', () => {
      const test = createMockTest();
      const result = createMockResult({
        status: 'timedOut',
        error: { message: 'Test timed out' },
      });

      const output = useCase.execute({ test, result });

      expect(output.success).toBe(true);
      if (!output.success) throw new Error('Expected success');
      expect(output.data.testResult.status).toBe('timedOut');
    });

    it('should handle interrupted status', () => {
      const test = createMockTest();
      const result = createMockResult({
        status: 'interrupted',
      });

      const output = useCase.execute({ test, result });

      expect(output.success).toBe(true);
      if (!output.success) throw new Error('Expected success');
      expect(output.data.testResult.status).toBe('interrupted');
    });

    it('should skip inline body attachments without path', () => {
      const test = createMockTest();
      const result = createMockResult({
        attachments: [
          { name: 'screenshot', contentType: 'image/png', body: Buffer.from('data') },
          // No path means it's an inline attachment
        ],
      });

      const output = useCase.execute({ test, result });

      expect(output.success).toBe(true);
      if (!output.success) throw new Error('Expected success');
      expect(output.data.testResult.artifacts).toHaveLength(0);
    });

    it('should handle missing attachment files gracefully', () => {
      const test = createMockTest();
      const result = createMockResult({
        attachments: [
          {
            name: 'screenshot',
            contentType: 'image/png',
            path: '/nonexistent/path/screenshot.png',
          },
        ],
      });

      const output = useCase.execute({ test, result });

      expect(output.success).toBe(true);
      if (!output.success) throw new Error('Expected success');
      expect(output.data.testResult.artifacts).toHaveLength(0);
      expect(logger.verbose).toHaveBeenCalledWith('Could not stat attachment', expect.any(Object));
    });
  });

  // ==========================================================================
  // Real Playwright Error Types
  // ==========================================================================

  describe('real Playwright error types', () => {
    it('should handle expect() timeout errors with long selectors', () => {
      const test = createMockTest();
      const longSelector = `[data-testid="very-long-test-id-that-describes-the-element-in-detail-${Array(50).fill('x').join('')}"]`;
      const result = createMockResult({
        status: 'failed',
        error: {
          message: `Timeout 30000ms exceeded.\n\nCall log:\n  - waiting for locator('${longSelector}')`,
          stack: `Error: Timeout 30000ms exceeded.\n    at /tests/login.spec.ts:25:15`,
        },
      });

      const output = useCase.execute({ test, result });

      expect(output.success).toBe(true);
      if (!output.success) throw new Error('Expected success');
      expect(output.data.testResult.errorMessage).toContain('Timeout');
    });

    it('should handle locator strict mode violations', () => {
      const test = createMockTest();
      const result = createMockResult({
        status: 'failed',
        error: {
          message: `Error: locator.click: Error: strict mode violation: locator('button') resolved to 3 elements:\n    1) <button id="btn1">First</button>\n    2) <button id="btn2">Second</button>\n    3) <button id="btn3">Third</button>`,
          stack: `Error: strict mode violation\n    at /tests/buttons.spec.ts:10:15`,
        },
      });

      const output = useCase.execute({ test, result });

      expect(output.success).toBe(true);
      if (!output.success) throw new Error('Expected success');
      expect(output.data.testResult.errorMessage).toContain('strict mode violation');
    });

    it('should handle navigation errors', () => {
      const test = createMockTest();
      const result = createMockResult({
        status: 'failed',
        error: {
          message: `page.goto: net::ERR_CONNECTION_REFUSED at https://localhost:3000/login`,
          stack: `Error: net::ERR_CONNECTION_REFUSED\n    at /tests/navigation.spec.ts:5:10`,
        },
      });

      const output = useCase.execute({ test, result });

      expect(output.success).toBe(true);
      if (!output.success) throw new Error('Expected success');
      expect(output.data.testResult.errorMessage).toContain('ERR_CONNECTION_REFUSED');
    });

    it('should handle frame detached errors', () => {
      const test = createMockTest();
      const result = createMockResult({
        status: 'failed',
        error: {
          message: `frame.click: Frame was detached`,
          stack: `Error: Frame was detached\n    at /tests/iframe.spec.ts:20:8`,
        },
      });

      const output = useCase.execute({ test, result });

      expect(output.success).toBe(true);
      if (!output.success) throw new Error('Expected success');
      expect(output.data.testResult.errorMessage).toContain('Frame was detached');
    });

    it('should handle target closed errors', () => {
      const test = createMockTest();
      const result = createMockResult({
        status: 'failed',
        error: {
          message: `page.click: Target page, context or browser has been closed`,
          stack: `Error: Target page, context or browser has been closed\n    at /tests/close.spec.ts:15:10`,
        },
      });

      const output = useCase.execute({ test, result });

      expect(output.success).toBe(true);
      if (!output.success) throw new Error('Expected success');
      expect(output.data.testResult.errorMessage).toContain('Target page');
    });

    it('should handle expect assertion errors with received/expected diff', () => {
      const test = createMockTest();
      const result = createMockResult({
        status: 'failed',
        error: {
          message: `expect(received).toHaveText(expected)\n\nExpected string: "Welcome, John"\nReceived string: "Welcome, Guest"\n\nCall log:\n  - expect.toHaveText with timeout 5000ms`,
          stack: `Error: expect(received).toHaveText(expected)\n    at /tests/welcome.spec.ts:12:25`,
        },
      });

      const output = useCase.execute({ test, result });

      expect(output.success).toBe(true);
      if (!output.success) throw new Error('Expected success');
      expect(output.data.testResult.errorMessage).toContain('Expected string');
      expect(output.data.testResult.errorMessage).toContain('Received string');
    });

    it('should handle errors with binary/non-printable characters', () => {
      const test = createMockTest();
      const binaryContent = Buffer.from([0x00, 0x01, 0x02, 0xff, 0xfe]).toString();
      const result = createMockResult({
        status: 'failed',
        error: {
          message: `Response body contained invalid data: ${binaryContent}`,
        },
      });

      const output = useCase.execute({ test, result });

      expect(output.success).toBe(true);
      if (!output.success) throw new Error('Expected success');
      // Should handle without crashing
      expect(output.data.testResult.status).toBe('failed');
    });

    it('should handle errors with very long selector strings', () => {
      const test = createMockTest();
      // Simulate a very complex selector chain
      const longSelector = Array(100)
        .fill(0)
        .map((_, i) => `div:nth-child(${i})`)
        .join(' > ');
      const result = createMockResult({
        status: 'failed',
        error: {
          message: `Timeout waiting for selector: ${longSelector}`,
        },
      });

      const output = useCase.execute({ test, result });

      expect(output.success).toBe(true);
      if (!output.success) throw new Error('Expected success');
      // Error should be truncated
      expect(output.data.testResult.errorMessage?.length).toBeLessThan(longSelector.length + 100);
    });

    it('should handle soft assertion errors (multiple failures)', () => {
      const test = createMockTest();
      const result = createMockResult({
        status: 'failed',
        error: {
          message: `Error: 3 soft assertion(s) failed:\n1) Expected "a" to equal "b"\n2) Expected 1 to be 2\n3) Expected true to be false`,
          stack: `Error: soft assertions failed\n    at /tests/soft.spec.ts:30:5`,
        },
      });

      const output = useCase.execute({ test, result });

      expect(output.success).toBe(true);
      if (!output.success) throw new Error('Expected success');
      expect(output.data.testResult.errorMessage).toContain('soft assertion');
    });

    it('should handle snapshot mismatch errors', () => {
      const test = createMockTest();
      const result = createMockResult({
        status: 'failed',
        error: {
          message: `Screenshot comparison failed:\n- Expected: test-1-expected.png\n- Received: test-1-actual.png\n- Diff: test-1-diff.png\nPixel difference: 1245 (0.5%)`,
        },
      });

      const output = useCase.execute({ test, result });

      expect(output.success).toBe(true);
      if (!output.success) throw new Error('Expected success');
      expect(output.data.testResult.errorMessage).toContain('Screenshot comparison');
    });
  });

  // ==========================================================================
  // Playwright Version Compatibility
  // ==========================================================================

  describe('Playwright version compatibility', () => {
    it('should handle tests without annotations property (pre-1.42)', () => {
      // Pre-1.42 Playwright didn't have annotations
      const testWithoutAnnotations = {
        title: 'legacy test @smoke',
        parent: {
          title: 'Suite',
          project: () => ({ name: 'chromium' }),
        },
        titlePath: () => ['Suite', 'legacy test @smoke'],
        location: { file: 'test.spec.ts', line: 10, column: 1 },
        // No annotations property
      } as unknown as TestCase;
      const result = createMockResult();

      const output = useCase.execute({ test: testWithoutAnnotations, result });

      expect(output.success).toBe(true);
      if (!output.success) throw new Error('Expected success');
      // Should still extract inline tags
      expect(output.data.testResult.tags).toContain('@smoke');
    });

    it('should handle test.step() hierarchy with errors', () => {
      const test = createMockTest();
      const result = createMockResult({
        status: 'failed',
        steps: [
          {
            title: 'Navigate to page',
            category: 'test.step',
            duration: 100,
            steps: [
              {
                title: 'Wait for load',
                category: 'test.step',
                duration: 50,
                error: { message: 'Page load timeout' },
                steps: [],
              },
            ],
          },
        ],
      });

      const output = useCase.execute({ test, result });

      expect(output.success).toBe(true);
      if (!output.success) throw new Error('Expected success');
      expect(output.data.testResult.steps[0].steps![0].error).toBe('Page load timeout');
    });

    it('should handle null annotations gracefully', () => {
      const testWithNullAnnotations = {
        title: 'test with null annotations',
        annotations: null,
        parent: {
          title: 'Suite',
          project: () => ({ name: 'chromium' }),
        },
        titlePath: () => ['Suite', 'test with null annotations'],
        location: { file: 'test.spec.ts', line: 10, column: 1 },
      } as unknown as TestCase;
      const result = createMockResult();

      const output = useCase.execute({ test: testWithNullAnnotations, result });

      expect(output.success).toBe(true);
    });

    it('should handle test with empty titlePath', () => {
      const testWithEmptyTitlePath = {
        title: 'standalone test',
        annotations: [],
        parent: {
          title: '',
          project: () => ({ name: 'chromium' }),
        },
        titlePath: () => [],
        location: { file: 'test.spec.ts', line: 1, column: 1 },
      } as unknown as TestCase;
      const result = createMockResult();

      const output = useCase.execute({ test: testWithEmptyTitlePath, result });

      expect(output.success).toBe(true);
    });
  });

  // ==========================================================================
  // Deep Nesting Edge Cases
  // ==========================================================================

  describe('deep nesting edge cases', () => {
    it('should handle very deep describe nesting (20+ levels)', () => {
      // Build a deeply nested parent chain
      let currentParent: any = {
        title: '',
        project: () => ({ name: 'chromium' }),
        parent: undefined,
      };

      const titles: string[] = [];
      for (let i = 0; i < 25; i++) {
        const title = `Describe Level ${i}`;
        titles.push(title);
        currentParent = {
          title,
          project: () => ({ name: 'chromium' }),
          parent: currentParent,
        };
      }

      const deeplyNestedTest = {
        title: 'deeply nested test',
        annotations: [],
        parent: currentParent,
        titlePath: () => [...titles.reverse(), 'deeply nested test'],
        location: { file: 'test.spec.ts', line: 10, column: 1 },
      } as unknown as TestCase;
      const result = createMockResult();

      const output = useCase.execute({ test: deeplyNestedTest, result });

      expect(output.success).toBe(true);
      if (!output.success) throw new Error('Expected success');
      expect(output.data.testResult.suitePath.length).toBe(25);
    });

    it('should handle test with very long title (10000+ chars)', () => {
      const veryLongTitle = 'A'.repeat(10000);
      const test = createMockTest({
        title: veryLongTitle,
        titlePath: () => ['Suite', veryLongTitle],
      });
      const result = createMockResult();

      const output = useCase.execute({ test, result });

      expect(output.success).toBe(true);
      if (!output.success) throw new Error('Expected success');
      // Should handle without issues
      expect(output.data.testResult.testName.length).toBe(10000);
    });

    it('should handle deeply nested steps (10+ levels)', () => {
      const test = createMockTest();

      // Build deeply nested steps
      const buildNestedSteps = (depth: number): any => {
        if (depth === 0) {
          return { title: 'leaf step', category: 'test.step', duration: 10, steps: [] };
        }
        return {
          title: `step level ${depth}`,
          category: 'test.step',
          duration: 10 * depth,
          steps: [buildNestedSteps(depth - 1)],
        };
      };

      const result = createMockResult({
        steps: [buildNestedSteps(10)],
      });

      const output = useCase.execute({ test, result });

      expect(output.success).toBe(true);
      if (!output.success) throw new Error('Expected success');
      expect(output.data.testResult.steps).toHaveLength(1);
    });
  });

  // ==========================================================================
  // Special Characters and Unicode
  // ==========================================================================

  describe('special characters and unicode', () => {
    it('should handle test titles with unicode characters', () => {
      const test = createMockTest({
        title: '日本語テスト 中文测试 🎉 émojis',
        titlePath: () => ['国際化', '日本語テスト 中文测试 🎉 émojis'],
      });
      const result = createMockResult();

      const output = useCase.execute({ test, result });

      expect(output.success).toBe(true);
      if (!output.success) throw new Error('Expected success');
      expect(output.data.testResult.testName).toContain('日本語テスト');
      expect(output.data.testResult.testName).toContain('🎉');
    });

    it('should handle test titles with HTML-like content', () => {
      const test = createMockTest({
        title: 'should handle <div> and </script> tags',
        titlePath: () => ['Suite', 'should handle <div> and </script> tags'],
      });
      const result = createMockResult();

      const output = useCase.execute({ test, result });

      expect(output.success).toBe(true);
      if (!output.success) throw new Error('Expected success');
      expect(output.data.testResult.testName).toContain('<div>');
    });

    it('should handle test titles with JSON-like content', () => {
      const test = createMockTest({
        title: 'should parse {"key": "value", "nested": {"a": 1}}',
        titlePath: () => ['Suite', 'should parse {"key": "value", "nested": {"a": 1}}'],
      });
      const result = createMockResult();

      const output = useCase.execute({ test, result });

      expect(output.success).toBe(true);
      if (!output.success) throw new Error('Expected success');
      expect(output.data.testResult.testName).toContain('"key"');
    });

    it('should handle error messages with unicode and special chars', () => {
      const test = createMockTest();
      const result = createMockResult({
        status: 'failed',
        error: {
          message: `Expected: "Привет мир 🌍"\nReceived: "Hello world"`,
        },
      });

      const output = useCase.execute({ test, result });

      expect(output.success).toBe(true);
      if (!output.success) throw new Error('Expected success');
      expect(output.data.testResult.errorMessage).toContain('Привет');
      expect(output.data.testResult.errorMessage).toContain('🌍');
    });

    it('should handle file paths with spaces and special characters', () => {
      const test = createMockTest({
        location: {
          file: '/project/tests/my tests/special (test) [1].spec.ts',
          line: 10,
          column: 1,
        },
      });
      const result = createMockResult();

      const output = useCase.execute({ test, result });

      expect(output.success).toBe(true);
      if (!output.success) throw new Error('Expected success');
      expect(output.data.testResult.testFile).toContain('special (test) [1].spec.ts');
    });
  });

  describe('cross-platform path handling', () => {
    it('should handle Windows-style paths', () => {
      const test = createMockTest({
        title: 'test',
        location: { file: 'C:\\Users\\dev\\project\\tests\\example.spec.ts', line: 10, column: 1 },
      });
      const result = createMockResult();

      const output = useCase.execute({ test, result });

      expect(output.success).toBe(true);
      if (!output.success) throw new Error('Expected success');
      // Should extract a reasonable file path
      expect(output.data.testResult.testFile).toBeDefined();
      expect(output.data.testResult.testFile.length).toBeGreaterThan(0);
    });

    it('should handle mixed path separators', () => {
      const test = createMockTest({
        title: 'test',
        location: { file: '/project\\tests/sub\\example.spec.ts', line: 10, column: 1 },
      });
      const result = createMockResult();

      const output = useCase.execute({ test, result });

      expect(output.success).toBe(true);
      if (!output.success) throw new Error('Expected success');
      expect(output.data.testResult.testFile).toBeDefined();
    });

    it('should handle UNC paths (Windows network shares)', () => {
      const test = createMockTest({
        title: 'test',
        location: { file: '\\\\server\\share\\tests\\example.spec.ts', line: 10, column: 1 },
      });
      const result = createMockResult();

      const output = useCase.execute({ test, result });

      expect(output.success).toBe(true);
      if (!output.success) throw new Error('Expected success');
      expect(output.data.testResult.testFile).toBeDefined();
    });

    it('should handle paths with drive letters', () => {
      const test = createMockTest({
        title: 'test',
        location: { file: 'D:/Projects/my-app/tests/login.spec.ts', line: 10, column: 1 },
      });
      const result = createMockResult();

      const output = useCase.execute({ test, result });

      expect(output.success).toBe(true);
      if (!output.success) throw new Error('Expected success');
      expect(output.data.testResult.testFile).toContain('login.spec.ts');
    });
  });

  describe('error object edge cases', () => {
    it('should handle error with circular reference', () => {
      const circularError: any = new Error('Circular error');
      circularError.self = circularError; // Create circular reference

      const test = createMockTest({ title: 'test' });
      const result = createMockResult({ status: 'failed', duration: 100 });
      result.errors = [circularError];

      // Should not throw
      const output = useCase.execute({ test, result });

      expect(output.success).toBe(true);
      if (!output.success) throw new Error('Expected success');
      expect(output.data.testResult.errorMessage).toBeDefined();
    });

    it('should handle error with non-string message property', () => {
      const weirdError = {
        message: { nested: 'object' }, // Non-string message
        stack: 'Error\n    at test.spec.ts:10:5',
      };

      const test = createMockTest({ title: 'test' });
      const result = createMockResult({ status: 'failed', duration: 100 });
      result.errors = [weirdError as any];

      const output = useCase.execute({ test, result });

      expect(output.success).toBe(true);
      if (!output.success) throw new Error('Expected success');
      // Should handle gracefully
      expect(output.data.testResult.status).toBe('failed');
    });

    it('should handle error with cause chain (ES2022)', () => {
      const rootCause = new Error('Root cause');
      const middleError = new Error('Middle error', { cause: rootCause });
      const topError = new Error('Top error', { cause: middleError });

      const test = createMockTest({ title: 'test' });
      const result = createMockResult({ status: 'failed', duration: 100 });
      result.errors = [topError];

      const output = useCase.execute({ test, result });

      expect(output.success).toBe(true);
      if (!output.success) throw new Error('Expected success');
      // Error message may be null or contain the error - just verify no crash
      expect(output.data.testResult.status).toBe('failed');
    });

    it('should handle AggregateError', () => {
      const errors = [
        new Error('First error'),
        new Error('Second error'),
        new Error('Third error'),
      ];
      const aggregateError = new AggregateError(errors, 'Multiple errors occurred');

      const test = createMockTest({ title: 'test' });
      const result = createMockResult({ status: 'failed', duration: 100 });
      result.errors = [aggregateError];

      const output = useCase.execute({ test, result });

      expect(output.success).toBe(true);
      if (!output.success) throw new Error('Expected success');
      // Error message may be null or contain the error - just verify no crash
      expect(output.data.testResult.status).toBe('failed');
    });

    it('should handle error that is just a string', () => {
      const test = createMockTest({ title: 'test' });
      const result = createMockResult({ status: 'failed', duration: 100 });
      result.errors = ['Plain string error' as any];

      const output = useCase.execute({ test, result });

      expect(output.success).toBe(true);
      if (!output.success) throw new Error('Expected success');
      // Should handle string errors
      expect(output.data.testResult.status).toBe('failed');
    });

    it('should handle error that is a number', () => {
      const test = createMockTest({ title: 'test' });
      const result = createMockResult({ status: 'failed', duration: 100 });
      result.errors = [42 as any];

      const output = useCase.execute({ test, result });

      expect(output.success).toBe(true);
      if (!output.success) throw new Error('Expected success');
      expect(output.data.testResult.status).toBe('failed');
    });

    it('should handle error with undefined message', () => {
      const weirdError = {
        message: undefined,
        stack: 'at some location',
      };

      const test = createMockTest({ title: 'test' });
      const result = createMockResult({ status: 'failed', duration: 100 });
      result.errors = [weirdError as any];

      const output = useCase.execute({ test, result });

      expect(output.success).toBe(true);
      if (!output.success) throw new Error('Expected success');
      expect(output.data.testResult.status).toBe('failed');
    });

    it('should handle error with null message', () => {
      const weirdError = {
        message: null,
        stack: 'at some location',
      };

      const test = createMockTest({ title: 'test' });
      const result = createMockResult({ status: 'failed', duration: 100 });
      result.errors = [weirdError as any];

      const output = useCase.execute({ test, result });

      expect(output.success).toBe(true);
      if (!output.success) throw new Error('Expected success');
      expect(output.data.testResult.status).toBe('failed');
    });

    it('should handle error with getter that throws', () => {
      const dangerousError = {
        get message(): string {
          throw new Error('Getter threw!');
        },
        stack: 'at some location',
      };

      const test = createMockTest({ title: 'test' });
      const result = createMockResult({ status: 'failed', duration: 100 });
      result.errors = [dangerousError as any];

      // Should not crash
      const output = useCase.execute({ test, result });
      expect(output.success).toBe(true);
    });
  });

  // ==========================================================================
  // ANSI Escape Code Stripping
  // ==========================================================================

  describe('ANSI escape code stripping', () => {
    it('should strip basic color codes from error messages', () => {
      const test = createMockTest();
      // Simulate Playwright's colored output: \x1b[2m (dim) \x1b[22m (normal)
      const coloredError =
        '\x1b[2mexpect(\x1b[22m \x1b[31mreceived\x1b[39m). \x1b[22mtoBe \x1b[2m(\x1b[22m \x1b[32mexpected\x1b[39m';
      const result = createMockResult({
        status: 'failed',
        error: { message: coloredError },
      });

      const output = useCase.execute({ test, result });

      expect(output.success).toBe(true);
      if (!output.success) throw new Error('Expected success');
      // Should strip ANSI codes
      expect(output.data.testResult.errorMessage).not.toContain('\x1b[');
      expect(output.data.testResult.errorMessage).not.toContain('[2m');
      expect(output.data.testResult.errorMessage).not.toContain('[31m');
      // But keep the actual content
      expect(output.data.testResult.errorMessage).toContain('expect');
      expect(output.data.testResult.errorMessage).toContain('received');
      expect(output.data.testResult.errorMessage).toContain('toBe');
    });

    it('should strip ANSI codes from expected/received diff output', () => {
      const test = createMockTest();
      // Real-world example from Playwright expect assertion
      const coloredError =
        'Error:\n' +
        ' \x1b[2mexpect(\x1b[22m \x1b[31mreceived\x1b[39m \x1b[2m).\x1b[22mtoBe\x1b[2m(\x1b[22m \x1b[32mexpected\x1b[39m \x1b[2m) // Object.is equality\x1b[22m\n\n' +
        'Expected:  \x1b[32m200\x1b[39m\n' +
        'Received:  \x1b[31m400\x1b[39m';
      const result = createMockResult({
        status: 'failed',
        error: { message: coloredError },
      });

      const output = useCase.execute({ test, result });

      expect(output.success).toBe(true);
      if (!output.success) throw new Error('Expected success');
      const errorMessage = output.data.testResult.errorMessage!;
      // Verify no ANSI codes remain
      // eslint-disable-next-line no-control-regex
      expect(errorMessage).not.toMatch(/\x1b\[/);
      // Verify content is preserved
      expect(errorMessage).toContain('Expected:');
      expect(errorMessage).toContain('200');
      expect(errorMessage).toContain('Received:');
      expect(errorMessage).toContain('400');
    });

    it('should handle errors without ANSI codes (no change)', () => {
      const test = createMockTest();
      const plainError = 'Expected 200 but received 400';
      const result = createMockResult({
        status: 'failed',
        error: { message: plainError },
      });

      const output = useCase.execute({ test, result });

      expect(output.success).toBe(true);
      if (!output.success) throw new Error('Expected success');
      expect(output.data.testResult.errorMessage).toBe(plainError);
    });

    it('should strip various ANSI escape sequences', () => {
      const test = createMockTest();
      // Different ANSI codes: bold, underline, cursor movement, colors
      const complexAnsi =
        '\x1b[1mBold\x1b[0m ' +
        '\x1b[4mUnderline\x1b[24m ' +
        '\x1b[38;5;196mRed256\x1b[0m ' +
        '\x1b[48;2;255;0;0mTrueColorBg\x1b[0m';
      const result = createMockResult({
        status: 'failed',
        error: { message: complexAnsi },
      });

      const output = useCase.execute({ test, result });

      expect(output.success).toBe(true);
      if (!output.success) throw new Error('Expected success');
      const errorMessage = output.data.testResult.errorMessage!;
      // eslint-disable-next-line no-control-regex
      expect(errorMessage).not.toMatch(/\x1b/);
      expect(errorMessage).toContain('Bold');
      expect(errorMessage).toContain('Underline');
    });

    it('should strip ANSI codes from step errors', () => {
      const test = createMockTest();
      const result = createMockResult({
        status: 'failed',
        steps: [
          {
            title: 'Failing step',
            category: 'test.step',
            duration: 50,
            error: { message: '\x1b[31mStep failed with color\x1b[39m' },
            steps: [],
          },
        ],
      });

      const output = useCase.execute({ test, result });

      expect(output.success).toBe(true);
      if (!output.success) throw new Error('Expected success');
      expect(output.data.testResult.steps[0].error).toBe('Step failed with color');
      expect(output.data.testResult.steps[0].error).not.toContain('\x1b[');
    });
  });
});
