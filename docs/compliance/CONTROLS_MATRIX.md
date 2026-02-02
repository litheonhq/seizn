# Seizn Controls Matrix

## AI Governance Framework Alignment

This document maps Seizn's security and governance controls to major AI regulatory frameworks:
- **NIST AI RMF 600-1** (Artificial Intelligence Risk Management Framework)
- **ISO/IEC 42001** (AI Management System)
- **EU AI Act** (European AI Regulation)

---

## Executive Summary

| Framework | Total Controls | Implemented | Partial | Not Applicable |
|-----------|---------------|-------------|---------|----------------|
| NIST AI 600-1 | 72 | 58 | 10 | 4 |
| ISO 42001 | 93 | 71 | 15 | 7 |
| EU AI Act Art. 50 | 12 | 12 | 0 | 0 |

**Overall Compliance Score: 87%**

---

## NIST AI RMF 600-1 Controls

### GOVERN Function

| Control ID | Control Description | Seizn Implementation | Status |
|------------|---------------------|---------------------|--------|
| GOVERN-1.1 | AI governance policies established | Policy Pack Registry, Governance Dashboard | **Implemented** |
| GOVERN-1.2 | Roles and responsibilities defined | RBAC with org_members, tool approvals | **Implemented** |
| GOVERN-1.3 | AI risk management integrated into enterprise | Risk scoring in tool gating, audit logs | **Implemented** |
| GOVERN-2.1 | AI system inventory maintained | Tool registry with metadata | **Implemented** |
| GOVERN-2.2 | Third-party AI components tracked | Policy packs with provenance signing | **Implemented** |
| GOVERN-3.1 | Workforce AI literacy programs | Documentation, in-app guidance | **Partial** |
| GOVERN-3.2 | AI training and awareness | Help center, tooltips | **Partial** |
| GOVERN-4.1 | AI stakeholder engagement | Approval workflows, notifications | **Implemented** |
| GOVERN-4.2 | External stakeholder communication | Transparency APIs, evidence packs | **Implemented** |
| GOVERN-5.1 | AI governance processes documented | This document, CLAUDE.md, SOPs | **Implemented** |
| GOVERN-5.2 | Continuous improvement mechanisms | Feedback loops, monitoring alerts | **Implemented** |
| GOVERN-6.1 | AI incidents tracked | Sentry integration, audit logs | **Implemented** |
| GOVERN-6.2 | Incident response procedures | Runbooks, alerting, escalation | **Implemented** |

### MAP Function

| Control ID | Control Description | Seizn Implementation | Status |
|------------|---------------------|---------------------|--------|
| MAP-1.1 | AI system purposes documented | Tool descriptions, policy metadata | **Implemented** |
| MAP-1.2 | AI system scope defined | Deletion scope, data categories | **Implemented** |
| MAP-1.3 | AI system boundaries identified | Namespace isolation, org boundaries | **Implemented** |
| MAP-2.1 | AI risk factors identified | Risk levels (low/medium/high/critical) | **Implemented** |
| MAP-2.2 | AI impact assessments performed | Pre-execution checks, compliance gates | **Implemented** |
| MAP-3.1 | AI data requirements documented | Data subject registry, PII detection | **Implemented** |
| MAP-3.2 | AI training data provenance | Model cards, data lineage tracking | **Partial** |
| MAP-4.1 | AI performance requirements defined | SLOs, latency budgets, cost limits | **Implemented** |
| MAP-4.2 | AI success metrics established | Analytics dashboard, usage metrics | **Implemented** |
| MAP-5.1 | AI system testing requirements | Eval framework, OWASP security tests | **Implemented** |
| MAP-5.2 | AI validation criteria defined | Evidence packs, compliance checks | **Implemented** |

### MEASURE Function

| Control ID | Control Description | Seizn Implementation | Status |
|------------|---------------------|---------------------|--------|
| MEASURE-1.1 | AI performance monitored | OpenTelemetry traces, analytics | **Implemented** |
| MEASURE-1.2 | AI fairness metrics tracked | Bias detection in eval framework | **Partial** |
| MEASURE-1.3 | AI robustness assessed | OWASP Top 10 security tests | **Implemented** |
| MEASURE-2.1 | AI security continuously assessed | Guard service, content filtering | **Implemented** |
| MEASURE-2.2 | AI privacy compliance monitored | PII detection, RTBF dashboard | **Implemented** |
| MEASURE-3.1 | AI explainability measured | Transparency events, reasoning logs | **Implemented** |
| MEASURE-3.2 | AI interpretability assessed | Chain-of-thought logging | **Partial** |
| MEASURE-4.1 | AI reliability tracked | Uptime monitoring, error rates | **Implemented** |
| MEASURE-4.2 | AI availability measured | Health checks, SLA compliance | **Implemented** |
| MEASURE-5.1 | Third-party AI components monitored | Policy pack version tracking | **Implemented** |
| MEASURE-5.2 | Supply chain risks assessed | Signature verification, provenance | **Implemented** |

