# Spekra SDK

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT) [![codecov](https://codecov.io/gh/spekra/spekra-sdk/graph/badge.svg)](https://codecov.io/gh/spekra/spekra-sdk)

Official SDKs for integrating with the [Spekra](https://spekra.dev) platform.

## The Problem

Test suites grow. Flakiness creeps in. CI times balloon. And when something breaks, you're left digging through logs trying to figure out *what changed*.

Most teams lack visibility into their test health over time:
- Which tests are flaky and how often?
- Are test times trending up?
- Which tests fail most frequently on specific branches?
- How does test reliability compare across different CI environments?

Without this data, debugging becomes guesswork and optimization becomes impossible.

## The Solution

Spekra collects and analyzes your test results to give you actionable insights:

- **Flakiness Detection** - Identify tests that pass and fail inconsistently
- **Trend Analysis** - Track test duration and failure rates over time
- **Branch Comparison** - Compare test health across branches before merging
- **CI Correlation** - Understand how test behavior varies across environments

The SDKs in this repo make it trivial to send your test data to Spekra. Just add a reporter to your existing test configuration.

## Packages

| Package | Version | Description |
|---------|---------|-------------|
| [@spekra/playwright](./packages/playwright) | [![npm](https://img.shields.io/npm/v/@spekra/playwright.svg)](https://www.npmjs.com/package/@spekra/playwright) | Playwright test reporter |
| [@spekra/jest](./packages/jest) | [![npm](https://img.shields.io/npm/v/@spekra/jest.svg)](https://www.npmjs.com/package/@spekra/jest) | Jest test reporter |
| [@spekra/vitest](./packages/vitest) | [![npm](https://img.shields.io/npm/v/@spekra/vitest.svg)](https://www.npmjs.com/package/@spekra/vitest) | Vitest test reporter |

## Quick Start

### Playwright

```bash
npm install @spekra/playwright
```

```typescript
// playwright.config.ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  reporter: [
    ['html'],
    ['@spekra/playwright', { apiKey: process.env.SPEKRA_API_KEY }],
  ],
});
```

### Jest

```bash
npm install @spekra/jest
```

```javascript
// jest.config.js
module.exports = {
  reporters: [
    'default',
    ['@spekra/jest', {
      apiKey: process.env.SPEKRA_API_KEY,
      source: 'my-unit-tests',
    }],
  ],
};
```

### Vitest

```bash
npm install @spekra/vitest
```

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    reporters: [
      'default',
      ['@spekra/vitest', {
        apiKey: process.env.SPEKRA_API_KEY,
        source: 'my-unit-tests',
      }],
    ],
  },
});
```

That's it. Run your tests and results flow to Spekra automatically.

## JUnit Upload Workflow (Experimental)

For frameworks or environments where reporter APIs are unstable, you can use a
report-generation + upload flow similar to Trunk:

1. generate JUnit XML from your test runner
2. validate report quality locally
3. upload the report to Spekra

Example for Vitest:

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    reporters: [
      ['junit', { outputFile: './junit.xml', addFileAttribute: true }],
    ],
  },
});
```

```bash
# Validate report shape and warnings
pnpm analytics:validate -- --junit-paths "./junit.xml" --strict

# Upload results to Spekra
SPEKRA_API_KEY=sk_xxx pnpm analytics:upload -- \
  --junit-paths "./junit.xml" \
  --source "frontend-unit-tests" \
  --framework "vitest"
```

Notes:

- `--junit-paths` accepts comma-separated files, directories, or globs.
- `--framework` currently supports `vitest`, `jest`, and `playwright` to match
  the current API enum.
- This path is metadata-focused and does not include deep Playwright artifacts
  (trace/video/screenshots).

## Philosophy

**Zero friction.** Adding Spekra should take minutes, not hours. No test rewrites, no complex configuration.

**Never break tests.** The SDKs are designed to fail silently. Network issues or API errors are logged but never cause test failures.

**Privacy first.** We only collect test metadata (names, durations, pass/fail). No source code is collected; Playwright artifacts are only uploaded when your run includes attachments.

## AI / Maintainer Workflow

- Assistant bootstrap: [`docs/AI_ASSISTANT.md`](./docs/AI_ASSISTANT.md)
- Historical implementation plans: [`docs/plans/INDEX.md`](./docs/plans/INDEX.md)

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for development setup and guidelines.

## License

MIT © [Spekra](https://spekra.dev)
