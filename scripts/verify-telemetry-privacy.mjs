#!/usr/bin/env node
/**
 * Privacy guard for client telemetry and RUM.
 *
 * It prevents common regressions where browser telemetry starts sending full
 * URLs, query strings, hashes, cookies, or storage-derived values.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const checkedFiles = [
  'src/components/rum/WebVitalsReporter.tsx',
  'src/app/api/rum/route.ts',
  'src/lib/telemetry/browser-telemetry.ts',
  'src/hooks/useTelemetry.ts',
].map((file) => path.join(root, file));

const forbiddenPatterns = [
  [/window\.location\.href/, 'full browser URL capture'],
  [/\blocation\.search\b/, 'query string capture'],
  [/\blocation\.hash\b/, 'hash capture'],
  [/\bdocument\.cookie\b/, 'cookie capture'],
  [/\blocalStorage\b/, 'localStorage capture'],
  [/\bsessionStorage\b/, 'sessionStorage capture'],
];

const requiredPatterns = [
  ['src/components/rum/WebVitalsReporter.tsx', /window\.location\.pathname/, 'RUM must report pathname only'],
  ['src/app/api/rum/route.ts', /sanitizePath/, 'RUM API must sanitize URL paths'],
  ['src/app/api/rum/route.ts', /getUtf8ByteLength/, 'RUM API must enforce byte-sized payload caps'],
  ['src/lib/telemetry/browser-telemetry.ts', /sanitizeTelemetryAttributes/, 'browser telemetry must sanitize attributes'],
];

const failures = [];

for (const filePath of checkedFiles) {
  const rel = normalize(path.relative(root, filePath));
  const content = read(filePath);
  for (const [pattern, label] of forbiddenPatterns) {
    if (pattern.test(content)) {
      failures.push(`${rel}: forbidden ${label}`);
    }
  }
}

for (const [relativePath, pattern, label] of requiredPatterns) {
  const content = read(path.join(root, relativePath));
  if (!pattern.test(content)) {
    failures.push(`${relativePath}: missing ${label}`);
  }
}

if (failures.length > 0) {
  console.error('Telemetry privacy verification failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('Telemetry privacy guard passed.');

function read(filePath) {
  if (!fs.existsSync(filePath)) {
    console.error(`Required file missing: ${normalize(path.relative(root, filePath))}`);
    process.exit(1);
  }
  return fs.readFileSync(filePath, 'utf8');
}

function normalize(value) {
  return value.replaceAll('\\', '/');
}
