import { describe, it, expect } from 'vitest';
import { normalizeTestFilePath, TEST_DIR_MARKERS } from '../../../src/utils/file-path.util';

describe('normalizeTestFilePath', () => {
  describe('with test directory markers', () => {
    it('extracts path after /e2e/tests/', () => {
      expect(normalizeTestFilePath('/home/user/project/e2e/tests/auth/login.spec.ts')).toBe(
        'auth/login.spec.ts'
      );
    });

    it('extracts path after /e2e/', () => {
      expect(normalizeTestFilePath('/home/user/project/e2e/auth.spec.ts')).toBe('auth.spec.ts');
    });

    it('extracts path after /tests/', () => {
      expect(normalizeTestFilePath('/home/user/project/tests/unit/utils.test.ts')).toBe(
        'unit/utils.test.ts'
      );
    });

    it('extracts path after /test/', () => {
      expect(normalizeTestFilePath('/home/user/project/test/integration/api.test.ts')).toBe(
        'integration/api.test.ts'
      );
    });

    it('extracts path after /__tests__/', () => {
      expect(normalizeTestFilePath('/home/user/project/src/__tests__/utils.test.ts')).toBe(
        'utils.test.ts'
      );
    });

    it('extracts path after /specs/', () => {
      expect(normalizeTestFilePath('/home/user/project/specs/features/checkout.spec.ts')).toBe(
        'features/checkout.spec.ts'
      );
    });

    it('extracts path after /spec/', () => {
      expect(normalizeTestFilePath('/home/user/project/spec/models/user.spec.ts')).toBe(
        'models/user.spec.ts'
      );
    });
  });

  describe('marker priority', () => {
    it('uses first matching marker in path', () => {
      // /e2e/tests/ should match before a potential /tests/ later in path
      expect(normalizeTestFilePath('/home/user/project/e2e/tests/nested/test.spec.ts')).toBe(
        'nested/test.spec.ts'
      );
    });
  });

  describe('fallback behavior', () => {
    it('returns last 2 segments when no marker found', () => {
      expect(normalizeTestFilePath('/home/user/project/src/components/Button.test.tsx')).toBe(
        'components/Button.test.tsx'
      );
    });

    it('returns filename when only 1 segment', () => {
      expect(normalizeTestFilePath('test.ts')).toBe('test.ts');
    });

    it('handles paths with no recognizable markers', () => {
      expect(normalizeTestFilePath('/opt/builds/runner/job123/src/app.test.ts')).toBe(
        'src/app.test.ts'
      );
    });
  });

  describe('Windows path handling', () => {
    it('normalizes backslashes to forward slashes', () => {
      expect(
        normalizeTestFilePath('C:\\Users\\user\\project\\tests\\unit\\utils.test.ts')
      ).toBe('unit/utils.test.ts');
    });

    it('handles mixed separators', () => {
      expect(normalizeTestFilePath('/home/user\\project/tests/spec.ts')).toBe('spec.ts');
    });

    it('handles full Windows paths with drive letters', () => {
      expect(
        normalizeTestFilePath('D:\\Projects\\MyApp\\e2e\\tests\\smoke.spec.ts')
      ).toBe('smoke.spec.ts');
    });
  });

  describe('edge cases', () => {
    it('handles empty string', () => {
      expect(normalizeTestFilePath('')).toBe('');
    });

    it('handles path with only filename', () => {
      expect(normalizeTestFilePath('test.spec.ts')).toBe('test.spec.ts');
    });

    it('handles path ending with separator', () => {
      expect(normalizeTestFilePath('/home/user/project/tests/')).toBe('');
    });

    it('handles multiple consecutive separators', () => {
      expect(normalizeTestFilePath('/home/user//project///tests/unit.test.ts')).toBe(
        'unit.test.ts'
      );
    });

    it('handles marker appearing in filename', () => {
      // The marker pattern should only match directories, not filenames
      expect(normalizeTestFilePath('/home/user/src/tests_helper.ts')).toBe(
        'src/tests_helper.ts'
      );
    });

    it('handles deeply nested paths', () => {
      expect(
        normalizeTestFilePath('/a/b/c/d/e/f/g/tests/unit/features/auth/login.test.ts')
      ).toBe('unit/features/auth/login.test.ts');
    });

    it('handles Jest convention with __tests__', () => {
      expect(
        normalizeTestFilePath('/home/user/project/src/components/__tests__/Button.test.tsx')
      ).toBe('Button.test.tsx');
    });

    it('handles Playwright convention with e2e/tests', () => {
      expect(
        normalizeTestFilePath('/home/user/my-app/e2e/tests/login.spec.ts')
      ).toBe('login.spec.ts');
    });
  });

  describe('real-world paths', () => {
    it('handles GitHub Actions runner paths', () => {
      expect(
        normalizeTestFilePath('/home/runner/work/my-repo/my-repo/tests/unit/api.test.ts')
      ).toBe('unit/api.test.ts');
    });

    it('handles CircleCI runner paths', () => {
      expect(
        normalizeTestFilePath('/home/circleci/project/e2e/tests/smoke.spec.ts')
      ).toBe('smoke.spec.ts');
    });

    it('handles GitLab CI runner paths', () => {
      expect(
        normalizeTestFilePath('/builds/group/project/spec/integration/api_spec.ts')
      ).toBe('integration/api_spec.ts');
    });

    it('handles Docker container paths', () => {
      expect(
        normalizeTestFilePath('/app/src/__tests__/utils/helper.test.ts')
      ).toBe('utils/helper.test.ts');
    });

    it('handles monorepo paths with package names', () => {
      expect(
        normalizeTestFilePath('/home/user/monorepo/packages/my-package/tests/unit/index.test.ts')
      ).toBe('unit/index.test.ts');
    });
  });
});

describe('TEST_DIR_MARKERS', () => {
  it('contains expected markers', () => {
    expect(TEST_DIR_MARKERS).toContain('/e2e/tests/');
    expect(TEST_DIR_MARKERS).toContain('/e2e/');
    expect(TEST_DIR_MARKERS).toContain('/tests/');
    expect(TEST_DIR_MARKERS).toContain('/test/');
    expect(TEST_DIR_MARKERS).toContain('/__tests__/');
    expect(TEST_DIR_MARKERS).toContain('/specs/');
    expect(TEST_DIR_MARKERS).toContain('/spec/');
  });

  it('has markers in correct priority order', () => {
    // More specific markers should come first
    const e2eTestsIndex = TEST_DIR_MARKERS.indexOf('/e2e/tests/');
    const e2eIndex = TEST_DIR_MARKERS.indexOf('/e2e/');
    
    expect(e2eTestsIndex).toBeLessThan(e2eIndex);
  });

  it('includes all common test directory conventions', () => {
    // Ensure we support major frameworks
    expect(TEST_DIR_MARKERS.length).toBeGreaterThanOrEqual(7);
  });
});

