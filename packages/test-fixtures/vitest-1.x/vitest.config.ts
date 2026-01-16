import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    reporters: [
      'default',
      // Use workspace reporter for integration testing
      ['@spekra/vitest', {
        apiKey: process.env.SPEKRA_API_KEY,
        source: 'vitest-1.x-fixture',
        enabled: !!process.env.SPEKRA_API_KEY,
        debug: !!process.env.SPEKRA_DEBUG,
      }],
    ],
  },
});
