import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 30000,
  retries: 1,
  use: {
    headless: true,
  },
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
  ],
  reporter: [
    ['list'],
    [
      '@spekra/playwright',
      {
        apiKey: process.env.SPEKRA_API_KEY,
        apiUrl: process.env.SPEKRA_API_URL || 'http://localhost:3000/api/reports',
        projectName: 'test-fixture-pw-1.44',
        debug: true,
      },
    ],
  ],
});
