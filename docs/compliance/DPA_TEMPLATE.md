# Data Processing Agreement (DPA)

> Version: 1.0.0
> Last Updated: 2026-02-02

---

## DATA PROCESSING AGREEMENT

This Data Processing Agreement ("DPA") forms part of the Master Service Agreement or Terms of Service ("Agreement") between:

**Seizn, Inc.** ("Processor" or "Seizn")
- Address: [Company Address]
- Contact: privacy@seizn.com

and

**[Customer Name]** ("Controller" or "Customer")
- Address: [Customer Address]
- Contact: [Customer Contact]

(collectively, the "Parties")

---

## 1. DEFINITIONS

**1.1** "Personal Data" means any information relating to an identified or identifiable natural person.

**1.2** "Processing" means any operation performed on Personal Data, including collection, storage, use, disclosure, or deletion.

**1.3** "Data Subject" means the individual to whom Personal Data relates.

**1.4** "Sub-processor" means any third party engaged by Seizn to Process Personal Data.

**1.5** "Data Protection Laws" means GDPR, CCPA, and other applicable privacy regulations.

**1.6** "Security Incident" means any unauthorized access, acquisition, or disclosure of Personal Data.

---

## 2. SCOPE AND PURPOSE

**2.1 Purpose of Processing**

Seizn processes Personal Data solely to provide the Services described in the Agreement, including:
- AI agent execution and conversation processing
- Document embedding and retrieval
- User authentication and authorization
- Usage analytics and billing

**2.2 Categories of Personal Data**

| Category | Examples | Retention |
|----------|----------|-----------|
| Account Data | Name, email, organization | Account lifetime + 30 days |
| Usage Data | API calls, features used | 2 years |
| Content Data | Uploaded documents, conversations | Customer-controlled |
| Technical Data | IP addresses, device info | 90 days |

**2.3 Categories of Data Subjects**

- Customer's employees and contractors
- Customer's end users
- Customer's customers (if applicable)

---

## 3. OBLIGATIONS OF THE PROCESSOR

**3.1 Processing Instructions**

Seizn shall:
- Process Personal Data only on documented instructions from Customer
- Notify Customer if legally required to process otherwise
- Ensure personnel are bound by confidentiality obligations

**3.2 Security Measures**

Seizn implements appropriate technical and organizational measures, including:

| Measure | Implementation |
|---------|----------------|
| Encryption at rest | AES-256-GCM |
| Encryption in transit | TLS 1.3 |
| Access control | RBAC with MFA |
| Audit logging | Comprehensive event logging |
| Vulnerability management | Regular scanning and patching |
| Incident response | 24/7 security team |

See Annex II for detailed security measures.

**3.3 Sub-processors**

Seizn:
- Maintains a list of approved Sub-processors (Annex III)
- Provides 30 days notice before engaging new Sub-processors
- Ensures Sub-processors are bound by equivalent data protection obligations
- Remains liable for Sub-processor compliance

**3.4 Data Subject Rights**

Seizn assists Customer in responding to Data Subject requests:
- Access requests: Within 72 hours
- Deletion requests: Within 30 days
- Portability requests: Within 30 days

**3.5 Security Incident Notification**

Seizn shall:
- Notify Customer of Security Incidents within 72 hours
- Provide incident details, impact assessment, and remediation steps
- Cooperate with Customer's incident response

---

## 4. OBLIGATIONS OF THE CONTROLLER

**4.1** Customer shall:
- Ensure lawful basis for Processing
- Provide clear Processing instructions
- Respond to Data Subject requests
- Maintain appropriate security configurations

**4.2** Customer represents that:
- Personal Data is collected lawfully
- Data Subjects have been informed of Processing
- Appropriate consents have been obtained where required

---

## 5. INTERNATIONAL DATA TRANSFERS

**5.1 Transfer Mechanisms**

For transfers outside the EEA/UK, Seizn relies on:
- Standard Contractual Clauses (Module 2: Controller to Processor)
- Data residency options (EU, US, AP regions)
- Supplementary measures as required

**5.2 Transfer Impact Assessment**

Seizn has conducted transfer impact assessments for:
- US transfers: SCCs + supplementary measures
- Other transfers: As documented in Annex IV

---

## 6. AUDITS AND COMPLIANCE

