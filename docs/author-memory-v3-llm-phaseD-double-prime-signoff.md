# Author Memory v3 LLM Phase D Double-Prime Signoff

Generated: 2026-05-03
Branch: `feat/npc-memory-pivot`
Scope: Phase D double-prime Designer Round 2.1 landing implementation from `docs/architecture/seizn-author-phase-d-double-prime-handoff.md`.

## Summary

- Rebuilt the Author landing as split React sections matching the Designer Round 2.1 bundle.
- Added the monochrome slate token system, signal colors, and global font loading for Pretendard, Source Serif 4, and JetBrains Mono.
- Replaced the old cyan landing treatment with the new ink/signal token vocabulary across landing and pricing surfaces.
- Added Mark A brand assets, favicon metadata, and shared nav/footer lockup SVG references.
- Kept the engine surface strip gated behind `NEXT_PUBLIC_ENGINE_SURFACE_LIVE=1`; default production and local build behavior remains hidden.
- Aligned pricing copy and cadence presentation across the landing and pricing route.
- Added viewport, accessibility, token, route, favicon, env-gate, detector-seed, and public-copy regression coverage.
- Preview deployment was not run. Preview deployments are prohibited.

## Acceptance

- [x] Hero B split layout is implemented with dark left copy and light detector panel.
- [x] Workflow, Inputs, Conflicts, Simulation, Trust, Pricing, FAQ, Footer, and EngineTease sections are split into typed React components.
- [x] The detector seed uses `Han Iseul transfers to Class 2 on day 9.` against `character.han_iseul.class = 1`.
- [x] Trust copy uses `Workspace-isolated`; public FAQ copy excludes the internal CI-grep wording.
- [x] Pricing uses Indie and Pro full cards, Pro dark highlight, and Studio/Enterprise slim rows.
- [x] Studio and Enterprise cadence copy matches the Designer Round 2.1 decision.
- [x] 360 px, 768 px, and 1440 px viewports have zero horizontal overflow.
- [x] Mobile and tablet render the character strip and vertical plan picker; desktop keeps the full split hero and graph treatment.
- [x] EngineTease is hidden by default and covered by env-gate tests.
- [x] Mark A SVG assets are registered through Next.js metadata and used by nav/footer lockups.
- [x] Public KNOT separation guard passed with 0 matches across the configured source and build-output scopes.

## Verification

- `npm run typecheck` - passed.
- `npm run test:run -- src/__tests__/landing/author-landing.test.ts src/__tests__/billing/checkout-button-legal.test.tsx` - passed, 2 files, 16 tests.
- `npm run test:run` - passed, 138 files, 1163 passed, 16 skipped.
- `npm run lint` - passed with one existing Next.js warning for custom font links in `src/app/[locale]/layout.tsx`.
- `npm run build` - passed.
- `npm run verify:knot-separation` - passed, 0 matches across the configured source and `.next` output scopes.
- `rg -n "cyan-(300|500|600|700|900)|bg-cyan|text-cyan|border-cyan|shadow-cyan|from-cyan|to-cyan" src/components/landing src/app/[locale]/page.tsx src/app/[locale]/pricing` - no matches.
- `rg -n "\bKNOT\b|KNOT-isolated|CI grep" src/components/landing src/app/[locale]/page.tsx src/app/[locale]/pricing public` - no matches.
- `git diff --check` - passed.
- Lighthouse accessibility: `reports/phaseD-double-prime-lighthouse-en-accessibility.json` - score 1.00, no failed audits.
- Viewport check: `reports/phaseD-double-prime-viewport-check.json` - 1440, 768, and 360 px checks passed with overflow 0.

## Visual Artifacts

- `reports/phaseD-double-prime-landing-en-1440.png`
- `reports/phaseD-double-prime-landing-en-768.png`
- `reports/phaseD-double-prime-landing-en-360.png`
- `reports/phaseD-double-prime-favicon-scale.png`
- `reports/phaseD-double-prime-lighthouse-en-accessibility.json`
- `reports/phaseD-double-prime-viewport-check.json`

## Files Changed

- `docs/author-memory-v3-llm-phaseD-double-prime-signoff.md`
- `public/icons/seizn-mark.svg`
- `public/icons/seizn-mark-16.svg`
- `reports/phaseD-double-prime-favicon-scale.png`
- `reports/phaseD-double-prime-landing-en-1440.png`
- `reports/phaseD-double-prime-landing-en-768.png`
- `reports/phaseD-double-prime-landing-en-360.png`
- `reports/phaseD-double-prime-lighthouse-en-accessibility.json`
- `reports/phaseD-double-prime-viewport-check.json`
- `src/__tests__/landing/author-landing.test.ts`
- `src/app/[locale]/layout.tsx`
- `src/app/[locale]/pricing/page.tsx`
- `src/app/[locale]/pricing/pricing-client.tsx`
- `src/app/globals.css`
- `src/app/icon.svg`
- `src/app/layout.tsx`
- `src/components/checkout-button.tsx`
- `src/components/landing/author-flagship-landing.tsx`
- `src/components/landing/author-landing-copy.ts`
- `src/components/landing/brand-marks.tsx`
- `src/components/landing/canon-graph.tsx`
- `src/components/landing/conflict-detector.tsx`
- `src/components/landing/engine-tease.tsx`
- `src/components/landing/hero-split-detector.tsx`
- `src/components/landing/section-conflicts.tsx`
- `src/components/landing/section-faq.tsx`
- `src/components/landing/section-footer.tsx`
- `src/components/landing/section-header.tsx`
- `src/components/landing/section-inputs.tsx`
- `src/components/landing/section-pricing.tsx`
- `src/components/landing/section-simulation.tsx`
- `src/components/landing/section-trust.tsx`
- `src/components/landing/section-workflow.tsx`
- `src/styles/tokens.css`
