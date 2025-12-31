import type { UserConfig } from 'tsdown';

/**
 * Base tsdown configuration for all packages.
 * Import and spread this in package-specific configs.
 */
export const baseConfig: UserConfig = {
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  treeshake: true,
  minify: false,
  target: false,
};

/**
 * Helper to read package version for build-time injection.
 * Use in reporter packages that need __SDK_VERSION__.
 */
export function getVersionDefine(): Record<string, string> {
  // Dynamic import to avoid issues in packages that don't need it
  const { readFileSync } = require('fs');
  const pkg = JSON.parse(readFileSync('./package.json', 'utf-8')) as { version: string };
  return {
    __SDK_VERSION__: JSON.stringify(pkg.version),
  };
}

