# Contributing to Spekra SDK

Thanks for your interest in contributing! This guide will help you get set up.

## Development

This is a monorepo managed with [pnpm workspaces](https://pnpm.io/workspaces) and [Changesets](https://github.com/changesets/changesets).

### Prerequisites

- Node.js >= 20.0.0
- pnpm >= 9.0.0

### Setup

```bash
# Clone the repo
git clone https://github.com/spekra/spekra-sdk.git
cd spekra-sdk

# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run tests
pnpm test

# Type check
pnpm typecheck

# Lint
pnpm lint
```

### Project Structure

```
spekra-sdk/
├── packages/
│   ├── playwright/        # @spekra/playwright - Playwright reporter
│   └── test-fixtures/     # Real Playwright projects for version compatibility testing
│       ├── playwright-1.40/
│       ├── playwright-1.44/
│       └── playwright-1.48/
├── .changeset/            # Changeset configuration
├── .github/               # GitHub Actions workflows
└── package.json           # Root workspace config
```

## Making Changes

### Branch Naming

- `feat/description` - New features
- `fix/description` - Bug fixes
- `docs/description` - Documentation updates
- `chore/description` - Maintenance tasks

### Adding a Changeset

When you make changes to a package, add a changeset before opening a PR:

```bash
pnpm changeset
```

This will prompt you to:
1. Select which packages have changed
2. Choose the semver bump type (major/minor/patch)
3. Write a summary of the changes

**Guidelines for bump types:**
- `patch` - Bug fixes, documentation updates, internal refactors
- `minor` - New features, new configuration options
- `major` - Breaking changes to the public API

### Running Tests

```bash
# Run all tests
pnpm test

# Run tests for a specific package
pnpm --filter @spekra/playwright test

# Run tests in watch mode
pnpm --filter @spekra/playwright test:watch

# Run tests with coverage
pnpm --filter @spekra/playwright test:coverage
```

### Code Quality

Before submitting a PR, ensure:

```bash
# Type checking passes
pnpm typecheck

# Linting passes
pnpm lint

# Tests pass
pnpm test
```

## Pull Requests

1. Fork the repo and create your branch from `main`
2. Make your changes
3. Add a changeset (`pnpm changeset`)
4. Ensure tests and linting pass
5. Open a PR with a clear description

## Releasing

Releases are automated via GitHub Actions:

1. When PRs with changesets merge to `main`, a "Version Packages" PR is automatically created
2. This PR updates package versions and changelogs based on the changesets
3. Merging the "Version Packages" PR triggers publishing to npm

Maintainers handle the final merge of version PRs.

### Prerelease Versions

For alpha/beta releases, the project uses [Changesets prerelease mode](https://github.com/changesets/changesets/blob/main/docs/prereleases.md).

**Enter prerelease mode** (do once when starting a prerelease cycle):

```bash
# Enter alpha mode
pnpm prerelease:enter alpha

# Or beta mode
pnpm prerelease:enter beta

# Commit the pre.json file
git add .changeset/pre.json
git commit -m "Enter alpha prerelease mode"
```

While in prerelease mode, the normal PR flow continues unchanged:
- Create changesets as usual (`pnpm changeset`)
- Versions will be suffixed with the prerelease tag (e.g., `0.1.0-alpha.0`, `0.1.0-alpha.1`)
- The "Version Packages" PR will create prerelease versions

**Exit prerelease mode** (when ready for a stable release):

```bash
pnpm prerelease:exit

git add .changeset/pre.json
git commit -m "Exit prerelease mode"
```

The next "Version Packages" PR will produce stable versions.

## Questions?

Open an issue or reach out at [spekra.dev](https://spekra.dev).
