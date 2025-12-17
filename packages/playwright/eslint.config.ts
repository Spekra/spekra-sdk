import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier';

export default tseslint.config(
  // Global ignores
  {
    ignores: ['dist/', 'node_modules/', '*.js', '*.cjs', '*.mjs', 'eslint.config.ts'],
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
    },
  },

  // Prettier (must be last)
  eslintConfigPrettier
);
