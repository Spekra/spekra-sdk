# @spekra/vitest

Vitest test reporter for [Spekra](https://spekra.dev) - detect flaky tests and track test analytics.

## Installation

```bash
npm install @spekra/vitest
# or
pnpm add @spekra/vitest
# or
yarn add @spekra/vitest
```

## Quick Start

Add the reporter to your `vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    reporters: [
      'default',
      ['@spekra/vitest', {
        apiKey: process.env.SPEKRA_API_KEY,
        source: 'my-vitest-tests',
      }],
    ],
  },
});
```

## Configuration

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `apiKey` | `string` | - | Your Spekra API key (required) |
| `source` | `string` | - | Identifier for your test suite (required) |
| `apiUrl` | `string` | `https://spekra.dev/api/v1/reports` | API endpoint URL |
| `enabled` | `boolean` | `true` | Enable/disable reporting |
| `debug` | `boolean` | `false` | Enable verbose logging |
| `failOnError` | `boolean` | `false` | Fail the test run if reporting fails |
| `onError` | `function` | - | Callback when reporting fails |
| `onMetrics` | `function` | - | Callback to receive reporter metrics |

### Environment Variables

You can also configure the reporter using environment variables:

| Variable | Description |
|----------|-------------|
| `SPEKRA_VITEST_API_KEY` | API key (Vitest-specific) |
| `SPEKRA_API_KEY` | API key (fallback) |
| `SPEKRA_VITEST_SOURCE` | Source identifier (Vitest-specific) |
| `SPEKRA_SOURCE` | Source identifier (fallback) |
| `SPEKRA_VITEST_ENABLED` | Enable/disable (`true`/`false`) |
| `SPEKRA_VITEST_DEBUG` | Debug mode (`true`/`false`) |
| `SPEKRA_VITEST_FAIL_ON_ERROR` | Fail on error (`true`/`false`) |

Environment variables with the `SPEKRA_VITEST_` prefix take priority over the generic `SPEKRA_` prefix.

## Features

### Workspace Support

If you're using [Vitest Workspaces](https://vitest.dev/guide/workspace.html), the reporter automatically captures the workspace name in the `project` field:

```typescript
// vitest.workspace.ts
export default [
  'packages/*',
];
```

Each test result will include the workspace/project name, allowing you to filter by project in the Spekra dashboard.

### Shard Support

When using Vitest's built-in sharding, shard information is automatically captured:

```bash
vitest run --shard=1/3
```

The reporter captures `shardIndex` and `totalShards` to properly aggregate results across shards.

### Watch Mode

The reporter is automatically disabled in watch mode (`vitest` without `run`). Reports are only sent when running `vitest run`.

### Retry Support

Test retries are tracked automatically. The `retry` field indicates which attempt the result represents (0 = first run).

## Example Configurations

### Basic Setup

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    reporters: [
      'default',
      ['@spekra/vitest', {
        apiKey: process.env.SPEKRA_API_KEY,
        source: 'frontend-unit-tests',
      }],
    ],
  },
});
```

### CI-Only Reporting

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    reporters: [
      'default',
      ['@spekra/vitest', {
        apiKey: process.env.SPEKRA_API_KEY,
        source: 'frontend-unit-tests',
        enabled: !!process.env.CI,
      }],
    ],
  },
});
```

### With Error Handling

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    reporters: [
      'default',
      ['@spekra/vitest', {
        apiKey: process.env.SPEKRA_API_KEY,
        source: 'frontend-unit-tests',
        failOnError: true,
        onError: (error) => {
          console.error('Spekra reporting failed:', error.message);
        },
        onMetrics: (metrics) => {
          console.log('Reported', metrics.resultsReported, 'test results');
        },
      }],
    ],
  },
});
```

## Supported Vitest Versions

- Vitest 1.x

## License

MIT
