# Secure SDLC for GenAI Applications

## NIST SSDF Implementation for AI/ML Systems

This document describes Seizn's implementation of the NIST Secure Software Development Framework (SSDF) with specific adaptations for Generative AI applications.

---

## Overview

The Secure Software Development Framework (SSDF) provides practices for secure software development throughout the SDLC. For GenAI applications, additional considerations are required:

1. **Model Supply Chain Security** - Provenance of models and weights
2. **Prompt Engineering Security** - Injection attack prevention
3. **Output Validation** - Content safety and accuracy
4. **Data Pipeline Security** - Training and inference data protection
5. **AI-Specific Vulnerabilities** - OWASP LLM Top 10 coverage

---

## SSDF Practice Groups

### PO: Prepare the Organization

#### PO.1 - Define Security Requirements

| Practice | GenAI Adaptation | Seizn Implementation |
|----------|------------------|---------------------|
| PO.1.1 | AI threat modeling including adversarial attacks | Threat model documented in security docs |
| PO.1.2 | Model-specific security requirements | Guard service requirements spec |
| PO.1.3 | Compliance requirements (EU AI Act, etc.) | Controls matrix, compliance APIs |

**GenAI-Specific Requirements:**

```yaml
# .seizn/security-requirements.yaml
genai_security:
  input_validation:
    - prompt_injection_detection
    - jailbreak_prevention
    - input_length_limits
    - rate_limiting

  output_validation:
    - content_safety_filtering
    - pii_detection
    - hallucination_detection
    - citation_verification

  model_security:
    - weight_integrity_verification
    - model_card_validation
    - provenance_tracking
```

#### PO.2 - Implement Roles and Responsibilities

| Role | GenAI Responsibilities |
|------|----------------------|
| AI Security Lead | Model threat assessment, adversarial testing |
| ML Engineer | Secure training pipelines, model validation |
| Platform Engineer | Inference infrastructure security |
| Security Engineer | Traditional security + AI-specific controls |

#### PO.3 - Implement Supporting Toolchains

**GenAI Security Toolchain:**

```
┌─────────────────────────────────────────────────────────────────┐
│                     GenAI Security Pipeline                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐     │
│  │ Static   │──▶│ Dynamic  │──▶│ Model    │──▶│ Runtime  │     │
│  │ Analysis │   │ Testing  │   │ Testing  │   │ Guard    │     │
│  └──────────┘   └──────────┘   └──────────┘   └──────────┘     │
│       │              │              │              │            │
│       ▼              ▼              ▼              ▼            │
│  ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐     │
│  │ ESLint   │   │ OWASP    │   │ Eval     │   │ Guard    │     │
│  │ CodeQL   │   │ LLM Top  │   │ Suite    │   │ Service  │     │
│  │ Semgrep  │   │ 10 Tests │   │ Redteam  │   │ Filters  │     │
│  └──────────┘   └──────────┘   └──────────┘   └──────────┘     │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

#### PO.4 - Define Secure Development Criteria

**GenAI Security Gates:**

```yaml
# CI/CD Security Gates for GenAI
security_gates:
  pre_commit:
    - secret_scanning
    - prompt_template_validation
    - dependency_audit

  pre_merge:
    - static_analysis
    - unit_tests
    - owasp_llm_tests
    - model_card_validation

  pre_deploy:
    - integration_tests
    - adversarial_eval
    - compliance_check
    - security_review

  post_deploy:
    - canary_monitoring
    - anomaly_detection
    - content_safety_alerts
```

---

### PS: Protect the Software

#### PS.1 - Protect All Forms of Code

| Asset | Protection Method |
|-------|-------------------|
| Source Code | Git with signed commits |
| Prompt Templates | Version controlled, access restricted |
| Model Weights | Encrypted at rest, integrity verified |
| Configuration | Secrets in vault, config validation |

**Prompt Template Security:**

```typescript
// Secure prompt template handling
interface SecurePrompt {
  id: string;
  version: string;
  template: string;
  hash: string;
  allowedVariables: string[];
  inputValidation: ValidationRule[];
  maxLength: number;
  signedBy: string;
}

