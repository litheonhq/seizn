#!/usr/bin/env python3
"""
Seizn Stripe Meter Provisioning (2026-04-21 Stage 01)

Creates two Stripe Billing Meters and two monthly metered prices:
  - memories overage: $0.05 / 1K memories
  - ops overage:      $0.01 / 1K operations

The app reports raw overage units. Stripe price transform_quantity divides
reported quantity by 1,000 and rounds up for billing.
"""

import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request


STRIPE_API = "https://api.stripe.com/v1"

METERED_PRODUCT = {
    "lookup_key": "seizn_metered_overage",
    "name": "Seizn Metered Overage",
    "description": "Usage-based overage for Studio and Pro subscriptions.",
}

METERS = [
    {
        "id": "memories",
        "display_name": "Seizn memories overage",
        "event_name": "seizn_memories_overage",
        "unit_amount_cents": 5,
        "lookup_key": "seizn_memories_overage_1k_monthly",
        "env_meter": "STRIPE_METER_ID_MEMORIES",
        "env_price": "STRIPE_METERED_PRICE_ID_MEMORIES",
    },
    {
        "id": "ops",
        "display_name": "Seizn ops overage",
        "event_name": "seizn_ops_overage",
        "unit_amount_cents": 1,
        "lookup_key": "seizn_ops_overage_1k_monthly",
        "env_meter": "STRIPE_METER_ID_OPS",
        "env_price": "STRIPE_METERED_PRICE_ID_OPS",
    },
]


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
        with urllib.request.urlopen(req, timeout=20) as response:
            return json.loads(response.read())
    except urllib.error.HTTPError as exc:
        message = exc.read().decode(errors="replace")
        raise RuntimeError(f"Stripe {method} {path} failed: {exc.code} {message}") from exc


def ensure_product(sk: str) -> dict:
    lookup_key = METERED_PRODUCT["lookup_key"]
    query = urllib.parse.quote(f'metadata["lookup_key"]:"{lookup_key}" AND active:"true"')
    search = stripe_request(sk, "GET", f"/products/search?query={query}")
    if search.get("data"):
        product = search["data"][0]
        print(f"  [reuse] product {product['id']} ({product['name']})")
        return product

    product = stripe_request(sk, "POST", "/products", {
        "name": METERED_PRODUCT["name"],
        "description": METERED_PRODUCT["description"],
        "metadata[lookup_key]": lookup_key,
    })
    print(f"  [create] product {product['id']} ({product['name']})")
    return product


def list_meters(sk: str) -> list[dict]:
    meters: list[dict] = []
    path = "/billing/meters?limit=100"
    while True:
        page = stripe_request(sk, "GET", path)
        meters.extend(page.get("data", []))
        if not page.get("has_more") or not page.get("data"):
            return meters
        last_id = page["data"][-1]["id"]
        path = f"/billing/meters?limit=100&starting_after={urllib.parse.quote(last_id)}"


def ensure_meter(sk: str, spec: dict) -> dict:
    for meter in list_meters(sk):
        if meter.get("event_name") == spec["event_name"]:
            print(f"  [reuse] meter {meter['id']} ({spec['event_name']})")
            return meter

    meter = stripe_request(sk, "POST", "/billing/meters", {
        "display_name": spec["display_name"],
        "event_name": spec["event_name"],
        "default_aggregation[formula]": "sum",
        "customer_mapping[type]": "by_id",
        "customer_mapping[event_payload_key]": "stripe_customer_id",
        "value_settings[event_payload_key]": "value",
    })
    print(f"  [create] meter {meter['id']} ({spec['event_name']})")
    return meter


def ensure_price(sk: str, product_id: str, meter_id: str, spec: dict) -> dict:
    lookup_key = spec["lookup_key"]
    query = urllib.parse.quote(f'lookup_key:"{lookup_key}" AND active:"true"')
    search = stripe_request(sk, "GET", f"/prices/search?query={query}")
    if search.get("data"):
        price = search["data"][0]
        print(f"  [reuse] price {price['id']} ({lookup_key})")
        return price

    price = stripe_request(sk, "POST", "/prices", {
        "product": product_id,
        "currency": "usd",
        "unit_amount": spec["unit_amount_cents"],
        "recurring[interval]": "month",
        "recurring[usage_type]": "metered",
        "recurring[meter]": meter_id,
        "transform_quantity[divide_by]": 1000,
        "transform_quantity[round]": "up",
        "lookup_key": lookup_key,
        "nickname": spec["display_name"],
        "metadata[usage_dimension]": spec["id"],
        "metadata[unit]": "1000",
    })
    print(f"  [create] price {price['id']} ${spec['unit_amount_cents']/100:.2f} / 1K")
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
        print("!! LIVE MODE: meters and prices affect real subscriptions !!")
        reply = input("Continue? type 'yes' to proceed: ").strip().lower()
        if reply != "yes":
            print("Aborted.")
            return 0

    print()
    product = ensure_product(sk)
    env_block: list[tuple[str, str]] = []

    for spec in METERS:
        print(f"=== {spec['display_name']} ===")
        meter = ensure_meter(sk, spec)
        price = ensure_price(sk, product["id"], meter["id"], spec)
        env_block.append((spec["env_meter"], meter["id"]))
        env_block.append((spec["env_price"], price["id"]))
        print()

    print("=" * 60)
    print("Add these to .env.litheon and Vercel Production env:")
    print("=" * 60)
    for key, value in env_block:
        print(f"{key}={value}")
    print()
    print("Keep STRIPE_SECRET_KEY configured in Vercel Production.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
