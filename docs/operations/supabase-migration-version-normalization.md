# Supabase Migration Version Normalization

## Goal
- Remove numeric-prefix collisions in `supabase/migrations` so `supabase db push --dry-run` works without `--include-all` or history ambiguity.
- Make each migration file map to a unique version in `supabase_migrations.schema_migrations`.

## Problem Pattern
- Existing files reused the same numeric version prefix, for example:
  - `20260204_admin_audit_events.sql`
  - `20260204_auto_eval_system.sql`
  - ...
- Supabase CLI interprets version from filename prefix and cannot reliably resolve multiple files under one version key.

## Normalization Rule
- For each collision group, assign deterministic sequence versions:
  - First file: `<base>001`
  - Second file: `<base>002`
  - ...
- Example:
  - `20260222_001_companion_meta_and_analytics.sql` -> `20260222001_001_companion_meta_and_analytics.sql`
  - `20260222_002_fix_search_path_mutable.sql` -> `20260222002_002_fix_search_path_mutable.sql`

## Tooling
- Script: `scripts/normalize-migration-versions.mjs`
- Preserve map used for deterministic base selection in mixed legacy groups:
  - `scripts/migration-version-preserve-map.json`

## Remote History Sync Procedure
1. Rename local files to normalized versions.
2. Remove legacy base versions in remote history:
   - `supabase migration repair --status reverted <base_versions...>`
3. Mark normalized versions as applied:
   - `supabase migration repair --status applied <normalized_versions...>`
4. Verify:
   - `supabase db push --dry-run --db-url <POSTGRES_URL_NON_POOLING>`
   - Expected: `Remote database is up to date.`

## Validation Snapshot
- Local versions: 146
- Remote versions: 146
- Missing local/remote versions: 0 / 0
- `supabase db push --dry-run`: pass

## Rollback
If you must revert to legacy naming:
1. Rename files back to original names.
2. `repair --status reverted` for normalized versions.
3. `repair --status applied` for legacy versions.
4. Re-run `db push --dry-run`.
