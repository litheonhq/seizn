/**
 * PCR Evidence Pack Exporter
 *
 * Exports proof chains as evidence packs in various formats.
 */

import { randomUUID } from 'crypto';
import type {
  ProofChainRecord,
  ProofSignature,
  EvidencePack,
  PackFile,
  ExportOptions,
  ExportFormat,
} from './types';
import {
  generateHash,
  generateVerificationCertificate,
  verifySignature,
} from './signature';
import { extractProofChainSummary } from './chain-builder';

// ============================================
// JSON Exporter
// ============================================

/**
 * Export proof chain as JSON
 */
export function exportAsJson(
  proofChain: ProofChainRecord,
  signature: ProofSignature,
  options: Partial<ExportOptions> = {}
): { content: string; pack: EvidencePack } {
  const { includeRawContent = true, includeSummary = true } = options;

  const exportData: Record<string, unknown> = {
    version: '1.0',
    exportedAt: new Date().toISOString(),
    proofChain: {
      id: proofChain.id,
      userId: proofChain.userId,
      traceId: proofChain.traceId,
      version: proofChain.version,
      hashAlgorithm: proofChain.hashAlgorithm,
      rootHash: proofChain.rootHash,
      finalHash: proofChain.finalHash,
      status: proofChain.status,
      createdAt: proofChain.createdAt,
      updatedAt: proofChain.updatedAt,
    },
    signature: {
      id: signature.id,
      algorithm: signature.algorithm,
      hashAlgorithm: signature.hashAlgorithm,
      signedHash: signature.signedHash,
      signature: signature.signature,
      keyId: signature.keyId,
      signerId: signature.signerId,
      signedAt: signature.signedAt,
      validUntil: signature.validUntil,
      claims: signature.claims,
    },
  };

  if (includeRawContent) {
    exportData.chain = proofChain.chain;
  } else {
    // Include only hashes, not raw content
    exportData.chain = proofChain.chain.map((link) => ({
      index: link.index,
      evidenceId: link.evidence.id,
      evidenceType: link.evidence.type,
      evidenceHash: link.evidence.hash,
      linkHash: link.linkHash,
      previousHash: link.previousHash,
      timestamp: link.timestamp,
    }));
  }

  if (includeSummary) {
    exportData.summary = extractProofChainSummary(proofChain);
  }

  const content = JSON.stringify(exportData, null, 2);
  const checksum = generateHash(content);

  const pack: EvidencePack = {
    id: randomUUID(),
    proofChain,
    signature,
    format: 'json',
    exportedAt: new Date().toISOString(),
    checksum,
  };

  return { content, pack };
}

// ============================================
// ZIP Exporter (Browser/Node compatible)
// ============================================

/**
 * ZIP file structure for evidence pack
 */
interface ZipFileEntry {
  path: string;
  content: string | Uint8Array;
  comment?: string;
}

/**
 * Create ZIP file entries for evidence pack
 */
