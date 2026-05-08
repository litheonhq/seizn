---
template: gdpr-breach-72h
language: en
target: Lead supervisory authority (default Irish DPC for SaaS w/o EU establishment) + affected data subjects (where high risk)
deadline: 72 hours from awareness (GDPR Article 33) — supervisory authority only; data subject notification "without undue delay" if high risk (Article 34)
filing_path: https://forms.dataprotection.ie (Irish DPC) OR via the lead authority of the EU Member State where the controller has its main establishment
last_reviewed: 2026-05-09 (W3.3 / lawyer review pending)
---

# Personal Data Breach Notification (GDPR Article 33) — 72-hour template

> Fill in `<<>>` placeholders. Lawyer + DPO 1st review before submission.
>
> **Note**: GDPR Article 34 (notification to data subjects) only triggers when
> the breach is "likely to result in a high risk to the rights and freedoms"
> of natural persons. Encrypted-at-rest data with strong key management is one
> of the recognized exceptions. Document this analysis even if you decide to
> notify out of caution.

## 1. Controller information

- **Name:** Litheon LLC (Wyoming, USA)
- **Address:** <<Wyoming registered agent address>>
- **EU Representative (Article 27):** <<Name + address — REQUIRED for non-EU controllers offering services to EU subjects unless exempt>>
- **Data Protection Officer (DPO):** <<Name>> · dpo@seizn.com
- **Primary contact:** privacy@seizn.com · <<phone>>

## 2. Notification metadata

- **Notification submitted:** YYYY-MM-DD HH:MM UTC
- **Awareness:** YYYY-MM-DD HH:MM UTC (timestamp at which we became aware)
- **Hours elapsed since awareness:** <<n>> hours
- **If filed >72 h:** justified delay reason (Article 33.1) — `<<reason>>`

## 3. Breach summary

- **Date and time of breach:** YYYY-MM-DD HH:MM ~ YYYY-MM-DD HH:MM UTC (or estimated)
- **How discovered:** <<e.g., automated monitoring alert / external security researcher / vendor disclosure>>
- **Nature of the breach:** [ ] Confidentiality [ ] Integrity [ ] Availability
- **Type of incident:** [ ] Unauthorized access [ ] Hacking / cyber attack [ ] Insider [ ] Loss / theft [ ] Misconfiguration [ ] Other: <<>>
- **Containment status:** [ ] Contained (date) [ ] Ongoing [ ] Unknown

## 4. Categories and approximate number of data subjects

- **Approximate number of data subjects:** <<n>> (EU residents estimate <<m>>)
- **Affected categories:**
  - [ ] Customer accounts (controllers' clients)
  - [ ] Founding members
  - [ ] Trial users
  - [ ] Stripe payment customers
  - [ ] Desktop waitlist subscribers
  - [ ] BYOK API key holders
  - [ ] Other: <<>>

## 5. Categories and approximate number of personal data records

- **Approximate number of records:** <<n>>
- **Data categories affected:**
  - [ ] Identifiers (email, name)
  - [ ] Authentication credentials (password hashes — bcrypt cost <<>>)
  - [ ] Authentication credentials (plaintext — IF YES, escalate to Article 34)
  - [ ] Payment data (Stripe customer ID, last 4 of card, billing address)
  - [ ] Location data (IP address)
  - [ ] Usage telemetry / API call logs
  - [ ] Authorial content (memory entries, canon, simulation outputs)
  - [ ] Special categories (Article 9: health, sexual orientation, religion, etc.)
  - [ ] Children's data (Article 8 — under 16 in EU)
  - [ ] Encrypted data with separate key (Article 34 exemption candidate)
  - [ ] Other: <<>>

## 6. Likely consequences

Assess the impact on data subjects. Consider:

- Identity theft / fraud risk: <<low / medium / high — reasoning>>
- Financial loss risk: <<>>
- Reputational damage: <<>>
- Loss of confidentiality of professional secrets / authorial work: <<>>
- Discrimination risk: <<>>
- Other significant harm: <<>>

## 7. Measures taken or proposed

- **Already taken** (within <<n>> hours of awareness):
  1. <<e.g., revoked compromised access credentials>>
  2. <<e.g., rotated Supabase service role key, Stripe API key, Resend API key>>
  3. <<e.g., forced logout of all sessions via NEXTAUTH_SECRET rotation>>
  4. <<e.g., engaged external forensic firm>>
  5. <<e.g., preserved evidence — locked DB read-replicas, exported logs>>
- **Planned next 72 h:**
  1. <<e.g., affected user notification email>>
  2. <<e.g., post-mortem publication on /trust>>
  3. <<e.g., remediation roll-out + verification>>

## 8. Decision on data subject notification (Article 34)

Reasoning under Article 34.3 exemptions:

- (a) Encryption: was the data encrypted with keys not compromised? <<Y/N — reasoning>>
- (b) Subsequent measures making high risk no longer materializing? <<Y/N>>
- (c) Disproportionate effort (use public communication instead)? <<Y/N>>

**Decision:** [ ] Notify all affected subjects directly [ ] Public communication on /trust + email digest [ ] Determined notification not required (justify in §6)

If notifying: see `legal/breach-templates/user-notification-en.md`.

## 9. Cross-border considerations

- **Lead supervisory authority:** <<Irish DPC by default (no EU establishment) — confirm with EU Representative>>
- **Other authorities to inform:** <<e.g., concerned authorities under one-stop-shop>>
- **Other regimes triggered:**
  - [ ] UK GDPR / DPA 2018 — ICO (UK)
  - [ ] California CCPA — California AG (>500 CA residents)
  - [ ] Korea PIPA — KISA (see `pipa-72h.md`)
  - [ ] Japan APPI — PPC
  - [ ] Other: <<>>

## 10. Attachments

- Incident timeline (timestamps in UTC + the affected user's local time)
- System architecture diagram
- Service component map (sub-processors involved)
- Sample notification email (after sent to data subjects)

---

## Operator notes (delete before submission)

- **EU Representative obligation**: as a non-EU controller offering services to EU residents, Article 27 requires us to designate an EU representative unless processing is occasional, etc. **We do not currently meet the exemption** — Litheon LLC must contract an EU rep before any meaningful EU launch. Pre-Wave 2 hand-off.
- **Lead authority**: GDPR one-stop-shop only applies if we have a "main establishment" in the EU. Without one, each Member State's authority can act. The Irish DPC handles many SaaS / non-EU cases pragmatically; defaulting there speeds up.
- **High risk threshold**: a useful test — would a reasonable EU subject change their behavior (close account, monitor credit) if they knew? If yes → Article 34 notification.
- This template is a draft pending lawyer review. On a real incident: fill §1-§7, ask EU privacy counsel for a 30-min review, then file.
