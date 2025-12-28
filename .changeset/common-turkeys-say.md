---
"@spekra/playwright": minor
---

### Features

- **PII Redaction**: Add client-side redaction of sensitive data (emails, tokens, API keys, credit cards, SSNs, phone numbers, AWS keys, GitHub tokens, URL credentials) before sending to Spekra. Supports custom patterns via the new `redact` option.
- **Enhanced Test Metadata**: Parse Playwright test titles into structured fields (`fullTitle`, `suitePath`, `testName`, `tags`, `project`) for better filtering and grouping.
- **Source Identifier**: Add `source` config option to group test runs from the same test suite/repo (replaces `projectName`).

### Architecture

- Refactor to clean architecture with domain entities, infrastructure services, and use cases for better maintainability and testability.

### Breaking Changes

- `projectName` option removed in favor of `source` (now captured per-result from Playwright's project)
- `TestResult.testTitle` replaced with `fullTitle`, `suitePath`, `testName`, `tags`
- `ReportPayload.project` replaced with `source`
