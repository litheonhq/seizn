#!/usr/bin/env node

/**
 * Seizn Evidence Pack Verification CLI
 *
 * Verifies the integrity of exported Seizn evidence packs.
 * Supports both JSON and ZIP (base64-encoded) export formats.
 *
 * Usage:
 *   seizn-verify <evidence-pack-file>
 *   npx seizn-verify-evidence <evidence-pack-file>
 *
 * Exit codes:
 *   0 = Verified successfully
 *   1 = Verification failed (integrity issue)
 *   2 = Error (file not found, invalid format, etc.)
 */

import { readFileSync } from 'fs';
import { resolve, extname } from 'path';
import { createHash, createVerify, createHmac } from 'crypto';

// ============================================
// Types (mirrored from seizn core, standalone)
// ============================================

interface Evidence {
  id: string;
  type: string;
  content: string | Record<string, unknown>;
  hash: string;
  timestamp: string;
  source?: {
    documentId?: string;
    chunkId?: string;
    pageNumber?: number;
    url?: string;
  };
  metadata?: Record<string, unknown>;
}

interface ChainLink {
  index: number;
  evidence: Evidence;
  linkHash: string;
  previousHash: string | null;
  timestamp: string;
}

interface ProofChainMeta {
  id: string;
  userId: string;
  traceId?: string;
  version: string;
  hashAlgorithm: string;
  rootHash: string;
  finalHash: string;
  chainLength?: number;
  status: string;
  createdAt: string;
  updatedAt: string;
}

interface ProofChainRecord extends ProofChainMeta {
  chain: ChainLink[];
}

interface SignatureData {
  id: string;
  proofChainId?: string;
  algorithm: string;
  hashAlgorithm: string;
  signedHash: string;
  signature: string;
  keyId: string;
  signerId: string;
  signedAt: string;
  validUntil?: string;
  claims?: Record<string, unknown>;
}

interface ProvenanceSignature {
  algorithm: string;
  value: string;
  publicKey: string;
}

interface ProvDocument {
  '@context'?: Record<string, string>;
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

interface ProvenanceEvidencePack {
  id: string;
  version: string;
  created: string;
  provenance: ProvDocument;
  signature?: ProvenanceSignature;
  metadata: Record<string, unknown>;
  hash: string;
}

interface Manifest {
  version: string;
  format: string;
  exportedAt: string;
  proofChainId: string;
  signatureId: string;
  files: string[];
}

interface ZipStructure {
  format: string;
  version: string;
  entries: Array<{ path: string; content: string }>;
}

interface PackFile {
  name: string;
  path: string;
  contentType: string;
  size: number;
  checksum: string;
}

// ============================================
// Verification Report
// ============================================

type CheckStatus = 'pass' | 'fail' | 'warn' | 'skip';

interface CheckResult {
  name: string;
  status: CheckStatus;
  message: string;
  details?: string;
}

interface VerificationReport {
  file: string;
  format: 'json' | 'zip' | 'provenance-json' | 'unknown';
  timestamp: string;
  checks: CheckResult[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    warnings: number;
    skipped: number;
  };
  verdict: 'VERIFIED' | 'FAILED' | 'ERROR';
}

// ============================================
// Hash Utilities
// ============================================

function generateHash(data: string, algorithm = 'sha256'): string {
  return createHash(algorithm).update(data).digest('hex');
}

function hashObject(obj: Record<string, unknown>, algorithm = 'sha256'): string {
  const sortedJson = JSON.stringify(obj, Object.keys(obj).sort());
  return generateHash(sortedJson, algorithm);
}

function hashEvidence(content: string | Record<string, unknown>, algorithm = 'sha256'): string {
  if (typeof content === 'string') {
    return generateHash(content, algorithm);
  }
  return hashObject(content, algorithm);
}

function generateLinkHash(
  evidence: { id: string; type: string; hash: string; timestamp: string },
  previousHash: string | null,
  algorithm = 'sha256'
): string {
  const linkData: Record<string, unknown> = {
    evidenceId: evidence.id,
    evidenceType: evidence.type,
    evidenceHash: evidence.hash,
    timestamp: evidence.timestamp,
    previousHash: previousHash || 'genesis',
  };
  return hashObject(linkData, algorithm);
}

// ============================================
// Format Detection
// ============================================

type DetectedFormat =
  | { type: 'pcr-json'; data: Record<string, unknown> }
  | { type: 'pcr-zip'; data: ZipStructure }
  | { type: 'provenance-json'; data: ProvenanceEvidencePack }
  | { type: 'unknown'; raw: string };

function detectFormat(raw: string): DetectedFormat {
  let parsed: Record<string, unknown>;

  // Try to parse as JSON directly
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Try to decode as base64 first (ZIP format is base64-encoded JSON)
    try {
      const decoded = Buffer.from(raw, 'base64').toString('utf-8');
      parsed = JSON.parse(decoded);

      // Check if it's the ZIP structure
      if (
        typeof parsed === 'object' &&
        parsed !== null &&
        (parsed as Record<string, unknown>).format === 'seizn-evidence-pack-zip'
      ) {
        return { type: 'pcr-zip', data: parsed as unknown as ZipStructure };
      }
    } catch {
      return { type: 'unknown', raw };
    }
  }

