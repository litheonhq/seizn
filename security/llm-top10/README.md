# OWASP LLM Top 10 Security Test Suite

> Red team test suite for LLM/Agent security vulnerabilities

## Overview

This test suite validates Seizn's defenses against the [OWASP Top 10 for LLM Applications](https://owasp.org/www-project-top-10-for-large-language-model-applications/).

## Coverage

| # | Vulnerability | Test File | Status |
|---|---------------|-----------|--------|
| LLM01 | Prompt Injection | `prompt-injection.test.ts` | Implemented |
| LLM02 | Insecure Output Handling | `insecure-output.test.ts` | Implemented |
| LLM04 | Model Denial of Service | `denial-of-service.test.ts` | Implemented |
| LLM06 | Sensitive Info Disclosure | `sensitive-info.test.ts` | Implemented |
| LLM08 | Excessive Agency | `excessive-agency.test.ts` | Implemented |

## Running Tests

```bash
# Run all security tests
pnpm test:security

# Run specific category
pnpm test:security -- --grep "Prompt Injection"

# Run with verbose output
pnpm test:security -- --verbose
```

## CI Integration

These tests run automatically on:
- Every PR to `main`
- Every release tag
- Manual trigger via workflow_dispatch

Tests must pass before merge. See `.github/workflows/security-tests.yml`.

## Test Categories

### LLM01: Prompt Injection

Tests for:
- Direct prompt injection via user input
- Indirect injection via retrieved context (memory/RAG)
- System prompt extraction attempts
- Jailbreak attempts

### LLM02: Insecure Output Handling

Tests for:
- XSS payloads in LLM responses
- SQL injection patterns in outputs
- Command injection patterns
- Path traversal in file operations

### LLM04: Model Denial of Service

Tests for:
- Unbounded token generation
- Recursive/infinite loops
- Resource exhaustion via large inputs
- Rate limiting effectiveness

### LLM06: Sensitive Information Disclosure

Tests for:
- PII leakage in responses
- API key/secret exposure
- Internal system information leakage
- Cross-tenant data exposure

### LLM08: Excessive Agency

Tests for:
- Unauthorized tool execution
- Destructive action prevention
- Permission boundary enforcement
- Human-in-the-loop requirements

## Adding New Tests

1. Create test file in `security/llm-top10/`
2. Follow naming convention: `<category>.test.ts`
3. Use provided test utilities from `./utils`
4. Document test rationale in comments
5. Update this README with new coverage

## References

- [OWASP Top 10 for LLM](https://owasp.org/www-project-top-10-for-large-language-model-applications/)
- [OWASP LLM AI Security & Governance Checklist](https://owasp.org/www-project-ai-security-and-governance-checklist/)
