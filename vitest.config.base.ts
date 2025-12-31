/**
 * Base Vitest configuration for all packages.
 * Import and merge these settings in package-specific vitest.config.ts files.
 */

import { defu } from 'defu';
import type { UserConfig } from 'vitest/config';

/**
 * Base test configuration shared across all packages.
 * Packages can override specific settings as needed.
 */
export const baseTestConfig = {
  globals: true,
  environment: 'node' as const,
  include: ['tests/unit/**/*.test.ts'],
  coverage: {
    provider: 'v8' as const,
    reporter: ['text', 'html', 'lcov'],
    include: ['src/**/*.ts'],
    exclude: ['**/index.ts'], // Index files are typically just re-exports
    thresholds: {
      statements: 95,
      branches: 95,
      functions: 95,
      lines: 95,
    },
  },
};

/**
 * Creates a complete Vitest config by merging package overrides with base config.
 * Uses defu for deep merging - overrides take precedence over base config.
 *
 * @param overrides - Package-specific overrides to merge with base config
 * @returns Complete Vitest configuration
 *
 * @example
 * // Simple usage (most packages)
 * export default defineConfig(createVitestConfig());
 *
 * @example
 * // With additional test includes
 * export default defineConfig(createVitestConfig({
 *   test: {
 *     include: ['tests/unit/**\/*.test.ts', 'tests/integration/**\/*.test.ts'],
 *   },
 * }));
 *
 * @example
 * // With define and alias (for packages depending on @spekra/core)
 * export default defineConfig(createVitestConfig({
 *   define: {
 *     __SDK_VERSION__: JSON.stringify(pkg.version),
 *   },
 *   resolve: {
 *     alias: {
 *       '@spekra/core': resolve(__dirname, '../core/src/index.ts'),
 *     },
 *   },
 * }));
 */
export function createVitestConfig(overrides: UserConfig = {}): UserConfig {
  return defu(overrides, { test: baseTestConfig }) as UserConfig;
}