  // Detect PCR JSON export format (has proofChain + signature at top level)
  if (parsed.proofChain && parsed.signature && parsed.version) {
    return { type: 'pcr-json', data: parsed };
  }

  // Detect ZIP-format JSON wrapper (base64 content inside a JSON response)
  if (parsed.content && parsed.pack) {
    // This is the API response wrapper; the actual content is base64
    try {
      const decoded = Buffer.from(parsed.content as string, 'base64').toString('utf-8');
      const inner = JSON.parse(decoded);
      if (inner.format === 'seizn-evidence-pack-zip') {
        return { type: 'pcr-zip', data: inner as ZipStructure };
      }
    } catch {
      // Fall through
    }
  }

  // Detect W3C PROV evidence pack format (has provenance + hash)
  if (parsed.provenance && parsed.hash && parsed.id) {
    return { type: 'provenance-json', data: parsed as unknown as ProvenanceEvidencePack };
  }

  // Detect the ZIP structure directly if it was already parsed
  if (parsed.format === 'seizn-evidence-pack-zip') {
    return { type: 'pcr-zip', data: parsed as unknown as ZipStructure };
  }

  return { type: 'unknown', raw };
}

// ============================================
// PCR JSON Verification
// ============================================

function verifyPcrJson(data: Record<string, unknown>): CheckResult[] {
  const checks: CheckResult[] = [];

  // Check 1: Proof chain metadata present
  const proofChain = data.proofChain as ProofChainMeta | undefined;
  if (!proofChain || !proofChain.id) {
    checks.push({
      name: 'Proof chain metadata',
      status: 'fail',
      message: 'Missing or invalid proof chain metadata',
    });
    return checks;
  }
  checks.push({
    name: 'Proof chain metadata',
    status: 'pass',
    message: `Proof chain ${proofChain.id} found`,
    details: `Version: ${proofChain.version}, Algorithm: ${proofChain.hashAlgorithm}`,
  });

  // Check 2: Signature present
  const signature = data.signature as SignatureData | undefined;
  if (!signature || !signature.id) {
    checks.push({
      name: 'Signature present',
      status: 'fail',
      message: 'Missing signature data',
    });
  } else {
    checks.push({
      name: 'Signature present',
      status: 'pass',
      message: `Signature ${signature.id} found`,
      details: `Algorithm: ${signature.algorithm}-${signature.hashAlgorithm}, Signer: ${signature.signerId}`,
    });

    // Check 2a: Signature expiration
    if (signature.validUntil) {
      const expiresAt = new Date(signature.validUntil);
      if (expiresAt < new Date()) {
        checks.push({
          name: 'Signature validity',
          status: 'warn',
          message: `Signature expired at ${signature.validUntil}`,
        });
      } else {
        checks.push({
          name: 'Signature validity',
          status: 'pass',
          message: `Signature valid until ${signature.validUntil}`,
        });
      }
    }

    // Check 2b: Signature proof chain ID matches
    if (signature.proofChainId && signature.proofChainId !== proofChain.id) {
      checks.push({
        name: 'Signature chain ID match',
        status: 'fail',
        message: 'Signature proofChainId does not match proof chain ID',
        details: `Expected: ${proofChain.id}, Got: ${signature.proofChainId}`,
      });
    } else if (signature.proofChainId) {
      checks.push({
        name: 'Signature chain ID match',
        status: 'pass',
        message: 'Signature references correct proof chain',
      });
    }

    // Check 2c: Verify signed hash against proof chain data
    const dataToSign: Record<string, unknown> = {
      proofChainId: proofChain.id,
      rootHash: proofChain.rootHash,
      finalHash: proofChain.finalHash,
      chainLength: (data.chain as ChainLink[] | undefined)?.length ?? proofChain.chainLength ?? 0,
      version: proofChain.version,
    };
    const expectedSignedHash = hashObject(dataToSign, signature.hashAlgorithm || 'sha256');

    if (expectedSignedHash !== signature.signedHash) {
      checks.push({
        name: 'Signed hash integrity',
        status: 'fail',
        message: 'Signed hash does not match recomputed proof chain hash',
        details: `Expected: ${expectedSignedHash}, Got: ${signature.signedHash}`,
      });
    } else {
      checks.push({
        name: 'Signed hash integrity',
        status: 'pass',
        message: 'Signed hash matches proof chain data',
      });
    }
  }

  // Check 3: Chain present and verifiable
  const chain = data.chain as ChainLink[] | undefined;
  if (!chain || !Array.isArray(chain) || chain.length === 0) {
    checks.push({
      name: 'Chain data',
      status: 'skip',
      message: 'No chain data present (hash-only export or missing)',
    });
  } else {
    checks.push({
      name: 'Chain data',
      status: 'pass',
      message: `Chain contains ${chain.length} links`,
    });

    // Check 3a: Chain integrity
    const hashAlgorithm = proofChain.hashAlgorithm || 'sha256';
    const brokenLinks: number[] = [];

    for (let i = 0; i < chain.length; i++) {
      const link = chain[i];

      // Verify link index
      if (link.index !== i) {
        brokenLinks.push(i);
        continue;
      }

      // Verify previous hash reference
      if (i === 0) {
        if (link.previousHash !== null) {
          brokenLinks.push(i);
          continue;
        }
      } else {
        if (link.previousHash !== chain[i - 1].linkHash) {
          brokenLinks.push(i);
          continue;
        }
      }

      // Verify evidence hash
      if (link.evidence && link.evidence.content !== undefined) {
        const expectedEvidenceHash = hashEvidence(link.evidence.content, hashAlgorithm);
        if (link.evidence.hash !== expectedEvidenceHash) {
          brokenLinks.push(i);
          continue;
        }
      }

      // Verify link hash
      const expectedLinkHash = generateLinkHash(link.evidence, link.previousHash, hashAlgorithm);
      if (link.linkHash !== expectedLinkHash) {
        brokenLinks.push(i);
      }
    }

    if (brokenLinks.length === 0) {
      checks.push({
        name: 'Chain integrity',
        status: 'pass',
        message: `All ${chain.length} chain links verified`,
      });
    } else {
      checks.push({
        name: 'Chain integrity',
        status: 'fail',
        message: `Chain broken at ${brokenLinks.length} link(s)`,
        details: `Broken links: ${brokenLinks.join(', ')}`,
      });
    }

    // Check 3b: Root hash matches first link
    if (chain[0].linkHash !== proofChain.rootHash) {
      checks.push({
        name: 'Root hash',
        status: 'fail',
        message: 'Root hash does not match first chain link',
        details: `Expected: ${proofChain.rootHash}, Got: ${chain[0].linkHash}`,
      });
    } else {
      checks.push({
        name: 'Root hash',
        status: 'pass',
        message: 'Root hash matches genesis link',
      });
    }

    // Check 3c: Final hash matches last link
    if (chain[chain.length - 1].linkHash !== proofChain.finalHash) {
      checks.push({
        name: 'Final hash',
        status: 'fail',
        message: 'Final hash does not match last chain link',
        details: `Expected: ${proofChain.finalHash}, Got: ${chain[chain.length - 1].linkHash}`,
      });
    } else {
      checks.push({
        name: 'Final hash',
        status: 'pass',
        message: 'Final hash matches terminal link',
      });
    }
  }

  // Check 4: Summary present (informational)
  if (data.summary) {
    checks.push({
      name: 'Summary',
      status: 'pass',
      message: 'Summary data present',
    });
  }

  return checks;
}

