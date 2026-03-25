# JUnit Upload CLI (v1)

Date: 2026-03-24
Status: Active

## Goal

Ship a first working uploader-first path for Spekra that ingests JUnit XML
without depending on test runner reporter internals.

## Scope

- Add a repository-local CLI script with `validate` and `upload` commands for
  JUnit files.
- Transform JUnit test cases into the existing Spekra report payload shape and
  post to `/api/v1/reports`.
- Add practical docs for local and CI usage.
- Keep existing reporters unchanged in this slice.

## Prior Context

- Reporter hook churn in modern Vitest versions creates reliability risk.
- We need a stable ingestion path that works across many frameworks.
- A Trunk-style report generation + validation + upload flow is the target UX.

## Steps

1. Add a CLI script and argument parsing for `validate` and `upload`.
2. Implement JUnit parsing and normalization into Spekra test results.
3. Implement validation warnings for common report quality issues.
4. Implement authenticated upload with source/framework metadata flags.
5. Document usage and examples in public-safe SDK docs.
6. Run a targeted local validation and note any follow-up work.

## Acceptance Criteria

- `validate` reports summary + warnings and exits non-zero on invalid input.
- `upload` posts transformed results successfully with API key auth.
- Users can supply source/framework/branch/commit metadata from CLI args.
- README/docs include a reproducible example for Vitest JUnit uploads.
- Existing reporter packages are not broken by this change.
