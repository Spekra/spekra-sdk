import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier';
import spekraPlugin from './eslint-rules';

export default tseslint.config(
  // Global ignores
  {
    ignores: [
      'dist/',
      'node_modules/',
      '*.js',
      '*.cjs',
      '*.mjs',
      'eslint.config.ts',
      'vitest.config.ts',
      'eslint-rules/', // Don't lint the lint rules themselves with type-checked config
    ],
  },

  // Base configs
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,

  // Global settings
  {
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.json', './tsconfig.test.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },

  // Relaxed rules for test files
  {
    files: ['**/tests/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/unbound-method': 'off', // vi.mocked() triggers this incorrectly
      '@typescript-eslint/no-unsafe-function-type': 'off', // Allow Function type in test callbacks
    },
  },

  // Custom Spekra rules for unit tests
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
  eslintConfigPrettier
);
