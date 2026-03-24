# AI Assistant Guide

This is the canonical bootstrap document for AI assistants working in
`spekra-sdk`.

Assistant-specific entry files such as [AGENTS.md](../AGENTS.md) and
[CLAUDE.md](../CLAUDE.md) should point here instead of duplicating the same
repo policy.

## How To Use This File

Start here, then load only the docs that matter for the current task.

Treat this file as an index and decision point, not as a replacement for all
repo documentation.

## Always Load

- [docs/ai/WORKFLOW.md](ai/WORKFLOW.md) for the standard AI workflow, planning
  rules, validation expectations, and handoff checklist
- [docs/ai/PACKAGES_SNAPSHOT.md](ai/PACKAGES_SNAPSHOT.md) for the current
  package map and ownership boundaries
- [README.md](../README.md) for public package overview
- [CONTRIBUTING.md](../CONTRIBUTING.md) for contributor setup, test commands,
  and release workflow

## Load By Task

### Playwright reporter work

Load:

- `packages/playwright/README.md`

### Jest reporter work

Load:

- `packages/jest/README.md`

### Vitest reporter work

Load:

- `packages/vitest/README.md`

### Release and versioning work

Load:

- `.changeset/README.md`
- `.github/workflows/release.yml`

### CI or repository governance work

Load:

- `.github/PULL_REQUEST_TEMPLATE.md`
- `.github/workflows/ci.yml`
- `.github/workflows/test.yml`
- `.github/workflows/codeql.yml`

## Core Repo Rules

- Keep this repo public-safe and contributor-friendly.
- GitHub Issues, PRs, and maintainer GitHub Projects track active work. Do not
  recreate local backlog files.
- Create a new dated plan in [docs/plans](plans) before substantial code
  changes.
- Treat `docs/plans` as append-only historical records.
- Update package docs, tests, and changesets together when public behavior
  changes.
- If you are a maintainer doing cross-repo work, also consult the private
  maintainer hub in `spekra-app` when available, but do not make this repo
  depend on private docs to remain understandable.

## Intent

This file exists to keep assistant workflow guidance centralized.

If an assistant entry file starts becoming a second copy of repo policy, move
that guidance here or into a more specific canonical doc instead.
