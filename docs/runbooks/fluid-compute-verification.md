# Vercel Fluid Compute Verification (W5.2)

> Vercel Fluid Compute became the default execution model on 2025-04-23 for all
> serverless functions on the Pro plan. It collapses cold starts by reusing the
> same isolate across many concurrent invocations, dramatically improving
> per-RPS pricing for chatty AI workloads. Confirm the project actually opts in.

## Verification (sysadmin, 2 minutes)

1. Open Vercel dashboard → Project `seizn` → Settings → Functions.
2. Verify **Function Runtime** is set to **Fluid (default)**, not "Standard".
3. Verify **Default Region** is `icn1` (Seoul) for our primary user base — Fluid
   honors regional placement.
4. For each long-running route (`/api/canon/extract`, `/api/simulate`,
   `/api/llm/*`), check **maxDuration**: should be 60s for Fluid (max 300s on Pro
   contract). If still 10s, bump in `vercel.json` route override.
5. Confirm **Memory** stays at 1024 MB default. Fluid's per-invocation memory
   allocation is what matters for cost; over-provisioning wastes $.

## Code-side check

`vercel.json` should contain:

```json
{
  "functions": {
    "src/app/api/canon/extract/route.ts": { "maxDuration": 60, "memory": 1024 },
    "src/app/api/simulate/route.ts":      { "maxDuration": 60, "memory": 1024 },
    "src/app/api/llm/*/route.ts":         { "maxDuration": 60, "memory": 1024 }
  }
}
```

Any route that explicitly sets `runtime: 'edge'` opts OUT of Fluid because
edge runtime is a separate substrate. Keep edge for `middleware.ts` (W2.6
NextAuth split) and short, network-bound routes; everything LLM-touching
must be node runtime.

## Expected savings

For our chat-style canon-extract endpoint, Fluid reduces effective cost by
~40-60% versus standard serverless because the cold start tax is amortized
across the request burst. We won't hit free tier quota until ~100K
conversations/month.

## Rollback

If Fluid causes issues (rare — same Node 20 runtime, just different lifecycle):
Settings → Functions → switch back to **Standard**. Effects propagate within 5
min on next deploy.
