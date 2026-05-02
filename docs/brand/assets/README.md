# Seizn Brand Assets

This directory stores raster and source brand files that are not part of the
runtime SVG logo set in `public/`.

## Runtime Assets

The web app should continue to prefer the optimized SVG files in `public/`:

- `public/seizn-icon.svg`
- `public/seizn-mark-light.svg`
- `public/seizn-mark-dark.svg`
- `public/seizn-wordmark.svg`
- `public/seizn-lockup-light.svg`
- `public/seizn-lockup-dark.svg`

## Source Assets

`source/` contains editable source files.

- `seizn-horizontal-no-bg-4k.psd` is the primary horizontal transparent source.
- `seizn-horizontal-no-bg-4k-legacy-mislabeled-psd.psd` was supplied with a
  `.png` filename, but its file signature is PSD (`8BPS`). It is preserved with a
  corrected extension so image pipelines do not treat it as a PNG.

## Raster Assets

`raster/` contains high-resolution PNG exports for manual design, press, and
documentation work. Do not import these large files directly into app pages
without creating optimized derivatives first.
