#!/usr/bin/env npx ts-node
/**
 * Evidence Pack Verification CLI
 *
 * Verifies the integrity and authenticity of Seizn Evidence Packs.
 *
 * Usage:
 *   npx ts-node scripts/verify-evidence-pack.ts <path-to-evidence.json>
 *   npx ts-node scripts/verify-evidence-pack.ts --zip <path-to-evidence.zip>
 *
 * Options:
 *   --verbose, -v    Show detailed verification output
 *   --json           Output results as JSON
 *   --zip            Input is a zip file containing evidence.json
 *   --help, -h       Show help
 *
 * Exit codes:
 *   0 - Verification successful
 *   1 - Verification failed
 *   2 - Invalid input or file not found
 */

import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import * as readline from "readline";

// ANSI color codes for terminal output
const colors = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
};

// Evidence Pack types (simplified from evidence-pack.ts)
interface EvidencePack {
  id: string;
  version: string;
  created: string;
  provenance: ProvDocument;
  signature?: {
    algorithm: string;
    value: string;
    publicKey: string;
  };
  metadata: {
    organizationId: string;
    traceId?: string;
    purpose?: string;
    retentionDays?: number;
  };
  hash: string;
}

interface ProvDocument {
  "@context": Record<string, string>;
  id: string;
  type: string;
  generatedAtTime: string;
  entity: Record<string, unknown>;
  activity: Record<string, unknown>;
  agent: Record<string, unknown>;
  wasGeneratedBy: Record<string, unknown>;
  used: Record<string, unknown>;
  wasDerivedFrom: Record<string, unknown>;
  wasAttributedTo: Record<string, unknown>;
  wasAssociatedWith: Record<string, unknown>;
}

interface VerificationResult {
  valid: boolean;
  checks: {
    name: string;
    passed: boolean;
    message?: string;
  }[];
  summary: {
    totalChecks: number;
    passed: number;
    failed: number;
  };
  evidencePack?: {
    id: string;
    version: string;
    created: string;
    organizationId: string;
    traceId?: string;
    entityCount: number;
    activityCount: number;
    agentCount: number;
  };
}

// Parse command line arguments
function parseArgs(): {
  filePath: string;
  verbose: boolean;
  json: boolean;
  zip: boolean;
  help: boolean;
} {
  const args = process.argv.slice(2);
  const result = {
    filePath: "",
    verbose: false,
    json: false,
    zip: false,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "--verbose" || arg === "-v") {
      result.verbose = true;
    } else if (arg === "--json") {
      result.json = true;
    } else if (arg === "--zip") {
      result.zip = true;
    } else if (arg === "--help" || arg === "-h") {
      result.help = true;
    } else if (!arg.startsWith("-")) {
      result.filePath = arg;
    }
  }

  return result;
}

// Print help message
function printHelp(): void {
  console.log(`
${colors.bold}Seizn Evidence Pack Verification CLI${colors.reset}

${colors.cyan}Usage:${colors.reset}
  npx ts-node scripts/verify-evidence-pack.ts <path-to-evidence.json>
  npx ts-node scripts/verify-evidence-pack.ts --zip <path-to-evidence.zip>

${colors.cyan}Options:${colors.reset}
  --verbose, -v    Show detailed verification output
  --json           Output results as JSON
  --zip            Input is a zip file containing evidence.json
  --help, -h       Show this help message

${colors.cyan}Examples:${colors.reset}
  # Verify a JSON evidence pack
  npx ts-node scripts/verify-evidence-pack.ts ./evidence-abc123.json

  # Verify with verbose output
  npx ts-node scripts/verify-evidence-pack.ts -v ./evidence-abc123.json

  # Output results as JSON (useful for CI/CD)
  npx ts-node scripts/verify-evidence-pack.ts --json ./evidence-abc123.json

${colors.cyan}Exit Codes:${colors.reset}
  0 - Verification successful
  1 - Verification failed
  2 - Invalid input or file not found

${colors.cyan}Verification Checks:${colors.reset}
  1. Schema validation - Ensures the evidence pack has required fields
  2. Hash integrity - Verifies the content hash matches
  3. Signature verification - Validates the cryptographic signature (if present)
  4. Provenance completeness - Checks W3C PROV document structure
  5. Temporal consistency - Validates timestamps are consistent
  6. Reference integrity - Ensures all references are valid
`);
}

