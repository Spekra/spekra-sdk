# @spekra/playwright

[![npm version](https://img.shields.io/npm/v/@spekra/playwright.svg)](https://www.npmjs.com/package/@spekra/playwright)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![codecov](https://codecov.io/gh/spekra/spekra-sdk/graph/badge.svg?flag=playwright)](https://codecov.io/gh/spekra/spekra-sdk)

A lightweight Playwright test reporter that sends test results to the [Spekra](https://spekra.dev) platform for analysis and tracking.

## Table of Contents

- [Features](#features)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
  - [Required Options](#required-options)
  - [Optional Options](#optional-options)
  - [Retry Configuration](#retry-configuration)
  - [Error Handling](#error-handling)
  - [Memory Management](#memory-management)
  - [Callbacks](#callbacks)
- [Environment Variables](#environment-variables)
- [CI Integration](#ci-integration)
- [Sharding Support](#sharding-support)
- [Security Considerations](#security-considerations)
- [What Data is Sent](#what-data-is-sent)
- [Troubleshooting](#troubleshooting)
- [Requirements](#requirements)
- [License](#license)

## Features

- **🚀 Simple Setup** - Just 3 lines of configuration
- **🛡️ Never Breaks Tests** - All errors are caught and logged, never thrown
- **🔍 Smart Detection** - Automatically detects Git info, CI environment, and shards
- **🔒 Privacy-Conscious** - Only sends test metadata, not source code
- **📦 Batched Sending** - Efficiently batches results to minimize API calls
- **⚡ Zero Impact** - No effect on test execution time or reliability
- **🔄 Automatic Retries** - Exponential backoff with jitter for resilient delivery
- **📊 Observable** - Optional callbacks for metrics and error tracking

## Installation

```bash
npm install @spekra/playwright
# or
pnpm add @spekra/playwright
# or
yarn add @spekra/playwright
```

## Quick Start

Add the reporter to your `playwright.config.ts`:

```typescript
import { defineConfig } from '@playwright/test';

export default defineConfig({
  reporter: [
    ['html'],  // Keep your existing reporters
    ['@spekra/playwright', { apiKey: process.env.SPEKRA_API_KEY }],
  ],
});
```

That's it! Run your tests and results will appear in Spekra.

## Configuration

### Required Options

| Option | Type | Description |
|--------|------|-------------|
| [`apiKey`](#apikey) | `string` | Your Spekra API key (or set `SPEKRA_API_KEY` env var) |

### Optional Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| [`projectName`](#projectname) | `string` | From Playwright config | Override project name |
| [`enabled`](#enabled) | `boolean` | `true` | Enable/disable reporting |
| [`debug`](#debug) | `boolean` | `false` | Verbose logging |
| [`batchSize`](#batchsize) | `number` | `20` | Results per batch (1-1000) |
| [`timeout`](#timeout) | `number` | `15000` | Request timeout in ms |
| [`maxRetries`](#retry-configuration) | `number` | `3` | Retry attempts (0 to disable) |
| [`retryBaseDelayMs`](#retry-configuration) | `number` | `1000` | Base retry delay in ms |
| [`retryMaxDelayMs`](#retry-configuration) | `number` | `10000` | Max retry delay in ms |
| [`maxErrorLength`](#error-handling) | `number` | `4000` | Max error message chars |
| [`maxStackTraceLines`](#error-handling) | `number` | `20` | Max stack trace lines |
| [`maxBufferSize`](#memory-management) | `number` | `1000` | Max buffered results |
| [`onError`](#callbacks) | `function` | - | Error callback |
| [`onMetrics`](#callbacks) | `function` | - | Metrics callback |
| [`apiUrl`](#apiurl) | `string` | `https://spekra.dev/api/reports` | API endpoint |

### Option Details

#### `apiKey` *(required)*

Your Spekra API key. Can also be set via `SPEKRA_API_KEY` environment variable. Visit the [`Spekra Docs`](https://spekra.dev/docs) for details on how to generate this for your org.

```typescript
{ apiKey: process.env.SPEKRA_API_KEY }
```

#### `projectName`

Override the project name (defaults to Playwright project name). This is not recommended if you run multiple Playwright projects as it will result in what looks like duplicate test cases.

```typescript
{ projectName: 'my-app-e2e' }
```

#### `enabled`

Enable or disable reporting. Useful for conditionally enabling in CI only.

```typescript
{ enabled: process.env.CI === 'true' }
```

#### `debug`

Enable verbose logging for troubleshooting.

```typescript
{ debug: true }
```

#### `batchSize`

Number of test results to collect before sending a batch. Valid range: 1-1000. This is solely available for performance tuning around your CI runners. There are tradeoffs for both ends of this scale. The lower end is great for workloads where network activity is not the bottleneck. The high end is for workloads where memory is not the issue. Careful with this, as pushing beyond on your runner's memory capabilities carries the risk of running into out of memory exceptions.

```typescript
{ batchSize: 50 }
```

#### `timeout`

API request timeout in milliseconds.

```typescript
{ timeout: 30000 }
```

### Retry Configuration

The reporter uses exponential backoff with jitter for resilient delivery.

| Option | Default | Description |
|--------|---------|-------------|
| `maxRetries` | `3` | Number of retry attempts (0 to disable) |
| `retryBaseDelayMs` | `1000` | Initial delay between retries |
| `retryMaxDelayMs` | `10000` | Maximum delay cap |

Retry delays follow exponential backoff: 1s → 2s → 4s → 8s (capped at max). A ±25% jitter is added to prevent thundering herd when multiple shards retry simultaneously.

```typescript
{
  maxRetries: 5,
  retryBaseDelayMs: 500,
  retryMaxDelayMs: 30000,
}
```

### Error Handling

Control how error messages are captured and truncated.

| Option | Default | Description |
|--------|---------|-------------|
| `maxErrorLength` | `4000` | Maximum characters for error messages |
| `maxStackTraceLines` | `20` | Maximum lines in stack traces |

Error messages include stack traces for debugging. These options prevent oversized payloads while preserving useful information.

```typescript
{
  maxErrorLength: 8000,
  maxStackTraceLines: 30,
}
```

### Memory Management

Prevent memory issues if the API becomes unreachable during long test runs.

| Option | Default | Description |
|--------|---------|-------------|
| `maxBufferSize` | `1000` | Maximum results kept in memory |

When the buffer is full, oldest results are dropped to make room for new ones. A warning is logged when this occurs.

```typescript
{ maxBufferSize: 500 }
```

### Callbacks

Hook into reporter events for custom alerting or metrics collection.

#### `onError`

Called when reporting fails after all retries.

```typescript
{
  onError: (error) => {
    console.error('Spekra reporting failed:', error.message);
    // error.type: 'network' | 'api' | 'timeout' | 'validation'
    // error.statusCode: HTTP status (for api errors)
    // error.requestId: correlation ID for debugging
    // error.resultsAffected: number of results that failed to send
  }
}
```

#### `onMetrics`

Called after each batch and at end of run with performance metrics.

```typescript
{
  onMetrics: (metrics) => {
    console.log(`Reported ${metrics.resultsReported} results`);
    console.log(`Total latency: ${metrics.totalLatencyMs}ms`);
    // metrics.requestsSent: total requests (including retries)
    // metrics.requestsFailed: failed after all retries
    // metrics.resultsReported: successfully reported
    // metrics.resultsDropped: dropped due to buffer overflow
    // metrics.bytesSent: compressed bytes
    // metrics.bytesUncompressed: original bytes
  }
}
```

#### `apiUrl`

Custom API endpoint for self-hosted Spekra instances. Currently, this is used internally. Self-hosted option is not available yet.

```typescript
{ apiUrl: 'https://your-instance.com/api/reports' }
```

### Full Configuration Example

```typescript
import { defineConfig } from '@playwright/test';

export default defineConfig({
  reporter: [
    [
      '@spekra/playwright',
      {
        // Required
        apiKey: process.env.SPEKRA_API_KEY,
        
        // Basic options
        apiUrl: 'https://spekra.dev/api/reports',
        projectName: 'my-app-e2e',
        enabled: process.env.CI === 'true',
        debug: false,
        batchSize: 20,
        timeout: 15000,
        
        // Retry configuration
        maxRetries: 3,
        retryBaseDelayMs: 1000,
        retryMaxDelayMs: 10000,
        
        // Error handling
        maxErrorLength: 4000,
        maxStackTraceLines: 20,
        
        // Memory management
        maxBufferSize: 1000,
        
        // Callbacks
        onError: (error) => {
          console.error('[Spekra Error]', error.message);
        },
        onMetrics: (metrics) => {
          console.log('[Spekra Metrics]', metrics);
        },
      },
    ],
  ],
});
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `SPEKRA_API_KEY` | API key (alternative to config option) |
| `TEST_RUN_ID` | Shared run ID across shards (for parallel runs) |
| `TEST_SHARD_INDEX` | Current shard index |
| `TEST_TOTAL_SHARDS` | Total number of shards |

## CI Integration

The reporter automatically detects and integrates with:

- **GitHub Actions**
- **GitLab CI**
- **CircleCI**
- **Jenkins**
- **Azure DevOps**
- **Bitbucket Pipelines**

For each CI environment, it automatically extracts:
- Run URL (link back to CI job)
- Branch name
- Commit SHA

## Sharding Support

For parallel test runs across multiple shards, set `TEST_RUN_ID` to the same value for all shards:

### GitHub Actions Example

```yaml
jobs:
  test:
    strategy:
      matrix:
        shard: [1, 2, 3, 4]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - run: npx playwright test --shard=${{ matrix.shard }}/4
        env:
          TEST_RUN_ID: ${{ github.run_id }}-${{ github.run_attempt }}
          SPEKRA_API_KEY: ${{ secrets.SPEKRA_API_KEY }}
```

## Security Considerations

### API Key Handling

- Store your API key in environment variables, never commit to source control
- The SDK masks API keys in all log output (shows `abc...xyz`)
- Use CI/CD secrets management for production

### Sensitive Data in Error Messages

Test assertion failures may include sensitive data in error messages. If your tests involve:
- User credentials or tokens
- Personal identifiable information (PII)
- API keys or secrets

Consider sanitizing test data or using the `maxErrorLength` option to limit exposure:

```typescript
{ maxErrorLength: 500 }  // Limit error message length
```

### Data Privacy

The SDK only sends test metadata (file paths, test names, durations, error messages). It does **NOT** send:
- Source code
- Environment variables (except CI-specific ones for URL/branch/commit)
- Screenshots or videos
- Network traffic
- Any files from your system

### Request Security

- All requests use HTTPS
- Requests include correlation IDs for debugging
- Payloads over 1KB are gzip compressed
- Connection keep-alive for efficiency

## What Data is Sent

The reporter sends only test metadata:

```typescript
{
  runId: "run-a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  project: "chromium",
  branch: "main",
  commitSha: "a1b2c3d4e5f6...",
  ciUrl: "https://github.com/org/repo/actions/runs/12345",
  shardIndex: 1,
  totalShards: 4,
  startedAt: "2024-12-14T10:00:00.000Z",
  finishedAt: "2024-12-14T10:05:30.000Z",
  results: [
    {
      testFile: "auth/login.spec.ts",
      testTitle: "Login > should login with valid credentials",
      status: "passed",
      durationMs: 2340,
      retry: 0,
      errorMessage: null
    }
  ]
}
```

## Troubleshooting

### "No API key provided"

Set the API key via config option or environment variable:

```typescript
{ apiKey: process.env.SPEKRA_API_KEY }
```

Or in your shell:

```bash
export SPEKRA_API_KEY=your-api-key
```

### Results not appearing in Spekra

1. **Check enabled status**: Ensure `enabled` is not `false`
2. **Enable debug mode**: Set `debug: true` to see detailed logs
3. **Check network**: Ensure your CI can reach `https://spekra.dev`
4. **Verify API key**: Ensure your API key is valid and has permissions

### Requests timing out

Increase the timeout:

```typescript
{ timeout: 30000 }  // 30 seconds
```

### High memory usage with many tests

Reduce buffer size or batch size:

```typescript
{
  maxBufferSize: 500,
  batchSize: 10,
}
```

### Debug mode

Enable verbose logging to troubleshoot issues:

```typescript
{ debug: true }
```

This logs:
- Run ID and project name
- Git branch and commit
- CI provider and URL
- Shard information
- Request IDs and response times
- Compression ratios
- Retry attempts

## Requirements

- Node.js >= 20.0.0
- Playwright >= 1.40.0

## License

MIT © [Spekra](https://spekra.dev)
