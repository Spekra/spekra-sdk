/**
 * File path utilities for normalizing test file paths
 */

/**
 * Common test directory markers used to extract relative paths
 */
export const TEST_DIR_MARKERS = [
  '/e2e/tests/',
  '/e2e/',
  '/tests/',
  '/test/',
  '/__tests__/',
  '/specs/',
  '/spec/',
];

/**
 * Normalize a test file path to a relative path.
 * Extracts the relative path after common test directory markers.
 *
 * @param absolutePath - The absolute path to the test file
 * @returns A relative path suitable for display
 *
 * @example
 * normalizeTestFilePath('/home/user/project/e2e/tests/auth/login.spec.ts')
 * // => 'auth/login.spec.ts'
 *
 * @example
 * normalizeTestFilePath('/home/user/project/src/__tests__/utils.test.ts')
 * // => 'utils.test.ts'
 */
export function normalizeTestFilePath(absolutePath: string): string {
  // Normalize path separators (Windows -> Unix)
  const file = absolutePath.replace(/\\/g, '/');

  // Try to find a known test directory marker
  for (const marker of TEST_DIR_MARKERS) {
    const idx = file.indexOf(marker);
    if (idx !== -1) {
      return file.substring(idx + marker.length);
    }
  }

  // Fallback: return last 2 path segments
  const parts = file.split('/');
  if (parts.length >= 2) {
    return parts.slice(-2).join('/');
  }

  return parts.pop() || file;
}

