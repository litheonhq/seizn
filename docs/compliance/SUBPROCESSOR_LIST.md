# Seizn Subprocessor List

> Version: 1.0.0
> Last Updated: 2026-02-02
> Effective Date: 2026-02-02

---

## Overview

This document lists all third-party subprocessors that Seizn engages to process customer data. Seizn maintains contractual agreements with each subprocessor to ensure appropriate data protection measures.

---

## Current Subprocessors

### Infrastructure & Hosting

| Subprocessor | Purpose | Data Processed | Location | DPA |
|--------------|---------|----------------|----------|-----|
| **Vercel** | Application hosting, edge functions | Application data, logs | Global (US primary) | ✓ |
| **Supabase** | Database, authentication, storage | User data, credentials, files | US/EU (configurable) | ✓ |
| **Cloudflare** | CDN, DDoS protection, WAF | Traffic data, IP addresses | Global | ✓ |
| **Hetzner** | Dedicated compute, backup storage | Processed data, backups | EU (Germany/Finland) | ✓ |

### AI & Machine Learning

| Subprocessor | Purpose | Data Processed | Location | DPA |
|--------------|---------|----------------|----------|-----|
| **OpenAI** | LLM inference (GPT models) | Prompts, responses | US | ✓ |
| **Anthropic** | LLM inference (Claude models) | Prompts, responses | US | ✓ |
| **Cohere** | Embeddings, reranking | Text chunks | US/EU | ✓ |
| **Voyage AI** | Specialized embeddings | Text chunks | US | ✓ |

### Observability & Monitoring

| Subprocessor | Purpose | Data Processed | Location | DPA |
|--------------|---------|----------------|----------|-----|
| **Sentry** | Error tracking, performance | Error logs, stack traces | US | ✓ |
| **PostHog** | Product analytics | Usage events (anonymized) | EU | ✓ |
| **Axiom** | Log aggregation | Application logs | US/EU | ✓ |

### Communication & Support

| Subprocessor | Purpose | Data Processed | Location | DPA |
|--------------|---------|----------------|----------|-----|
| **Resend** | Transactional email | Email addresses, content | US | ✓ |
| **Intercom** | Customer support chat | Support conversations | US | ✓ |
| **Slack** | Internal notifications | Alert data | US | ✓ |

### Payment & Billing

| Subprocessor | Purpose | Data Processed | Location | DPA |
|--------------|---------|----------------|----------|-----|
| **Stripe** | Payment processing | Payment info, billing | US/EU | ✓ |

### Security & Compliance

| Subprocessor | Purpose | Data Processed | Location | DPA |
|--------------|---------|----------------|----------|-----|
| **AWS KMS** | Key management (BYOK) | Encryption keys | US/EU/AP | ✓ |
| **Azure Key Vault** | Key management (BYOK) | Encryption keys | US/EU/AP | ✓ |
| **Google Cloud KMS** | Key management (BYOK) | Encryption keys | US/EU/AP | ✓ |

---

## Data Flow by Region

### US Customers (Default)

```
Customer → Cloudflare (Global) → Vercel (US) → Supabase (US)
                                      ↓
                              OpenAI/Anthropic (US)
```

### EU Customers (EU Data Residency)

```
Customer → Cloudflare (EU) → Vercel (EU Edge) → Supabase (EU)
                                    ↓
                            Hetzner (Germany)
```

### AP Customers (AP Data Residency)

```
Customer → Cloudflare (AP) → Vercel (AP Edge) → Supabase (AP)
                                    ↓
                            Regional AI Provider
```

---

## Subprocessor Due Diligence

Before engaging any subprocessor, Seizn conducts:

1. **Security Assessment**
   - SOC 2 Type II or equivalent certification
   - Penetration test results (annual)
   - Security questionnaire review

2. **Privacy Assessment**
   - Data Processing Agreement (DPA) review
   - GDPR compliance verification
   - Data transfer mechanism assessment

3. **Business Continuity**
   - SLA review (99.9%+ uptime)
   - Disaster recovery capabilities
   - Exit strategy documentation

---

## Change Notification

Seizn will notify customers of subprocessor changes:

| Change Type | Notice Period | Method |
|-------------|---------------|--------|
| New subprocessor | 30 days | Email + Dashboard |
| Material change | 30 days | Email + Dashboard |
| Security incident | Immediate | Email + Status page |
| Removal | 14 days | Email |

### Notification Preferences

Customers can configure notification preferences at:
`Settings → Security → Subprocessor Notifications`

---

## Objection Process

Customers may object to new subprocessors within 30 days:

1. Submit objection via security@seizn.com
2. Seizn will review and respond within 10 business days
3. If objection cannot be resolved:
   - Seizn may offer alternative processing
   - Customer may terminate affected services

---

## Historical Changes

| Date | Change | Subprocessor | Type |
|------|--------|--------------|------|
| 2026-02-02 | Initial list | All | Published |

---

## Contact

For questions about subprocessors:
- **Email**: privacy@seizn.com
- **DPA Requests**: legal@seizn.com

---

*This list is reviewed and updated monthly. Subscribe to updates at seizn.com/security/subprocessors*