// Validation before use
function validatePrompt(prompt: SecurePrompt, inputs: Record<string, string>) {
  // 1. Verify signature
  if (!verifyPromptSignature(prompt)) {
    throw new SecurityError('Invalid prompt signature');
  }

  // 2. Validate inputs
  for (const [key, value] of Object.entries(inputs)) {
    if (!prompt.allowedVariables.includes(key)) {
      throw new SecurityError(`Unauthorized variable: ${key}`);
    }
    validateInput(value, prompt.inputValidation);
  }

  // 3. Check length limits
  const rendered = renderPrompt(prompt.template, inputs);
  if (rendered.length > prompt.maxLength) {
    throw new SecurityError('Prompt exceeds maximum length');
  }

  return rendered;
}
```

#### PS.2 - Provide a Software Integrity Verification

**Model Integrity Verification:**

```typescript
// Model provenance and integrity
interface ModelProvenance {
  modelId: string;
  provider: string;
  version: string;
  trainingDataHash?: string;
  weightsHash: string;
  signedBy: string;
  signature: string;
  certChain: string[];
}

async function verifyModelIntegrity(
  model: ModelProvenance,
  weightsPath: string
): Promise<boolean> {
  // 1. Verify certificate chain
  const certValid = await verifyCertChain(model.certChain);
  if (!certValid) return false;

  // 2. Verify signature
  const sigValid = crypto.verify(
    'sha256',
    Buffer.from(model.weightsHash),
    model.certChain[0],
    Buffer.from(model.signature, 'base64')
  );
  if (!sigValid) return false;

  // 3. Verify weights hash
  const actualHash = await computeFileHash(weightsPath);
  return actualHash === model.weightsHash;
}
```

#### PS.3 - Archive and Protect Software Releases

**Release Artifacts:**

```yaml
# Release manifest for GenAI components
release:
  version: "2.1.0"
  timestamp: "2026-02-02T00:00:00Z"

  components:
    - name: guard-service
      type: container
      digest: "sha256:abc..."
      sbom: "sbom-guard-2.1.0.spdx.json"

    - name: eval-framework
      type: npm
      digest: "sha256:def..."
      sbom: "sbom-eval-2.1.0.spdx.json"

    - name: prompt-templates
      type: bundle
      digest: "sha256:ghi..."
      signatures:
        - signer: "security@seizn.com"
          signature: "base64..."

  attestations:
    - type: "https://slsa.dev/provenance/v1"
      file: "provenance.intoto.jsonl"
```

---

### PW: Produce Well-Secured Software

#### PW.1 - Design Software to Meet Security Requirements

**GenAI Architecture Security Patterns:**

```
┌────────────────────────────────────────────────────────────────┐
│                    Secure GenAI Architecture                    │
├────────────────────────────────────────────────────────────────┤
│                                                                 │
│   User Input                                                    │
│       │                                                         │
│       ▼                                                         │
│   ┌───────────────┐                                            │
│   │ Rate Limiter  │◀── IP/User-based limits                    │
│   └───────┬───────┘                                            │
│           ▼                                                     │
│   ┌───────────────┐                                            │
│   │Input Sanitizer│◀── Length, charset, structure validation   │
│   └───────┬───────┘                                            │
│           ▼                                                     │
│   ┌───────────────┐                                            │
│   │ Prompt Guard  │◀── Injection detection, jailbreak filter   │
│   └───────┬───────┘                                            │
│           ▼                                                     │
│   ┌───────────────┐                                            │
│   │ Context Mgr   │◀── RAG security, access control            │
│   └───────┬───────┘                                            │
│           ▼                                                     │
│   ┌───────────────┐                                            │
│   │   LLM API     │◀── Model isolation, credential rotation    │
│   └───────┬───────┘                                            │
│           ▼                                                     │
│   ┌───────────────┐                                            │
│   │ Output Guard  │◀── Content safety, PII filter              │
│   └───────┬───────┘                                            │
│           ▼                                                     │
│   ┌───────────────┐                                            │
│   │ Audit Logger  │◀── Compliance logging, evidence capture    │
│   └───────┬───────┘                                            │
│           ▼                                                     │
│       Response                                                  │
│                                                                 │
└────────────────────────────────────────────────────────────────┘
```

#### PW.2 - Review Software Design

**GenAI Security Review Checklist:**

```markdown
## GenAI Security Design Review

