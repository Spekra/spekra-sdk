# @spekra/analytics-cli

Internal workspace package that powers the uploader-first JUnit workflow for
Spekra.

Use root commands from the repository:

```bash
pnpm analytics:validate -- --junit-paths "./junit.xml" --strict
pnpm analytics:upload -- --junit-paths "./junit.xml" --source "frontend-unit-tests"
```
