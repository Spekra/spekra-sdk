import { defineConfig } from 'tsdown';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8')) as { version: string };
const coreEntry = fileURLToPath(new URL('../core/src/index.ts', import.meta.url));

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  noExternal: ['@spekra/core'],
  alias: {
    '@spekra/core': coreEntry,
  },
  dts: true,
  clean: true,
  sourcemap: true,
  treeshake: true,
  minify: false,
  target: false,
  define: {
    __SDK_VERSION__: JSON.stringify(pkg.version),
  },
});