### Input Handling
- [ ] All user inputs are validated before processing
- [ ] Prompt injection detection is implemented
- [ ] Input length limits are enforced
- [ ] Special characters are properly escaped

### Model Integration
- [ ] Model API credentials are properly secured
- [ ] Model responses are validated before use
- [ ] Fallback behavior is defined for model failures
- [ ] Model version is pinned and tracked

### Output Processing
- [ ] Output content is filtered for safety
- [ ] PII is detected and handled appropriately
- [ ] Hallucination detection is in place
- [ ] Output length limits are enforced

### Data Flow
- [ ] Sensitive data is encrypted in transit
- [ ] Logging does not include sensitive information
- [ ] Data retention policies are implemented
- [ ] RTBF capabilities are in place

### Access Control
- [ ] Authentication is required for all endpoints
- [ ] Authorization checks context appropriately
- [ ] Rate limiting prevents abuse
- [ ] Audit logging captures access patterns
```

#### PW.4 - Reuse Existing, Well-Secured Software

**Approved GenAI Dependencies:**

```json
{
  "approvedDependencies": {
    "llm": {
      "openai": "^4.0.0",
      "anthropic": "^0.10.0"
    },
    "security": {
      "@seizn/guard": "^2.0.0",
      "@seizn/eval": "^1.0.0"
    },
    "vectors": {
      "pgvector": "^0.5.0"
    }
  },
  "prohibitedPatterns": [
    "eval(",
    "Function(",
    "dangerouslySetInnerHTML"
  ]
}
```

#### PW.5 - Create Source Code Securely

**GenAI Coding Standards:**

```typescript
// GOOD: Parameterized prompt with validation
const response = await llm.complete({
  prompt: buildSecurePrompt(template, {
    userQuery: sanitize(userInput),
    context: authorizedContext
  }),
  maxTokens: 1000,
  temperature: 0.7
});

// BAD: Direct string concatenation (prompt injection risk)
// const response = await llm.complete({
//   prompt: `Answer this: ${userInput}`,
// });

// GOOD: Output validation
const validated = await validateLLMOutput(response, {
  maxLength: 5000,
  allowedContentTypes: ['text'],
  piiHandling: 'redact'
});

// BAD: Direct output usage without validation
// return response.text;
```

#### PW.7 - Test Executable Code

**GenAI Test Categories:**

```yaml
# GenAI Testing Strategy
tests:
  unit_tests:
    coverage_target: 80%
    includes:
      - prompt_builder_tests
      - sanitizer_tests
      - validator_tests

  integration_tests:
    includes:
      - llm_api_integration
      - guard_service_integration
      - audit_logging_integration

  security_tests:
    owasp_llm_top_10:
      - LLM01_prompt_injection
      - LLM02_insecure_output
      - LLM03_training_data_poisoning
      - LLM04_model_denial_of_service
      - LLM05_supply_chain
      - LLM06_sensitive_info_disclosure
      - LLM07_insecure_plugin_design
      - LLM08_excessive_agency
      - LLM09_overreliance
      - LLM10_model_theft

  adversarial_tests:
    includes:
      - jailbreak_attempts
      - prompt_extraction
      - context_manipulation
      - output_manipulation

  eval_tests:
    includes:
      - accuracy_benchmarks
      - safety_evals
      - bias_detection
      - hallucination_rate
