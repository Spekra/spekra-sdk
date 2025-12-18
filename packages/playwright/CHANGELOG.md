# @spekra/playwright

## 0.1.0-alpha.0

### Minor Changes

- b581648: Add @spekra/playwright reporter for sending test results to the Spekra platform
  - Automatic test result collection and batching
  - CI environment detection (GitHub Actions, GitLab CI, CircleCI, etc.)
  - Git metadata extraction (branch, commit SHA)
  - Configurable batching and retry logic
  - Support for Playwright 1.40+
