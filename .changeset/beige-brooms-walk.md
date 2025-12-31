---
"@spekra/playwright": minor
"@spekra/jest": minor
---

### New Features

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