```

#### PW.8 - Configure Software Securely

**Secure Default Configuration:**

```typescript
// config/security.ts
export const securityConfig = {
  // Input Security
  input: {
    maxPromptLength: 10000,
    maxTokens: 4096,
    allowedCharsets: ['utf-8'],
    sanitization: 'strict'
  },

  // Guard Service
  guard: {
    enabled: true,
    promptInjectionDetection: true,
    contentSafetyFilter: true,
    piiDetection: true,
    thresholds: {
      toxicity: 0.7,
      violence: 0.8,
      sexual: 0.9,
      harmful: 0.7
    }
  },

  // Output Security
  output: {
    maxResponseLength: 50000,
    stripSensitivePatterns: true,
    citationRequired: false
  },

  // Rate Limiting
  rateLimit: {
    requests: {
      perMinute: 60,
      perHour: 1000,
      perDay: 10000
    },
    tokens: {
      perMinute: 100000,
      perHour: 1000000
    }
  },

  // Audit
  audit: {
    logRequests: true,
    logResponses: true,
    retentionDays: 90,
    sensitiveDataHandling: 'hash'
  }
};
```

---

### RV: Respond to Vulnerabilities

#### RV.1 - Identify and Confirm Vulnerabilities

**GenAI Vulnerability Types:**

| Category | Examples | Detection Method |
|----------|----------|------------------|
| Prompt Injection | Jailbreaks, instruction override | Pattern matching, ML classifier |
| Data Leakage | Training data extraction | Output monitoring, eval tests |
| Model Manipulation | Adversarial inputs | Robustness testing |
| Supply Chain | Compromised models/deps | Signature verification, SBOM |
| Output Safety | Harmful content generation | Content filtering |

**Vulnerability Scanning Pipeline:**

```yaml
# .github/workflows/genai-security-scan.yml
name: GenAI Security Scan

on:
  push:
    branches: [main, develop]
  pull_request:

jobs:
  static-analysis:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Run CodeQL
        uses: github/codeql-action/analyze@v3
      - name: Run Semgrep
        uses: returntocorp/semgrep-action@v1
        with:
          config: p/security-audit

  dependency-scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Run npm audit
        run: npm audit --audit-level=high
      - name: Check for known vulnerabilities
        uses: snyk/actions/node@master

  owasp-llm-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Setup Node
        uses: actions/setup-node@v4
      - name: Run OWASP LLM Top 10 Tests
        run: npm run test:owasp-llm
        env:
          TEST_API_KEY: ${{ secrets.TEST_API_KEY }}

  model-security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Verify model provenance
        run: npm run verify:models
      - name: Check model signatures
        run: npm run verify:signatures
```

#### RV.2 - Assess and Prioritize Vulnerabilities

**GenAI Vulnerability Scoring:**

```typescript
interface GenAIVulnerability {
  id: string;
  type: 'prompt_injection' | 'data_leakage' | 'output_safety' | 'supply_chain';
  severity: 'critical' | 'high' | 'medium' | 'low';
  exploitability: number; // 0-10
  impact: number; // 0-10
  remediationEffort: 'trivial' | 'simple' | 'moderate' | 'complex';
}

function calculatePriority(vuln: GenAIVulnerability): number {
  const severityWeight = {
    critical: 10,
    high: 7,
    medium: 4,
    low: 1
  };

  const effortWeight = {
    trivial: 1,
    simple: 0.8,
    moderate: 0.5,
    complex: 0.3
  };

  return (
    severityWeight[vuln.severity] *
    vuln.exploitability *
    vuln.impact *
    effortWeight[vuln.remediationEffort]
  ) / 100;
}
```

#### RV.3 - Remediate Vulnerabilities

**Remediation Runbook:**

```markdown
## GenAI Vulnerability Remediation

### Prompt Injection (Critical)

1. **Immediate Actions:**
   - Enable strict input validation
   - Activate injection detection filter
   - Review recent logs for exploitation

2. **Short-term Fix:**
   - Update Guard service rules
   - Add specific pattern to blocklist
   - Deploy canary with fix

3. **Long-term Solution:**
   - Implement structural prompt separation
   - Add multi-layer validation
   - Update security tests

### Data Leakage (High)

1. **Immediate Actions:**
   - Review leaked data scope
   - Notify affected parties if PII involved
   - Enable output filtering

2. **Investigation:**
   - Analyze attack vector
   - Check for training data memorization
   - Review access logs

3. **Remediation:**
   - Implement output scanning
   - Add PII detection layer
   - Update model if necessary
```

---

## CI/CD Pipeline Security

### Pipeline Configuration

```yaml
# .github/workflows/secure-genai-pipeline.yml
name: Secure GenAI Pipeline

on:
  push:
    branches: [main]
  pull_request:

