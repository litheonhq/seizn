#!/usr/bin/env node
import { promises as fs } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SRC_DIR = path.join(ROOT, 'src');

async function fileExists(relPath) {
  try {
    await fs.access(path.join(ROOT, relPath));
    return true;
  } catch {
    return false;
  }
}

async function read(relPath) {
  return fs.readFile(path.join(ROOT, relPath), 'utf8');
}

async function listFilesRecursive(dir) {
  const out = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === '.next') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await listFilesRecursive(full)));
    } else {
      out.push(full);
    }
  }
  return out;
}

function rel(fullPath) {
  return path.relative(ROOT, fullPath).replaceAll('\\', '/');
}

const results = [];
function record(name, ok, detail) {
  results.push({ name, ok, detail });
}

async function verifyFileSet(name, files) {
  const missing = [];
  for (const f of files) {
    if (!(await fileExists(f))) missing.push(f);
  }
  record(name, missing.length === 0, missing.length === 0 ? 'ok' : `missing: ${missing.join(', ')}`);
}

async function main() {
  // 1) Intelligent memory graph core
  await verifyFileSet('memory-graph-core', [
    'src/lib/spring/memory-v3/service.ts',
    'src/app/api/spring/mindmap/route.ts',
    'src/app/(dashboard)/dashboard/memories/mindmap/page.tsx',
  ]);

  // 2) Candidate queue (human-in-the-loop)
  await verifyFileSet('memory-candidate-queue', [
    'src/app/api/spring/memory/candidates/route.ts',
    'src/app/(dashboard)/dashboard/memories/candidates/CandidatesClient.tsx',
  ]);

  // 3) E2E encryption guardrail
  await verifyFileSet('e2e-encryption-guardrail', [
    'scripts/db-verify-e2e-encryption.mjs',
    'scripts/run-migration-file.mjs',
    'src/lib/memory/secure-memory-client.ts',
  ]);

  // 4) Tenant policy enforcement
  await verifyFileSet('tenant-policy-enforcement', [
    'src/lib/tenant-policy/enforcer.ts',
    'src/app/api/tenant-policy/enforce/route.ts',
    'src/lib/tenant-policy/enforcer.test.ts',
  ]);

  // 5) Autopilot webhook idempotency/repo-scope checks
  await verifyFileSet('autopilot-webhook-safety', [
    'src/lib/autopilot/github-webhook-reconcile.ts',
    'src/lib/autopilot/__tests__/github-webhook-reconcile.test.ts',
    'src/app/api/webhooks/github/route.ts',
  ]);

  // 6) MCP sampling tool flow
  const mcpIndexPath = 'mcp-server/src/index.ts';
  if (await fileExists(mcpIndexPath)) {
    const mcpIndex = await read(mcpIndexPath);
    const hasTool = mcpIndex.includes('name: "sampling_draft"');
    const hasFallback = mcpIndex.includes('sampling tools capability');
    record(
      'mcp-sampling-draft',
      hasTool && hasFallback,
      hasTool && hasFallback
        ? 'ok'
        : `missing ${[
            !hasTool ? 'sampling_draft tool' : null,
            !hasFallback ? 'fallback branch' : null,
          ]
            .filter(Boolean)
            .join(' + ')}`
    );
  } else {
    record('mcp-sampling-draft', false, `missing: ${mcpIndexPath}`);
  }

  // 7) Anthropic header normalization for prompt caching
  const allSrcFiles = (await listFilesRecursive(SRC_DIR)).filter((p) =>
    p.endsWith('.ts') || p.endsWith('.tsx')
  );
  const hardcodedVersion = [];
  const missingBuilder = [];
  for (const file of allSrcFiles) {
    const text = await fs.readFile(file, 'utf8');
    const r = rel(file);
    const ignored =
      r.endsWith('src/lib/anthropic/prompt-caching.ts') ||
      r.endsWith('src/__tests__/anthropic/prompt-caching.test.ts');

    if (!ignored && text.includes("'anthropic-version': '2023-06-01'")) {
      hardcodedVersion.push(r);
    }

    if (
      text.includes('https://api.anthropic.com/v1/messages') &&
      text.includes('fetch(') &&
      !text.includes('buildAnthropicHeaders(')
    ) {
      missingBuilder.push(r);
    }
  }

  record(
    'anthropic-header-normalization',
    hardcodedVersion.length === 0 && missingBuilder.length === 0,
    [
      hardcodedVersion.length ? `hardcoded-version: ${hardcodedVersion.join(', ')}` : null,
      missingBuilder.length ? `missing-builder: ${missingBuilder.join(', ')}` : null,
      hardcodedVersion.length === 0 && missingBuilder.length === 0 ? 'ok' : null,
    ]
      .filter(Boolean)
      .join(' | ')
  );

  // Print report
  let failures = 0;
  for (const row of results) {
    const icon = row.ok ? 'PASS' : 'FAIL';
    if (!row.ok) failures += 1;
    console.log(`[${icon}] ${row.name}: ${row.detail}`);
  }

  if (failures > 0) {
    console.error(`\nverify-ai-os-memory failed: ${failures} check(s) failed.`);
    process.exit(1);
  }

  console.log('\nverify-ai-os-memory passed.');
}

main().catch((error) => {
  console.error('verify-ai-os-memory crashed:', error);
  process.exit(1);
});
