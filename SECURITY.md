# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.x     | :white_check_mark: |
| < 1.0   | :x:                |

## Reporting a Vulnerability

Please report security vulnerabilities to **security@seizn.com**.

**Do NOT create public GitHub issues for security vulnerabilities.**

### What to Include

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

### Response Timeline

We will:

1. Acknowledge receipt within **48 hours**
2. Provide an estimated timeline for fix within **5 business days**
3. Notify you when the fix is released
4. Credit you in the security advisory (if desired)

## Scope

The following are in scope for security reports:

- **seizn.com** web application
- **Seizn API** (api.seizn.com)
- **Official SDKs**
  - `seizn` (Python)
  - `@seizn/spring` (npm)
  - `@seizn/summer` (npm)
  - `@seizn/mcp-server` (npm)

## Out of Scope

The following are out of scope:

- Third-party integrations not maintained by Seizn
- Social engineering attacks
- Physical attacks
- Denial of service (DoS/DDoS) attacks
- Issues in dependencies (report to upstream maintainers)

## Security Best Practices

When using Seizn:

1. **API Keys**: Never commit API keys to version control
2. **Environment Variables**: Store secrets in environment variables
3. **Least Privilege**: Use scoped API keys with minimal permissions
4. **Rotation**: Rotate API keys periodically
5. **HTTPS**: Always use HTTPS for API calls (enforced by default)

## Compliance

For compliance documentation, see:

- [Security Whitepaper](./docs/compliance/SECURITY_WHITEPAPER.md)
- [SOC 2 Compliance Checklist](./docs/compliance/SOC2_COMPLIANCE_CHECKLIST.md)
- [Access Control Policy](./docs/compliance/ACCESS_CONTROL_POLICY.md)
