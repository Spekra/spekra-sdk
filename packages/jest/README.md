# @spekra/jest

Jest test reporter for [Spekra](https://spekra.dev) - automated flake detection and test analytics platform.

## Installation

```bash
npm install @spekra/jest --save-dev
# or
yarn add @spekra/jest --dev
# or
pnpm add @spekra/jest --save-dev
```

## Quick Start

### 1. Get your API key

Sign up at [spekra.dev](https://spekra.dev) and get your API key from the settings page.

### 2. Configure Jest

Add the reporter to your Jest config:

```javascript
// jest.config.js
module.exports = {
  reporters: [
    'default',
    ['@spekra/jest', {
      source: 'my-app-unit-tests',  // Required: identifies your test suite
    }]
  ],
};
```

### 3. Set your API key

Set the `SPEKRA_API_KEY` environment variable:

```bash
# In your CI pipeline
export SPEKRA_API_KEY=your-api-key-here

# Or use SPEKRA_JEST_API_KEY for Jest-specific key
export SPEKRA_JEST_API_KEY=your-api-key-here
```

## Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `apiKey` | `string` | - | Your Spekra API key (or use `SPEKRA_JEST_API_KEY` / `SPEKRA_API_KEY` env var) |
| `source` | `string` | **Required** | Identifier for your test suite (e.g., `'frontend-unit-tests'`) |
| `apiUrl` | `string` | `'https://spekra.dev/api/v1/reports'` | API endpoint URL |
| `enabled` | `boolean` | `true` | Enable/disable reporting |
| `debug` | `boolean` | `false` | Enable verbose logging |
| `failOnError` | `boolean` | `false` | Fail Jest run if reporting fails |
| `onError` | `function` | - | Callback when reporting fails |
| `onMetrics` | `function` | - | Callback to receive metrics |

## Environment Variables

The reporter checks these environment variables (in order of priority):

| Variable | Description |
|----------|-------------|
| `SPEKRA_JEST_API_KEY` | API key (Jest-specific) |
| `SPEKRA_API_KEY` | API key (fallback) |
| `SPEKRA_JEST_SOURCE` | Source identifier |
| `SPEKRA_JEST_ENABLED` | Set to `'false'` to disable |
| `SPEKRA_JEST_DEBUG` | Set to `'true'` for verbose logs |
| `SPEKRA_JEST_FAIL_ON_ERROR` | Set to `'true'` to fail on reporting errors |

## Source Naming Guidelines

The `source` identifies your test suite in Spekra. Use a descriptive, stable name:

```javascript
// Good examples
source: 'checkout-unit-tests'
source: 'api-integration-tests'
source: 'frontend-e2e'

// Bad examples (too generic)
source: 'tests'
source: 'my-tests'
```

**Note:** Changing the source creates a new grouping in Spekra. Keep it stable.

## Retry Detection

Spekra automatically detects test retries from Jest's `invocations` count:
- `invocations: 1` → First run (retry: 0)
- `invocations: 2` → One retry (retry: 1)
- etc.

This enables accurate flake detection even when retries pass.

## CI Integration

The reporter automatically detects CI environments and extracts:
- Build URL
- Branch name
- Commit SHA
- Run ID

Supported CI providers:
- GitHub Actions
- GitLab CI
- CircleCI
- Jenkins
- Azure DevOps
- Bitbucket Pipelines

## Example: GitHub Actions

```yaml
# .github/workflows/test.yml
name: Tests
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - run: npm test
        env:
          SPEKRA_API_KEY: ${{ secrets.SPEKRA_API_KEY }}
```

## TypeScript Support

The package includes TypeScript definitions. Import types if needed:

```typescript
import type { SpekraJestOptions, SpekraError, SpekraMetrics } from '@spekra/jest';
```

## Troubleshooting

### Reporter not sending results

1. Check that `SPEKRA_API_KEY` is set
2. Check that `source` is configured
3. Enable debug mode: `debug: true` or `SPEKRA_JEST_DEBUG=true`

### Seeing "Missing source" error

The `source` option is required for Jest. Add it to your config:

```javascript
['@spekra/jest', { source: 'your-test-suite-name' }]
```

## License

MIT

