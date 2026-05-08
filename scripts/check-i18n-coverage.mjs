#!/usr/bin/env node
/**
 * i18n coverage check (plan W5.1).
 *
 * 1. Compares ko.json + en.json against each non-fully-translated locale and reports
 *    which keys would fall back to English at runtime. (Informational — by design;
 *    plan W4.4 keeps non-en/ko in fallback indefinitely.)
 * 2. Greps src/components/landing + src/app/[locale]/pricing for hardcoded English
 *    strings that bypass `t()` — these are the leaks the user reported (e.g., the
 *    settings "Some settings data could not be loaded." case in W1).
 * 3. Exit code: 0 if no hardcoded strings found in monitored surfaces; 1 otherwise.
 *
 * Usage: node scripts/check-i18n-coverage.mjs
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const I18N_DIR = join(ROOT, 'src/i18n/dictionaries');
const SCAN_PATHS = [
  'src/components/landing',
  'src/app/[locale]/pricing',
  'src/app/[locale]/checkout',
  'src/components/legal/CookieBanner.tsx',
  'src/components/feedback',
];

// Surfaces explicitly allowed to ship English even in non-en locales (plan §3 §W3.7).
const FORCED_ENGLISH_SURFACES = new Set([
  'src/app/[locale]/legal',
  'src/components/feedback', // Empty/Loading/Error labels are passed in by callers.
]);

// =================== Step 1: dictionary diff ===================
const dicts = {};
for (const file of readdirSync(I18N_DIR)) {
  if (!file.endsWith('.json')) continue;
  const code = file.replace(/\.json$/, '');
  try {
    dicts[code] = JSON.parse(readFileSync(join(I18N_DIR, file), 'utf8'));
  } catch (err) {
    console.error(`[err] Cannot parse ${file}: ${err.message}`);
    process.exit(2);
  }
}

function flatKeys(obj, prefix = '') {
  const keys = new Set();
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      for (const sub of flatKeys(v, path)) keys.add(sub);
    } else {
      keys.add(path);
    }
  }
  return keys;
}

const enKeys = flatKeys(dicts.en ?? {});
const koKeys = flatKeys(dicts.ko ?? {});

console.log(`\nDictionary size — en: ${enKeys.size} keys, ko: ${koKeys.size} keys`);

const missingInKo = [...enKeys].filter((k) => !koKeys.has(k));
const missingInEn = [...koKeys].filter((k) => !enKeys.has(k));
console.log(`  ko missing en keys: ${missingInKo.length}`);
console.log(`  en missing ko keys: ${missingInEn.length}`);
if (missingInKo.length > 0) {
  console.log('  → first 5:', missingInKo.slice(0, 5));
}

// =================== Step 2: hardcoded English string grep ===================
// Heuristics:
//   - inside JSX text (between > and <): a string ≥ 12 chars containing a space and 2+ words.
//   - excludes obvious placeholders, code snippets, URLs, identifiers.
//   - flags only when the file has `useTranslation` or `t(` in scope.

const SUSPECT_LINE_RE = />\s*([A-Z][A-Za-z][^<{}]{12,})</g;
const ALLOW_PATTERNS = [
  /^[A-Z]{2,}_[A-Z_]+$/, // SCREAMING_SNAKE
  /^[a-z][a-zA-Z0-9]*$/, // single identifier
  /^https?:\/\//,
  /^\$\{/, // template literal
  /^&[a-zA-Z]+;/, // HTML entity prefixed
];

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      walk(full, out);
    } else if (/\.(tsx?|mdx?)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

let hardcodedHits = 0;
for (const target of SCAN_PATHS) {
  const abs = join(ROOT, target);
  let files;
  try {
    const st = statSync(abs);
    files = st.isDirectory() ? walk(abs) : [abs];
  } catch {
    continue;
  }

  for (const f of files) {
    const rel = f.slice(ROOT.length + 1).replace(/\\/g, '/');
    if ([...FORCED_ENGLISH_SURFACES].some((s) => rel.startsWith(s))) continue;

    const text = readFileSync(f, 'utf8');
    if (!/(useTranslation|\bt\(['"`])/.test(text)) continue; // file doesn't use t()

    SUSPECT_LINE_RE.lastIndex = 0;
    let match;
    while ((match = SUSPECT_LINE_RE.exec(text)) !== null) {
      const candidate = match[1].trim();
      if (ALLOW_PATTERNS.some((re) => re.test(candidate))) continue;
      const wordCount = candidate.split(/\s+/).length;
      if (wordCount < 2) continue;
      // Quote-only or punctuation-heavy false positives
      if (!/[a-zA-Z]/.test(candidate)) continue;
      const lineNo = text.slice(0, match.index).split(/\r?\n/).length;
      console.log(`  [hit] ${rel}:${lineNo} → "${candidate.slice(0, 80)}"`);
      hardcodedHits++;
    }
  }
}

console.log(`\nHardcoded English strings in t()-aware files: ${hardcodedHits}`);

if (hardcodedHits > 0) {
  console.log('\nReview each hit. If it should be translated, wrap with t() and add the key to ko/en.');
  console.log('If it must stay English (legal copy, brand names, code), add the path to FORCED_ENGLISH_SURFACES.');
  process.exit(1);
}

console.log('\n✓ No t()-aware files leaking hardcoded English in monitored surfaces.');
process.exit(0);