// Load evidence pack from file
async function loadEvidencePack(filePath: string, isZip: boolean): Promise<EvidencePack> {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  let content: string;

  if (isZip) {
    // For zip files, we'd need to use a zip library
    // For simplicity, we'll just look for evidence.json in the current directory
    throw new Error("ZIP support requires 'adm-zip' package. Please extract the zip and pass the JSON file directly.");
  } else {
    content = fs.readFileSync(filePath, "utf-8");
  }

  try {
    return JSON.parse(content) as EvidencePack;
  } catch {
    throw new Error("Invalid JSON format in evidence pack file");
  }
}

// Calculate hash of provenance document
function calculateHash(provenance: ProvDocument): string {
  const normalized = JSON.stringify(provenance, Object.keys(provenance).sort());
  return crypto.createHash("sha256").update(normalized).digest("hex");
}

// Verify signature
function verifySignature(pack: EvidencePack): { valid: boolean; message?: string } {
  if (!pack.signature) {
    return { valid: true, message: "No signature present (optional)" };
  }

  try {
    const { algorithm, value, publicKey } = pack.signature;

    // Calculate the data that was signed
    const dataToVerify = JSON.stringify({
      id: pack.id,
      version: pack.version,
      created: pack.created,
      provenance: pack.provenance,
      metadata: pack.metadata,
      hash: pack.hash,
    });

    // Verify the signature
    const verifier = crypto.createVerify(algorithm);
    verifier.update(dataToVerify);
    const isValid = verifier.verify(publicKey, Buffer.from(value, "base64"));

    return { valid: isValid, message: isValid ? "Signature verified" : "Invalid signature" };
  } catch (error) {
    return {
      valid: false,
      message: `Signature verification error: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }
}

// Check schema validity
function checkSchema(pack: EvidencePack): { valid: boolean; message?: string } {
  const requiredFields = ["id", "version", "created", "provenance", "metadata", "hash"];
  const missing = requiredFields.filter((field) => !(field in pack));

  if (missing.length > 0) {
    return { valid: false, message: `Missing required fields: ${missing.join(", ")}` };
  }

  if (!pack.provenance || typeof pack.provenance !== "object") {
    return { valid: false, message: "Invalid provenance document" };
  }

  if (!pack.metadata || typeof pack.metadata !== "object") {
    return { valid: false, message: "Invalid metadata" };
  }

  return { valid: true, message: "Schema valid" };
}

// Check provenance completeness
function checkProvenanceCompleteness(provenance: ProvDocument): { valid: boolean; message?: string } {
  const requiredSections = [
    "@context",
    "id",
    "type",
    "generatedAtTime",
    "entity",
    "activity",
    "agent",
  ];

  const missing = requiredSections.filter((section) => !(section in provenance));

  if (missing.length > 0) {
    return {
      valid: false,
      message: `Missing provenance sections: ${missing.join(", ")}`,
    };
  }

  // Check W3C PROV type
  if (provenance.type !== "prov:Bundle") {
    return {
      valid: false,
      message: `Invalid provenance type: expected 'prov:Bundle', got '${provenance.type}'`,
    };
  }

  return { valid: true, message: "Provenance structure complete" };
}

// Check temporal consistency
function checkTemporalConsistency(pack: EvidencePack): { valid: boolean; message?: string } {
  try {
    const packCreated = new Date(pack.created);
    const provGenerated = new Date(pack.provenance.generatedAtTime);

    if (isNaN(packCreated.getTime())) {
      return { valid: false, message: "Invalid pack creation timestamp" };
    }

    if (isNaN(provGenerated.getTime())) {
      return { valid: false, message: "Invalid provenance generation timestamp" };
    }

    // Pack should be created after or at the same time as provenance
    if (packCreated < provGenerated) {
      return {
        valid: false,
        message: "Pack creation time is before provenance generation time",
      };
    }

    // Check if timestamp is not in the future (with 5 minute tolerance)
    const now = new Date();
    const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000);

    if (packCreated > fiveMinutesFromNow) {
      return { valid: false, message: "Pack creation time is in the future" };
    }

    return { valid: true, message: "Timestamps are consistent" };
  } catch (error) {
    return {
      valid: false,
      message: `Temporal check error: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }
}

// Check reference integrity
function checkReferenceIntegrity(provenance: ProvDocument): { valid: boolean; message?: string } {
  const entityIds = new Set(Object.keys(provenance.entity || {}));
  const activityIds = new Set(Object.keys(provenance.activity || {}));
  const agentIds = new Set(Object.keys(provenance.agent || {}));

  const errors: string[] = [];

  // Check wasGeneratedBy references
  for (const [, gen] of Object.entries(provenance.wasGeneratedBy || {})) {
    const g = gen as { entity?: string; activity?: string };
    if (g.entity && !entityIds.has(g.entity)) {
      errors.push(`wasGeneratedBy references unknown entity: ${g.entity}`);
    }
    if (g.activity && !activityIds.has(g.activity)) {
      errors.push(`wasGeneratedBy references unknown activity: ${g.activity}`);
    }
  }

  // Check used references
  for (const [, usage] of Object.entries(provenance.used || {})) {
    const u = usage as { entity?: string; activity?: string };
    if (u.entity && !entityIds.has(u.entity)) {
      errors.push(`used references unknown entity: ${u.entity}`);
    }
    if (u.activity && !activityIds.has(u.activity)) {
      errors.push(`used references unknown activity: ${u.activity}`);
    }
  }

  // Check wasDerivedFrom references
  for (const [, derivation] of Object.entries(provenance.wasDerivedFrom || {})) {
    const d = derivation as { generatedEntity?: string; usedEntity?: string };
    if (d.generatedEntity && !entityIds.has(d.generatedEntity)) {
      errors.push(`wasDerivedFrom references unknown entity: ${d.generatedEntity}`);
    }
    if (d.usedEntity && !entityIds.has(d.usedEntity)) {
      errors.push(`wasDerivedFrom references unknown entity: ${d.usedEntity}`);
    }
  }

  // Check wasAttributedTo references
  for (const [, attr] of Object.entries(provenance.wasAttributedTo || {})) {
    const a = attr as { entity?: string; agent?: string };
    if (a.entity && !entityIds.has(a.entity)) {
      errors.push(`wasAttributedTo references unknown entity: ${a.entity}`);
    }
    if (a.agent && !agentIds.has(a.agent)) {
      errors.push(`wasAttributedTo references unknown agent: ${a.agent}`);
    }
  }

  // Check wasAssociatedWith references
  for (const [, assoc] of Object.entries(provenance.wasAssociatedWith || {})) {
    const as = assoc as { activity?: string; agent?: string };
    if (as.activity && !activityIds.has(as.activity)) {
      errors.push(`wasAssociatedWith references unknown activity: ${as.activity}`);
    }
    if (as.agent && !agentIds.has(as.agent)) {
      errors.push(`wasAssociatedWith references unknown agent: ${as.agent}`);
    }
  }

  if (errors.length > 0) {
    return {
      valid: false,
      message: errors.join("; "),
    };
  }

  return { valid: true, message: "All references are valid" };
}

// Main verification function
async function verifyEvidencePack(
  filePath: string,
  isZip: boolean,
  verbose: boolean
): Promise<VerificationResult> {
  const checks: VerificationResult["checks"] = [];

  // Load evidence pack
  let pack: EvidencePack;
  try {
    pack = await loadEvidencePack(filePath, isZip);
  } catch (error) {
    return {
      valid: false,
      checks: [
        {
          name: "File Loading",
          passed: false,
          message: error instanceof Error ? error.message : "Failed to load file",
        },
      ],
      summary: { totalChecks: 1, passed: 0, failed: 1 },
    };
  }

  // 1. Schema validation
  const schemaCheck = checkSchema(pack);
  checks.push({ name: "Schema Validation", passed: schemaCheck.valid, message: schemaCheck.message });

  if (!schemaCheck.valid) {
    return {
      valid: false,
      checks,
      summary: { totalChecks: checks.length, passed: 0, failed: checks.length },
    };
  }

  // 2. Hash integrity
  const calculatedHash = calculateHash(pack.provenance);
  const hashValid = calculatedHash === pack.hash;
  checks.push({
    name: "Hash Integrity",
    passed: hashValid,
    message: hashValid
      ? "Content hash verified"
      : `Hash mismatch: expected ${pack.hash}, got ${calculatedHash}`,
  });

  // 3. Signature verification
  const sigCheck = verifySignature(pack);
  checks.push({ name: "Signature Verification", passed: sigCheck.valid, message: sigCheck.message });

  // 4. Provenance completeness
  const provCheck = checkProvenanceCompleteness(pack.provenance);
  checks.push({ name: "Provenance Completeness", passed: provCheck.valid, message: provCheck.message });

  // 5. Temporal consistency
  const timeCheck = checkTemporalConsistency(pack);
  checks.push({ name: "Temporal Consistency", passed: timeCheck.valid, message: timeCheck.message });

  // 6. Reference integrity
  const refCheck = checkReferenceIntegrity(pack.provenance);
  checks.push({ name: "Reference Integrity", passed: refCheck.valid, message: refCheck.message });

  // Calculate summary
  const passed = checks.filter((c) => c.passed).length;
  const failed = checks.filter((c) => !c.passed).length;

  return {
    valid: failed === 0,
    checks,
    summary: { totalChecks: checks.length, passed, failed },
    evidencePack: {
      id: pack.id,
      version: pack.version,
      created: pack.created,
      organizationId: pack.metadata.organizationId,
      traceId: pack.metadata.traceId,
      entityCount: Object.keys(pack.provenance.entity || {}).length,
      activityCount: Object.keys(pack.provenance.activity || {}).length,
      agentCount: Object.keys(pack.provenance.agent || {}).length,
    },
  };
}

// Print results to console
function printResults(result: VerificationResult, verbose: boolean): void {
  console.log();
  console.log(`${colors.bold}╔════════════════════════════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.bold}║          Seizn Evidence Pack Verification Report           ║${colors.reset}`);
  console.log(`${colors.bold}╚════════════════════════════════════════════════════════════╝${colors.reset}`);
  console.log();

  if (result.evidencePack) {
    console.log(`${colors.cyan}Evidence Pack Info:${colors.reset}`);
    console.log(`  ID:           ${result.evidencePack.id}`);
    console.log(`  Version:      ${result.evidencePack.version}`);
    console.log(`  Created:      ${result.evidencePack.created}`);
    console.log(`  Organization: ${result.evidencePack.organizationId}`);
    if (result.evidencePack.traceId) {
      console.log(`  Trace ID:     ${result.evidencePack.traceId}`);
    }
    console.log(`  Entities:     ${result.evidencePack.entityCount}`);
    console.log(`  Activities:   ${result.evidencePack.activityCount}`);
    console.log(`  Agents:       ${result.evidencePack.agentCount}`);
    console.log();
  }

  console.log(`${colors.cyan}Verification Checks:${colors.reset}`);
  console.log();

  for (const check of result.checks) {
    const icon = check.passed ? `${colors.green}✓${colors.reset}` : `${colors.red}✗${colors.reset}`;
    const status = check.passed ? `${colors.green}PASS${colors.reset}` : `${colors.red}FAIL${colors.reset}`;

    console.log(`  ${icon} ${check.name}: ${status}`);

    if (verbose && check.message) {
      console.log(`    ${colors.dim}${check.message}${colors.reset}`);
    }
  }

  console.log();
  console.log(`${colors.cyan}Summary:${colors.reset}`);
  console.log(`  Total Checks: ${result.summary.totalChecks}`);
  console.log(`  Passed:       ${colors.green}${result.summary.passed}${colors.reset}`);
  console.log(`  Failed:       ${result.summary.failed > 0 ? colors.red : ""}${result.summary.failed}${colors.reset}`);
  console.log();

  if (result.valid) {
    console.log(`${colors.green}${colors.bold}✓ VERIFICATION SUCCESSFUL${colors.reset}`);
    console.log(`${colors.dim}  The evidence pack is valid and has not been tampered with.${colors.reset}`);
  } else {
    console.log(`${colors.red}${colors.bold}✗ VERIFICATION FAILED${colors.reset}`);
    console.log(`${colors.dim}  The evidence pack failed one or more verification checks.${colors.reset}`);
  }

  console.log();
}

// Main entry point
async function main(): Promise<void> {
  const args = parseArgs();

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  if (!args.filePath) {
    console.error(`${colors.red}Error: No input file specified${colors.reset}`);
    console.error("Use --help for usage information");
    process.exit(2);
  }

  try {
    const result = await verifyEvidencePack(args.filePath, args.zip, args.verbose);

    if (args.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      printResults(result, args.verbose);
    }

    process.exit(result.valid ? 0 : 1);
  } catch (error) {
    if (args.json) {
      console.log(
        JSON.stringify({
          valid: false,
          error: error instanceof Error ? error.message : "Unknown error",
        })
      );
    } else {
      console.error(`${colors.red}Error: ${error instanceof Error ? error.message : "Unknown error"}${colors.reset}`);
    }
    process.exit(2);
  }
}

// Run main function
main().catch(console.error);
