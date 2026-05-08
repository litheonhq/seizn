---
doc_type: subprocessors
language: en
version: v1
generated_at: 2026-05-09
status: draft (lawyer review pending)
master: true
applies_to: seizn.com (Author flagship), engine.seizn.com (NPC SDK surface)
data_controller: Litheon LLC, Wyoming, USA
---

# Sub-processors

Last updated: 2026-05-09

Litheon LLC engages the third parties below to process personal information on our behalf. We require each sub-processor to operate under a Data Processing Agreement (DPA) with appropriate technical and organizational safeguards. New sub-processors are announced 30 days before they go live; you can object via privacy@seizn.com within that window.

## Infrastructure

| Sub-processor | Purpose | Data | Location | Safeguards |
|---|---|---|---|---|
| **Vercel, Inc.** | Application hosting, edge functions | Application traffic, logs | US (primary), regional edge | DPA, SCCs |
| **Supabase, Inc.** | Database, authentication, storage | User accounts, content, files | Seoul / Tokyo / Frankfurt (configurable) | DPA, SCCs, ISO 27001 |
| **Cloudflare, Inc.** | CDN, DDoS protection, WAF, R2 object storage | Traffic metadata, IP, backups | Global | DPA, SCCs, EU-US DPF |
| **Hetzner Online GmbH** | Self-hosted observability + backup target | Error logs, analytics events, encrypted DB backups | Germany | DPA, GDPR-native (DE) |

## AI inference

| Sub-processor | Purpose | Data | Location | Safeguards |
|---|---|---|---|---|
| **Anthropic, PBC** | Default LLM inference (Claude) | Prompts + responses (transient) | US | DPA, zero-retention API mode |
| **OpenAI, LLC** | Optional LLM inference (BYOK only) | Prompts + responses, BYOK key | US | DPA (customer-direct under BYOK) |
| **Voyage AI** | Optional embeddings (BYOK or workspace setting) | Text chunks | US | DPA |
| **Cohere, Inc.** | Optional reranking (BYOK or workspace setting) | Text chunks | US / EU | DPA |

## Communication

| Sub-processor | Purpose | Data | Location | Safeguards |
|---|---|---|---|---|
| **Plus Five Five, Inc.** (dba Resend) | Transactional email delivery | Email addresses, recipient names, message metadata, message body | US | DPA, **EU-US DPF certified**, **SCCs Commission Decision 2021/914 Module Two**. Customer data deleted within 90 days of account termination. |

## Payments

| Sub-processor | Purpose | Data | Location | Safeguards |
|---|---|---|---|---|
| **Stripe, Inc.** | Subscription billing, tax, customer portal | Payment method, billing address, tax ID, invoice history | US / EU | DPA, PCI-DSS L1, EU-US DPF |

## Observability (self-hosted)

| Sub-processor | Purpose | Data | Location | Safeguards |
|---|---|---|---|---|
| **GlitchTip** (self-hosted on Hetzner) | Error tracking (Sentry-compatible) | Stack traces, request metadata, user ID | Germany | First-party, no third-party transfer |
| **Plausible Analytics** (self-hosted on Hetzner, Community Edition) | Marketing analytics, cookieless | Page URL, referrer, country, device class | Germany | First-party, no third-party transfer, no cookies |

## Optional integrations (only if you connect them)

| Sub-processor | Purpose | Data | Location | Safeguards |
|---|---|---|---|---|
| **Google LLC** | Google OAuth sign-in, Google Drive Cloud Sync | Email, profile, authorized files | US / EU | DPA, EU-US DPF |
| **GitHub, Inc.** | GitHub OAuth sign-in | Email, profile | US | DPA, EU-US DPF |
| **AWS KMS / Azure Key Vault / Google Cloud KMS** | BYOK key encryption (customer-selected) | Encryption keys (no plaintext key material visible to Seizn) | Customer-selected region | DPA, FIPS 140-2 |

## International transfers

For transfers outside the EEA, UK, or Switzerland we rely on the EU-US Data Privacy Framework (where applicable) and Standard Contractual Clauses (Commission Decision 2021/914) executed with each sub-processor. Korean transfers are documented per PIPA §28-8(1) in the Privacy Policy §6.

## Change history

| Date | Change |
|---|---|
| 2026-05-09 | v1 published (W3.7). Adds Resend (transactional email), GlitchTip + Plausible self-hosted, Hetzner backup target. |

## Contact

- Privacy: privacy@seizn.com
- DPA / SCC requests: legal@seizn.com

---

*Status: draft pending lawyer review. Operational binding from launch date.*