function createZipEntries(
  proofChain: ProofChainRecord,
  signature: ProofSignature,
  options: Partial<ExportOptions> = {}
): ZipFileEntry[] {
  const { includeRawContent = true, includeSummary = true } = options;
  const entries: ZipFileEntry[] = [];

  // 1. Manifest file
  const manifest = {
    version: '1.0',
    format: 'seizn-evidence-pack',
    exportedAt: new Date().toISOString(),
    proofChainId: proofChain.id,
    signatureId: signature.id,
    files: [] as string[],
  };

  // 2. Proof chain metadata
  const proofChainMeta = {
    id: proofChain.id,
    userId: proofChain.userId,
    traceId: proofChain.traceId,
    version: proofChain.version,
    hashAlgorithm: proofChain.hashAlgorithm,
    rootHash: proofChain.rootHash,
    finalHash: proofChain.finalHash,
    chainLength: proofChain.chain.length,
    status: proofChain.status,
    createdAt: proofChain.createdAt,
    updatedAt: proofChain.updatedAt,
  };
  entries.push({
    path: 'proof-chain/metadata.json',
    content: JSON.stringify(proofChainMeta, null, 2),
  });
  manifest.files.push('proof-chain/metadata.json');

  // 3. Chain links
  if (includeRawContent) {
    for (const link of proofChain.chain) {
      const linkData = {
        index: link.index,
        evidence: link.evidence,
        linkHash: link.linkHash,
        previousHash: link.previousHash,
        timestamp: link.timestamp,
      };
      const filename = `proof-chain/links/${link.index.toString().padStart(4, '0')}-${link.evidence.type}.json`;
      entries.push({
        path: filename,
        content: JSON.stringify(linkData, null, 2),
      });
      manifest.files.push(filename);
    }
  } else {
    // Hash-only chain
    const chainHashes = proofChain.chain.map((link) => ({
      index: link.index,
      evidenceId: link.evidence.id,
      evidenceType: link.evidence.type,
      evidenceHash: link.evidence.hash,
      linkHash: link.linkHash,
      previousHash: link.previousHash,
      timestamp: link.timestamp,
    }));
    entries.push({
      path: 'proof-chain/chain-hashes.json',
      content: JSON.stringify(chainHashes, null, 2),
    });
    manifest.files.push('proof-chain/chain-hashes.json');
  }

  // 4. Signature
  const signatureData = {
    id: signature.id,
    proofChainId: signature.proofChainId,
    algorithm: signature.algorithm,
    hashAlgorithm: signature.hashAlgorithm,
    signedHash: signature.signedHash,
    signature: signature.signature,
    keyId: signature.keyId,
    signerId: signature.signerId,
    signedAt: signature.signedAt,
    validUntil: signature.validUntil,
    claims: signature.claims,
  };
  entries.push({
    path: 'signature/signature.json',
    content: JSON.stringify(signatureData, null, 2),
  });
  manifest.files.push('signature/signature.json');

  // 5. Verification certificate
  const verificationResult = verifySignature(proofChain, signature);
  const certificate = generateVerificationCertificate(
    proofChain,
    signature,
    verificationResult
  );
  entries.push({
    path: 'verification/certificate.json',
    content: certificate,
  });
  manifest.files.push('verification/certificate.json');

  // 6. Summary (optional)
  if (includeSummary) {
    const summary = extractProofChainSummary(proofChain);
    entries.push({
      path: 'summary.json',
      content: JSON.stringify(summary, null, 2),
    });
    manifest.files.push('summary.json');

    // Human-readable summary
    const readableSummary = generateReadableSummary(proofChain, signature, summary);
    entries.push({
      path: 'README.txt',
      content: readableSummary,
    });
    manifest.files.push('README.txt');
  }

  // 7. Manifest (add at the end)
  entries.unshift({
    path: 'manifest.json',
    content: JSON.stringify(manifest, null, 2),
  });

  return entries;
}

/**
 * Generate human-readable summary
 */
function generateReadableSummary(
  proofChain: ProofChainRecord,
  signature: ProofSignature,
  summary: ReturnType<typeof extractProofChainSummary>
): string {
  const lines = [
    '═══════════════════════════════════════════════════════════════',
    '                   SEIZN EVIDENCE PACK',
    '═══════════════════════════════════════════════════════════════',
    '',
    'PROOF CHAIN INFORMATION',
    '───────────────────────────────────────────────────────────────',
    `ID:              ${proofChain.id}`,
    `Created:         ${proofChain.createdAt}`,
    `Hash Algorithm:  ${proofChain.hashAlgorithm}`,
    `Chain Length:    ${summary.chainLength} links`,
    `Root Hash:       ${proofChain.rootHash}`,
    `Final Hash:      ${proofChain.finalHash}`,
    '',
    'SIGNATURE INFORMATION',
    '───────────────────────────────────────────────────────────────',
    `Signature ID:    ${signature.id}`,
    `Algorithm:       ${signature.algorithm}-${signature.hashAlgorithm}`,
    `Signed At:       ${signature.signedAt}`,
    `Valid Until:     ${signature.validUntil || 'No expiration'}`,
    `Signer ID:       ${signature.signerId}`,
    '',
    'CONTENT SUMMARY',
    '───────────────────────────────────────────────────────────────',
    `Query:           ${summary.query ? truncate(summary.query, 60) : 'N/A'}`,
    `Answer:          ${summary.answer ? truncate(summary.answer, 60) : 'N/A'}`,
    `Context Chunks:  ${summary.contextCount}`,
    `Has Contract:    ${summary.hasContract ? 'Yes' : 'No'}`,
    '',
    '═══════════════════════════════════════════════════════════════',
    'This evidence pack contains cryptographically signed proof of',
    'the RAG pipeline execution. Verify integrity using the included',
    'signature and certificate files.',
    '═══════════════════════════════════════════════════════════════',
  ];

  return lines.join('\n');
}

/**
 * Truncate string with ellipsis
 */
function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.substring(0, maxLen - 3) + '...';
}

