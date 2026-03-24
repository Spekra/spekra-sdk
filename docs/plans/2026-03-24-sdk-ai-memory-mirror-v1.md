# 2026-03-24 SDK AI Memory Mirror V1

Status: Completed

## Goal

Create a thin, public-safe AI assistant mirror for `spekra-sdk` so the repo has
its own canonical assistant bootstrap, workflow guidance, and package map
without depending on private maintainer docs.

## Prior Context

- the new centralized AI memory-bank structure added in `spekra-app`
- existing public contributor docs in `README.md` and `CONTRIBUTING.md`
- the public/private repo split between `spekra-sdk` and `spekra-app`

## Problem

- `spekra-sdk` did not yet have assistant entry points or a canonical assistant
  bootstrap doc
- public contributors and assistants lacked a package-focused map of the repo
- the public repo should not rely on private app docs as its only workflow
  guide

## Scope

- add a canonical assistant bootstrap doc
- add a thin workflow doc and package snapshot
- add thin root assistant entry points
- add `docs/plans` scaffolding and record this implementation as the first plan
- update discoverability in `README.md` and `CONTRIBUTING.md`

## Non-Goals

- do not duplicate private strategy or maintainer-only context from
  `spekra-app`
- do not add a second local backlog system
- do not automate package snapshot generation in this pass

## Plan

1. Create `docs/AI_ASSISTANT.md` as the canonical assistant bootstrap and doc
   index.
2. Add `docs/ai/WORKFLOW.md` and `docs/ai/PACKAGES_SNAPSHOT.md`.
3. Add thin `AGENTS.md` and `CLAUDE.md` entry-point files.
4. Add `docs/plans/INDEX.md` and record this implementation as the first plan
   in the new system.
5. Update `README.md` and `CONTRIBUTING.md` so humans can discover the new
   workflow.

## Acceptance Criteria

- there is one obvious assistant-facing entry point for `spekra-sdk`
- assistant workflow guidance is centralized instead of duplicated
- the repo remains understandable without access to private maintainer docs
- package and release boundaries are documented for contributors
