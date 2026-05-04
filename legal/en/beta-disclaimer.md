---
doc_type: beta-disclaimer
language: en
version: v1
generated_at: 2026-05-02
status: draft (lawyer review pending)
master: true
applies_to: seizn.com (Author flagship), engine.seizn.com (NPC SDK surface)
beta_until: 2026-08-31
data_controller: Litheon LLC, Wyoming, USA
---

# Beta Disclaimer

Last updated: 2026-05-02

## 1. What this disclaimer covers

Seizn is currently offered as a beta service. This document explains, in plain language, how the beta period differs from a full production launch — specifically with regard to infrastructure ownership and what that means for your data.

## 2. Why this disclaimer exists

We want you to know exactly where your data lives and who can touch it during beta. We are publishing this document instead of burying the information inside the Privacy Policy, because we think transparency at the start matters more than legal minimalism.

## 3. The core fact

> This service operates under a beta period until 2026-08-31 (the 'Beta Period'). During the Beta Period, certain infrastructure components — specifically file storage (Cloudflare R2) and payment-processing intermediation — operate under temporary personal ownership of iruhana25@gmail.com (the 'Operator'), pending migration to Litheon LLC, the legal data controller. Throughout the Beta Period and after, Litheon LLC remains the sole data controller; your data is processed solely for providing Seizn Author services. You may export or delete your data at any time.

## 4. What is on personal ownership during beta

| Component | Owner during beta | Migration target | Migration trigger |
|---|---|---|---|
| Cloudflare R2 storage bucket (`seizn-author-uploads-temp`) | Personal Cloudflare account of the Operator | Litheon LLC Cloudflare account, new bucket `seizn-author-uploads` | Sufficient revenue to fund Mercury initial deposit; planned by 2026-06-30 |
| Subscription billing (Stripe) | Litheon LLC (already on the entity) | n/a — already on Litheon LLC | n/a |
| AI inference (default Anthropic) | Litheon LLC API key | n/a | n/a |
| Application hosting (Vercel) | Litheon LLC team | n/a | n/a |
| Authentication (NextAuth, Google, GitHub) | Litheon LLC OAuth apps | n/a | n/a |

In practical terms: only the file-storage layer and any incidental Cloudflare access tokens are temporarily on a personal account. Everything else (billing, code, AI, auth, monitoring) is already on Litheon LLC.

## 5. Why personal ownership is necessary, briefly

Litheon LLC is a US Wyoming entity. Cloudflare R2 enterprise activation under a fresh entity requires a US-based corporate card, which in turn requires Mercury (or equivalent) banking activation, which requires an initial deposit. Until that initial deposit clears, we cannot create a Litheon-owned R2 bucket. Rather than delay launch, we operate a temporary bucket under the Operator's personal Cloudflare account during beta. This is documented internally at `docs/migrations/20260502-r2-litheon-migration.md` for audit purposes.

## 6. What this means for you

- **Data controller is unchanged**: Litheon LLC is the sole legal data controller throughout the Beta Period. The Operator does not have a separate legal relationship with you.
- **Access is least-privilege**: only the operational scripts and the Operator (in a service capacity) can access the storage bucket. No human read access is performed except for support requests you initiate.
- **Encryption applies**: all uploads are encrypted in transit and at rest, regardless of which Cloudflare account holds the bucket.
- **You can export anytime**: Settings → Export. No request needed.
- **You can delete anytime**: Settings → Account → Delete. Your data is purged within 30 days of confirmation.
- **Migration is auditable**: when we migrate to a Litheon-owned bucket, we publish a SHA-256 integrity report so you can verify nothing was altered or lost. Reports go to seizn.com/docs/migrations.

## 7. End of Beta Period

The Beta Period ends on 2026-08-31, or earlier when the migration to Litheon-owned storage is complete and verified — whichever comes first.

If migration is delayed past 2026-08-31, we will:

1. Publish a status update at seizn.com/blog with the new target date.
2. Email all active accounts within 7 days of the original deadline.
3. Continue to honor all data rights and contractual obligations.

## 8. What changes after beta

- The temporary bucket is deleted after the Litheon-owned bucket is verified and the migration report is published.
- The Operator no longer holds any infrastructure access tokens; all credentials are rotated to Litheon LLC.
- This Beta Disclaimer is archived; ongoing operations are governed solely by the Privacy Policy and Terms of Service.

## 9. Your options if you are not comfortable with beta terms

You may:

- Wait until the post-beta launch (planned for 2026-08-31 or earlier) to sign up.
- Sign up now and export or delete your account at any time during beta.
- Contact privacy@seizn.com with specific concerns.

We respect either choice and will not penalize a wait-and-see approach.

## 10. Contact

- Beta questions: beta@seizn.com
- Privacy: privacy@seizn.com
- Operator (transparency channel): iruhana25@gmail.com

---

*This disclaimer is binding for the Beta Period. Status: draft pending lawyer review. Operational binding from launch date.*
