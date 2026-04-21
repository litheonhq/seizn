# Seizn Stripe Provisioning

## provision-plans.py — 2026-04-21 5-tier refactor

Creates 4 Stripe Products (Indie, Studio, Pro, Enterprise) and 8 Prices
(monthly + yearly for each tier). Prints the env-var block to paste into
`.env.litheon` and Vercel env.

### Usage

**PowerShell:**
```powershell
# Load STRIPE_SECRET_KEY from .env.litheon
$envPath = "C:\Users\admin\.env.litheon"
$lines = [System.IO.File]::ReadAllLines($envPath, [System.Text.Encoding]::UTF8)
$sk = ($lines | Where-Object { $_ -match '^STRIPE_SECRET_KEY=' })[0]
if (-not $sk) { Write-Host "STRIPE_SECRET_KEY not in env" -ForegroundColor Red; exit 1 }
$env:STRIPE_SECRET_KEY = $sk.Substring('STRIPE_SECRET_KEY='.Length).Trim('"').Trim("'").Trim()

cd C:\Users\admin\Projects\seizn-codex-clean
python scripts/stripe/provision-plans.py

# Cleanup
$env:STRIPE_SECRET_KEY = $null
```

### Safety

- In `sk_live_*` mode, the script prompts `yes` before proceeding.
- Existing products with matching `metadata.lookup_key=seizn_<id>` are reused.
- Stripe prices are immutable — re-running creates NEW prices (old ones need manual archive in the Stripe dashboard).

### After running

1. Copy the `STRIPE_PRICE_ID_*` block printed at the end.
2. Append to `.env.litheon` (for local dev).
3. Paste into Vercel → Project Settings → Environment Variables (Production + Preview).
4. Redeploy Vercel — the webhook handler at `src/app/api/webhooks/stripe/route.ts`
   will resolve incoming price IDs via `resolvePlanFromPriceId()` which reads env.

### Plan catalog (source of truth: `src/lib/plan-limits.ts` + `src/lib/stripe-config.ts`)

| Plan | Monthly | Yearly (15% off) |
|---|---|---|
| Indie | $39 | $397.80 |
| Studio | $299 | $3,049.80 |
| Pro | $999 | $10,189.80 |
| Enterprise (floor) | $2,500 | $30,000 (negotiated) |
