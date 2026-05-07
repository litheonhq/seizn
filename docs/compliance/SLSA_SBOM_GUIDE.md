# SLSA L2 & SBOM Compliance Guide

## Supply-chain Levels for Software Artifacts (SLSA)

Seizn implements **SLSA Level 2** compliance for all production releases, providing:

- **Build integrity** - Signed provenance attestations
- **Source integrity** - Verified source code origin
- **Build as code** - Reproducible build definitions
- **Isolated builds** - Hermetic build environment

---

## SLSA Level 2 Requirements

| Requirement | Implementation | Status |
|-------------|---------------|--------|
| Version controlled | GitHub repository | **Met** |
| Verified history | Signed commits, branch protection | **Met** |
| Retained indefinitely | GitHub retention + backup | **Met** |
| Build script exists | GitHub Actions workflow | **Met** |
| Build service used | GitHub Actions (hosted runner) | **Met** |
| Build as code | `.github/workflows/release-slsa.yml` | **Met** |
| Ephemeral environment | Fresh runner per build | **Met** |
| Isolated builds | No user-defined inputs | **Met** |
| Parameterless builds | Version from tags only | **Met** |
| Signed provenance | SLSA GitHub Generator | **Met** |

---

## Release Pipeline

### Build Flow

```
┌────────────────────────────────────────────────────────────────┐
│                    SLSA L2 Release Pipeline                     │
├────────────────────────────────────────────────────────────────┤
│                                                                 │
│   1. Tag Push (v*)                                             │
│         │                                                       │
│         ▼                                                       │
│   ┌──────────────┐                                             │
│   │    Build     │──▶ npm ci --ignore-scripts                  │
│   │  Application │──▶ npm test                                 │
│   │              │──▶ npm run build                            │
│   └──────┬───────┘                                             │
│          │                                                      │
│          ├──────────────────┬──────────────────┐               │
│          ▼                  ▼                  ▼               │
│   ┌──────────────┐   ┌──────────────┐   ┌──────────────┐      │
│   │  SBOM Gen    │   │  Container   │   │  Security    │      │
│   │  SPDX/CDX    │   │    Build     │   │    Scan      │      │
│   └──────┬───────┘   └──────┬───────┘   └──────────────┘      │
│          │                  │                                   │
│          │                  ▼                                   │
│          │           ┌──────────────┐                          │
│          │           │    SLSA      │                          │
│          │           │  Provenance  │                          │
│          │           └──────┬───────┘                          │
│          │                  │                                   │
│          ▼                  ▼                                   │
│   ┌────────────────────────────────────────┐                   │
│   │           GitHub Release               │                   │
│   │  - Artifacts                           │                   │
│   │  - SBOM (SPDX + CycloneDX)            │                   │
│   │  - Provenance attestation              │                   │
│   │  - Changelog                           │                   │
│   └────────────────────────────────────────┘                   │
│                                                                 │
└────────────────────────────────────────────────────────────────┘
```

### Trigger Conditions

```yaml
on:
  push:
    tags:
      - 'v*'  # Semantic version tags
  workflow_dispatch:
    inputs:
      version:
        description: 'Version to release'
        required: true
```

---

## Software Bill of Materials (SBOM)

### Generated Formats

#### SPDX (ISO/IEC 5962:2021)

```json
{
  "spdxVersion": "SPDX-2.3",
  "dataLicense": "CC0-1.0",
  "SPDXID": "SPDXRef-DOCUMENT",
  "name": "seizn-v2.1.0",
  "documentNamespace": "https://www.seizn.com/sbom/v2.1.0",
  "packages": [
    {
      "SPDXID": "SPDXRef-Package-seizn",
      "name": "seizn",
      "versionInfo": "2.1.0",
      "supplier": "Organization: Seizn Inc.",
      "downloadLocation": "https://github.com/litheonhq/seizn",
      "filesAnalyzed": true,
      "checksums": [
        {
          "algorithm": "SHA256",
          "checksumValue": "..."
        }
      ]
    }
  ],
  "relationships": [
    {
      "spdxElementId": "SPDXRef-DOCUMENT",
      "relationshipType": "DESCRIBES",
      "relatedSpdxElement": "SPDXRef-Package-seizn"
    }
  ]
}
```

#### CycloneDX (OWASP Standard)

```json
{
  "bomFormat": "CycloneDX",
  "specVersion": "1.5",
  "version": 1,
  "metadata": {
    "timestamp": "2026-02-02T00:00:00Z",
    "tools": [
      {
        "vendor": "anchore",
        "name": "syft",
        "version": "0.100.0"
      }
    ],
    "component": {
      "bom-ref": "seizn@2.1.0",
      "type": "application",
      "name": "seizn",
      "version": "2.1.0"
    }
  },
  "components": [
    {
      "type": "library",
      "name": "next",
      "version": "15.0.0",
      "purl": "pkg:npm/next@15.0.0"
    }
  ]
}
```

### SBOM Components Included

| Component Type | Examples |
|---------------|----------|
| Application code | `seizn-app`, `guard-service` |
| NPM dependencies | `next`, `react`, `openai` |
| Runtime | `node:20-alpine` |
| OS packages | Base image packages |

---

## Provenance Attestation

### SLSA Provenance Format

