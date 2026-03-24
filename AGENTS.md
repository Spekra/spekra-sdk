# Spekra SDK Agent Notes

Read [docs/AI_ASSISTANT.md](docs/AI_ASSISTANT.md) first.

That file is the canonical assistant bootstrap for this repo and points to the
workflow, package map, contributor guidance, and release context needed for the
task at hand.

This file should stay thin and only hold Codex-specific execution notes that
are not shared across every assistant surface.

## Codex Execution Notes

- Keep this repo public-safe. Do not import private maintainer context here as
  if it were public documentation.
- When package behavior changes, update tests, package docs, and changesets
  together.
