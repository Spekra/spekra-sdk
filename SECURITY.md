# Security Policy

## Reporting a Vulnerability

We take security seriously. If you discover a security vulnerability in the Spekra SDK, please report it responsibly.

**Please do NOT open a public GitHub issue for security vulnerabilities.**

### How to Report

Use [GitHub's private vulnerability reporting](https://github.com/spekra/spekra-sdk/security/advisories/new) to report security issues confidentially.

### What to Include

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Any suggested fixes (optional)

### What to Expect

- **Acknowledgment**: Within 48 hours
- **Initial Assessment**: Within 7 days
- **Resolution Timeline**: Depends on severity, typically within 30-90 days

### Scope

This policy applies to:
- `@spekra/playwright` package
- All code in the `spekra/spekra-sdk` repository

### Out of Scope

- The Spekra platform itself (report separately via the platform)
- Social engineering attacks
- Denial of service attacks

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.x.x   | :white_check_mark: |

## Security Best Practices

When using the Spekra SDK:

1. **Never commit API keys** - Use environment variables
2. **Rotate keys regularly** - Especially if exposed
3. **Use CI secrets** - Store `SPEKRA_API_KEY` in your CI provider's secrets management
4. **Review error messages** - Test assertions may contain sensitive data

## Acknowledgments

We appreciate responsible disclosure and will acknowledge security researchers who report valid vulnerabilities.
