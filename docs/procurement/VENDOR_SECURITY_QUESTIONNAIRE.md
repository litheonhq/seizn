# Seizn Vendor Security Questionnaire

**Version:** 1.0
**Last Updated:** 2026-02-02

Pre-filled responses to common enterprise vendor security questionnaires.

---

## 1. COMPANY INFORMATION

| Question | Response |
|----------|----------|
| Company Legal Name | Seizn, Inc. |
| Year Founded | 2024 |
| Number of Employees | [XX] |
| Primary Office Location | [Location] |
| Data Center Locations | US (Primary), EU (Available) |

---

## 2. SECURITY GOVERNANCE

### 2.1 Security Program

| Question | Response |
|----------|----------|
| Do you have a documented information security program? | Yes |
| Is there a dedicated security team/role? | Yes |
| Is there executive-level security oversight? | Yes |
| Do you conduct regular security risk assessments? | Yes, annually |
| Do you have documented security policies? | Yes |

### 2.2 Compliance & Certifications

| Question | Response |
|----------|----------|
| SOC 2 Type II? | In Progress (Target: 2026 Q3) |
| ISO 27001? | Planned |
| GDPR Compliant? | Yes |
| CCPA Compliant? | Yes |
| EU AI Act Compliant? | Yes (Article 50) |
| PCI DSS? | N/A (no payment card data processed) |
| HIPAA? | Available with BAA (Enterprise tier) |

---

## 3. ACCESS CONTROL

### 3.1 Authentication

| Question | Response |
|----------|----------|
| Multi-factor authentication available? | Yes |
| MFA required for admin access? | Yes |
| SSO/SAML support? | Yes (Enterprise tier) |
| Password complexity requirements? | Yes |
| Account lockout after failed attempts? | Yes (5 attempts) |
| Session timeout? | Yes (configurable) |

### 3.2 Authorization

| Question | Response |
|----------|----------|
| Role-based access control (RBAC)? | Yes |
| Principle of least privilege? | Yes |
| Regular access reviews? | Yes, quarterly |
| Privileged access management? | Yes |
| Separation of duties? | Yes |

---

## 4. DATA SECURITY

### 4.1 Encryption

| Question | Response |
|----------|----------|
| Data encrypted at rest? | Yes, AES-256 |
| Data encrypted in transit? | Yes, TLS 1.3 |
| Key management process? | HSM-backed, automated rotation |
| Can customer manage their own keys? | Yes (Enterprise tier) |

### 4.2 Data Handling

| Question | Response |
|----------|----------|
| Data classification scheme? | Yes |
| Data retention policies? | Yes, configurable |
| Secure data disposal? | Yes, certified deletion |
| Data backup frequency? | Continuous replication |
| Backup encryption? | Yes |
| Backup testing? | Yes, quarterly |

### 4.3 Data Residency

| Question | Response |
|----------|----------|
| Can customer choose data location? | Yes (US/EU) |
| Cross-border data transfers? | Per customer configuration |
| Transfer mechanisms (SCCs, etc.)? | Yes, SCCs available |

---

## 5. NETWORK SECURITY

| Question | Response |
|----------|----------|
| Firewall protection? | Yes |
| Web Application Firewall (WAF)? | Yes |
| DDoS protection? | Yes |
| Intrusion Detection/Prevention? | Yes |
| Network segmentation? | Yes |
| VPN for admin access? | Yes |
| Regular penetration testing? | Yes, annually |
| Vulnerability scanning? | Yes, continuous |

---

## 6. APPLICATION SECURITY

### 6.1 Secure Development

| Question | Response |
|----------|----------|
| Secure SDLC documented? | Yes |
| Security requirements in design? | Yes |
| Code review required? | Yes |
| Static code analysis (SAST)? | Yes |
| Dynamic application testing (DAST)? | Yes |
| Dependency vulnerability scanning? | Yes |
| Secret detection in code? | Yes (Gitleaks) |

### 6.2 Vulnerability Management

| Question | Response |
|----------|----------|
| Vulnerability management program? | Yes |
| Critical vulnerability SLA? | 24 hours |
| High vulnerability SLA? | 7 days |
| Bug bounty/VDP program? | Coordinated disclosure |

---

## 7. AI-SPECIFIC SECURITY

| Question | Response |
|----------|----------|
| OWASP LLM Top 10 addressed? | Yes, all categories |
| Prompt injection protection? | Yes (Guard system) |
| PII detection/redaction? | Yes |
| AI output filtering? | Yes |
| Model access controls? | Yes |
| AI audit logging? | Yes, complete |
| Human-in-the-loop for critical actions? | Yes (Tool Gating) |

---

## 8. INCIDENT MANAGEMENT

| Question | Response |
|----------|----------|
| Incident response plan? | Yes |
| 24/7 security monitoring? | Yes |
| Incident classification scheme? | Yes |
| Customer notification SLA for breaches? | 72 hours |
| Post-incident review process? | Yes |
| Incident response testing? | Yes, annually |

---

## 9. BUSINESS CONTINUITY

| Question | Response |
|----------|----------|
| Business continuity plan? | Yes |
| Disaster recovery plan? | Yes |
| Recovery Time Objective (RTO)? | 4 hours |
| Recovery Point Objective (RPO)? | 1 hour |
| Multi-region availability? | Yes |
| BC/DR testing? | Yes, annually |

---

## 10. VENDOR MANAGEMENT

| Question | Response |
|----------|----------|
| Subprocessor list available? | Yes |
| Subprocessor security assessments? | Yes, annually |
| Notification for subprocessor changes? | Yes, 30 days |
| Right to audit subprocessors? | Yes |

---

## 11. EMPLOYEE SECURITY

| Question | Response |
|----------|----------|
| Background checks? | Yes |
| Security awareness training? | Yes, annually |
| Acceptable use policy? | Yes |
| Confidentiality agreements? | Yes |
| Offboarding procedures? | Yes |

---

## 12. PHYSICAL SECURITY

| Question | Response |
|----------|----------|
| Data center security certifications? | SOC 2, ISO 27001 (cloud provider) |
| Physical access controls? | Yes (cloud provider managed) |
| Environmental controls? | Yes (cloud provider managed) |
| Video surveillance? | Yes (cloud provider managed) |

---

## 13. LOGGING & MONITORING

| Question | Response |
|----------|----------|
| Security event logging? | Yes |
| Log retention period? | 90 days (configurable) |
| Centralized log management? | Yes |
| Real-time alerting? | Yes |
| Log integrity protection? | Yes |
| Customer access to audit logs? | Yes |

---

## 14. PRIVACY

| Question | Response |
|----------|----------|
| Privacy policy published? | Yes |
| DPA available? | Yes |
| Data subject request handling? | Yes |
| Right to erasure (RTBF)? | Yes, with verification |
| Data portability? | Yes |
| Consent management? | Yes |

---

## 15. CONTRACTUAL

| Question | Response |
|----------|----------|
| SLA available? | Yes |
| Uptime guarantee? | 99.9% |
| Liability terms? | Per agreement |
| Indemnification? | Yes |
| Insurance coverage? | Yes (Cyber, E&O) |
| Termination assistance? | Yes |

---

## DOCUMENT REQUESTS

| Document | Availability |
|----------|--------------|
| SOC 2 Report | In Progress |
| Penetration Test Summary | Available under NDA |
| Security Whitepaper | Available |
| Data Processing Agreement | Available |
| Subprocessor List | Available |
| Insurance Certificate | Available on request |
| Business Continuity Plan Summary | Available on request |

---

*For additional questions, contact: security@seizn.com*
