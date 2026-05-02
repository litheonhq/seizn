#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const POSTCSS_SAFE_FLOOR = '8.5.13';

function runNpm(args) {
  const options = {
    cwd: process.cwd(),
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  };

  if (process.env.npm_execpath) {
    return spawnSync(process.execPath, [process.env.npm_execpath, ...args], options);
  }

  if (process.platform === 'win32') {
    const commandLine = ['npm', ...args]
      .map((arg) => `"${String(arg).replace(/"/g, '\\"')}"`)
      .join(' ');
    return spawnSync(commandLine, { ...options, shell: true });
  }

  return spawnSync('npm', args, options);
}

function npmView(packageName, field) {
  const result = runNpm(['view', packageName, field, '--json']);
  if (result.status !== 0) {
    throw new Error(
      result.error?.message || result.stderr || result.stdout || `npm view ${packageName} ${field} failed`
    );
  }
  return JSON.parse(result.stdout);
}

function versionParts(version) {
  return String(version)
    .replace(/^[^\d]*/, '')
    .split(/[.-]/)
    .slice(0, 3)
    .map((part) => Number.parseInt(part, 10) || 0);
}

function isAtLeast(version, floor) {
  const actual = versionParts(version);
  const minimum = versionParts(floor);
  for (let i = 0; i < 3; i += 1) {
    if (actual[i] > minimum[i]) return true;
    if (actual[i] < minimum[i]) return false;
  }
  return true;
}

const packageJson = JSON.parse(readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'));
const stableNext = npmView('next@latest', 'version');
const stableNextDependencies = npmView('next@latest', 'dependencies');
const stableEslintConfigNext = npmView('eslint-config-next@latest', 'version');
const stableBundleAnalyzer = npmView('@next/bundle-analyzer@latest', 'version');
const stableNextPostcss = stableNextDependencies.postcss ?? null;
const postcssReady = stableNextPostcss ? isAtLeast(stableNextPostcss, POSTCSS_SAFE_FLOOR) : false;
const currentNext = packageJson.dependencies?.next ?? null;

console.log(JSON.stringify({
  ready: postcssReady,
  check: 'next@latest direct dependency metadata',
  currentNext,
  stableNext,
  stableNextPostcss,
  requiredPostcssFloor: POSTCSS_SAFE_FLOOR,
  stableEslintConfigNext,
  stableBundleAnalyzer,
  recommendation: postcssReady
    ? 'Stable Next can replace the canary after normal install, audit, build, and test validation.'
    : 'Keep the canary pin until stable Next stops resolving the vulnerable PostCSS line.',
}, null, 2));

if (!postcssReady && process.env.NEXT_STABLE_AUDIT_STRICT === '1') {
  process.exitCode = 1;
}