**6.1 Audit Rights**

Customer may:
- Request SOC 2 Type II reports annually
- Request penetration test summaries
- Conduct on-site audits with 30 days notice (at Customer's expense)

**6.2 Compliance Documentation**

Seizn provides:
- Security certifications and attestations
- Data Processing records
- Sub-processor due diligence documentation

---

## 7. DATA RETENTION AND DELETION

**7.1 Retention Periods**

| Data Type | Default Retention | Customer Control |
|-----------|-------------------|------------------|
| Account Data | Account lifetime + 30 days | Configurable |
| Content Data | Unlimited | Full control |
| Usage Logs | 2 years | Minimum required |
| Backups | 30 days after deletion | N/A |

**7.2 Deletion**

Upon Agreement termination or Customer request:
- Active data deleted within 30 days
- Backups purged within 90 days
- Deletion certification available upon request

**7.3 Right to be Forgotten (RTBF)**

Seizn supports automated RTBF processing:
- Cascading deletion across all systems
- Verification and certification
- Audit trail maintenance

---

## 8. TERM AND TERMINATION

**8.1** This DPA remains in effect for the duration of the Agreement.

**8.2** Upon termination:
- Customer may export data for 30 days
- Seizn deletes data per Section 7
- Confidentiality obligations survive

---

## 9. LIABILITY

**9.1** Liability for data protection breaches is subject to the Agreement's liability provisions.

**9.2** Each Party is liable for damages caused by Processing that violates Data Protection Laws.

---

## 10. GOVERNING LAW

This DPA is governed by the laws specified in the Agreement, except where Data Protection Laws require otherwise.

---

## SIGNATURES

**Seizn, Inc.**

Signature: _________________________
Name: [Authorized Representative]
Title: [Title]
Date: _________________________

**[Customer Name]**

Signature: _________________________
Name: _________________________
Title: _________________________
Date: _________________________

---

## ANNEX I: PROCESSING DETAILS

### A. List of Parties

**Controller**: Customer (as identified in Agreement)
**Processor**: Seizn, Inc.

### B. Description of Processing

| Element | Description |
|---------|-------------|
| Subject Matter | AI agent platform services |
| Duration | Term of Agreement |
| Nature | Storage, retrieval, AI processing |
| Purpose | Service delivery as per Agreement |
| Data Types | As specified in Section 2.2 |
| Data Subjects | As specified in Section 2.3 |

---

## ANNEX II: TECHNICAL AND ORGANIZATIONAL MEASURES

### 1. Access Control

- Multi-factor authentication required
- Role-based access control (RBAC)
- Regular access reviews (quarterly)
- Automated deprovisioning

### 2. Encryption

- AES-256-GCM for data at rest
- TLS 1.3 for data in transit
- Customer-managed keys available (BYOK)
- Key rotation every 90 days

### 3. Network Security

- Web Application Firewall (WAF)
- DDoS protection
- Network segmentation
- Intrusion detection/prevention

### 4. Monitoring

- 24/7 security monitoring
- Automated alerting
- Log retention: 2 years
- SIEM integration available

### 5. Incident Response

- Documented incident response plan
- Regular tabletop exercises
- 15-minute response SLA (critical)

### 6. Business Continuity

- Multi-region deployment
- Daily backups
- 99.9% uptime SLA
- Disaster recovery testing (annual)

### 7. Personnel

- Background checks for employees
- Security awareness training (annual)
- Confidentiality agreements
- Least privilege access

---

## ANNEX III: APPROVED SUB-PROCESSORS

See current list at: https://seizn.com/legal/subprocessors

Or refer to: `docs/compliance/SUBPROCESSOR_LIST.md`

---

## ANNEX IV: STANDARD CONTRACTUAL CLAUSES

For transfers to third countries, the EU Standard Contractual Clauses (Commission Implementing Decision 2021/914) are incorporated by reference.

**Module 2 (Controller to Processor)** applies.

Available at: https://seizn.com/legal/scc

---

## ANNEX V: UK ADDENDUM

For transfers from the UK, the UK International Data Transfer Addendum is incorporated.

Available at: https://seizn.com/legal/uk-addendum

---

*This DPA template is provided for informational purposes. Please contact legal@seizn.com for the executed version.*
