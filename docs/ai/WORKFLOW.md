# AI Workflow Guide

This is the subordinate AI workflow and handoff guide for `spekra-sdk`.

If you are choosing where to start, begin with
[docs/AI_ASSISTANT.md](../AI_ASSISTANT.md). That file is the canonical
assistant bootstrap and doc index.

## Source Of Truth

1. [docs/AI_ASSISTANT.md](../AI_ASSISTANT.md) as the canonical assistant
   bootstrap and doc index
2. [AGENTS.md](../../AGENTS.md) for assistant-specific execution policy when
   the environment supports it
3. This guide for AI workflow and handoff
4. [README.md](../../README.md) and [CONTRIBUTING.md](../../CONTRIBUTING.md)
   for public-facing contributor usage
5. package READMEs under `packages/*`
6. GitHub Issues, PRs, and maintainer GitHub Projects for active work

If guidance conflicts, follow `AGENTS.md` for execution constraints and update
stale docs in the same change.

## Standard Workflow

1. Read the relevant package docs, tests, and workflow files before editing.
2. Create a new dated implementation plan in `docs/plans` before substantial
   code changes.
3. Make the smallest complete change set that satisfies the request.
4. Update tests, package docs, changesets, and workflow docs together to avoid
   drift.
5. Run the appropriate validation commands and report exactly what was
   executed.

If a change crosses into `spekra-app`, treat it as a contract change and keep
app ingestion, fixtures, and public SDK docs aligned.

## Required Planning

- Plan location: `docs/plans`
- Filename format: `YYYY-MM-DD-short-topic-v1.md`
- Treat existing plan files as immutable historical records
- For follow-up work, create a new dated plan instead of editing an older plan
- Include: goal, scope, prior context, steps, and acceptance criteria

## Validation Expectations

Use the smallest validation set that meaningfully matches the change.

Typical commands:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

For targeted package work, prefer filtered commands:

```bash
pnpm --filter @spekra/playwright test
pnpm --filter @spekra/jest test
pnpm --filter @spekra/vitest test
```

When published package behavior changes:

- add a changeset unless the change is truly internal-only
- update the relevant package README
- mention compatibility or migration notes when needed

## Release Workflow

- `changeset` files drive versioning and changelog generation
- release automation lives in `.github/workflows/release.yml`
- prerelease flows are documented in `CONTRIBUTING.md`

If a package API or behavior changes in a user-visible way, treat doc updates
and versioning notes as part of the same change.

## Handoff Checklist

Before finishing a change:

1. New plan doc created in `docs/plans` for the work when the change was
   substantial.
2. Relevant package docs and contributor docs updated.
3. Validation commands run, or explicitly called out if skipped.
4. Changeset added when public package behavior changed.
5. Risks, assumptions, and follow-up work noted in the handoff.

## Backlog Hygiene

This repo should not grow a second local backlog system.

Use GitHub-native tracking for active work and keep local docs focused on
workflow, package behavior, testing, and release process.