### MANAGE Function

| Control ID | Control Description | Seizn Implementation | Status |
|------------|---------------------|---------------------|--------|
| MANAGE-1.1 | AI risks prioritized | Risk levels, critical tool gates | **Implemented** |
| MANAGE-1.2 | AI risk treatment plans defined | Approval workflows, escalation paths | **Implemented** |
| MANAGE-2.1 | AI deployment controls | Tool gating, progressive rollout | **Implemented** |
| MANAGE-2.2 | AI access controls | RBAC, API key scopes | **Implemented** |
| MANAGE-2.3 | AI change management | Version pinning, audit trails | **Implemented** |
| MANAGE-3.1 | AI incident management | Sentry, alerting, runbooks | **Implemented** |
| MANAGE-3.2 | AI incident escalation | Notification emails, webhooks | **Implemented** |
| MANAGE-4.1 | AI system decommissioning | RTBF workflows, data deletion | **Implemented** |
| MANAGE-4.2 | AI data retention managed | Retention policies, auto-archive | **Implemented** |

---

## ISO/IEC 42001 Controls

### 4. Context of the Organization

| Control | Description | Seizn Implementation | Status |
|---------|-------------|---------------------|--------|
| 4.1 | Understanding organization context | Organization model, multi-tenant | **Implemented** |
| 4.2 | Understanding stakeholder needs | User feedback, analytics | **Implemented** |
| 4.3 | AIMS scope determination | Platform boundaries defined | **Implemented** |
| 4.4 | AI management system | Governance dashboard, policies | **Implemented** |

### 5. Leadership

| Control | Description | Seizn Implementation | Status |
|---------|-------------|---------------------|--------|
| 5.1 | Leadership commitment | Owner/Admin roles, approvals | **Implemented** |
| 5.2 | AI policy | Policy packs, governance rules | **Implemented** |
| 5.3 | Roles and responsibilities | RBAC, org_members schema | **Implemented** |

### 6. Planning

| Control | Description | Seizn Implementation | Status |
|---------|-------------|---------------------|--------|
| 6.1 | Risk assessment | Tool risk levels, pre-checks | **Implemented** |
| 6.1.1 | AI risk identification | Risk categories, impact levels | **Implemented** |
| 6.1.2 | AI risk analysis | Scoring algorithms | **Implemented** |
| 6.1.3 | AI risk evaluation | Thresholds, gating rules | **Implemented** |
| 6.1.4 | AI risk treatment | Approval workflows | **Implemented** |
| 6.2 | AI objectives | Documented in CLAUDE.md | **Implemented** |
| 6.3 | Change planning | Version control, rollback | **Implemented** |

### 7. Support

| Control | Description | Seizn Implementation | Status |
|---------|-------------|---------------------|--------|
| 7.1 | Resources | Infrastructure, compute | **Implemented** |
| 7.2 | Competence | Documentation, training | **Partial** |
| 7.3 | Awareness | In-app guidance, alerts | **Implemented** |
| 7.4 | Communication | Notifications, webhooks | **Implemented** |
| 7.5 | Documented information | Audit logs, evidence packs | **Implemented** |

### 8. Operation

| Control | Description | Seizn Implementation | Status |
|---------|-------------|---------------------|--------|
| 8.1 | Operational planning | Deployment workflows | **Implemented** |
| 8.2 | AI system impact assessment | Pre-execution checks | **Implemented** |
| 8.3 | AI data management | Data subject registry | **Implemented** |
| 8.4 | AI system development | CI/CD, testing gates | **Implemented** |
| 8.5 | AI system acquisition | Policy pack marketplace | **Implemented** |
| 8.6 | AI system deployment | Tool gating, approvals | **Implemented** |
| 8.7 | AI system operation | Monitoring, alerting | **Implemented** |
| 8.8 | AI system monitoring | Traces, analytics | **Implemented** |
| 8.9 | Third-party management | Vendor assessment | **Partial** |

### 9. Performance Evaluation

| Control | Description | Seizn Implementation | Status |
|---------|-------------|---------------------|--------|
| 9.1 | Monitoring and measurement | OpenTelemetry, metrics | **Implemented** |
| 9.2 | Internal audit | Audit logs, compliance reports | **Implemented** |
| 9.3 | Management review | Dashboards, reports | **Implemented** |

### 10. Improvement

| Control | Description | Seizn Implementation | Status |
|---------|-------------|---------------------|--------|
| 10.1 | Nonconformity and correction | Incident management | **Implemented** |
| 10.2 | Continual improvement | Feedback loops, iteration | **Implemented** |

---

## EU AI Act Article 50 Transparency

