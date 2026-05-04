# Author Memory v3 R2 Litheon Migration Runbook

Date: 2026-05-02
Status: blocked-pending-litheon-r2-bucket
Owner: Codex
Scope: Move Author Memory v3 upload objects from the temporary personal R2 bucket to a Litheon-owned R2 bucket before external launch.

## Current Blockers

- Litheon-owned Cloudflare R2 bucket `seizn-author-uploads` is not confirmed yet.
- Target bucket credentials are not confirmed in the local Litheon env as `R2_AUTHOR_NEW_*`.
- The live `author_audit_log` migration is separately blocked by an invalid `POSTGRES_URL_NON_POOLING` value.

No raw credentials should be written into this document, git, logs, or memory.

## Required Target Env

Set these in the Litheon private env file only:

```text
R2_AUTHOR_NEW_ACCOUNT_ID=
R2_AUTHOR_NEW_ACCESS_KEY_ID=
R2_AUTHOR_NEW_SECRET_ACCESS_KEY=
R2_AUTHOR_NEW_BUCKET_NAME=seizn-author-uploads
R2_AUTHOR_NEW_REGION=auto
R2_AUTHOR_NEW_ENDPOINT=https://<account_id>.r2.cloudflarestorage.com
R2_AUTHOR_NEW_OWNER=litheon
```

The existing temporary source bucket remains configured through `R2_AUTHOR_ACCOUNT_ID`, `R2_AUTHOR_ACCESS_KEY_ID`, `R2_AUTHOR_SECRET_ACCESS_KEY`, and `R2_AUTHOR_BUCKET_NAME=seizn-author-uploads-temp`.

## Execution Sequence

1. User creates the Litheon-owned Cloudflare R2 bucket `seizn-author-uploads`.
2. User creates a target bucket API token with object read/write access.
3. User stores target values as `R2_AUTHOR_NEW_*` in `C:\Users\admin\.codex\private\consolidated\litheon.env`.
4. Codex runs a dry run:

   ```bash
   bash scripts/migrate-r2-to-litheon.sh
   ```

5. Codex executes the copy only after the dry run is clean:

   ```bash
   R2_MIGRATION_EXECUTE=1 bash scripts/migrate-r2-to-litheon.sh
   ```

6. Codex verifies SHA256 integrity:

   ```bash
   npx ts-node --project tsconfig.node.json scripts/verify-r2-integrity.ts --json docs/migrations/r2-integrity-report.json
   ```

7. After 100% integrity passes, Codex updates runtime env/code references from the temporary bucket to `seizn-author-uploads`.
8. Codex runs upload and signed-read smoke tests against the new bucket.
9. User deletes the temporary bucket only after two successful read/write verification passes.
10. Codex updates this runbook status to `completed` with timestamp, object count, and verification report path.

## Rollback

- Do not delete or mutate the source bucket during copy or verification.
- If integrity fails, keep runtime pointed at `seizn-author-uploads-temp`.
- Re-run the copy for the failed prefix or object set after resolving target permissions.
- Only switch runtime env after integrity and smoke tests are green.

## Accounting Note

If the temporary bucket incurred personal-account charges, record the transfer as personal-to-Litheon reimbursement, capital contribution, or interest-free loan according to the final accounting decision. Do not mix Celovin or personal production infrastructure into the external launch state.

## Completion Evidence Template

```text
Completed at:
Source bucket:
Target bucket:
Object count:
Total bytes:
Integrity report:
Runtime env updated:
Upload smoke:
Signed-read smoke:
Temporary bucket deletion:
Accounting treatment:
```
