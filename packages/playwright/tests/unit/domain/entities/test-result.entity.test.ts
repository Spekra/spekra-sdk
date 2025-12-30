import { describe, it, expect } from 'vitest';
import { TestResult } from '../../../../src/domain/entities/test-result.entity';
import { Artifact } from '../../../../src/domain/entities/artifact.entity';

describe('TestResult', () => {
  describe('create', () => {
    it('should create a test result with generated id', () => {
      const result = TestResult.create({
        testFile: 'tests/login.spec.ts',
        fullTitle: 'Login > should login successfully',
        suitePath: ['Login'],
        testName: 'should login successfully',
        tags: ['smoke'],
        project: 'chromium',
        status: 'passed',
        durationMs: 1500,
        retry: 0,
        errorMessage: null,
      });

      expect(result.id).toBeDefined();
      expect(result.id.length).toBeGreaterThan(0);
      expect(result.testFile).toBe('tests/login.spec.ts');
      expect(result.fullTitle).toBe('Login > should login successfully');
      expect(result.suitePath).toEqual(['Login']);
      expect(result.testName).toBe('should login successfully');
      expect(result.tags).toEqual(['smoke']);
      expect(result.project).toBe('chromium');
      expect(result.status).toBe('passed');
      expect(result.durationMs).toBe(1500);
      expect(result.retry).toBe(0);
      expect(result.errorMessage).toBeNull();
    });

    it('should default optional arrays to empty', () => {
      const result = TestResult.create({
        testFile: 'tests/test.spec.ts',
        fullTitle: 'test',
        suitePath: [],
        testName: 'test',
        tags: [],
        project: 'default',
        status: 'passed',
        durationMs: 100,
        retry: 0,
        errorMessage: null,
      });

      expect(result.artifacts).toEqual([]);
      expect(result.steps).toEqual([]);
      expect(result.stdout).toEqual([]);
      expect(result.stderr).toEqual([]);
    });

    it('should accept artifacts, steps, and console output', () => {
      const artifact = Artifact.create({
        type: 'screenshot',
        name: 'screenshot',
        path: '/tmp/screenshot.png',
        contentType: 'image/png',
        size: 1000,
      });

      const result = TestResult.create({
        testFile: 'tests/test.spec.ts',
        fullTitle: 'test',
        suitePath: [],
        testName: 'test',
        tags: [],
        project: 'default',
        status: 'failed',
        durationMs: 500,
        retry: 1,
        errorMessage: 'Expected true to be false',
        artifacts: [artifact],
        steps: [{ title: 'Click button', durationMs: 50, error: null }],
        stdout: ['Console log output'],
        stderr: ['Console error output'],
      });

      expect(result.artifacts).toHaveLength(1);
      expect(result.steps).toHaveLength(1);
      expect(result.stdout).toEqual(['Console log output']);
      expect(result.stderr).toEqual(['Console error output']);
      expect(result.errorMessage).toBe('Expected true to be false');
    });
  });

  describe('hasArtifacts', () => {
    it('should return false when no artifacts', () => {
      const result = TestResult.create({
        testFile: 'test.spec.ts',
        fullTitle: 'test',
        suitePath: [],
        testName: 'test',
        tags: [],
        project: 'default',
        status: 'passed',
        durationMs: 100,
        retry: 0,
        errorMessage: null,
      });

      expect(result.hasArtifacts).toBe(false);
    });

    it('should return true when has artifacts', () => {
      const artifact = Artifact.create({
        type: 'screenshot',
        name: 'screenshot',
        path: '/tmp/screenshot.png',
        contentType: 'image/png',
        size: 1000,
      });

      const result = TestResult.create({
        testFile: 'test.spec.ts',
        fullTitle: 'test',
        suitePath: [],
        testName: 'test',
        tags: [],
        project: 'default',
        status: 'passed',
        durationMs: 100,
        retry: 0,
        errorMessage: null,
        artifacts: [artifact],
      });

      expect(result.hasArtifacts).toBe(true);
    });
  });

  describe('totalArtifactSize', () => {
    it('should return 0 when no artifacts', () => {
      const result = TestResult.create({
        testFile: 'test.spec.ts',
        fullTitle: 'test',
        suitePath: [],
        testName: 'test',
        tags: [],
        project: 'default',
        status: 'passed',
        durationMs: 100,
        retry: 0,
        errorMessage: null,
      });

      expect(result.totalArtifactSize).toBe(0);
    });

    it('should sum artifact sizes', () => {
      const artifact1 = Artifact.create({
        type: 'screenshot',
        name: 'screenshot1',
        path: '/tmp/screenshot1.png',
        contentType: 'image/png',
        size: 1000,
      });
      const artifact2 = Artifact.create({
        type: 'screenshot',
        name: 'screenshot2',
        path: '/tmp/screenshot2.png',
        contentType: 'image/png',
        size: 2500,
      });

      const result = TestResult.create({
        testFile: 'test.spec.ts',
        fullTitle: 'test',
        suitePath: [],
        testName: 'test',
        tags: [],
        project: 'default',
        status: 'passed',
        durationMs: 100,
        retry: 0,
        errorMessage: null,
        artifacts: [artifact1, artifact2],
      });

      expect(result.totalArtifactSize).toBe(3500);
    });
  });

  describe('toPayload', () => {
    it('should convert to API payload format', () => {
      const artifact = Artifact.create({
        type: 'trace',
        name: 'trace',
        path: '/local/path/trace.zip',
        contentType: 'application/zip',
        size: 5000,
      });

      const result = TestResult.create({
        testFile: 'tests/checkout.spec.ts',
        fullTitle: 'Checkout > should complete purchase',
        suitePath: ['Checkout'],
        testName: 'should complete purchase',
        tags: ['critical', 'e2e'],
        project: 'webkit',
        status: 'passed',
        durationMs: 3000,
        retry: 0,
        errorMessage: null,
        artifacts: [artifact],
        steps: [
          { title: 'Navigate to cart', durationMs: 500, error: null },
          { title: 'Click checkout', durationMs: 200, error: null },
        ],
        stdout: ['Order created'],
        stderr: [],
      });

      const payload = result.toPayload();

      expect(payload.id).toBe(result.id);
      expect(payload.testFile).toBe('tests/checkout.spec.ts');
      expect(payload.fullTitle).toBe('Checkout > should complete purchase');
      expect(payload.suitePath).toEqual(['Checkout']);
      expect(payload.testName).toBe('should complete purchase');
      expect(payload.tags).toEqual(['critical', 'e2e']);
      expect(payload.project).toBe('webkit');
      expect(payload.status).toBe('passed');
      expect(payload.durationMs).toBe(3000);
      expect(payload.retry).toBe(0);
      expect(payload.errorMessage).toBeNull();
      expect(payload.steps).toHaveLength(2);
      expect(payload.stdout).toEqual(['Order created']);
      expect(payload.stderr).toEqual([]);

      // Artifacts should be metadata (no path)
      expect(payload.artifacts).toHaveLength(1);
      expect(payload.artifacts[0].id).toBe(artifact.id);
      expect(payload.artifacts[0].type).toBe('trace');
      expect('path' in payload.artifacts[0]).toBe(false);
    });

    it('should handle failed test with error message', () => {
      const result = TestResult.create({
        testFile: 'test.spec.ts',
        fullTitle: 'test',
        suitePath: [],
        testName: 'test',
        tags: [],
        project: 'default',
        status: 'failed',
        durationMs: 100,
        retry: 2,
        errorMessage: 'Timeout: 30000ms exceeded',
      });

      const payload = result.toPayload();

      expect(payload.status).toBe('failed');
      expect(payload.retry).toBe(2);
      expect(payload.errorMessage).toBe('Timeout: 30000ms exceeded');
    });
  });

  describe('status types', () => {
    const statuses: Array<'passed' | 'failed' | 'skipped' | 'timedOut' | 'interrupted'> = [
      'passed',
      'failed',
      'skipped',
      'timedOut',
      'interrupted',
    ];

    for (const status of statuses) {
      it(`should accept ${status} status`, () => {
        const result = TestResult.create({
          testFile: 'test.spec.ts',
          fullTitle: 'test',
          suitePath: [],
          testName: 'test',
          tags: [],
          project: 'default',
          status,
          durationMs: 100,
          retry: 0,
          errorMessage: status === 'passed' || status === 'skipped' ? null : 'Error',
        });

        expect(result.status).toBe(status);
      });
    }
  });
});
