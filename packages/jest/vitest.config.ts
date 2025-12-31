import { defineConfig } from 'vitest/config';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createVitestConfig } from '../../vitest.config.base';

// Read version from package.json for test-time injection
const pkg = JSON.parse(readFileSync('./package.json', 'utf-8')) as { version: string };

export default defineConfig(
  createVitestConfig({
    define: {
      __SDK_VERSION__: JSON.stringify(pkg.version),
    },
    resolve: {
      alias: {
        '@spekra/core': resolve(__dirname, '../core/src/index.ts'),
      },
    },
  })
);
