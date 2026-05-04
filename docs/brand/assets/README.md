# Seizn Brand Assets — Dual Surface

Seizn operates two product surfaces with intentionally distinct visual identities. Use the asset family that matches the surface — never cross.

## Surface 1 — Author flagship (`seizn.com` · current W0–W6)

**Mark A — canon-graph node** (4 nodes + 4 edges, monochrome ink). Locked in Phase D″ (commit `1d3a3c49`) via Designer Round 1/2/2.1. Visual signature for the writer-facing AI memory product.

Runtime location: `public/`
- `public/seizn-icon.svg` — primary mark (32×32 viewBox, `var(--ink-900)`)
- `public/icon.svg` — proxy mapping mirror
- `public/favicon.svg` — Mark A canon-graph
- `public/favicon-16.png`·`favicon-32.png`·`favicon-48.png` — favicon set
- `public/favicon.ico` — fallback
- `public/apple-touch-icon.png` — 180×180, white rounded bg, Mark A 80% fill
- `public/og-image.png` — 1200×630, Mark A + 'seizn' wordmark + tagline `Catch every contradiction before it ships.`

Component source: `src/components/landing/brand-marks.tsx` — `SeiznMark`·`SeiznLockup` (canonical inline SVG; prefer this over raster files for any new in-app render).

Regeneration: `node scripts/gen-brand-png.mjs` re-derives PNG outputs from the canonical SVG.

## Surface 2 — NPC SDK / engine (`engine.seizn.com` · W7+ env gate)

**'S wave + 4 colored nodes'** — sketch tone, multi-color (orange · green · yellow · cyan). Visual signature for the NPC memory middleware product (game/agent runtime audience).

Storage location: `raster/` and `source/` in this directory.
- `raster/seizn-logo-bg-4096.png` — dark background composition
- `raster/seizn-logo-transparent-1516.png` — transparent mark only
- `raster/seizn-wordmark-transparent-4096.png` — wordmark only
- `raster/seizn-wordmark-transparent-v2-1728x2304.png` — wordmark v2
- `source/seizn-horizontal-no-bg-4k.psd` — editable source
- `source/seizn-horizontal-no-bg-4k-legacy-mislabeled-psd.psd` — corrected extension (file signature PSD, not PNG)

Runtime usage activates with `NEXT_PUBLIC_ENGINE_SURFACE_LIVE=1` (W7+ flip per Phase D″ env gate).

## Cross-surface rules

- **Never** mix Mark A (Author) with NPC SDK assets in the same surface.
- Author landing/auth/dashboard/email/share/OAuth consent screen → Mark A only.
- NPC SDK landing/docs/SDK README/agent registry → S wave only.
- Internal docs may reference both for product strategy purposes.

## Reference

- `docs/architecture/seizn-author-launch-runbook.md` — Phase D″ lock history
- Memory `seizn-dual-surface-decision-2026-05` — dual surface launch sequencing
- Memory `feedback_brand_separation_seizn` — brand separation rule
