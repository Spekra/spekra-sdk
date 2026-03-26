# @spekra/analytics-cli

## 0.1.0-alpha.0

### Minor Changes

- 2a52d52: ### New Package

  - **Analytics CLI (`@spekra/analytics-cli`)**: New CLI for uploading JUnit XML test reports to Spekra Analytics
    - `upload` command: parses JUnit reports and sends results to the Spekra API
    - `validate` command: parses and checks report quality without uploading
    - Auto-resolves branch, commit SHA, and CI URL from GitHub Actions environment variables
    - Supports glob patterns, directories, and explicit file paths via `--junit-paths`
    - Configurable via CLI flags or environment variables (`SPEKRA_API_KEY`, `SPEKRA_SOURCE`, etc.)
  - **GitHub Action**: New reusable action (`action.yml`) at the repo root, allowing any repo to upload JUnit reports via `uses: Spekra/spekra-sdk@v1`
