/**
 * Base ESLint configuration for all packages.
 * Import and spread these configs in package-specific eslint.config.ts files.
 */

import eslint from '@eslint/js';
import tseslint, { type ConfigArray } from 'typescript-eslint';
import type { Linter } from 'eslint';
import eslintConfigPrettier from 'eslint-config-prettier';
import spekraPlugin from './eslint-rules';

/**
 * Standard ignores for all packages
 */
export const ignores = [
  'dist/',
  'node_modules/',
  '*.js',
  '*.cjs',
  '*.mjs',
  'eslint.config.ts',
  'vitest.config.ts',
  'tsdown.config.ts',
  'eslint-rules/', // Don't lint lint rules with type-checked config
];

/**
 * Shared TypeScript rules
 */
export const tsRules: Linter.RulesRecord = {
  '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
  '@typescript-eslint/explicit-function-return-type': 'off',
  '@typescript-eslint/no-explicit-any': 'warn',
};

/**
 * Relaxed rules for test files
 */
export const testFileRules: Linter.RulesRecord = {
  '@typescript-eslint/no-unsafe-assignment': 'off',
  '@typescript-eslint/no-unsafe-member-access': 'off',
  '@typescript-eslint/no-unsafe-argument': 'off',
  '@typescript-eslint/no-unsafe-return': 'off',
  '@typescript-eslint/no-unsafe-call': 'off',
  '@typescript-eslint/no-explicit-any': 'off',
  '@typescript-eslint/require-await': 'off',
  '@typescript-eslint/unbound-method': 'off',
  '@typescript-eslint/no-unsafe-function-type': 'off',
};

/**
 * Create base ESLint config for a package.
 * 
 * @param packageDir - The package directory (use import.meta.dirname in the package's eslint.config.ts)
 * @param tsconfigPaths - Array of tsconfig paths relative to the package (e.g., ['./tsconfig.json'])
 * @param additionalIgnores - Additional patterns to ignore
 */
export function createBaseConfig(
  packageDir: string,
  tsconfigPaths: string[] = ['./tsconfig.json'],
  additionalIgnores: string[] = []
): ConfigArray {
  return [
    // Global ignores
    { ignores: [...ignores, ...additionalIgnores] },

    // Base configs
    eslint.configs.recommended,
    ...tseslint.configs.recommendedTypeChecked,

    // Global settings
    {
      languageOptions: {
        parserOptions: {
          project: tsconfigPaths,
          tsconfigRootDir: packageDir,
        },
      },
      rules: tsRules,
    },

    // Relaxed rules for test files
    {
      files: ['**/tests/**/*.ts'],
      rules: testFileRules,
    },

    // Spekra custom rules for unit tests (enforce test structure mirrors src)
    {
      files: ['**/tests/unit/**/*.test.ts'],
      plugins: {
        spekra: spekraPlugin,
      },
      rules: {
        'spekra/mirror-test-structure': [
          'error',
          {
            testDir: 'tests/unit',
            srcDir: 'src',
            excludedFiles: ['index.ts', 'types.ts'],
          },
        ],
      },
    },

    // Prettier (must be last)
    eslintConfigPrettier,
  ];
}

// Re-export for convenience
export { eslint, tseslint, eslintConfigPrettier };
