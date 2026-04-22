# Compliance

Seizn compliance primitives cover subject-scoped consent, DSR export/delete jobs, deletion tombstones, and audit evidence for memory records.

## Consent

- `consent_records` stores subject, organization, age bracket, consent scopes, policy version, grant time, expiry, and revocation time.
- `/api/consent` records scoped consent.
- `/api/consent/[subjectId]` reads active consent.
- `/api/consent/[subjectId]/[scope]` revokes a scope and enqueues a delete job.
- `/[locale]/consent` provides draft English consent copy pending legal review.

Memory writes call the consent assertion path before storing subject data. `memory_storage` requires consent for under-13 subjects. `ai_training` requires explicit opt-in for every age bracket.

## DSR Jobs

- `/api/dsr/jobs` creates and lists export/delete jobs.
- `/api/dsr/jobs/[jobId]/status` returns job state and export links when available.
- `/api/cron/dsr-worker` processes queued jobs behind `CRON_SECRET`.

Exports collect subject-scoped rows into a private object-store artifact. Deletes remove subject-scoped records, write a tombstone, and attach a deletion certificate.

## Audit Evidence

DSR state transitions emit audit events. Delete jobs create `dsr_deletion_tombstones` with a certificate hash and row-count summary so compliance evidence survives data deletion.
