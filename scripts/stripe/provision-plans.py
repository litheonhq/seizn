#!/usr/bin/env python3
"""
Seizn Stripe Plan Provisioning (2026-04-21 5-tier refactor)

Creates 4 Products (Indie, Studio, Pro, Enterprise) and 8 Prices
(monthly + yearly for each), prints the resulting price IDs as an
env-var block you can paste into .env.litheon + Vercel env.

Free tier has no Stripe price (no billing).

Usage (PowerShell):
    $env:STRIPE_SECRET_KEY = "<sk_live_or_sk_test_xxx>"
    python scripts/stripe/provision-plans.py

Re-running is idempotent-ish: existing products with the same lookup_key
are reused; new prices are created each run (Stripe prices are immutable,
so to "update" a price you create a new one and archive the old).

Exit codes:
    0 success
    1 missing STRIPE_SECRET_KEY
    2 Stripe API error
"""

import json
import os
import sys
import urllib.parse
import urllib.request
import urllib.error


# --- Plan catalog (cents, USD) ---
# Yearly = 15% discount on monthly*12 (rounded to whole dollars for clean invoicing).
PLANS = [
    {
        "id": "indie",
        "name": "Seizn Indie",
        "description": "Indie/solo tier. 100K memories, 100K ops/mo, 3 projects.",
        "monthly_cents": 3900,
        "yearly_cents": 39780,   # $39 * 12 * 0.85
        "env_monthly": "STRIPE_PRICE_ID_INDIE_MONTHLY",
        "env_yearly": "STRIPE_PRICE_ID_INDIE_YEARLY",
    },
    {
        "id": "studio",
        "name": "Seizn Studio",
        "description": "Studio tier. 500K memories, 500K ops/mo, 10 projects. Direct support.",
        "monthly_cents": 29900,
        "yearly_cents": 304980,  # $299 * 12 * 0.85
        "env_monthly": "STRIPE_PRICE_ID_STUDIO_MONTHLY",
        "env_yearly": "STRIPE_PRICE_ID_STUDIO_YEARLY",
    },
    {
        "id": "pro",
        "name": "Seizn Pro",
        "description": "Pro tier. 5M memories, unlimited ops, SLA. Moderation/ToM/scenes on by default.",
        "monthly_cents": 99900,
        "yearly_cents": 1018980,  # $999 * 12 * 0.85
        "env_monthly": "STRIPE_PRICE_ID_PRO_MONTHLY",
        "env_yearly": "STRIPE_PRICE_ID_PRO_YEARLY",
    },
    {
        "id": "enterprise",
        "name": "Seizn Enterprise",
        "description": "Enterprise tier. From $2,500/mo + usage. Self-host, SSO, DPA.",
        "monthly_cents": 250000,
        "yearly_cents": 3000000,
        "env_monthly": "STRIPE_PRICE_ID_ENTERPRISE_MONTHLY",
        "env_yearly": "STRIPE_PRICE_ID_ENTERPRISE_YEARLY",
    },
]

STRIPE_API = "https://api.stripe.com/v1"


def stripe_request(sk: str, method: str, path: str, body: dict | None = None) -> dict:
    url = STRIPE_API + path
    data = urllib.parse.urlencode(body).encode() if body else None
    req = urllib.request.Request(
        url,
        data=data,
        method=method,
        headers={
            "Authorization": f"Bearer {sk}",
            "Content-Type": "application/x-www-form-urlencoded",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        msg = e.read().decode(errors="replace")
        raise RuntimeError(f"Stripe {method} {path} failed: {e.code} {msg}") from e


def ensure_product(sk: str, plan: dict) -> dict:
    """Find product by lookup key (its id) or create it."""
    lookup_key = f"seizn_{plan['id']}"
    # Search for existing by metadata lookup_key (Stripe lets us search products)
    search = stripe_request(
        sk, "GET",
        f"/products/search?query={urllib.parse.quote(f'metadata[\"lookup_key\"]:\"{lookup_key}\" AND active:\"true\"')}"
    )
    if search.get("data"):
        product = search["data"][0]
        print(f"  [reuse] product {product['id']} ({product['name']})")
        return product

    product = stripe_request(sk, "POST", "/products", {
        "name": plan["name"],
        "description": plan["description"],
        "metadata[lookup_key]": lookup_key,
        "metadata[plan_id]": plan["id"],
    })
    print(f"  [create] product {product['id']} ({product['name']})")
    return product


def create_price(sk: str, product_id: str, plan_id: str, cents: int, cadence: str) -> dict:
    interval = "month" if cadence == "monthly" else "year"
    price = stripe_request(sk, "POST", "/prices", {
        "product": product_id,
        "unit_amount": cents,
        "currency": "usd",
        "recurring[interval]": interval,
        "metadata[plan_id]": plan_id,
        "metadata[cadence]": cadence,
    })
    print(f"  [create] price {price['id']}  ${cents/100:.2f} / {interval}")
    return price


def main() -> int:
    sk = os.environ.get("STRIPE_SECRET_KEY") or os.environ.get("STRIPE_SECRET_KEY_SEIZN")
    if not sk:
        print("ERROR: set STRIPE_SECRET_KEY env var first", file=sys.stderr)
        return 1
    if not sk.startswith(("sk_live_", "sk_test_")):
        print(f"ERROR: STRIPE_SECRET_KEY should start with sk_live_ or sk_test_ (got {sk[:8]}...)", file=sys.stderr)
        return 1

    is_live = sk.startswith("sk_live_")
    print(f"Stripe mode: {'LIVE' if is_live else 'TEST'}")
    if is_live:
        print("!! LIVE MODE — prices will be charged against real customers !!")
        reply = input("Continue? type 'yes' to proceed: ").strip().lower()
        if reply != "yes":
            print("Aborted.")
            return 0

    print()
    env_block: list[tuple[str, str]] = []
    for plan in PLANS:
        print(f"=== {plan['name']} ({plan['id']}) ===")
        product = ensure_product(sk, plan)
        monthly = create_price(sk, product["id"], plan["id"], plan["monthly_cents"], "monthly")
        yearly = create_price(sk, product["id"], plan["id"], plan["yearly_cents"], "yearly")
        env_block.append((plan["env_monthly"], monthly["id"]))
        env_block.append((plan["env_yearly"], yearly["id"]))
        print()

    print("=" * 60)
    print("Add these to .env.litheon AND Vercel env (prod + preview):")
    print("=" * 60)
    for key, value in env_block:
        print(f"{key}={value}")
    print()
    print("Also set STRIPE_SECRET_KEY in Vercel env if not already present.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
