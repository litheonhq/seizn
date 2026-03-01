#!/usr/bin/env node

import { execSync } from 'node:child_process';

const BUILD_TRIGGER_PATTERNS = [
  /^src\//,
  /^public\//,
  /^supabase\/migrations\//,
  /^app\//,
  /^next\.config\./,
  /^package\.json$/,
  /^package-lock\.json$/,
  /^pnpm-lock\.yaml$/,
  /^yarn\.lock$/,
  /^tsconfig(\..+)?\.json$/,
  /^tailwind\.config\./,
  /^postcss\.config\./,
  /^vercel\.json$/,
];

function getRange() {
  const head = process.env.VERCEL_GIT_COMMIT_SHA || 'HEAD';
  const previous = process.env.VERCEL_GIT_PREVIOUS_SHA;

  if (previous) {
    return { base: previous, head };
  }

  return { base: `${head}^`, head };
}

function getChangedFiles(base, head) {
  const output = execSync(`git diff --name-only ${base} ${head}`, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();

  if (!output) {
    return [];
  }

  return output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function isBuildRelevant(filePath) {
  return BUILD_TRIGGER_PATTERNS.some((pattern) => pattern.test(filePath));
}

const SKIP_BRANCH_PATTERNS = [
  /^dependabot\//,
];

function main() {
  try {
    const branch = process.env.VERCEL_GIT_COMMIT_REF || '';
    if (SKIP_BRANCH_PATTERNS.some((pattern) => pattern.test(branch))) {
      console.log(`[vercel-ignore] Skipping build for branch: ${branch}`);
      process.exit(0);
    }

    const { base, head } = getRange();
    const changedFiles = getChangedFiles(base, head);

    if (changedFiles.length === 0) {
      console.log('[vercel-ignore] No changed files detected. Skipping build.');
      process.exit(0);
    }

    const relevantChanges = changedFiles.filter(isBuildRelevant);
    if (relevantChanges.length === 0) {
      console.log('[vercel-ignore] No runtime-relevant files changed. Skipping build.');
      console.log(`[vercel-ignore] Changed files: ${changedFiles.join(', ')}`);
      process.exit(0);
    }

    console.log('[vercel-ignore] Runtime-relevant files changed. Proceeding with build.');
    console.log(`[vercel-ignore] Relevant files: ${relevantChanges.join(', ')}`);
    process.exit(1);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(`[vercel-ignore] Diff check failed (${message}). Proceeding with build.`);
    process.exit(1);
  }
}

main();