```json
{
  "_type": "https://in-toto.io/Statement/v1",
  "subject": [
    {
      "name": "ghcr.io/litheonhq/seizn",
      "digest": {
        "sha256": "abc123..."
      }
    }
  ],
  "predicateType": "https://slsa.dev/provenance/v1",
  "predicate": {
    "buildDefinition": {
      "buildType": "https://slsa-framework.github.io/github-actions-buildtypes/workflow/v1",
      "externalParameters": {
        "workflow": {
          "ref": "refs/tags/v2.1.0",
          "repository": "https://github.com/litheonhq/seizn"
        }
      },
      "resolvedDependencies": [
        {
          "uri": "git+https://github.com/litheonhq/seizn@refs/tags/v2.1.0",
          "digest": {
            "gitCommit": "abc123..."
          }
        }
      ]
    },
    "runDetails": {
      "builder": {
        "id": "https://github.com/slsa-framework/slsa-github-generator/.github/workflows/generator_container_slsa3.yml@refs/tags/v2.0.0"
      },
      "metadata": {
        "invocationId": "https://github.com/litheonhq/seizn/actions/runs/12345"
      }
    }
  }
}
```

### Verification

```bash
# Verify container provenance
cosign verify-attestation \
  --type slsaprovenance \
  --certificate-identity-regexp '^https://github.com/slsa-framework/slsa-github-generator/.github/workflows/generator_container_slsa3.yml@refs/tags/v[0-9]+.[0-9]+.[0-9]+$' \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com \
  ghcr.io/litheonhq/seizn:v2.1.0

# Verify SBOM
cosign verify-attestation \
  --type cyclonedx \
  --certificate-identity-regexp '^https://github.com/litheonhq/seizn/.github/workflows/release-slsa.yml@refs/tags/v' \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com \
  ghcr.io/litheonhq/seizn:v2.1.0
```

---

## Guard Service Components

The Guard service is integrated into the main Seizn application and covered by the same SLSA/SBOM compliance:

### Guard Service Files

```
src/lib/guard/
├── index.ts           # Main export
├── service.ts         # Guard service implementation
├── types.ts           # TypeScript types
├── prompt-guard.ts    # Prompt injection detection
├── content-filter.ts  # Content safety filtering
└── pii-detector.ts    # PII detection

src/app/api/guard/
├── route.ts           # Guard API endpoint
└── check/route.ts     # Check endpoint
```

### Guard Dependencies

The SBOM includes all Guard-specific dependencies:

| Package | Purpose | License |
|---------|---------|---------|
| `openai` | LLM API client | MIT |
| `zod` | Input validation | MIT |
| `@anthropic-ai/sdk` | Claude API client | MIT |

---

## Vulnerability Management

### Scanning Pipeline

```yaml
# Security scan job in release-slsa.yml
scan:
  name: Security Scan
  runs-on: ubuntu-latest
  needs: [container]

  steps:
    # Trivy container scan
    - name: Run Trivy
      uses: aquasecurity/trivy-action@master
      with:
        image-ref: ${{ needs.container.outputs.image }}
        format: 'sarif'
        severity: 'CRITICAL,HIGH'

    # Grype SBOM scan
    - name: Run Grype
      uses: anchore/scan-action@v3
      with:
        image: ${{ needs.container.outputs.image }}
        fail-build: false
        severity-cutoff: high
```

### Vulnerability Thresholds

| Severity | Policy |
|----------|--------|
| Critical | Block release, immediate fix |
| High | Block release, fix within 7 days |
| Medium | Warning, fix within 30 days |
| Low | Informational |

---

## Compliance Mapping

### NIST SSDF Alignment

| SSDF Practice | SLSA/SBOM Implementation |
|---------------|-------------------------|
| PS.1 (Protect code) | Signed commits, branch protection |
| PS.2 (Integrity verification) | SLSA provenance, checksums |
| PS.3 (Archive releases) | GitHub releases with SBOM |
| PW.4 (Reuse secure software) | SBOM dependency tracking |
| RV.1 (Identify vulnerabilities) | Trivy, Grype scanning |

### SOC 2 Controls

| Control | SLSA/SBOM Implementation |
|---------|-------------------------|
| CC6.1 (Logical access) | GitHub Actions OIDC |
| CC6.6 (System operations) | Build automation |
| CC7.1 (Change management) | Provenance tracking |
| CC8.1 (Change authorization) | Tag-based releases |

---

## Release Checklist

```markdown
## Pre-Release

- [ ] All tests passing
- [ ] Security scan clean (no critical/high)
- [ ] Dependencies up to date
- [ ] CHANGELOG updated

## Release Process

1. [ ] Create release tag: `git tag v2.1.0`
2. [ ] Push tag: `git push origin v2.1.0`
3. [ ] Monitor workflow: Actions > Release with SLSA Provenance
4. [ ] Verify provenance: `cosign verify-attestation ...`

## Post-Release

- [ ] Verify GitHub release published
- [ ] SBOM attached to release
- [ ] Provenance attestation visible
- [ ] Container image tagged correctly
- [ ] Security scan results reviewed
```

---

## References

- [SLSA Framework](https://slsa.dev/)
- [SLSA GitHub Generator](https://github.com/slsa-framework/slsa-github-generator)
- [SPDX Specification](https://spdx.dev/specifications/)
- [CycloneDX Specification](https://cyclonedx.org/specification/overview/)
- [Cosign Verification](https://docs.sigstore.dev/cosign/verify/)
- [NIST SSDF](https://csrc.nist.gov/Projects/ssdf)

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-02-02 | Initial SLSA/SBOM documentation |
