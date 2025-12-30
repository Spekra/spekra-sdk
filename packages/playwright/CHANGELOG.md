# @spekra/playwright

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
