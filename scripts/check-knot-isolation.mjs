#!/usr/bin/env node
/**
 * KNOT ↔ Seizn entity separation check (plan W5.4).
 *
 * Memory `feedback_seizn_knot_separation`:
 *   "Seizn 외부 산출물(marketing/landing/docs/demo/case study)에 KNOT 자료·캐릭·세계관 노출 0건"
 *
 * Static check — greps for KNOT proper nouns inside surfaces that ship to public.
 * Pre-launch gate: this script must exit 0.
 *
 * Source of KNOT canon: `C:\Users\admin\Projects\knot\canon.md`. We don't read
 * that file at CI time (KNOT lives in a separate repo); we keep a hardcoded
 * proper-noun list here, mirrored from canon.md's character index.
 *
 * Add a new KNOT name to KNOT_PROPER_NOUNS only when canon.md confirms it. Never
 * remove a name unless KNOT itself retires it.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

// KNOT proper nouns — keep updated against C:\Users\admin\Projects\knot\canon.md.
// Treat each as a Seizn-public-leakage signal.
const KNOT_PROPER_NOUNS = [
  // Characters (KO + romanizations)
  '서지운', '허사서', '아오이', '소리', '강은하', '제이', 'JJ',
  'Seo Jiwoon', 'Hur Sasa', 'Aoi', 'Sori', 'Kang Eunha',
  // World names
  '한운맹', '백운각', '천운방', '만류각',
  'Hanwoonmaeng', 'Baekwoongak', 'Cheonwoonbang', 'Mallyugak',
  // Title / IP
  'KNOT (結)', '結 KNOT', '(結)',
  // Distinctive concepts
  '운기 결산', '경맥 정산',
];

// Surfaces shipping to public — these MUST NOT contain KNOT references.
const PUBLIC_SURFACES = [
  'src/app/[locale]/page.tsx',           // Landing
  'src/app/[locale]/pricing',             // Pricing
  'src/app/[locale]/docs',                // Public docs
  'src/app/[locale]/demo',                // Demo
  'src/app/[locale]/comparison',          // Comparison
  'src/app/[locale]/enterprise',          // Enterprise sales
  'src/app/[locale]/sla',                 // SLA
  'src/app/[locale]/trust',               // Trust Center
  'src/app/[locale]/changelog',           // Changelog
  'src/app/[locale]/legal',               // Legal pages
  'src/components/landing',               // Landing components
  'src/components/extreme-homepage',      // Live demo widget
  'legal/en',                             // Public legal markdown
  'legal/ko',
  'legal/ja',
  'legal/zh',
  'public',                               // Public static (excluding /brand)
];

// Allowed surfaces — KNOT can appear here for personal dogfood, never customer-facing.
const ALLOWED_SURFACES_PREFIXES = [
  'src/lib/sample-ip-demo',               // Synthetic Saebyeok seed (W5.4 swap target)
  'docs/',                                 // Internal runbooks (not customer-facing)
];

const ROOT = process.cwd();

function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry === 'node_modules' || entry === '.next') continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      walk(full, out);
    } else if (/\.(tsx?|jsx?|mdx?|json|html)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

let totalHits = 0;
const hitsByFile = new Map();

for (const surface of PUBLIC_SURFACES) {
  const abs = join(ROOT, surface);
  let files;
  try {
    const st = statSync(abs);
    files = st.isDirectory() ? walk(abs) : [abs];
  } catch {
    continue;
  }

  for (const f of files) {
    const rel = f.slice(ROOT.length + 1).replace(/\\/g, '/');
    if (ALLOWED_SURFACES_PREFIXES.some((p) => rel.startsWith(p))) continue;

    let text;
    try {
      text = readFileSync(f, 'utf8');
    } catch {
      continue;
    }

    for (const noun of KNOT_PROPER_NOUNS) {
      const idx = text.indexOf(noun);
      if (idx === -1) continue;
      const lineNo = text.slice(0, idx).split(/\r?\n/).length;
      console.log(`  [LEAK] ${rel}:${lineNo} → "${noun}"`);
      hitsByFile.set(rel, (hitsByFile.get(rel) ?? 0) + 1);
      totalHits++;
    }
  }
}

console.log('\n=== KNOT isolation summary ===');
console.log(`Files scanned:     ${[...PUBLIC_SURFACES].length} surface roots`);
console.log(`KNOT terms checked: ${KNOT_PROPER_NOUNS.length}`);
console.log(`Leak hits:          ${totalHits}`);
if (totalHits > 0) {
  console.log(`Files with leaks:   ${hitsByFile.size}`);
}

if (totalHits > 0) {
  console.error('\n✗ KNOT references found in public surface. This blocks launch.');
  console.error('  Fix: replace with synthetic IP (sample-ip-demo) or public-domain works.');
  process.exit(1);
}

console.log('\n✓ No KNOT references in public surfaces.');
process.exit(0);