// ============================================
// PCR ZIP (base64-encoded JSON) Verification
// ============================================

function verifyPcrZip(data: ZipStructure, packFiles?: PackFile[]): CheckResult[] {
  const checks: CheckResult[] = [];

  // Build entry map
  const entryMap = new Map<string, string>();
  for (const entry of data.entries) {
    entryMap.set(entry.path, entry.content);
  }

  // Check 1: Manifest exists
  const manifestRaw = entryMap.get('manifest.json');
  if (!manifestRaw) {
    checks.push({
      name: 'Manifest present',
      status: 'fail',
      message: 'manifest.json not found in archive',
    });
    return checks;
  }

  let manifest: Manifest;
  try {
    manifest = JSON.parse(manifestRaw);
    checks.push({
      name: 'Manifest present',
      status: 'pass',
      message: `Manifest found: format=${manifest.format}, version=${manifest.version}`,
      details: `Exported at: ${manifest.exportedAt}`,
    });
  } catch {
    checks.push({
      name: 'Manifest present',
      status: 'fail',
      message: 'manifest.json is not valid JSON',
    });
    return checks;
  }

  // Check 2: All listed files exist in the archive
  const missingFiles: string[] = [];
  for (const filePath of manifest.files) {
    if (!entryMap.has(filePath)) {
      missingFiles.push(filePath);
    }
  }

  if (missingFiles.length === 0) {
    checks.push({
      name: 'File completeness',
      status: 'pass',
      message: `All ${manifest.files.length} manifest files present in archive`,
    });
  } else {
    checks.push({
      name: 'File completeness',
      status: 'fail',
      message: `${missingFiles.length} file(s) missing from archive`,
      details: `Missing: ${missingFiles.join(', ')}`,
    });
  }

  // Check 3: SHA-256 checksums of files match PackFile metadata (if available)
  if (packFiles && packFiles.length > 0) {
    let checksumMismatches = 0;
    for (const pf of packFiles) {
      const content = entryMap.get(pf.path);
      if (content !== undefined) {
        const actualChecksum = generateHash(content, 'sha256');
        if (actualChecksum !== pf.checksum) {
          checksumMismatches++;
        }
      }
    }

    if (checksumMismatches === 0) {
      checks.push({
        name: 'File checksums',
        status: 'pass',
        message: `All ${packFiles.length} file checksums verified`,
      });
    } else {
      checks.push({
        name: 'File checksums',
        status: 'fail',
        message: `${checksumMismatches} file(s) have checksum mismatches`,
      });
    }
  } else {
    checks.push({
      name: 'File checksums',
      status: 'skip',
      message: 'No PackFile metadata available for checksum verification',
    });
  }

  // Check 4: Proof chain metadata
  const metadataRaw = entryMap.get('proof-chain/metadata.json');
  let proofChainMeta: ProofChainMeta | undefined;
  if (!metadataRaw) {
    checks.push({
      name: 'Proof chain metadata',
      status: 'fail',
      message: 'proof-chain/metadata.json not found',
    });
  } else {
    try {
      proofChainMeta = JSON.parse(metadataRaw);
      checks.push({
        name: 'Proof chain metadata',
        status: 'pass',
        message: `Proof chain ${proofChainMeta!.id} (${proofChainMeta!.status})`,
        details: `Hash: ${proofChainMeta!.hashAlgorithm}, Root: ${proofChainMeta!.rootHash?.substring(0, 16)}...`,
      });
    } catch {
      checks.push({
        name: 'Proof chain metadata',
        status: 'fail',
        message: 'proof-chain/metadata.json is not valid JSON',
      });
    }
  }

  // Check 5: Chain link files exist and verify integrity
  const linkFiles = manifest.files.filter((f) => f.startsWith('proof-chain/links/'));
  const chainHashFile = manifest.files.find((f) => f === 'proof-chain/chain-hashes.json');

  if (linkFiles.length > 0) {
    const links: ChainLink[] = [];
    let parseErrors = 0;

    for (const linkFile of linkFiles.sort()) {
      const content = entryMap.get(linkFile);
      if (content) {
        try {
          links.push(JSON.parse(content));
        } catch {
          parseErrors++;
        }
      }
    }

    if (parseErrors > 0) {
      checks.push({
        name: 'Chain link files',
        status: 'fail',
        message: `${parseErrors} chain link file(s) failed to parse`,
      });
    } else {
      checks.push({
        name: 'Chain link files',
        status: 'pass',
        message: `${links.length} chain link files parsed successfully`,
      });

      // Verify chain integrity
      const hashAlgorithm = proofChainMeta?.hashAlgorithm || 'sha256';
      const brokenLinks: number[] = [];

      // Sort by index
      links.sort((a, b) => a.index - b.index);

      for (let i = 0; i < links.length; i++) {
        const link = links[i];

        if (link.index !== i) {
          brokenLinks.push(i);
          continue;
        }

        if (i === 0 && link.previousHash !== null) {
          brokenLinks.push(i);
          continue;
        }

        if (i > 0 && link.previousHash !== links[i - 1].linkHash) {
          brokenLinks.push(i);
          continue;
        }

        // Verify evidence content hash
        if (link.evidence && link.evidence.content !== undefined) {
          const expectedEvidenceHash = hashEvidence(link.evidence.content, hashAlgorithm);
          if (link.evidence.hash !== expectedEvidenceHash) {
            brokenLinks.push(i);
            continue;
          }
        }

        // Verify link hash
        const expectedLinkHash = generateLinkHash(link.evidence, link.previousHash, hashAlgorithm);
        if (link.linkHash !== expectedLinkHash) {
          brokenLinks.push(i);
        }
      }

      if (brokenLinks.length === 0) {
        checks.push({
          name: 'Chain integrity',
          status: 'pass',
          message: `All ${links.length} chain links verified`,
        });
      } else {
        checks.push({
          name: 'Chain integrity',
          status: 'fail',
          message: `Chain broken at ${brokenLinks.length} link(s)`,
          details: `Broken links: ${brokenLinks.join(', ')}`,
        });
      }

      // Verify root/final hash against metadata
      if (proofChainMeta && links.length > 0) {
        if (links[0].linkHash !== proofChainMeta.rootHash) {
          checks.push({
            name: 'Root hash',
            status: 'fail',
            message: 'Root hash mismatch',
            details: `Metadata: ${proofChainMeta.rootHash}, Chain: ${links[0].linkHash}`,
          });
        } else {
          checks.push({
            name: 'Root hash',
            status: 'pass',
            message: 'Root hash matches genesis link',
          });
        }

        if (links[links.length - 1].linkHash !== proofChainMeta.finalHash) {
          checks.push({
            name: 'Final hash',
            status: 'fail',
            message: 'Final hash mismatch',
            details: `Metadata: ${proofChainMeta.finalHash}, Chain: ${links[links.length - 1].linkHash}`,
          });
        } else {
          checks.push({
            name: 'Final hash',
            status: 'pass',
            message: 'Final hash matches terminal link',
          });
        }
      }
    }
  } else if (chainHashFile) {
    checks.push({
      name: 'Chain link files',
      status: 'skip',
      message: 'Hash-only export: individual link content not available for full verification',
    });

    // Parse hash-only chain for basic checks
    const hashChainRaw = entryMap.get(chainHashFile);
    if (hashChainRaw) {
      try {
        const hashChain = JSON.parse(hashChainRaw) as Array<{
          index: number;
          linkHash: string;
          previousHash: string | null;
        }>;
        // Verify link ordering and hash chaining
        const brokenLinks: number[] = [];
        for (let i = 0; i < hashChain.length; i++) {
          if (hashChain[i].index !== i) {
            brokenLinks.push(i);
            continue;
          }
          if (i === 0 && hashChain[i].previousHash !== null) {
            brokenLinks.push(i);
            continue;
          }
          if (i > 0 && hashChain[i].previousHash !== hashChain[i - 1].linkHash) {
            brokenLinks.push(i);
          }
        }

        if (brokenLinks.length === 0) {
          checks.push({
            name: 'Chain hash ordering',
            status: 'pass',
            message: `Hash chain ordering verified for ${hashChain.length} links`,
          });
        } else {
          checks.push({
            name: 'Chain hash ordering',
            status: 'fail',
            message: `Hash chain broken at ${brokenLinks.length} link(s)`,
            details: `Broken links: ${brokenLinks.join(', ')}`,
          });
        }
      } catch {
        checks.push({
          name: 'Chain hash file',
          status: 'fail',
          message: 'chain-hashes.json is not valid JSON',
        });
      }
    }
  } else {
    checks.push({
      name: 'Chain link files',
      status: 'skip',
      message: 'No chain link files or hash chain found',
    });
  }

  // Check 6: Digital signature
  const signatureRaw = entryMap.get('signature/signature.json');
  if (!signatureRaw) {
    checks.push({
      name: 'Digital signature',
      status: 'fail',
      message: 'signature/signature.json not found',
    });
  } else {
    try {
      const sig: SignatureData = JSON.parse(signatureRaw);
      checks.push({
        name: 'Digital signature',
        status: 'pass',
        message: `Signature ${sig.id} present`,
        details: `Algorithm: ${sig.algorithm}-${sig.hashAlgorithm}, Signer: ${sig.signerId}`,
      });

      // Verify signed hash against proof chain metadata
      if (proofChainMeta) {
        const chainLength = proofChainMeta.chainLength ?? linkFiles.length;
        const dataToSign: Record<string, unknown> = {
          proofChainId: proofChainMeta.id,
          rootHash: proofChainMeta.rootHash,
          finalHash: proofChainMeta.finalHash,
          chainLength,
          version: proofChainMeta.version,
        };
        const expectedSignedHash = hashObject(dataToSign, sig.hashAlgorithm || 'sha256');

        if (expectedSignedHash !== sig.signedHash) {
          checks.push({
            name: 'Signature hash match',
            status: 'fail',
            message: 'Signed hash does not match proof chain metadata',
            details: `Expected: ${expectedSignedHash}, Got: ${sig.signedHash}`,
          });
        } else {
          checks.push({
            name: 'Signature hash match',
            status: 'pass',
            message: 'Signed hash matches proof chain metadata',
          });
        }
      }

      // Check expiration
      if (sig.validUntil) {
        const expiresAt = new Date(sig.validUntil);
        if (expiresAt < new Date()) {
          checks.push({
            name: 'Signature validity period',
            status: 'warn',
            message: `Signature expired at ${sig.validUntil}`,
          });
        } else {
          checks.push({
            name: 'Signature validity period',
            status: 'pass',
            message: `Signature valid until ${sig.validUntil}`,
          });
        }
      }
    } catch {
      checks.push({
        name: 'Digital signature',
        status: 'fail',
        message: 'signature/signature.json is not valid JSON',
      });
    }
  }

  // Check 7: Verification certificate
  const certRaw = entryMap.get('verification/certificate.json');
  if (certRaw) {
    try {
      const cert = JSON.parse(certRaw);
      if (cert.verification && cert.verification.valid === true) {
        checks.push({
          name: 'Verification certificate',
          status: 'pass',
          message: 'Embedded verification certificate confirms validity',
          details: `Status: ${cert.verification.status}, Verified at: ${cert.verification.verifiedAt}`,
        });
      } else {
        checks.push({
          name: 'Verification certificate',
          status: 'warn',
          message: 'Embedded verification certificate reports invalid state',
          details: cert.verification?.status || 'unknown',
        });
      }
    } catch {
      checks.push({
        name: 'Verification certificate',
        status: 'fail',
        message: 'verification/certificate.json is not valid JSON',
      });
    }
  } else {
    checks.push({
      name: 'Verification certificate',
      status: 'skip',
      message: 'No verification certificate present',
    });
  }

  // Check 8: Summary/README
  if (entryMap.has('summary.json')) {
    checks.push({
      name: 'Summary',
      status: 'pass',
      message: 'Summary data present',
    });
  }

  if (entryMap.has('README.txt')) {
    checks.push({
      name: 'Readme',
      status: 'pass',
      message: 'Human-readable README present',
    });
  }

  return checks;
}

