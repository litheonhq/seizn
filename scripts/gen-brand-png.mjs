// One-shot generator for Mark A brand PNG assets (apple-touch-icon, og-image).
// Run: node scripts/gen-brand-png.mjs
// Re-run when Mark A canon-graph node design changes.
import sharp from 'sharp';
import { resolve } from 'node:path';

const root = process.cwd();
const out = (p) => resolve(root, 'public', p);

// Mark A SVG body (Phase D'' canon-graph node) - 4 nodes + 4 edges
const markABody = (color = '#1a1f2c') => `
  <line x1="8" y1="9" x2="22" y2="11" stroke="${color}" stroke-width="1.4" stroke-linecap="round" opacity="0.6"/>
  <line x1="8" y1="9" x2="11" y2="23" stroke="${color}" stroke-width="1.4" stroke-linecap="round" opacity="0.6"/>
  <line x1="22" y1="11" x2="24" y2="23" stroke="${color}" stroke-width="1.4" stroke-linecap="round" opacity="0.6"/>
  <line x1="11" y1="23" x2="24" y2="23" stroke="${color}" stroke-width="1.4" stroke-linecap="round" opacity="0.6"/>
  <circle cx="8" cy="9" r="3" fill="${color}"/>
  <circle cx="22" cy="11" r="2.4" fill="${color}"/>
  <circle cx="11" cy="23" r="2.2" fill="${color}"/>
  <circle cx="24" cy="23" r="3.2" fill="${color}"/>
`;

// 1) apple-touch-icon.png — 180x180, Mark A centered (~80% fill), white rounded background
const appleSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180" viewBox="0 0 180 180" fill="none">
  <rect width="180" height="180" fill="#ffffff" rx="36"/>
  <g transform="translate(18,18) scale(4.5)">
    ${markABody('#1a1f2c')}
  </g>
</svg>`;

await sharp(Buffer.from(appleSvg))
  .png({ compressionLevel: 9 })
  .toFile(out('apple-touch-icon.png'));
console.log('wrote public/apple-touch-icon.png (180x180)');

// 2) og-image.png — 1200x630, Mark A on left + 'seizn' wordmark + tagline + footer
const ogSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" fill="none">
  <rect width="1200" height="630" fill="#fcfcfc"/>
  <g transform="translate(120,187) scale(8)">
    ${markABody('#1a1f2c')}
  </g>
  <text x="450" y="320" font-family="Source Serif 4, Source Serif Pro, Georgia, serif" font-size="96" font-weight="400" fill="#1a1f2c" letter-spacing="-2">seizn</text>
  <text x="450" y="380" font-family="Source Serif 4, Source Serif Pro, Georgia, serif" font-size="32" font-weight="400" fill="#3d4555">Catch every contradiction before it ships.</text>
  <text x="120" y="600" font-family="JetBrains Mono, Menlo, Consolas, monospace" font-size="14" fill="#6f7782">&#169; 2026 Seizn by Litheon LLC</text>
</svg>`;

await sharp(Buffer.from(ogSvg))
  .png({ compressionLevel: 9 })
  .toFile(out('og-image.png'));
console.log('wrote public/og-image.png (1200x630)');
