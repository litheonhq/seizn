# Seizn Launch Decisions

## 2026-05-03 — Beta Disclaimer Lock

Status: locked for Phase A launch route implementation; lawyer review remains a separate cycle.

Decision:
- Publish Privacy Policy, Terms of Service, and Beta Disclosure from `legal/{en,ko,ja,zh}/` through localized legal routes.
- Keep beta infrastructure disclosure visible from checkout links, footer links, and the first dashboard entry banner.
- Store dashboard banner dismissal in the `seizn_beta_disclosure_dismissed` cookie so the notice appears once per browser.

Rationale:
- Stripe checkout and external author signup need visible Terms and Privacy links before payment intent creation.
- The beta storage ownership disclosure must be easy to inspect without blocking BYOK-only dogfood users.
- Litheon LLC remains the declared controller; lawyer review and full legal polish are tracked outside this implementation phase.