// ============================================
// W3C PROV Evidence Pack Verification
// ============================================

function verifyProvenancePack(pack: ProvenanceEvidencePack): CheckResult[] {
  const checks: CheckResult[] = [];

  // Check 1: Pack metadata
  checks.push({
    name: 'Pack metadata',
    status: 'pass',
    message: `Evidence pack ${pack.id} (v${pack.version})`,
    details: `Created: ${pack.created}`,
  });

  // Check 2: Provenance document structure
  const prov = pack.provenance;
  if (!prov || !prov.id) {
    checks.push({
      name: 'Provenance document',
      status: 'fail',
      message: 'Missing or invalid provenance document',
    });
    return checks;
  }

  const entityCount = Object.keys(prov.entity || {}).length;
  const activityCount = Object.keys(prov.activity || {}).length;
  const agentCount = Object.keys(prov.agent || {}).length;

  checks.push({
    name: 'Provenance document',
    status: 'pass',
    message: `PROV document: ${entityCount} entities, ${activityCount} activities, ${agentCount} agents`,
    details: `Type: ${prov.type}, Generated: ${prov.generatedAtTime}`,
  });

  // Check 3: Hash integrity
  const content = JSON.stringify(pack.provenance);
  const expectedHash = createHash('sha256').update(content).digest('hex');

  if (pack.hash !== expectedHash) {
    checks.push({
      name: 'Hash integrity',
      status: 'fail',
      message: 'Hash mismatch: provenance data may have been tampered with',
      details: `Expected: ${expectedHash}, Got: ${pack.hash}`,
    });
  } else {
    checks.push({
      name: 'Hash integrity',
      status: 'pass',
      message: 'Provenance hash verified',
    });
  }

  // Check 4: Digital signature verification
  if (pack.signature) {
    checks.push({
      name: 'Signature present',
      status: 'pass',
      message: `Signature found (algorithm: ${pack.signature.algorithm})`,
    });

    // Attempt RSA-SHA256 signature verification
    try {
      const verify = createVerify('SHA256');
      verify.update(content);
      verify.end();
      const isValid = verify.verify(pack.signature.publicKey, pack.signature.value, 'base64');

      if (isValid) {
        checks.push({
          name: 'Signature verification',
          status: 'pass',
          message: 'Digital signature verified successfully',
        });
      } else {
        checks.push({
          name: 'Signature verification',
          status: 'fail',
          message: 'Digital signature verification failed',
        });
      }
    } catch (err) {
      checks.push({
        name: 'Signature verification',
        status: 'warn',
        message: 'Could not verify signature with embedded public key',
        details: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  } else {
    checks.push({
      name: 'Signature present',
      status: 'skip',
      message: 'No digital signature in evidence pack',
    });
  }

  // Check 5: Provenance chain completeness (W3C PROV referential integrity)
  const provErrors: string[] = [];

  // Verify wasGeneratedBy references
  for (const [, gen] of Object.entries(prov.wasGeneratedBy || {})) {
    const g = gen as { entity: string; activity: string };
    if (!prov.entity[g.entity]) {
      provErrors.push(`Generation references non-existent entity: ${g.entity}`);
    }
    if (!prov.activity[g.activity]) {
      provErrors.push(`Generation references non-existent activity: ${g.activity}`);
    }
  }

  // Verify used references
  for (const [, usage] of Object.entries(prov.used || {})) {
    const u = usage as { activity: string; entity: string };
    if (!prov.activity[u.activity]) {
      provErrors.push(`Usage references non-existent activity: ${u.activity}`);
    }
    if (!prov.entity[u.entity]) {
      provErrors.push(`Usage references non-existent entity: ${u.entity}`);
    }
  }

  // Verify wasDerivedFrom references
  for (const [, deriv] of Object.entries(prov.wasDerivedFrom || {})) {
    const d = deriv as { generatedEntity: string; usedEntity: string };
    if (!prov.entity[d.generatedEntity]) {
      provErrors.push(`Derivation references non-existent generated entity: ${d.generatedEntity}`);
    }
    if (!prov.entity[d.usedEntity]) {
      provErrors.push(`Derivation references non-existent used entity: ${d.usedEntity}`);
    }
  }

  // Verify wasAttributedTo references
  for (const [, attr] of Object.entries(prov.wasAttributedTo || {})) {
    const a = attr as { entity: string; agent: string };
    if (!prov.entity[a.entity]) {
      provErrors.push(`Attribution references non-existent entity: ${a.entity}`);
    }
    if (!prov.agent[a.agent]) {
      provErrors.push(`Attribution references non-existent agent: ${a.agent}`);
    }
  }

  // Verify wasAssociatedWith references
  for (const [, assoc] of Object.entries(prov.wasAssociatedWith || {})) {
    const a = assoc as { activity: string; agent: string };
    if (!prov.activity[a.activity]) {
      provErrors.push(`Association references non-existent activity: ${a.activity}`);
    }
    if (!prov.agent[a.agent]) {
      provErrors.push(`Association references non-existent agent: ${a.agent}`);
    }
  }

  if (provErrors.length === 0) {
    checks.push({
      name: 'Provenance chain completeness',
      status: 'pass',
      message: 'All provenance references are valid',
    });
  } else {
    checks.push({
      name: 'Provenance chain completeness',
      status: 'fail',
      message: `${provErrors.length} provenance reference error(s)`,
      details: provErrors.slice(0, 5).join('; ') + (provErrors.length > 5 ? `... and ${provErrors.length - 5} more` : ''),
    });
  }

  // Check 6: PII redaction report (check metadata for claims)
  const metadata = pack.metadata || {};
  if (metadata.piiRedaction || metadata.redactionReport) {
    checks.push({
      name: 'PII redaction report',
      status: 'pass',
      message: 'PII redaction metadata present',
    });
  } else {
    checks.push({
      name: 'PII redaction report',
      status: 'skip',
      message: 'No PII redaction claim in evidence pack',
    });
  }

  return checks;
}

// ============================================
// Report Formatting
// ============================================

function formatReport(report: VerificationReport): string {
  const lines: string[] = [];

  lines.push('');
  lines.push('='.repeat(66));
  lines.push('  SEIZN EVIDENCE PACK VERIFICATION REPORT');
  lines.push('='.repeat(66));
  lines.push('');
  lines.push(`  File:      ${report.file}`);
  lines.push(`  Format:    ${report.format}`);
  lines.push(`  Verified:  ${report.timestamp}`);
  lines.push('');
  lines.push('-'.repeat(66));
  lines.push('  CHECKS');
  lines.push('-'.repeat(66));
  lines.push('');

  for (const check of report.checks) {
    const icon = {
      pass: '[PASS]',
      fail: '[FAIL]',
      warn: '[WARN]',
      skip: '[SKIP]',
    }[check.status];

    lines.push(`  ${icon}  ${check.name}`);
    lines.push(`          ${check.message}`);
    if (check.details) {
      lines.push(`          ${check.details}`);
    }
    lines.push('');
  }

  lines.push('-'.repeat(66));
  lines.push('  SUMMARY');
  lines.push('-'.repeat(66));
  lines.push('');
  lines.push(`  Total checks:  ${report.summary.total}`);
  lines.push(`  Passed:        ${report.summary.passed}`);
  lines.push(`  Failed:        ${report.summary.failed}`);
  lines.push(`  Warnings:      ${report.summary.warnings}`);
  lines.push(`  Skipped:       ${report.summary.skipped}`);
  lines.push('');
  lines.push('='.repeat(66));

  if (report.verdict === 'VERIFIED') {
    lines.push('  VERDICT: VERIFIED');
  } else if (report.verdict === 'FAILED') {
    lines.push('  VERDICT: VERIFICATION FAILED');
  } else {
    lines.push('  VERDICT: ERROR');
  }

  lines.push('='.repeat(66));
  lines.push('');

  return lines.join('\n');
}

function formatJsonReport(report: VerificationReport): string {
  return JSON.stringify(report, null, 2);
}

// ============================================
// Main CLI
// ============================================

function printUsage(): void {
  console.log(`
Usage: seizn-verify [options] <evidence-pack-file>

Verify the integrity of a Seizn evidence pack.

Arguments:
  evidence-pack-file   Path to the evidence pack file (.json or .zip export)

Options:
  --json               Output report as JSON instead of human-readable
  --quiet              Only output verdict (no detailed report)
  --help, -h           Show this help message
  --version, -v        Show version

Exit codes:
  0  Verified successfully
  1  Verification failed (integrity issue detected)
  2  Error (file not found, invalid format, etc.)
`);
}

function main(): void {
  const args = process.argv.slice(2);

  let filePath: string | undefined;
  let jsonOutput = false;
  let quiet = false;

  for (const arg of args) {
    if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    }
    if (arg === '--version' || arg === '-v') {
      console.log('seizn-verify-evidence v1.0.0');
      process.exit(0);
    }
    if (arg === '--json') {
      jsonOutput = true;
      continue;
    }
    if (arg === '--quiet') {
      quiet = true;
      continue;
    }
    if (arg.startsWith('-')) {
      console.error(`Unknown option: ${arg}`);
      console.error('Use --help for usage information.');
      process.exit(2);
    }
    filePath = arg;
  }

  if (!filePath) {
    console.error('Error: No evidence pack file specified.');
    console.error('Use --help for usage information.');
    process.exit(2);
  }

  // Resolve file path
  const resolvedPath = resolve(filePath);

  // Read file
  let raw: string;
  try {
    raw = readFileSync(resolvedPath, 'utf-8');
  } catch (err) {
    console.error(`Error: Could not read file: ${resolvedPath}`);
    if (err instanceof Error) {
      console.error(`  ${err.message}`);
    }
    process.exit(2);
  }

  // Detect format
  const detected = detectFormat(raw);

  // Run verification
  let checks: CheckResult[];
  let format: VerificationReport['format'];

  switch (detected.type) {
    case 'pcr-json': {
      format = 'json';
      checks = verifyPcrJson(detected.data);
      break;
    }
    case 'pcr-zip': {
      format = 'zip';
      // Try to extract PackFile metadata from API response wrapper
      let packFiles: PackFile[] | undefined;
      try {
        const outerParsed = JSON.parse(raw);
        if (outerParsed.pack && outerParsed.pack.files) {
          packFiles = outerParsed.pack.files;
        }
      } catch {
        // Not wrapped, no pack metadata available
      }
      checks = verifyPcrZip(detected.data, packFiles);
      break;
    }
    case 'provenance-json': {
      format = 'provenance-json';
      checks = verifyProvenancePack(detected.data);
      break;
    }
    default: {
      console.error('Error: Unrecognized evidence pack format.');
      console.error('Expected a Seizn PCR JSON export, PCR ZIP export, or W3C PROV evidence pack.');
      process.exit(2);
    }
  }

  // Build report
  const summary = {
    total: checks.length,
    passed: checks.filter((c) => c.status === 'pass').length,
    failed: checks.filter((c) => c.status === 'fail').length,
    warnings: checks.filter((c) => c.status === 'warn').length,
    skipped: checks.filter((c) => c.status === 'skip').length,
  };

  let verdict: VerificationReport['verdict'];
  if (summary.failed > 0) {
    verdict = 'FAILED';
  } else {
    verdict = 'VERIFIED';
  }

  const report: VerificationReport = {
    file: resolvedPath,
    format,
    timestamp: new Date().toISOString(),
    checks,
    summary,
    verdict,
  };

  // Output
  if (quiet) {
    console.log(verdict);
  } else if (jsonOutput) {
    console.log(formatJsonReport(report));
  } else {
    console.log(formatReport(report));
  }

  // Exit code
  if (verdict === 'VERIFIED') {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

main();
