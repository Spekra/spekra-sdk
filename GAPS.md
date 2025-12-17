# Known Gaps & Technical Debt

## Future Improvements

### Testing
- [x] **Contract testing with Prism/OpenAPI** - Full reporter → API integration tests using Prism mock server. OpenAPI spec at `openapi.json`, 29 integration tests validating payload structure, all test statuses, batching, metrics, and configuration.
- [ ] Add visual regression testing examples
- [ ] Add performance benchmarks to CI
- [ ] Consider mutation testing (Stryker)

### Documentation
- [ ] Add API documentation generation (TypeDoc)
- [ ] Add changelog generation automation
- [ ] Create migration guides for major versions

### Infrastructure
- [ ] Disable GitHub's default CodeQL setup (Settings → Code security → Code scanning → Configure → Disable default setup) in favor of workflow file
- [ ] Consider adding CODEOWNERS when team grows
- [ ] Set up release canary/beta channel
- [ ] Add package provenance verification docs for users

### Monitoring
- [ ] Add npm download badge to README
- [ ] Set up package health monitoring (Snyk, Socket.dev)
- [ ] Consider OpenSSF Scorecard badge

## Completed Items

Track completed items here for historical reference:

- [x] Add SECURITY.md
- [x] Add CODE_OF_CONDUCT.md
- [x] Add Dependabot configuration
- [x] Add CodeQL security scanning
- [x] Add coverage reporting (Codecov)
- [x] Add pre-commit hooks (lint-staged)
- [x] Add .npmrc with engine-strict
- [x] Contract testing with Prism/OpenAPI (29 integration tests)
