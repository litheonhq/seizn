# Seizn Stripe Provisioning

## provision-plans.py - 2026-04-21 5-tier refactor

Creates 4 Stripe Products (Indie, Studio, Pro, Enterprise) and 8 Prices
(monthly + yearly for each tier). Prints the env-var block to paste into
`.env.litheon` and Vercel Production env.

### Usage

**PowerShell:**
```powershell
$envPath = "C:\Users\admin\.env.litheon"
$lines = [System.IO.File]::ReadAllLines($envPath, [System.Text.Encoding]::UTF8)
$sk = ($lines | Where-Object { $_ -match '^STRIPE_SECRET_KEY=' })[0]
if (-not $sk) { Write-Host "STRIPE_SECRET_KEY not in env" -ForegroundColor Red; exit 1 }
$env:STRIPE_SECRET_KEY = $sk.Substring('STRIPE_SECRET_KEY='.Length).Trim('"').Trim("'").Trim()

cd C:\Users\admin\Projects\seizn-codex-clean
python scripts/stripe/provision-plans.py

$env:STRIPE_SECRET_KEY = $null
```

### Safety

- In `sk_live_*` mode, the script prompts `yes` before proceeding.
- Existing products with matching `metadata.lookup_key=seizn_<id>` are reused.
- Stripe prices are immutable; re-running creates new prices unless the script
  explicitly finds an existing active lookup key.

### After running

1. Copy the `STRIPE_PRICE_ID_*` block printed at the end.
2. Append to `.env.litheon` for local dev.
3. Paste into Vercel Project Settings Environment Variables for Production only.
4. Redeploy Vercel so `src/app/api/webhooks/stripe/route.ts` resolves incoming
   price IDs via `resolvePlanFromPriceId()`.

### Plan catalog

Source of truth: `src/lib/plan-limits.ts` and `src/lib/stripe-config.ts`.

| Plan | Monthly | Yearly (15% off) |
|---|---|---|
| Indie | $39 | $397.80 |
| Studio | $299 | $3,049.80 |
| Pro | $999 | $10,189.80 |
| Enterprise (floor) | $2,500 | $30,000 negotiated |

## provision-meters.py - 2026-04-21 Stage 01 overage billing

Creates two Stripe Billing Meters and two monthly metered prices:

| Dimension | Meter event | Price |
|---|---|---|
| Memories | `seizn_memories_overage` | $0.05 / 1K memories |
| Ops | `seizn_ops_overage` | $0.01 / 1K operations |

The app reports raw overage units to `/v1/billing/meter_events`; the Stripe
price divides usage by 1,000 and rounds up.

**PowerShell:**
```powershell
$envPath = "C:\Users\admin\.env.litheon"
$lines = [System.IO.File]::ReadAllLines($envPath, [System.Text.Encoding]::UTF8)
$sk = ($lines | Where-Object { $_ -match '^STRIPE_SECRET_KEY=' })[0]
if (-not $sk) { Write-Host "STRIPE_SECRET_KEY not in env" -ForegroundColor Red; exit 1 }
$env:STRIPE_SECRET_KEY = $sk.Substring('STRIPE_SECRET_KEY='.Length).Trim('"').Trim("'").Trim()

cd C:\Users\admin\Projects\seizn-codex-clean
python scripts/stripe/provision-meters.py

$env:STRIPE_SECRET_KEY = $null
```

Add the printed `STRIPE_METER_ID_*` and `STRIPE_METERED_PRICE_ID_*` values to
`.env.litheon` and Vercel Production env. The subscription webhook attaches
the metered prices to Studio/Pro subscriptions after successful checkout or
subscription creation.
