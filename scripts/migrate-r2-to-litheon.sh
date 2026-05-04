#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  bash scripts/migrate-r2-to-litheon.sh [--prefix <object-prefix>]

Copies Author Memory v3 R2 objects from the temporary personal bucket to the
Litheon-owned bucket. The script is dry-run by default. Set
R2_MIGRATION_EXECUTE=1 to perform the copy.

Required source env:
  R2_AUTHOR_ACCOUNT_ID or R2_ACCOUNT_ID
  R2_AUTHOR_ACCESS_KEY_ID or R2_ACCESS_KEY_ID
  R2_AUTHOR_SECRET_ACCESS_KEY or R2_SECRET_ACCESS_KEY
  R2_AUTHOR_BUCKET_NAME or R2_AUTHOR_BUCKET or R2_BUCKET

Required target env:
  R2_AUTHOR_NEW_ACCOUNT_ID or R2_NEW_ACCOUNT_ID
  R2_AUTHOR_NEW_ACCESS_KEY_ID or R2_NEW_ACCESS_KEY_ID
  R2_AUTHOR_NEW_SECRET_ACCESS_KEY or R2_NEW_SECRET_ACCESS_KEY
  R2_AUTHOR_NEW_BUCKET_NAME or R2_AUTHOR_NEW_BUCKET or R2_NEW_BUCKET

Optional env:
  R2_AUTHOR_ENDPOINT / R2_ENDPOINT
  R2_AUTHOR_NEW_ENDPOINT / R2_NEW_ENDPOINT
  R2_MIGRATION_TRANSFERS=4
  R2_MIGRATION_CHECKERS=8
  R2_MIGRATION_EXECUTE=1
  R2_MIGRATION_SKIP_VERIFY=1
  R2_MIGRATION_REPORT=docs/migrations/r2-integrity-report.json
EOF
}

env_any() {
  local name
  for name in "$@"; do
    if [ -n "${!name:-}" ]; then
      printf '%s' "${!name}"
      return 0
    fi
  done
  return 1
}

require_env_any() {
  local value
  if ! value="$(env_any "$@")"; then
    printf 'Missing required env: %s\n' "$*" >&2
    exit 1
  fi
  printf '%s' "$value"
}

prefix=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    --prefix)
      if [ "$#" -lt 2 ]; then
        echo "--prefix requires a value" >&2
        exit 1
      fi
      prefix="${2#/}"
      shift 2
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      printf 'Unknown argument: %s\n' "$1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if ! command -v rclone >/dev/null 2>&1; then
  echo "rclone is required for R2 migration copy. Install rclone, then rerun this script." >&2
  exit 1
fi

source_account_id="$(require_env_any R2_AUTHOR_ACCOUNT_ID R2_ACCOUNT_ID)"
source_access_key_id="$(require_env_any R2_AUTHOR_ACCESS_KEY_ID R2_ACCESS_KEY_ID)"
source_secret_access_key="$(require_env_any R2_AUTHOR_SECRET_ACCESS_KEY R2_SECRET_ACCESS_KEY)"
source_bucket="$(require_env_any R2_AUTHOR_BUCKET_NAME R2_AUTHOR_BUCKET R2_BUCKET)"
source_endpoint="$(env_any R2_AUTHOR_ENDPOINT R2_ENDPOINT || true)"
if [ -z "$source_endpoint" ]; then
  source_endpoint="https://${source_account_id}.r2.cloudflarestorage.com"
fi

target_account_id="$(require_env_any R2_AUTHOR_NEW_ACCOUNT_ID R2_NEW_ACCOUNT_ID)"
target_access_key_id="$(require_env_any R2_AUTHOR_NEW_ACCESS_KEY_ID R2_NEW_ACCESS_KEY_ID)"
target_secret_access_key="$(require_env_any R2_AUTHOR_NEW_SECRET_ACCESS_KEY R2_NEW_SECRET_ACCESS_KEY)"
target_bucket="$(require_env_any R2_AUTHOR_NEW_BUCKET_NAME R2_AUTHOR_NEW_BUCKET R2_NEW_BUCKET_NAME R2_NEW_BUCKET R2_BUCKET_NEW)"
target_endpoint="$(env_any R2_AUTHOR_NEW_ENDPOINT R2_NEW_ENDPOINT || true)"
if [ -z "$target_endpoint" ]; then
  target_endpoint="https://${target_account_id}.r2.cloudflarestorage.com"
fi

if [ "$source_bucket" = "$target_bucket" ] && [ "$source_endpoint" = "$target_endpoint" ]; then
  echo "Source and target resolve to the same bucket and endpoint. Refusing to continue." >&2
  exit 1
fi

umask 077
tmpdir="$(mktemp -d)"
cleanup() {
  rm -rf "$tmpdir"
}
trap cleanup EXIT

config_file="$tmpdir/rclone.conf"
cat > "$config_file" <<EOF
[source]
type = s3
provider = Cloudflare
access_key_id = ${source_access_key_id}
secret_access_key = ${source_secret_access_key}
endpoint = ${source_endpoint}
acl = private
no_check_bucket = true

[target]
type = s3
provider = Cloudflare
access_key_id = ${target_access_key_id}
secret_access_key = ${target_secret_access_key}
endpoint = ${target_endpoint}
acl = private
no_check_bucket = true
EOF

source_path="source:${source_bucket}"
target_path="target:${target_bucket}"
if [ -n "$prefix" ]; then
  source_path="${source_path}/${prefix%/}"
  target_path="${target_path}/${prefix%/}"
fi

copy_args=(
  --config "$config_file"
  copy "$source_path" "$target_path"
  --s3-no-check-bucket
  --transfers "${R2_MIGRATION_TRANSFERS:-4}"
  --checkers "${R2_MIGRATION_CHECKERS:-8}"
  --metadata
)

if [ "${R2_MIGRATION_EXECUTE:-0}" != "1" ]; then
  echo "Dry run only. Set R2_MIGRATION_EXECUTE=1 to perform the copy."
  copy_args+=(--dry-run)
else
  echo "Executing R2 copy into the Litheon target bucket."
fi

rclone "${copy_args[@]}"

if [ "${R2_MIGRATION_EXECUTE:-0}" = "1" ] && [ "${R2_MIGRATION_SKIP_VERIFY:-0}" != "1" ]; then
  report_path="${R2_MIGRATION_REPORT:-docs/migrations/r2-integrity-report.json}"
  verify_args=(--json "$report_path")
  if [ -n "$prefix" ]; then
    verify_args+=(--prefix "$prefix")
  fi
  npx ts-node --project tsconfig.node.json scripts/verify-r2-integrity.ts "${verify_args[@]}"
fi