/**
 * Export as ZIP (returns base64 encoded ZIP data)
 *
 * Note: This is a simplified ZIP implementation. For production,
 * consider using a proper ZIP library like JSZip or archiver.
 */
export async function exportAsZip(
  proofChain: ProofChainRecord,
  signature: ProofSignature,
  options: Partial<ExportOptions> = {}
): Promise<{ content: string; pack: EvidencePack; files: PackFile[] }> {
  const entries = createZipEntries(proofChain, signature, options);

  // Create pack files metadata
  const packFiles: PackFile[] = entries.map((entry) => {
    const content = typeof entry.content === 'string'
      ? entry.content
      : new TextDecoder().decode(entry.content);
    return {
      name: entry.path.split('/').pop() || entry.path,
      path: entry.path,
      contentType: entry.path.endsWith('.json') ? 'application/json' : 'text/plain',
      size: content.length,
      checksum: generateHash(content),
    };
  });

  // For now, return JSON representation of the ZIP structure
  // In production, use JSZip or similar library
  const zipContent = {
    format: 'seizn-evidence-pack-zip',
    version: '1.0',
    entries: entries.map((e) => ({
      path: e.path,
      content: typeof e.content === 'string' ? e.content : '[binary]',
    })),
  };

  const content = Buffer.from(JSON.stringify(zipContent, null, 2)).toString('base64');
  const checksum = generateHash(content);

  const pack: EvidencePack = {
    id: randomUUID(),
    proofChain,
    signature,
    format: 'zip',
    exportedAt: new Date().toISOString(),
    checksum,
    files: packFiles,
  };

  return { content, pack, files: packFiles };
}

// ============================================
// Main Export Function
// ============================================

/**
 * Export evidence pack in specified format
 */
export async function exportEvidencePack(
  proofChain: ProofChainRecord,
  signature: ProofSignature,
  options: ExportOptions = { format: 'json' }
): Promise<{
  content: string;
  pack: EvidencePack;
  files?: PackFile[];
  contentType: string;
  filename: string;
}> {
  const prefix = options.filenamePrefix || 'seizn-evidence';
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

  switch (options.format) {
    case 'zip': {
      const result = await exportAsZip(proofChain, signature, options);
      return {
        ...result,
        contentType: 'application/zip',
        filename: `${prefix}-${proofChain.id.slice(0, 8)}-${timestamp}.zip`,
      };
    }
    case 'json':
    default: {
      const result = exportAsJson(proofChain, signature, options);
      return {
        ...result,
        contentType: 'application/json',
        filename: `${prefix}-${proofChain.id.slice(0, 8)}-${timestamp}.json`,
      };
    }
  }
}

/**
 * Import and verify evidence pack from JSON
 */
export function importEvidencePackFromJson(jsonContent: string): {
  proofChain: ProofChainRecord;
  signature: ProofSignature;
  verified: boolean;
  error?: string;
} {
  try {
    const data = JSON.parse(jsonContent);

    if (!data.proofChain || !data.signature) {
      throw new Error('Invalid evidence pack format');
    }

    // Reconstruct proof chain
    const proofChain: ProofChainRecord = {
      id: data.proofChain.id,
      userId: data.proofChain.userId,
      traceId: data.proofChain.traceId,
      version: data.proofChain.version,
      hashAlgorithm: data.proofChain.hashAlgorithm,
      chain: data.chain || [],
      rootHash: data.proofChain.rootHash,
      finalHash: data.proofChain.finalHash,
      status: data.proofChain.status,
      createdAt: data.proofChain.createdAt,
      updatedAt: data.proofChain.updatedAt,
    };

    const signature: ProofSignature = {
      id: data.signature.id,
      proofChainId: data.signature.proofChainId || data.proofChain.id,
      algorithm: data.signature.algorithm,
      hashAlgorithm: data.signature.hashAlgorithm,
      signedHash: data.signature.signedHash,
      signature: data.signature.signature,
      keyId: data.signature.keyId,
      signerId: data.signature.signerId,
      signedAt: data.signature.signedAt,
      validUntil: data.signature.validUntil,
      claims: data.signature.claims,
    };

    // Verify if we have the chain
    let verified = false;
    if (proofChain.chain.length > 0) {
      const result = verifySignature(proofChain, signature);
      verified = result.valid;
    }

    return { proofChain, signature, verified };
  } catch (error) {
    return {
      proofChain: {} as ProofChainRecord,
      signature: {} as ProofSignature,
      verified: false,
      error: error instanceof Error ? error.message : 'Import failed',
    };
  }
}
