---
doc_type: privacy-policy
language: en
version: v1
generated_at: 2026-05-02
status: draft (lawyer review pending)
master: true
applies_to: seizn.com (Author flagship), engine.seizn.com (NPC SDK surface)
data_controller: Litheon LLC, Wyoming, USA
---

# Privacy Policy

Last updated: 2026-05-02

## 1. Who we are

Seizn ('Seizn', 'we', 'us', 'our') is operated by Litheon LLC, a Wyoming limited liability company registered in the United States. Litheon LLC is the sole data controller for personal information processed through Seizn services.

Contact: privacy@seizn.com

## 2. Scope

This policy covers personal information collected when you visit seizn.com, sign up for Seizn Author, use engine.seizn.com, or interact with related services. It does not cover third-party services you connect (Anthropic, Google, OpenAI via BYOK, etc.) — those operate under their own privacy policies.

## 3. Information we collect

### 3.1 Information you provide

- Account information: email, name, password hash, locale preference.
- Subscription and billing: handled by Stripe; we receive customer ID, plan, status, and invoice metadata. We do not store full card numbers.
- Content you upload: manuscripts, worldbuilding notes, character data, scenes, audit decisions, and other authorial materials.
- Support and communication: messages you send to support@seizn.com or via in-app forms.

### 3.2 Information collected automatically

- Usage telemetry: pages viewed, features used, errors encountered, performance metrics. Anonymized where possible.
- Device and connection: IP address, browser, OS, language.
- Cookies and similar technologies: see §10.

### 3.3 Information from third parties

- OAuth providers (Google, GitHub) when you sign in: email, profile name, avatar URL.
- Cloud Sync sources you connect (Google Docs, Notion, Obsidian): only the documents and folders you authorize.

## 4. How we use information

We process personal information to:

- Provide and operate Seizn services (the lawful basis is performance of contract).
- Process subscriptions and billing (performance of contract).
- Send service notices, security alerts, and (with consent) product updates (consent or legitimate interest).
- Improve product quality and detect abuse (legitimate interest).
- Comply with legal obligations (tax, accounting, lawful requests).

We do not sell personal information. We do not use your authorial content to train foundation models. We do not share your authorial content with third parties for advertising or marketing purposes.

## 5. AI features and model providers

Seizn uses large language models to extract canon, detect conflicts, and simulate scenes. Provider routing depends on your settings:

- Default: requests go to providers selected by Seizn (currently Anthropic). The provider processes the request transiently; we do not persist content beyond what is required to deliver the response.
- BYOK (Bring Your Own Key): when you register your own API key, requests go directly to that provider under your account and billing relationship. Seizn passes the request through but does not retain the content; the provider's privacy policy applies.

Provider data retention follows each provider's published policy. We document the active providers and retention windows at seizn.com/docs/providers.

## 6. Sharing and third parties

We share personal information only with:

- Service providers acting on our instructions (subprocessors): Stripe (billing), Cloudflare (CDN, R2 object storage), Vercel (hosting), Sentry (error monitoring), PostHog or Plausible (privacy-respecting analytics), Anthropic (AI inference, default routing), Google or GitHub (OAuth sign-in only).
- Legal authorities when required by law (court order, subpoena, lawful request).
- Acquirers in the event of merger or acquisition, with prior notice.

A current list of subprocessors is maintained at seizn.com/docs/subprocessors.

## 7. Data residency

You may choose where your authorial content is stored at the workspace level:

- Seoul (default for Asia-Pacific accounts)
- Tokyo
- Frankfurt (EU residency for GDPR-sensitive accounts)

Account metadata, billing records, and operational logs are processed in the United States by Litheon LLC and our subprocessors. International transfers rely on Standard Contractual Clauses (SCCs) where applicable.

## 8. Security

- Encryption in transit (TLS 1.2+) and at rest (AES-256).
- Access controls: least-privilege, audit-logged.
- BYOK encryption secrets are stored separately from API keys.
- Regular dependency vulnerability scans (zero open critical advisories at launch).

No system is perfectly secure. If we detect a breach affecting personal information, we will notify affected users and supervisory authorities as required by GDPR, KISA, and applicable law.

## 9. Your rights

Depending on your jurisdiction, you may have the right to:

- Access the personal information we hold about you.
- Correct inaccurate information.
- Export your authorial content (always available via Settings → Export, no request needed).
- Delete your account and associated data (Settings → Account → Delete; processed within 30 days, subject to legal retention requirements).
- Restrict or object to processing.
- Withdraw consent at any time.
- Lodge a complaint with your local supervisory authority (e.g., KISA in Korea, PPC in Japan, CAC in China, EU Data Protection Authorities, CCPA-covered residents in California).

To exercise rights not available in-app, contact privacy@seizn.com. We respond within 30 days.

## 10. Cookies and telemetry

We use a minimal set of cookies: session, CSRF token, locale preference, and (if accepted) analytics. You can decline analytics in the cookie banner without losing functionality. We do not use third-party advertising cookies.

## 11. Children

Seizn is not directed at children. We do not knowingly process personal information of users under 16. If you believe a minor has created an account, contact privacy@seizn.com and we will delete the account.

## 12. International transfers

Seizn operates globally. Data may be processed in the United States, Korea, Japan, Germany, and other jurisdictions where our subprocessors operate. Where required, we rely on SCCs, adequacy decisions, or your explicit consent.

## 13. Retention

- Account and content: retained until you delete your account.
- Billing records: retained 7 years for tax and accounting compliance.
- Usage telemetry: retained 13 months in identifiable form, longer in aggregate form.
- Audit logs (canon decisions, AI candidate reviews): retained for the lifetime of the workspace; exportable on request.

## 14. Changes to this policy

We may update this policy. Material changes will be announced by email and an in-app banner at least 30 days before they take effect. Historical versions remain available at seizn.com/legal/privacy/history.

## 15. Contact

- Privacy questions: privacy@seizn.com
- Data protection officer: dpo@seizn.com
- Postal: Litheon LLC, [Wyoming registered agent address — TBD before launch]

---

*Status: draft pending lawyer review. Operational binding from launch date. Until lawyer review, this document represents the controller's good-faith interpretation of applicable law.*
