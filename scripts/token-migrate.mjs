#!/usr/bin/env node
// Token migration: legacy szn-* + violet/purple/cyan/red/emerald/amber → V1 ink + signal-*
// Phase D'' V1 token system extension. Mechanical 1:1 replacement, logic-preserving.
//
// Usage: node scripts/token-migrate.mjs <path> [--dry-run]
//
// Notes:
// - Operates on .tsx/.ts/.jsx/.js files
// - Idempotent (re-running does nothing)
// - Does NOT touch landing/auth/brand-marks (lock zones — guard via path filter)

import { readFileSync, writeFileSync, statSync, readdirSync } from "node:fs";
import { join, extname } from "node:path";
import { argv, exit } from "node:process";

const args = argv.slice(2);
const dryRun = args.includes("--dry-run");
const targets = args.filter((a) => !a.startsWith("--"));

if (targets.length === 0) {
  console.error("Usage: node scripts/token-migrate.mjs <path...> [--dry-run]");
  exit(1);
}

// Paths that must never be modified (Phase D'' lock zones)
const LOCK_PATHS = [
  "src/components/landing/",
  "src/app/(auth)/",
  "src/components/auth/auth-shell.tsx",
  "docs/brand/assets/raster/",
  "docs/knot-input/",
];

// Ordered class-replacement rules. Each rule is [regex, replacement].
// Rules are applied in order, so put more-specific patterns first.
const rules = [
  // ---- szn-* color tokens (Tailwind classes via @theme inline) ----
  // text colors
  [/\btext-szn-text-1\b/g, "text-[var(--ink-900)]"],
  [/\btext-szn-text-2\b/g, "text-[var(--ink-600)]"],
  [/\btext-szn-text-3\/70\b/g, "text-[var(--ink-500)]/70"],
  [/\btext-szn-text-3\/(\d+)\b/g, "text-[var(--ink-500)]/$1"],
  [/\btext-szn-text-3\b/g, "text-[var(--ink-500)]"],
  [/\btext-szn-accent\b/g, "text-[var(--ink-900)]"],
  [/\btext-szn-danger\b/g, "text-[var(--signal-conflict)]"],
  [/\btext-szn-success\b/g, "text-[var(--signal-canon)]"],
  [/\btext-szn-warning\b/g, "text-[var(--signal-pending)]"],

  // hover text colors
  [/\bhover:text-szn-text-1\b/g, "hover:text-[var(--ink-900)]"],
  [/\bhover:text-szn-text-2\b/g, "hover:text-[var(--ink-600)]"],
  [/\bhover:text-szn-text-3\b/g, "hover:text-[var(--ink-500)]"],
  [/\bhover:text-szn-accent\b/g, "hover:text-[var(--ink-700)]"],

  // background colors
  [/\bbg-szn-bg\b/g, "bg-[var(--ink-50)]"],
  [/\bbg-szn-card\b/g, "bg-[var(--ink-0)]"],
  [/\bbg-szn-surface-1\/(\d+)\b/g, "bg-[var(--ink-50)]/$1"],
  [/\bbg-szn-surface-1\b/g, "bg-[var(--ink-50)]"],
  [/\bbg-szn-surface-2\b/g, "bg-[var(--ink-100)]"],
  [/\bbg-szn-surface\b/g, "bg-[var(--ink-50)]"],
  [/\bbg-szn-accent\/(\d+)\b/g, "bg-[var(--ink-900)]/$1"],
  [/\bbg-szn-accent\b/g, "bg-[var(--ink-900)]"],
  [/\bbg-szn-danger\/(\d+)\b/g, "bg-[var(--signal-conflict)]/$1"],
  [/\bbg-szn-danger\b/g, "bg-[var(--signal-conflict)]"],
  [/\bbg-szn-success\/(\d+)\b/g, "bg-[var(--signal-canon)]/$1"],
  [/\bbg-szn-success\b/g, "bg-[var(--signal-canon)]"],
  [/\bbg-szn-warning\/(\d+)\b/g, "bg-[var(--signal-pending)]/$1"],
  [/\bbg-szn-warning\b/g, "bg-[var(--signal-pending)]"],

  // hover bg
  [/\bhover:bg-szn-surface-1\/(\d+)\b/g, "hover:bg-[var(--ink-50)]/$1"],
  [/\bhover:bg-szn-surface-1\b/g, "hover:bg-[var(--ink-50)]"],
  [/\bhover:bg-szn-surface\b/g, "hover:bg-[var(--ink-50)]"],
  [/\bhover:bg-szn-accent\b/g, "hover:bg-[var(--ink-700)]"],
  [/\bhover:bg-szn-card\b/g, "hover:bg-[var(--ink-0)]"],

  // borders
  [/\bborder-szn-border\b/g, "border-[var(--ink-200)]"],
  [/\bborder-szn-accent\b/g, "border-[var(--ink-900)]"],
  [/\bborder-szn-danger\b/g, "border-[var(--signal-conflict)]"],
  [/\bborder-szn-success\b/g, "border-[var(--signal-canon)]"],
  [/\bborder-szn-warning\b/g, "border-[var(--signal-pending)]"],
  [/\bborder-szn-text-1\b/g, "border-[var(--ink-900)]"],
  [/\bborder-szn-text-2\b/g, "border-[var(--ink-600)]"],
  [/\bborder-szn-text-3\/(\d+)\b/g, "border-[var(--ink-500)]/$1"],
  [/\bborder-szn-text-3\b/g, "border-[var(--ink-500)]"],
  [/\bhover:border-szn-border\b/g, "hover:border-[var(--ink-200)]"],
  [/\bhover:border-szn-accent\b/g, "hover:border-[var(--ink-900)]"],
  [/\bhover:border-szn-text-1\b/g, "hover:border-[var(--ink-900)]"],
  [/\bhover:border-szn-text-3\/(\d+)\b/g, "hover:border-[var(--ink-500)]/$1"],
  [/\bhover:border-szn-text-3\b/g, "hover:border-[var(--ink-500)]"],

  // bg-szn-border / bg-szn-text-* (skeleton + button surfaces)
  [/\bbg-szn-border\b/g, "bg-[var(--ink-200)]"],
  [/\bbg-szn-text-1\/(\d+)\b/g, "bg-[var(--ink-900)]/$1"],
  [/\bbg-szn-text-1\b/g, "bg-[var(--ink-900)]"],
  [/\bbg-szn-text-2\b/g, "bg-[var(--ink-600)]"],
  [/\bbg-szn-text-3\b/g, "bg-[var(--ink-500)]"],
  [/\bhover:bg-szn-text-1\/(\d+)\b/g, "hover:bg-[var(--ink-700)]/$1"],
  [/\bhover:bg-szn-text-1\b/g, "hover:bg-[var(--ink-700)]"],

  // text-szn-border (icons / dividers)
  [/\btext-szn-border\b/g, "text-[var(--ink-200)]"],

  // placeholder/stroke/fill/accent/shadow/decoration variants
  [/\bplaceholder-szn-text-1\b/g, "placeholder-[var(--ink-900)]"],
  [/\bplaceholder-szn-text-2\b/g, "placeholder-[var(--ink-600)]"],
  [/\bplaceholder-szn-text-3\b/g, "placeholder-[var(--ink-500)]"],
  [/\bstroke-szn-border\b/g, "stroke-[var(--ink-200)]"],
  [/\bstroke-szn-text-3\b/g, "stroke-[var(--ink-500)]"],
  [/\bfill-szn-(text-1|text-2|text-3|accent|border|card)\b/g, (_, k) => {
    const map = { "text-1": "ink-900", "text-2": "ink-600", "text-3": "ink-500", accent: "ink-900", border: "ink-200", card: "ink-0" };
    return `fill-[var(--${map[k]})]`;
  }],
  [/\baccent-szn-accent\b/g, "accent-[var(--ink-900)]"],
  [/\bshadow-szn-accent\b/g, "shadow-[var(--ink-900)]"],

  // focus
  [/\bfocus:bg-szn-accent\b/g, "focus:bg-[var(--ink-900)]"],
  [/\bfocus:border-szn-accent\b/g, "focus:border-[var(--ink-900)]"],
  [/\bfocus:ring-szn-accent\b/g, "focus:ring-[var(--ink-900)]"],

  // ring
  [/\bring-szn-accent\/(\d+)\b/g, "ring-[var(--ink-900)]/$1"],
  [/\bring-szn-accent\b/g, "ring-[var(--ink-900)]"],
  [/\bring-szn-border\b/g, "ring-[var(--ink-200)]"],

  // divide
  [/\bdivide-szn-border\b/g, "divide-[var(--ink-200)]"],

  // ---- gradient legacy ----
  // hero gradient & decorative blobs
  [/\bbg-gradient-to-br from-violet-500 via-purple-500 to-cyan-500\b/g, "bg-[var(--ink-900)]"],
  [/\bbg-gradient-to-r from-violet-500 via-purple-500 to-cyan-500\b/g, "bg-[var(--ink-900)]"],
  [/\bbg-gradient-to-br from-violet-600 via-purple-600 to-cyan-600\b/g, "bg-[var(--ink-900)]"],
  [/\bbg-gradient-to-r from-violet-600 via-purple-600 to-cyan-600\b/g, "bg-[var(--ink-900)]"],
  [/\bgradient-hero\b/g, "bg-[var(--ink-50)]"],
  [/\bbtn-premium\b/g, "bg-[var(--ink-900)] hover:bg-[var(--ink-700)] text-white"],

  // ---- text-purple links / icons ----
  [/\btext-purple-600\b/g, "text-[var(--ink-900)] underline"],
  [/\btext-purple-700\b/g, "text-[var(--ink-900)] underline"],
  [/\btext-purple-500\b/g, "text-[var(--ink-700)] underline"],
  [/\btext-purple-400\b/g, "text-[var(--ink-700)]"],
  [/\btext-purple-300\b/g, "text-[var(--ink-500)]"],
  [/\btext-purple-(200|100|50)\b/g, "text-[var(--ink-300)]"],
  [/\bhover:text-purple-500\b/g, "hover:text-[var(--ink-700)]"],
  [/\bhover:text-purple-600\b/g, "hover:text-[var(--ink-700)]"],
  [/\bhover:text-purple-700\b/g, "hover:text-[var(--ink-700)]"],

  // ---- gradient legacy that uses szn-accent inside Tailwind gradient ----
  [/\bbg-gradient-to-r from-szn-accent\/(\d+) to-szn-accent\/(\d+)\b/g, "bg-[var(--ink-900)]/10"],
  [/\bbg-gradient-to-br from-szn-accent\/(\d+) to-szn-accent\/(\d+)\b/g, "bg-[var(--ink-900)]/10"],
  [/\bbg-gradient-to-r from-szn-accent to-szn-accent\/(\d+)\b/g, "bg-[var(--ink-900)]"],
  [/\bbg-gradient-to-br from-szn-accent to-szn-accent\/(\d+)\b/g, "bg-[var(--ink-900)]"],
  [/\bfrom-szn-accent\/(\d+)\b/g, "from-[var(--ink-900)]/$1"],
  [/\bto-szn-accent\/(\d+)\b/g, "to-[var(--ink-900)]/$1"],
  [/\bfrom-szn-accent\b/g, "from-[var(--ink-900)]"],
  [/\bto-szn-accent\b/g, "to-[var(--ink-900)]"],

  // ---- Tailwind violet/purple/cyan accent (non-blob) → ink ----
  [/\btext-violet-(\d+)\b/g, "text-[var(--ink-900)]"],
  [/\btext-cyan-(\d+)\b/g, "text-[var(--ink-900)]"],
  [/\bborder-violet-(\d+)\b/g, "border-[var(--ink-900)]"],
  [/\bborder-purple-(\d+)\b/g, "border-[var(--ink-900)]"],
  [/\bborder-cyan-(\d+)\b/g, "border-[var(--ink-900)]"],

  // bg-violet-* / bg-purple-* / bg-cyan-* (non-200 are accent surfaces)
  [/\bbg-violet-50\b/g, "bg-[var(--ink-50)]"],
  [/\bbg-violet-100\b/g, "bg-[var(--ink-100)]"],
  [/\bbg-violet-(\d+)\/(\d+)\b/g, "bg-[var(--ink-900)]/$2"],
  [/\bbg-violet-(\d+)\b/g, "bg-[var(--ink-900)]"],
  [/\bbg-purple-50\b/g, "bg-[var(--ink-50)]"],
  [/\bbg-purple-100\b/g, "bg-[var(--ink-100)]"],
  [/\bbg-purple-(\d+)\/(\d+)\b/g, "bg-[var(--ink-900)]/$2"],
  [/\bbg-purple-(\d+)\b/g, "bg-[var(--ink-900)]"],
  [/\bbg-cyan-50\b/g, "bg-[var(--ink-50)]"],
  [/\bbg-cyan-100\b/g, "bg-[var(--ink-100)]"],
  [/\bbg-cyan-(\d+)\/(\d+)\b/g, "bg-[var(--ink-900)]/$2"],
  [/\bbg-cyan-(\d+)\b/g, "bg-[var(--ink-900)]"],

  // ---- bg-red / border-red / text-red → signal-conflict ----
  [/\bbg-red-50\b/g, "bg-[var(--signal-conflict-soft)]"],
  [/\bbg-red-100\b/g, "bg-[var(--signal-conflict-soft)]"],
  [/\bbg-red-200\b/g, "bg-[var(--signal-conflict-soft)]"],
  [/\bbg-red-500\/10\b/g, "bg-[var(--signal-conflict)]/10"],
  [/\bbg-red-500\/20\b/g, "bg-[var(--signal-conflict)]/20"],
  [/\bbg-red-(500|600|700)\b/g, "bg-[var(--signal-conflict)]"],
  [/\bbg-red-(\d+)\/(\d+)\b/g, "bg-[var(--signal-conflict)]/$2"],
  [/\bborder-red-(\d+)\b/g, "border-[var(--signal-conflict)]"],
  [/\btext-red-(50|100|200|300|400)\b/g, "text-[var(--signal-conflict-soft)]"],
  [/\btext-red-(500|600|700|800|900)\b/g, "text-[var(--signal-conflict-ink)]"],
  [/\bhover:bg-red-(\d+)\b/g, "hover:bg-[var(--signal-conflict)]"],
  [/\bhover:text-red-(\d+)\b/g, "hover:text-[var(--signal-conflict-ink)]"],
  [/\bhover:border-red-(\d+)\b/g, "hover:border-[var(--signal-conflict)]"],

  // ---- bg-emerald / border-emerald / text-emerald → signal-canon ----
  [/\bbg-emerald-50\b/g, "bg-[var(--signal-canon-soft)]"],
  [/\bbg-emerald-100\b/g, "bg-[var(--signal-canon-soft)]"],
  [/\bbg-emerald-200\b/g, "bg-[var(--signal-canon-soft)]"],
  [/\bbg-emerald-(500|600|700)\b/g, "bg-[var(--signal-canon)]"],
  [/\bbg-emerald-(\d+)\/(\d+)\b/g, "bg-[var(--signal-canon)]/$2"],
  [/\bborder-emerald-(\d+)\b/g, "border-[var(--signal-canon)]"],
  [/\btext-emerald-(50|100|200|300|400)\b/g, "text-[var(--signal-canon-soft)]"],
  [/\btext-emerald-(500|600|700|800|900)\b/g, "text-[var(--signal-canon-ink)]"],
  [/\bhover:bg-emerald-(\d+)\b/g, "hover:bg-[var(--signal-canon)]"],
  [/\bhover:text-emerald-(\d+)\b/g, "hover:text-[var(--signal-canon-ink)]"],

  // ---- bg-amber / border-amber / text-amber → signal-pending ----
  [/\bbg-amber-50\b/g, "bg-[var(--signal-pending-soft)]"],
  [/\bbg-amber-100\b/g, "bg-[var(--signal-pending-soft)]"],
  [/\bbg-amber-200\b/g, "bg-[var(--signal-pending-soft)]"],
  [/\bbg-amber-(500|600|700)\b/g, "bg-[var(--signal-pending)]"],
  [/\bbg-amber-(\d+)\/(\d+)\b/g, "bg-[var(--signal-pending)]/$2"],
  [/\bborder-amber-(\d+)\b/g, "border-[var(--signal-pending)]"],
  [/\btext-amber-(50|100|200|300|400)\b/g, "text-[var(--signal-pending-soft)]"],
  [/\btext-amber-(500|600|700|800|900)\b/g, "text-[var(--signal-pending-ink)]"],
  [/\bhover:bg-amber-(\d+)\b/g, "hover:bg-[var(--signal-pending)]"],
  [/\bhover:text-amber-(\d+)\b/g, "hover:text-[var(--signal-pending-ink)]"],

  // ---- bg-yellow → signal-pending ----
  [/\bbg-yellow-50\b/g, "bg-[var(--signal-pending-soft)]"],
  [/\bbg-yellow-100\b/g, "bg-[var(--signal-pending-soft)]"],
  [/\bborder-yellow-(\d+)\b/g, "border-[var(--signal-pending)]"],
  [/\btext-yellow-(500|600|700|800|900)\b/g, "text-[var(--signal-pending-ink)]"],

  // ---- bg-green-* → signal-canon (when used as success) ----
  [/\bbg-green-50\b/g, "bg-[var(--signal-canon-soft)]"],
  [/\bbg-green-100\b/g, "bg-[var(--signal-canon-soft)]"],
  [/\bborder-green-(\d+)\b/g, "border-[var(--signal-canon)]"],
  [/\btext-green-(500|600|700|800|900)\b/g, "text-[var(--signal-canon-ink)]"],

  // ---- gray-900/800 dark btn (already token-aligned) ----
  [/\bbg-gray-900\b/g, "bg-[var(--ink-900)]"],
  [/\bhover:bg-gray-800\b/g, "hover:bg-[var(--ink-800)]"],
  [/\bbg-gray-800\b/g, "bg-[var(--ink-800)]"],
  [/\bhover:bg-gray-900\b/g, "hover:bg-[var(--ink-900)]"],

  // ---- rounded-3xl → rounded-2xl ----
  [/\brounded-3xl\b/g, "rounded-2xl"],
];

