---
"@spekra/vitest": minor
---

### New Features

- **Vitest Reporter (`@spekra/vitest`)**: New reporter package for Vitest 1.x test framework
  - Full lifecycle support (`onInit`, `onTaskUpdate`, `onFinished`)
  - Workspace support - captures project/workspace name automatically
  - Sharding support - captures shard index and total from Vitest config
  - Watch mode detection - automatically disabled in watch mode to avoid noise
  - Same configuration pattern as Jest reporter (`SPEKRA_VITEST_*` env vars)
  - `failOnError` option to fail test run if reporting fails
  - `onError` and `onMetrics` callbacks for custom handling