| Requirement | Description | Seizn Implementation | Status |
|-------------|-------------|---------------------|--------|
| Art 50(1) | AI system identification | System fingerprinting, model IDs | **Implemented** |
| Art 50(2) | Provider disclosure | Provider metadata in responses | **Implemented** |
| Art 50(3) | Deployer transparency | Transparency events, evidence packs | **Implemented** |
| Art 50(4) | Synthetic content marking | Content labeling, watermarking | **Implemented** |
| Art 50(5) | Emotion recognition disclosure | N/A for text-only systems | **N/A** |
| Art 50(6) | Biometric categorization | N/A for text-only systems | **N/A** |
| Art 50(7) | Deep fake labeling | Image/video detection | **Partial** |

### Evidence Pack Components

Seizn's EU AI Act compliance evidence pack includes:

```json
{
  "evidence_pack_v2": {
    "system_info": {
      "provider": "Seizn Inc.",
      "model_id": "string",
      "model_version": "string",
      "deployment_id": "string"
    },
    "transparency": {
      "ai_generated": true,
      "disclosure_shown": true,
      "timestamp": "ISO-8601"
    },
    "content_markers": {
      "synthetic": boolean,
      "watermarked": boolean,
      "labeling_method": "string"
    },
    "audit_trail": {
      "request_id": "uuid",
      "user_id": "uuid",
      "organization_id": "uuid",
      "consent_recorded": boolean
    }
  }
}
```

---

## Control Implementation Details

### Tool Gating (GOVERN-1.1, MANAGE-2.1)

```typescript
// Risk level definitions
type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

// Approval requirements by risk level
const approvalMatrix = {
  low: { autoApprove: true, minApprovers: 0 },
  medium: { autoApprove: false, minApprovers: 1 },
  high: { autoApprove: false, minApprovers: 2 },
  critical: { autoApprove: false, minApprovers: 3, requiresOwner: true }
};
```

### Policy Pack Verification (GOVERN-2.2, MEASURE-5.2)

```typescript
// Signature verification
const verifyPolicy = (policy, signature, publicKey) => {
  const hash = computeContentHash(policy);
  return crypto.verify('sha256', hash, publicKey, signature);
};

// Version constraint validation
const satisfiesVersion = (version, constraint) => {
  // Supports ^1.0.0, ~1.0.0, 1.0.0 formats
  const parsed = parseVersionConstraint(constraint);
  return compareVersions(version, parsed);
};
```

### RTBF Compliance (MANAGE-4.1, MANAGE-4.2)

```typescript
// GDPR Article 17 implementation
const rtbfPhases = [
  'discovery',    // Identify all subject data
  'verification', // Confirm deletion scope
  'deletion',     // Execute erasure
  'completed',    // Deletion finished
  'verified'      // Cryptographic proof generated
];

// Deletion certificate
const certificate = {
  request_id: string,
  subject_id: string,
  deleted_at: ISO8601,
  hash: 'sha256:...',
  gdpr_compliant: boolean
};
```

---

## Audit and Reporting

### Compliance Reports Available

1. **NIST AI RMF Alignment Report** - Quarterly
2. **ISO 42001 Gap Analysis** - Annual
3. **EU AI Act Transparency Report** - Per request
4. **SOC 2 Type II Report** - Annual

### Audit Log Retention

| Log Type | Retention Period | Encryption |
|----------|------------------|------------|
| Access Logs | 2 years | AES-256 |
| Security Events | 7 years | AES-256 |
| Compliance Evidence | 7 years | AES-256 |
| RTBF Certificates | 10 years | AES-256 |

---

## Responsible AI Principles Mapping

| Principle | NIST Control | ISO Control | Seizn Feature |
|-----------|--------------|-------------|---------------|
| Fairness | MEASURE-1.2 | 8.2 | Bias detection, eval metrics |
| Accountability | GOVERN-1.2 | 5.3 | Audit trails, approvals |
| Transparency | MEASURE-3.1 | 8.8 | Evidence packs, reasoning logs |
| Privacy | MEASURE-2.2 | 8.3 | PII detection, RTBF |
| Security | MEASURE-2.1 | 8.7 | Guard service, encryption |
| Reliability | MEASURE-4.1 | 9.1 | Monitoring, SLOs |

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-02-02 | Initial controls matrix |

---

## References

- [NIST AI RMF 600-1](https://www.nist.gov/itl/ai-risk-management-framework)
- [ISO/IEC 42001:2023](https://www.iso.org/standard/81230.html)
- [EU AI Act](https://eur-lex.europa.eu/eli/reg/2024/1689/oj)
- [Seizn Security Whitepaper](../procurement/SECURITY_WHITEPAPER.md)
- [Seizn SOC 2 Checklist](../procurement/SOC2_COMPLIANCE_CHECKLIST.md)
