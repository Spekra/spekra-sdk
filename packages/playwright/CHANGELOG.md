# @spekra/playwright

## 0.1.0-alpha.4

### Patch Changes

- d03ac49: Publish next alpha for hosted API v1 endpoint alignment and CI/release pipeline updates.

## 0.1.0-alpha.3

## 0.1.0-alpha.2

### Minor Changes

- 58c9f8a: ### New Features
  - **Jest Reporter (`@spekra/jest`)**: New reporter package for Jest test frameworks with full lifecycle support (`onRunStart`, `onTestResult`, `onRunComplete`), capturing test results and sending to Spekra API
  - **Core Package (`@spekra/core`)**: New internal shared package extracting common utilities:
    - Services: `LoggerService`, `RedactionService`, `CIService`, `GitService`
    - Clients: `ApiClient`, `BaseClient` (now with `framework` and `sdkVersion` tracking)
    - Use cases: `SendReportUseCase`, `BaseUseCase`
    - Types: `BaseReporterOptions`, `Framework`, `TestResult`, `ReportPayload`, etc.
    - Utils: `normalizeTestFilePath`
  - **Framework Tracking**: API requests now include `framework` (`playwright` | `jest` | `vitest`) and SDK version headers for better analytics

  ### Improvements
  - **Type Consolidation**: `SpekraReporterOptions` now extends `BaseReporterOptions` from core; shared types re-exported from `@spekra/core`
  - **CI Matrix Testing**: Added Jest version matrix to GitHub Actions workflows; separated core/playwright/jest test jobs
  - **CI Optimization**: Flattened job dependencies for parallel execution; consolidated static checks (typecheck, lint, bundle size) into single job to reduce redundant work across Node versions
  - **Dependency Linting**: New `lint:deps` job in CI using syncpack to enforce consistent dependency versions

  ### Internal
  - **Monorepo Configuration Consolidation**:
    - `tsconfig.base.json` - shared TypeScript compiler options (ES2022, strict mode)
    - `tsdown.config.base.ts` - shared build configuration (ESM + CJS, sourcemaps, tree-shaking)
    - `eslint.config.base.ts` - shared ESLint rules with `spekra/mirror-test-structure` custom rule
    - `vitest.config.base.ts` - shared test configuration with 95% coverage thresholds using `defu` for deep merging
  - **Syncpack Integration**: Added `.syncpackrc` for dependency version management across packages
  - **Test Migration**: Moved shared service/client tests from `@spekra/playwright` to `@spekra/core`
  - **Build Pipeline**: Added `postbuild` hook to refresh workspace links after builds
  - **Jest Test Fixtures**: Added `packages/test-fixtures/jest-29` with sample tests (basic, nested, flaky scenarios)

## 0.1.0-alpha.1

### Minor Changes

- 95549b1: ### Features
  - **PII Redaction**: Add client-side redaction of sensitive data (emails, tokens, API keys, credit cards, SSNs, phone numbers, AWS keys, GitHub tokens, URL credentials) before sending to Spekra. Supports custom patterns via the new `redact` option.
  - **Enhanced Test Metadata**: Parse Playwright test titles into structured fields (`fullTitle`, `suitePath`, `testName`, `tags`, `project`) for better filtering and grouping.
  - **Source Identifier**: Add `source` config option to group test runs from the same test suite/repo (replaces `projectName`).

  ### Architecture
  - Refactor to clean architecture with domain entities, infrastructure services, and use cases for better maintainability and testability.

  ### Breaking Changes
  - `projectName` option removed in favor of `source` (now captured per-result from Playwright's project)
  - `TestResult.testTitle` replaced with `fullTitle`, `suitePath`, `testName`, `tags`
  - `ReportPayload.project` replaced with `source`

## 0.1.0-alpha.0

### Minor Changes

- b581648: Add @spekra/playwright reporter for sending test results to the Spekra platform
  - Automatic test result collection and batching
  - CI environment detection (GitHub Actions, GitLab CI, CircleCI, etc.)
  - Git metadata extraction (branch, commit SHA)
  - Configurable batching and retry logic
  - Support for Playwright 1.44+
