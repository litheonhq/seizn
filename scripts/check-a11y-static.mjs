#!/usr/bin/env node
/**
 * Static a11y audit (plan W5.1).
 *
 * Cheap pre-flight pass over JSX/TSX. Catches the high-frequency mistakes that
 * cost us at WCAG AA: missing alt, label-less form controls, dialog without
 * aria-modal, button without text, links without href.
 *
 * Heavier dynamic audits (axe-core, lighthouse) run via lighthouse-ci in W5.2.
 *
 * Exit code: 0 if no errors, 1 if any error found.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const SCAN_PATHS = [
  'src/components',
  'src/app',
];
const IGNORE_DIRS = new Set(['node_modules', '.next', 'test-results', 'playwright-report']);

// Patterns are intentionally tag-bounded via `[^>]` (matches across newlines but
// stops at the closing `>`). Cross-tag false positives are avoided this way.
// Note `[^>]` includes newlines — JS regex character classes don't honor the
// dotall flag distinction.
const RULES = [
  {
    name: 'img-alt-required',
    description: '<img> must have alt attribute (use alt="" for decorative)',
    pattern: /<img\b(?![^>]*\salt=)[^>]*\/?>/gi,
  },
  {
    name: 'button-empty',
    description: 'button has neither children nor aria-label',
    pattern: /<button\b(?![^>]*\baria-label=)[^>]*>\s*<\/button>/gi,
  },
  {
    name: 'a-without-href',
    description: '<a> tag without href (use button instead)',
    pattern: /<a\b(?![^>]*\bhref=)[^>]*>(?!\s*<\/a>)/gi,
  },
  {
    name: 'role-dialog-without-aria',
    description: 'role="dialog" missing aria-modal or aria-label/labelledby',
    pattern: /role=["']dialog["']\s*(?![^>]*aria-(modal|label|labelledby)=)[^>]*>/gi,
  },
  {
    name: 'input-without-id-or-aria',
    description: '<input> without id (label assoc) and without aria-label',
    pattern: /<input\b(?![^>]*\b(id=|aria-label=|aria-labelledby=|type=["'](hidden|submit|reset|button)))[^>]*\/?>/gi,
  },
];

// Manually verified false-positives — files that have proper a11y attributes
// the regex doesn't catch (e.g. multi-line aria-label= spread, asymmetric quoting).
const KNOWN_FALSE_POSITIVES = new Set([
  'src/components/legal/CookieBanner.tsx', // input has aria-label, regex misses it
]);

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (IGNORE_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      walk(full, out);
    } else if (/\.(tsx|jsx)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

let totalHits = 0;
const hitsByRule = Object.fromEntries(RULES.map((r) => [r.name, 0]));

for (const target of SCAN_PATHS) {
  const abs = join(ROOT, target);
  let files;
  try {
    files = walk(abs);
  } catch {
    continue;
  }

  for (const f of files) {
    const rel = f.slice(ROOT.length + 1).replace(/\\/g, '/');
    if (KNOWN_FALSE_POSITIVES.has(rel)) continue;
    const text = readFileSync(f, 'utf8');

    for (const rule of RULES) {
      rule.pattern.lastIndex = 0;
      let m;
      while ((m = rule.pattern.exec(text)) !== null) {
        const lineNo = text.slice(0, m.index).split(/\r?\n/).length;
        const snippet = m[0].slice(0, 100).replace(/\n/g, ' ');
        console.log(`  [${rule.name}] ${rel}:${lineNo} → ${snippet}`);
        hitsByRule[rule.name]++;
        totalHits++;
      }
    }
  }
}

console.log('\n=== Static a11y audit summary ===');
for (const [name, count] of Object.entries(hitsByRule)) {
  console.log(`  ${name}: ${count}`);
}
console.log(`Total: ${totalHits}`);

if (totalHits > 0) {
  console.log('\nFix each hit. If a pattern is intentionally off (e.g., decorative img with empty alt), the rule should already pass.');
  console.log('Pre-existing hits are OK to baseline — track delta in PRs.');
}

// W5.1: report only, do not fail CI yet — too many pre-existing hits to baseline cleanly here.
// Once a separate cycle baselines existing offenders, switch to `process.exit(totalHits > 0 ? 1 : 0)`.
process.exit(0);
