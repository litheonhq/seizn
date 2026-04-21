#!/usr/bin/env python3
"""
Create the Seizn Design Partner coupon in Stripe.

Coupon:
  id: SEIZN_DP_2026
  discount: 66% off
  duration: repeating for 12 months
  max redemptions: 10

Usage (PowerShell):
  $env:STRIPE_SECRET_KEY = "<sk_live_or_sk_test_xxx>"
  python scripts/stripe/create-dp-coupon.py
"""

import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request


STRIPE_API = "https://api.stripe.com/v1"
COUPON_ID = "SEIZN_DP_2026"


def stripe_request(secret_key: str, method: str, path: str, body: dict | None = None) -> dict:
    data = urllib.parse.urlencode(body).encode() if body else None
    req = urllib.request.Request(
        STRIPE_API + path,
        data=data,
        method=method,
        headers={
            "Authorization": f"Bearer {secret_key}",
            "Content-Type": "application/x-www-form-urlencoded",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as response:
            return json.loads(response.read())
    except urllib.error.HTTPError as exc:
        payload = exc.read().decode(errors="replace")
        raise RuntimeError(f"Stripe {method} {path} failed: {exc.code} {payload}") from exc


def get_existing_coupon(secret_key: str) -> dict | None:
    try:
        return stripe_request(secret_key, "GET", f"/coupons/{urllib.parse.quote(COUPON_ID)}")
    except RuntimeError as exc:
        if "No such coupon" in str(exc) or "resource_missing" in str(exc):
            return None
        raise


def create_coupon(secret_key: str) -> dict:
    body = {
        "id": COUPON_ID,
        "name": "Seizn Design Partner 2026",
        "percent_off": 66,
        "duration": "repeating",
        "duration_in_months": 12,
        "max_redemptions": 10,
        "metadata[program]": "design_partners",
        "metadata[year]": "2026",
    }
    studio_product_id = os.environ.get("STRIPE_PRODUCT_ID_STUDIO")
    if studio_product_id:
        body["applies_to[products][0]"] = studio_product_id

    return stripe_request(
        secret_key,
        "POST",
        "/coupons",
        body,
    )


def main() -> int:
    secret_key = os.environ.get("STRIPE_SECRET_KEY") or os.environ.get("STRIPE_SECRET_KEY_SEIZN")
    if not secret_key:
        print("ERROR: set STRIPE_SECRET_KEY first", file=sys.stderr)
        return 1
    if not secret_key.startswith(("sk_live_", "sk_test_")):
        print("ERROR: STRIPE_SECRET_KEY should start with sk_live_ or sk_test_", file=sys.stderr)
        return 1

    is_live = secret_key.startswith("sk_live_")
    print(f"Stripe mode: {'LIVE' if is_live else 'TEST'}")
    if is_live:
        print("LIVE MODE: this creates a real coupon usable by approved Studio customers.")
        reply = input("Continue? type 'yes' to proceed: ").strip().lower()
        if reply != "yes":
            print("Aborted.")
            return 0

    existing = get_existing_coupon(secret_key)
    if existing:
        print(f"[reuse] coupon {existing['id']}")
        print(f"percent_off={existing.get('percent_off')} duration={existing.get('duration')}")
        print(f"duration_in_months={existing.get('duration_in_months')} max_redemptions={existing.get('max_redemptions')}")
        return 0

    coupon = create_coupon(secret_key)
    print(f"[create] coupon {coupon['id']}")
    print("Add this env var to Vercel Production:")
    print(f"SEIZN_DESIGN_PARTNER_COUPON={coupon['id']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
