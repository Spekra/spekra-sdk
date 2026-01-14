/** @type {import('jest').Config} */

module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/src/**/*.test.ts'],
  // Spekra reporter is added via CLI when running test:with-reporter
  // This keeps the base config clean for simple `pnpm test` runs
  reporters: ['default'],
};
