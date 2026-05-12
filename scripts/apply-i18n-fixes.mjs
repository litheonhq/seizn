#!/usr/bin/env node
// Apply key-path replacements to an i18n dictionary file.
//
// Usage:
//   node scripts/apply-i18n-fixes.mjs <dict-path> <fixes-json>
//
// fixes-json shape:
//   [{ "path": "dashboard.coach.subtitle", "value": "new text" }, ...]
//
// Walks the JSON and assigns the new leaf value at each path. Prints a
// per-fix status (ok / not-found). Exits non-zero if any path was missing.

import { readFile, writeFile } from 'node:fs/promises';
import { argv, exit } from 'node:process';

if (argv.length < 4) {
  console.error('Usage: node scripts/apply-i18n-fixes.mjs <dict-path> <fixes-json>');
  exit(2);
}

const [dictPath, fixesPath] = argv.slice(2);
const dict = JSON.parse(await readFile(dictPath, 'utf8'));
const fixes = JSON.parse(await readFile(fixesPath, 'utf8'));

const UNSAFE_SEGMENTS = new Set(['__proto__', 'prototype', 'constructor']);

function setAtPath(obj, path, value) {
  const parts = path.split('.');
  if (parts.some((p) => UNSAFE_SEGMENTS.has(p))) return false;
  let node = obj;
  for (let i = 0; i < parts.length - 1; i += 1) {
    if (node == null || typeof node !== 'object') return false;
    if (!Object.prototype.hasOwnProperty.call(node, parts[i])) return false;
    node = node[parts[i]];
  }
  const leaf = parts[parts.length - 1];
  if (node == null || typeof node !== 'object') return false;
  if (!Object.prototype.hasOwnProperty.call(node, leaf)) return false;
  if (typeof node[leaf] !== 'string') return false;
  node[leaf] = value;
  return true;
}

let missing = 0;
for (const { path, value } of fixes) {
  if (typeof value !== 'string') {
    console.log(`SKIP   ${path} (non-string value)`);
    continue;
  }
  const ok = setAtPath(dict, path, value);
  if (ok) console.log(`OK     ${path}`);
  else { console.log(`MISS   ${path}`); missing += 1; }
}

// Pretty-print with 2-space indent + trailing newline to match the existing
// dictionary formatting.
await writeFile(dictPath, JSON.stringify(dict, null, 2) + '\n', 'utf8');

if (missing > 0) {
  console.error(`\n${missing} path(s) not found in ${dictPath}`);
  exit(1);
}
