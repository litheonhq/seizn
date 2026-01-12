#!/usr/bin/env bash
set -euo pipefail

# Usage:
#   SEIZN_HOST=http://localhost:3000 SEIZN_API_KEY=... ./scripts/smoke-test-summer.sh

HOST="${SEIZN_HOST:-http://localhost:3000}"
API_KEY="${SEIZN_API_KEY:-}"

if [[ -z "$API_KEY" ]]; then
  echo "SEIZN_API_KEY is required" >&2
  exit 1
fi

function json_get() {
  # json_get '<json_string>' 'path.like.this'
  node -e "const o=JSON.parse(process.argv[1]); const path=process.argv[2].split('.'); let v=o; for (const k of path) v=v?.[k]; if (!v) process.exit(2); process.stdout.write(String(v));" "$1" "$2"
}

echo "[1/3] Create collection"
CREATE_RES=$(curl -sS -X POST "$HOST/api/summer/collections" \
  -H "x-api-key: $API_KEY" \
  -H "content-type: application/json" \
  -d '{"name":"smoke-test","description":"created by smoke-test"}')

COLLECTION_ID=$(json_get "$CREATE_RES" "collection.id" || true)
if [[ -z "$COLLECTION_ID" ]]; then
  echo "Failed to create collection" >&2
  echo "$CREATE_RES" >&2
  exit 1
fi

echo "  collection_id=$COLLECTION_ID"

echo "[2/3] Index document"
INDEX_RES=$(curl -sS -X POST "$HOST/api/summer/index" \
  -H "x-api-key: $API_KEY" \
  -H "content-type: application/json" \
  -d @- <<JSON
{
  "collection_id": "$COLLECTION_ID",
  "documents": [
    {
      "external_id": "doc-1",
      "title": "Hello Summer",
      "source": "smoke-test",
      "content": "Seizn Summer is a retrieval gateway. It supports vector search, hybrid search, and optional reranking."
    }
  ]
}
JSON
)

SUCCESS=$(json_get "$INDEX_RES" "success" || true)
if [[ "$SUCCESS" != "true" ]]; then
  echo "Index failed" >&2
  echo "$INDEX_RES" >&2
  exit 1
fi

echo "[3/3] Retrieve"
RETRIEVE_RES=$(curl -sS -X POST "$HOST/api/summer/retrieve" \
  -H "x-api-key: $API_KEY" \
  -H "content-type: application/json" \
  -d @- <<JSON
{
  "collection_id": "$COLLECTION_ID",
  "query": "What is Seizn Summer?",
  "include_trace": true
}
JSON
)

SUCCESS=$(json_get "$RETRIEVE_RES" "success" || true)
if [[ "$SUCCESS" != "true" ]]; then
  echo "Retrieve failed" >&2
  echo "$RETRIEVE_RES" >&2
  exit 1
fi

echo "OK"