function isLocked(file) {
  const norm = file.replace(/\\/g, "/");
  return LOCK_PATHS.some((p) => norm.includes(p));
}

function shouldProcess(file) {
  if (isLocked(file)) return false;
  const ext = extname(file);
  return [".tsx", ".ts", ".jsx", ".js"].includes(ext);
}

function* walk(dir) {
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      yield* walk(full);
    } else {
      yield full;
    }
  }
}

function processFile(file) {
  let src;
  try {
    src = readFileSync(file, "utf8");
  } catch {
    return { file, changed: false, count: 0 };
  }
  let result = src;
  let totalCount = 0;
  for (const [pattern, replacement] of rules) {
    const before = result;
    result = result.replace(pattern, replacement);
    if (result !== before) {
      const matches = before.match(pattern);
      totalCount += matches ? matches.length : 0;
    }
  }
  if (result === src) return { file, changed: false, count: 0 };
  if (!dryRun) writeFileSync(file, result, "utf8");
  return { file, changed: true, count: totalCount };
}

let totalFiles = 0;
let totalChanged = 0;
let totalReplacements = 0;

for (const target of targets) {
  let stat;
  try {
    stat = statSync(target);
  } catch {
    console.warn(`skip (not found): ${target}`);
    continue;
  }
  const files = stat.isDirectory() ? Array.from(walk(target)).filter(shouldProcess) : [target].filter(shouldProcess);
  for (const f of files) {
    totalFiles++;
    const r = processFile(f);
    if (r.changed) {
      totalChanged++;
      totalReplacements += r.count;
      console.log(`${dryRun ? "[dry] " : ""}${r.file}: ${r.count} replacements`);
    }
  }
}

console.log(`\n${dryRun ? "[dry-run] " : ""}Files scanned: ${totalFiles}`);
console.log(`Files changed: ${totalChanged}`);
console.log(`Total replacements: ${totalReplacements}`);
