import os
from supabase import create_client

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
    raise SystemExit("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY")

sb = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

# Example: pull last N feedback events
N = int(os.environ.get("LIMIT", "500"))
res = sb.table("fall_retrieval_feedback").select("*").order("created_at", desc=True).limit(N).execute()
print("rows:", len(res.data))

# TODO:
# - join with fall_retrieval_traces by request_id
# - build pairwise dataset (query, positive, negatives)
# - write to parquet/csv
