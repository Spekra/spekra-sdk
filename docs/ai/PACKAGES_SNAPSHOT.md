# Packages Snapshot

Initial manual snapshot created on 2026-03-24.

Update this file when the package layout or major repo responsibilities change
materially.

## Monorepo Shape

This repo is a pnpm workspace centered on published test reporters and their
shared internals.

Key top-level areas:

- `packages/core/` for shared types and utilities used across reporters
- `packages/playwright/` for the Playwright reporter
- `packages/jest/` for the Jest reporter
- `packages/vitest/` for the Vitest reporter
- `packages/analytics-cli/` for uploader-first JUnit validation/upload tooling
- `packages/test-fixtures/` for compatibility and fixture projects
- `.changeset/` for release/version intent
- `.github/` for CI, labeling, security, and release automation

## Package Responsibilities

### `@spekra/playwright`

Owns:

- Playwright reporter behavior
- artifact-aware reporting flow
- Playwright-specific metadata capture
- package-specific tests and docs

Primary docs:

- `packages/playwright/README.md`

### `@spekra/jest`

Owns:

- Jest reporter behavior
- Jest-specific configuration and metadata handling

Primary docs:

- `packages/jest/README.md`

### `@spekra/vitest`

Owns:

- Vitest reporter behavior
- workspace/project metadata handling for Vitest

Primary docs:

- `packages/vitest/README.md`

### `packages/analytics-cli`

Owns:

- JUnit XML parsing and normalization to Spekra report payloads
- uploader-first validation/upload command surface
- CI metadata and upload orchestration for report-based integrations

Primary docs:

- `packages/analytics-cli/README.md`

### `packages/core`

Owns:

- shared types
- shared transport or utility code
- cross-reporter primitives that should not live in a single package

## Release And Governance Surfaces

- `.changeset/` for version planning
- `.github/workflows/release.yml` for publish automation
- `.github/PULL_REQUEST_TEMPLATE.md` for change hygiene
- `CONTRIBUTING.md` for contributor workflow

## Cross-Repo Contract Boundary

This repo is public and package-focused.

It is coupled to the private `spekra-app` repo through:

- report payload shape
- headers and versioning expectations
- user-facing setup documentation
- compatibility fixtures used by the hosted app

If those seams move, maintainers should verify the sibling app repo as well.