env:
  SLSA_PROVENANCE: true
  SBOM_GENERATE: true

jobs:
  build:
    runs-on: ubuntu-latest
    outputs:
      digest: ${{ steps.build.outputs.digest }}

    steps:
      - uses: actions/checkout@v4

      - name: Install dependencies
        run: npm ci

      - name: Run security checks
        run: |
          npm audit --audit-level=high
          npm run lint:security
          npm run test:security

      - name: Build
        id: build
        run: |
          npm run build
          echo "digest=$(sha256sum dist/index.js | cut -d' ' -f1)" >> $GITHUB_OUTPUT

      - name: Generate SBOM
        run: |
          npx @cyclonedx/cyclonedx-npm --output-file sbom.json

      - name: Upload artifacts
        uses: actions/upload-artifact@v4
        with:
          name: build-artifacts
          path: |
            dist/
            sbom.json

  security-tests:
    needs: build
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - name: Run OWASP LLM Tests
        run: npm run test:owasp-llm

      - name: Run Adversarial Tests
        run: npm run test:adversarial

      - name: Security Report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: security-report
          path: reports/security-*.json

  deploy:
    needs: [build, security-tests]
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'

    steps:
      - name: Download artifacts
        uses: actions/download-artifact@v4
        with:
          name: build-artifacts

      - name: Verify build integrity
        run: |
          echo "${{ needs.build.outputs.digest }} dist/index.js" | sha256sum -c

      - name: Deploy with SLSA provenance
        run: |
          # Generate SLSA provenance
          npm run generate:provenance
          # Deploy to production
          npm run deploy:production
```

---

## Continuous Monitoring

### Runtime Security Monitoring

```typescript
// Real-time security monitoring for GenAI
const monitoringConfig = {
  alerts: {
    promptInjectionRate: {
      threshold: 0.01, // 1% of requests
      window: '5m',
      action: 'page_oncall'
    },
    contentSafetyViolations: {
      threshold: 10,
      window: '1h',
      action: 'notify_security'
    },
    unusualTokenUsage: {
      threshold: 2.0, // 2x normal
      window: '15m',
      action: 'investigate'
    },
    errorRateSpike: {
      threshold: 0.05,
      window: '5m',
      action: 'page_oncall'
    }
  },

  metrics: [
    'genai.requests.total',
    'genai.requests.blocked',
    'genai.tokens.input',
    'genai.tokens.output',
    'genai.latency.p50',
    'genai.latency.p99',
    'guard.detections.prompt_injection',
    'guard.detections.content_safety',
    'guard.detections.pii'
  ]
};
```

---

## Appendix: Security Checklist

### Pre-Release Security Checklist

```markdown
## GenAI Release Security Checklist

### Code Security
- [ ] All code reviewed by security-trained engineer
- [ ] No hardcoded credentials or API keys
- [ ] Input validation on all user inputs
- [ ] Output sanitization before display

### Model Security
- [ ] Model provenance verified
- [ ] Model signatures validated
- [ ] Model card reviewed for risks
- [ ] Fallback behavior defined

### Testing
- [ ] Unit test coverage > 80%
- [ ] Integration tests passing
- [ ] OWASP LLM Top 10 tests passing
- [ ] Adversarial eval completed
- [ ] Performance benchmarks met

### Documentation
- [ ] Security architecture documented
- [ ] API security requirements documented
- [ ] Incident response runbook updated
- [ ] User-facing security docs updated

### Compliance
- [ ] Privacy impact assessment completed
- [ ] Data processing agreements in place
- [ ] Audit logging configured
- [ ] RTBF capability verified

### Operations
- [ ] Monitoring dashboards configured
- [ ] Alert thresholds set appropriately
- [ ] Rollback procedure tested
- [ ] On-call rotation confirmed
```

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-02-02 | Initial SSDF for GenAI |

---

## References

- [NIST SSDF v1.1](https://csrc.nist.gov/Projects/ssdf)
- [OWASP LLM Top 10](https://owasp.org/www-project-top-10-for-large-language-model-applications/)
- [SLSA Framework](https://slsa.dev/)
- [Seizn Security Whitepaper](../procurement/SECURITY_WHITEPAPER.md)
