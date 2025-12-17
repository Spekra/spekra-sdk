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

That's it. Run your tests and results flow to Spekra automatically.

## Philosophy

**Zero friction.** Adding Spekra should take minutes, not hours. No test rewrites, no complex configuration.

**Never break tests.** The SDKs are designed to fail silently. Network issues or API errors are logged but never cause test failures.

**Privacy first.** We only collect test metadata (names, durations, pass/fail). No source code, no screenshots, no sensitive data.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for development setup and guidelines.

## License

MIT © [Spekra](https://spekra.dev)
