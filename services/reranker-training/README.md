# Domain-adaptive reranker training (scaffold)

Goal:
- Use online signals (click/accept/edits) to fine-tune a domain-specific reranker.
- Deploy per-tenant/per-domain versions safely (A/B gated).

This directory is intentionally a scaffold. Another AI can finish it.

## Data sources (Supabase)
- `fall_retrieval_traces` (candidates + context)
- `fall_retrieval_feedback` (click/accept)
- `fall_outcomes` (experiment-aware success events)

## Suggested dataset format
Pairwise labels for cross-encoder training:

| query | positive_text | negative_text | weight |
|------|---------------|---------------|--------|

Derive positives:
- accepted chunk_id
- thumb_up
- high-dwell click

Derive negatives:
- candidates shown but not clicked/accepted
- thumb_down

## Next steps (to implement)
1) Export join of traces + feedback into a flat dataset
2) Train a cross-encoder (e.g., sentence-transformers)
3) Evaluate on `fall_eval_datasets`
4) Deploy:
   - Host as a small inference service (fastapi)
   - Add a new `RerankProvider` in `src/lib/summer/rerank/*`
