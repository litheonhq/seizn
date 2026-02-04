#!/usr/bin/env node
/**
 * Seizn OPA Policy Compiler
 *
 * Compiles Rego policies to WASM for production use
 *
 * Usage:
 *   node scripts/compile-opa-policies.mjs
 *
 * Requirements:
 *   - OPA CLI installed: https://www.openpolicyagent.org/docs/latest/#1-download-opa
 *   - Or: brew install opa / choco install opa
 */

import { execSync, spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const POLICIES_DIR = path.join(ROOT_DIR, 'src/lib/opa/policies');
const OUTPUT_DIR = path.join(ROOT_DIR, 'public/policies');
const BUNDLE_VERSION = '1.0.0';

// ============================================
// Configuration
// ============================================

const CONFIG = {
  policies: [
    {
      name: 'seizn',
      files: ['seizn.rego'],
      entrypoints: [
        'seizn/decision',
        'seizn/allow',
        'seizn/deny_reason',
        'seizn/pii_action',
      ],
    },
    {
      name: 'seizn-k12',
      files: ['seizn.rego', 'k12.rego'],
      entrypoints: [
        'seizn/decision',
        'seizn/k12/decision',
        'seizn/k12/hint_level',
        'seizn/k12/safety_action',
      ],
    },
  ],
  // OPA build options
  buildOptions: {
    target: 'wasm',
    capabilities: 'capabilities.json',
    optimize: 2, // Optimization level (0-2)
  },
};

// ============================================
// Helper Functions
// ============================================

function checkOpaInstalled() {
  try {
    execSync('opa version', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

function getOpaVersion() {
  try {
    const output = execSync('opa version', { encoding: 'utf-8' });
    const match = output.match(/Version:\s+(\S+)/);
    return match ? match[1] : 'unknown';
  } catch {
    return 'not installed';
  }
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`📁 Created directory: ${dir}`);
  }
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

// ============================================
// Compilation Functions
// ============================================

async function compilePolicy(policyConfig) {
  const { name, files, entrypoints } = policyConfig;
  console.log(`\n🔨 Compiling policy: ${name}`);

  // Build file paths
  const inputFiles = files.map((f) => path.join(POLICIES_DIR, f));
  const outputFile = path.join(OUTPUT_DIR, `${name}.wasm`);

  // Verify input files exist
  for (const file of inputFiles) {
    if (!fs.existsSync(file)) {
      throw new Error(`Policy file not found: ${file}`);
    }
  }

  // Build OPA command
  const entrypointArgs = entrypoints.flatMap((ep) => ['-e', ep]);
  const args = [
    'build',
    '-t', 'wasm',
    '-O', String(CONFIG.buildOptions.optimize),
    ...entrypointArgs,
    '-o', outputFile,
    ...inputFiles,
  ];

  console.log(`   Running: opa ${args.join(' ')}`);

  return new Promise((resolve, reject) => {
    const proc = spawn('opa', args, {
      cwd: POLICIES_DIR,
      stdio: ['inherit', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data;
    });

    proc.stderr.on('data', (data) => {
      stderr += data;
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        console.error(`   ❌ Compilation failed with code ${code}`);
        console.error(`   stderr: ${stderr}`);
        reject(new Error(`OPA compilation failed: ${stderr}`));
        return;
      }

      // Get output file size
      const stats = fs.statSync(outputFile);
      console.log(`   ✅ Output: ${outputFile} (${formatBytes(stats.size)})`);

      resolve({
        name,
        outputFile,
        size: stats.size,
        entrypoints,
      });
    });

    proc.on('error', (err) => {
      reject(new Error(`Failed to spawn OPA: ${err.message}`));
    });
  });
}

async function generateManifest(results) {
  const manifest = {
    version: BUNDLE_VERSION,
    compiledAt: new Date().toISOString(),
    opaVersion: getOpaVersion(),
    bundles: results.map((r) => ({
      name: r.name,
      file: path.basename(r.outputFile),
      size: r.size,
      entrypoints: r.entrypoints,
    })),
  };

  const manifestPath = path.join(OUTPUT_DIR, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`\n📄 Generated manifest: ${manifestPath}`);

  return manifest;
}

// ============================================
// Validation Functions
// ============================================

async function validatePolicies() {
  console.log('\n🔍 Validating policies...');

  for (const policy of CONFIG.policies) {
    for (const file of policy.files) {
      const filePath = path.join(POLICIES_DIR, file);

      if (!fs.existsSync(filePath)) {
        console.log(`   ⚠️  File not found: ${file}`);
        continue;
      }

      try {
        execSync(`opa check ${filePath}`, { stdio: 'pipe' });
        console.log(`   ✅ ${file}: valid`);
      } catch (error) {
        console.log(`   ❌ ${file}: invalid`);
        console.log(`      ${error.stderr?.toString() || error.message}`);
      }
    }
  }
}

async function testPolicies() {
  console.log('\n🧪 Running policy tests...');

  // Find test files
  const testFiles = fs.readdirSync(POLICIES_DIR).filter((f) => f.endsWith('_test.rego'));

  if (testFiles.length === 0) {
    console.log('   No test files found (looking for *_test.rego)');
    return;
  }

  for (const testFile of testFiles) {
    const testPath = path.join(POLICIES_DIR, testFile);

    try {
      const output = execSync(`opa test ${POLICIES_DIR} -v`, { encoding: 'utf-8' });
      console.log(output);
    } catch (error) {
      console.log(`   ❌ Tests failed: ${error.message}`);
    }
  }
}

// ============================================
// Main
// ============================================

async function main() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║           Seizn OPA Policy Compiler                        ║');
  console.log('╚════════════════════════════════════════════════════════════╝');

  // Check OPA installation
  if (!checkOpaInstalled()) {
    console.error('\n❌ OPA CLI not found!');
    console.error('   Please install OPA: https://www.openpolicyagent.org/docs/latest/#1-download-opa');
    console.error('   Or: brew install opa / choco install opa');
    process.exit(1);
  }

  console.log(`\n📦 OPA Version: ${getOpaVersion()}`);
  console.log(`📁 Policies: ${POLICIES_DIR}`);
  console.log(`📁 Output: ${OUTPUT_DIR}`);

  // Ensure output directory exists
  ensureDir(OUTPUT_DIR);

  // Validate policies
  await validatePolicies();

  // Run tests
  await testPolicies();

  // Compile policies
  console.log('\n📦 Compiling policies to WASM...');
  const results = [];

  for (const policy of CONFIG.policies) {
    try {
      const result = await compilePolicy(policy);
      results.push(result);
    } catch (error) {
      console.error(`\n❌ Failed to compile ${policy.name}: ${error.message}`);
      // Continue with other policies
    }
  }

  if (results.length === 0) {
    console.error('\n❌ No policies compiled successfully');
    process.exit(1);
  }

  // Generate manifest
  const manifest = await generateManifest(results);

  // Summary
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║                    Compilation Complete                     ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log(`\n✅ Compiled ${results.length}/${CONFIG.policies.length} policies`);
  console.log(`📦 Bundle version: ${manifest.version}`);
  console.log(`📅 Compiled at: ${manifest.compiledAt}`);
  console.log('\nBundles:');
  for (const bundle of manifest.bundles) {
    console.log(`   - ${bundle.name}: ${formatBytes(bundle.size)} (${bundle.entrypoints.length} entrypoints)`);
  }
}

main().catch((error) => {
  console.error('\n❌ Fatal error:', error.message);
  process.exit(1);
});
